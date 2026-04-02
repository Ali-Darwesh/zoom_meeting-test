// Import essential files
const ScheduleMeetingAction = require('../../../src/application/use-cases/ScheduleMeetingAction');
const { addMeetingTask } = require('../../../src/infrastructure/queue/MeetingQueue');

// 🛡️ The magic here: We prevent the connection to Redis and only monitor if the function was called
jest.mock('../../../src/infrastructure/queue/MeetingQueue', () => ({
    addMeetingTask: jest.fn()
}));

describe('ScheduleMeetingAction - Unit Tests', () => {
    let scheduleAction;

    // Clean up the environment before each test
    beforeEach(() => {
        scheduleAction = new ScheduleMeetingAction();
        jest.clearAllMocks();
    });

    test('✅ should add the task to the queue successfully and return queued status', async () => {
        // 1. Arrange (Valid mock data)
        const mockMeetingData = {
            title: 'Test Meeting',
            startTime: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
            durationInMinutes: 45,
            providerName: 'zoom'
        };
        const userId = 'user-123-uuid';

        // 2. Act
        const result = await scheduleAction.execute(mockMeetingData, userId);

        // 3. Assert
        expect(addMeetingTask).toHaveBeenCalledTimes(1); // Ensure the queue received the task
        expect(result.status).toBe('queued'); // Ensure the immediate response for the controller
    });

    test('❌ should throw an error if data is missing', async () => {
        // 1. Arrange (Intentionally missing data)
        const invalidData = { title: 'Meeting without time' };
        const userId = 'user-123-uuid';

        // 2 + 3. Act & Assert (Verify it throws an error)
        await expect(scheduleAction.execute(invalidData, userId))
            .rejects
            .toThrow("Missing required meeting fields");

        // Ensure the queue did not receive anything (system protection)
        expect(addMeetingTask).not.toHaveBeenCalled();
    });
});