const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

class PrismaMeetingRepository {
    /**
     * Persists a newly created meeting entity to the database.
     * @param {Object} meetingEntity - The populated meeting domain entity.
     * @returns {Promise<Object>} The saved database record.
     */
    async save(meetingEntity) {
        try {
            return await prisma.meeting.create({
                data: {
                    title: meetingEntity.title,
                    startTime: meetingEntity.startTime,
                    duration: meetingEntity.durationInMinutes,

                    zoomMeetingId: meetingEntity.providerMeetingId,
                    joinUrl: meetingEntity.joinUrl,
                    userId: meetingEntity.userId,

                    rawZoomResponse: meetingEntity.rawResponse
                }
            });
        } catch (error) {
            console.error('[Repository Error] Failed to save meeting:', error.message);
            throw new Error('فشل حفظ الاجتماع في قاعدة البيانات');
        }
    }
    /**
         * Retrieves all scheduled meetings for a specific user, ordered by start time.
         * @param {string} userId - The unique identifier of the user.
         * @returns {Promise<Array>} A list of meeting records.
         */
    async findByUserId(userId) {
        try {
            return await prisma.meeting.findMany({
                where: { userId: userId },
                orderBy: { startTime: 'asc' }
            });
        } catch (error) {
            console.error('[Repository Error] Failed to fetch meetings:', error.message);
            throw new Error('فشل جلب سجل الاجتماعات');
        }
    }
}

module.exports = PrismaMeetingRepository;