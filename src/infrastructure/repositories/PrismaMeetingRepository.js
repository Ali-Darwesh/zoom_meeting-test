const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

class PrismaMeetingRepository {
    async save(meetingEntity) {
        try {
            return await prisma.meeting.create({
                data: {
                    title: meetingEntity.title,
                    startTime: meetingEntity.startTime,
                    duration: meetingEntity.durationInMinutes,

                    // 💡 يفضل تغيير اسم العمود في Prisma لاحقاً إلى providerMeetingId
                    zoomMeetingId: meetingEntity.providerMeetingId,
                    joinUrl: meetingEntity.joinUrl,
                    userId: meetingEntity.userId,

                    // 💡 يفضل تغييره لاحقاً إلى rawProviderResponse
                    rawZoomResponse: meetingEntity.rawResponse
                }
            });
        } catch (error) {
            console.error('[Repository Error] Failed to save meeting:', error.message);
            throw new Error('فشل حفظ الاجتماع في قاعدة البيانات');
        }
    }

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