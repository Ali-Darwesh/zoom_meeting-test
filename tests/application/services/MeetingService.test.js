// tests/application/services/MeetingService.test.js

// 1. Mock Prisma Client
jest.mock('@prisma/client', () => {
    const mockPrismaClient = {
        meeting: {
            findUnique: jest.fn(),
            findMany: jest.fn(),
            upsert: jest.fn(),
            deleteMany: jest.fn(),
            delete: jest.fn(),
        },
        oAuthToken: {
            findUnique: jest.fn(),
        }
    };
    return { PrismaClient: jest.fn(() => mockPrismaClient) };
});

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// 2. Mock Redis Cache Explicitly to avoid open handles (connection leaks)
jest.mock('../../../src/infrastructure/cache/RedisService', () => ({
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn()
}));
const cache = require('../../../src/infrastructure/cache/RedisService');

// 3. Mock ZoomProvider Instance Explicitly
const mockZoomProviderInstance = {
    getUpcomingMeetings: jest.fn(),
    deleteMeeting: jest.fn()
};
jest.mock('../../../src/infrastructure/providers/ZoomProvider', () => {
    return jest.fn(() => mockZoomProviderInstance);
});

// Import the service AFTER the mocks are defined
const meetingService = require('../../../src/application/services/MeetingService');

describe('MeetingService - Detailed Logic Tests', () => {
    const userId = 'user-uuid-123';

    // Clear all mock history before each test to ensure clean state
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('getLiveMeetings (Sync Logic)', () => {
        test('should return cached meetings if available (Cache Hit)', async () => {
            const mockCache = [{ id: '1', title: 'Cached Meeting' }];
            cache.get.mockResolvedValue(mockCache);

            prisma.oAuthToken.findUnique.mockResolvedValue({ userId });

            const result = await meetingService.getLiveMeetings(userId, false);

            expect(result.source).toBe('cache');
            expect(result.meetings).toEqual(mockCache);
            expect(mockZoomProviderInstance.getUpcomingMeetings).not.toHaveBeenCalled();
        });

        test('should sync with Zoom and update DB if cache is empty', async () => {
            cache.get.mockResolvedValue(null);
            const mockZoomMeetings = [{ id: 123, topic: 'New Zoom Meeting', start_time: new Date() }];
            mockZoomProviderInstance.getUpcomingMeetings.mockResolvedValue(mockZoomMeetings);

            prisma.oAuthToken.findUnique.mockResolvedValue({ userId });

            const result = await meetingService.getLiveMeetings(userId, false);

            expect(prisma.meeting.upsert).toHaveBeenCalled();
            expect(prisma.meeting.deleteMany).toHaveBeenCalled();
            expect(result.source).toBe('database_synced');
        });
    });

    describe('deleteMeeting (Security & Logic)', () => {
        test('should throw error if meeting does not belong to user (IDOR Protection)', async () => {
            const meetingInDb = { id: 1, zoomMeetingId: '999', userId: 'other-user-id' };
            prisma.meeting.findUnique.mockResolvedValue(meetingInDb);

            await expect(meetingService.deleteMeeting(userId, '999'))
                .rejects
                .toThrow("Operation Denied: Unauthorized to delete other users' meetings"); // Fixed exact string match

            expect(mockZoomProviderInstance.deleteMeeting).not.toHaveBeenCalled();
        });

        test('should delete from Zoom and DB if authorized', async () => {
            const meetingInDb = { id: 1, zoomMeetingId: '999', userId: userId };
            prisma.meeting.findUnique.mockResolvedValue(meetingInDb);
            mockZoomProviderInstance.deleteMeeting.mockResolvedValue(true);

            const result = await meetingService.deleteMeeting(userId, '999');

            expect(result).toBe(true);
            expect(mockZoomProviderInstance.deleteMeeting).toHaveBeenCalledWith(userId, '999');
            expect(prisma.meeting.delete).toHaveBeenCalled();
            expect(cache.del).toHaveBeenCalled();
        });
    });
});