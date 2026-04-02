// src/application/services/MeetingService.js
const ZoomProvider = require('../../infrastructure/providers/ZoomProvider');
const zoomProvider = new ZoomProvider();
const cache = require('../../infrastructure/cache/RedisService');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

class MeetingService {

    /**
     * Fetches live upcoming meetings for a user, utilizing Redis cache and syncing with the Zoom API.
     * Executes an upsert and cleanup algorithm to keep the local database synchronized with Zoom.
     * * @param {string} userId - The unique UUID of the user.
     * @param {boolean|string} forceRefresh - If true, bypasses the cache and forces a fresh sync with the Zoom API.
     * @returns {Promise<{source: string, meetings: Array<Object>}>} An object containing the data source ('none', 'cache', or 'database_synced') and the formatted meetings list.
     */
    async getLiveMeetings(userId, forceRefresh) {
        // 1. Security Check: Ensure the user has a connected Zoom account
        const tokenExists = await prisma.oAuthToken.findUnique({ where: { userId } });
        if (!tokenExists) {
            return { source: 'none', meetings: [] };
        }

        const cacheKey = `zoom_live_meetings:${userId}`;

        if (forceRefresh === 'true' || forceRefresh === true) {
            await cache.del(cacheKey);
        }

        // 2. Fetch from Cache (If available, avoids stressing DB and Zoom API)
        const cachedMeetings = await cache.get(cacheKey);
        if (cachedMeetings) {
            return { source: 'cache', meetings: cachedMeetings };
        }

        // 3. If no cache, fetch live data from Zoom API
        console.log('🔄 Syncing local Database with Zoom API...');
        const zoomMeetings = await zoomProvider.getUpcomingMeetings(userId);

        // --- Database Sync Algorithm ---

        // A) Extract a list of incoming Zoom meeting IDs
        const zoomMeetingIds = zoomMeetings.map(m => m.id.toString());

        // B) Loop through Zoom meetings: Upsert (Update if exists, Create if not)
        for (const zm of zoomMeetings) {
            await prisma.meeting.upsert({
                where: { zoomMeetingId: zm.id.toString() },
                update: {
                    title: zm.topic,
                    startTime: new Date(zm.start_time),
                    duration: zm.duration,
                    joinUrl: zm.join_url
                },
                create: {
                    zoomMeetingId: zm.id.toString(),
                    userId: userId,
                    title: zm.topic,
                    startTime: new Date(zm.start_time),
                    duration: zm.duration,
                    joinUrl: zm.join_url,
                    status: 'scheduled'
                }
            });
        }

        // C) Database Cleanup: Delete any local meeting that no longer exists on Zoom
        await prisma.meeting.deleteMany({
            where: {
                userId: userId,
                zoomMeetingId: { notIn: zoomMeetingIds }
            }
        });

        // --- End of Sync Algorithm ---

        // 4. Format data uniformly for the frontend
        const formattedMeetings = zoomMeetings.map(m => ({
            id: m.id, // Send Zoom ID to frontend for easier handling
            title: m.topic,
            startTime: m.start_time,
            joinUrl: m.join_url
        }));

        // 5. Save the synchronized result in cache for 60 seconds to protect the system
        await cache.set(cacheKey, formattedMeetings, 60);

        return { source: 'database_synced', meetings: formattedMeetings };
    }

    /**
     * Deletes a meeting from both the local database and the Zoom API.
     * Includes an IDOR (Insecure Direct Object Reference) check to ensure the user owns the meeting.
     * * @param {string} userId - The unique UUID of the user performing the deletion.
     * @param {string|number} meetingId - The provider's meeting ID (e.g., Zoom Meeting ID) provided by the frontend.
     * @returns {Promise<boolean>} Returns true if the deletion is successful across all systems.
     * @throws {Error} Throws an error if the meeting is not found or the user is unauthorized to delete it.
     */
    async deleteMeeting(userId, meetingId) {
        // 1. Search DB using zoomMeetingId (converted to string to match Prisma schema)
        const meeting = await prisma.meeting.findUnique({
            where: { zoomMeetingId: meetingId.toString() }
        });

        // 2. Verify meeting existence
        if (!meeting) {
            throw new Error("Meeting not found or already deleted");
        }

        // 3. IDOR Protection
        if (meeting.userId !== userId) {
            throw new Error("Operation Denied: Unauthorized to delete other users' meetings");
        }

        // 4. Delete from Zoom servers
        await zoomProvider.deleteMeeting(userId, meeting.zoomMeetingId);

        // 5. Delete from local database (using our internal primary key)
        await prisma.meeting.delete({
            where: { id: meeting.id }
        });

        // 6. Invalidate cache immediately
        await cache.del(`zoom_live_meetings:${userId}`);

        return true;
    }
}

module.exports = new MeetingService();