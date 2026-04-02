const { addMeetingTask } = require('../../infrastructure/queue/MeetingQueue');
const Meeting = require('../../domain/entities/Meeting');

class ScheduleMeetingAction {
    async execute(meetingData, userId) {
        // 1. إنشاء الكيان للتحقق من البيانات الأولية
        const meeting = new Meeting({ ...meetingData, userId });

        // 2. إرسال المهمة للطابور
        await addMeetingTask({
            meetingDetails: meeting,
            userId: userId
        });

        // 3. الرد الفوري
        return {
            status: 'queued',
            message: 'Meeting creation is in progress.'
        };
    }
}
module.exports = ScheduleMeetingAction;