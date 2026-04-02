// src/presentation/controllers/MeetingController.js
const ScheduleMeetingAction = require('../../application/use-cases/ScheduleMeetingAction');
const { meetingSchema, deleteMeetingSchema } = require('../../application/validators/meetingValidator');
const meetingService = require('../../application/services/MeetingService'); // 👈 استدعاء الخدمة الجديدة

class MeetingController {

    async schedule(req, res) {
        try {
            // 1. فحص البيانات
            const { error, value } = meetingSchema.validate(req.body, { abortEarly: false });

            if (error) {
                return res.status(400).json({
                    success: false,
                    errors: error.details.map(detail => detail.message)
                });
            }

            // 2. التنفيذ عبر Use Case
            const scheduleAction = new ScheduleMeetingAction();
            const result = await scheduleAction.execute(value, value.userId);

            res.status(202).json({ success: true, data: result });

        } catch (error) {
            res.status(400).json({ success: false, error: error.message });
        }
    }

    async list(req, res) {
        try {
            const { userId, forceRefresh } = req.query;
            if (!userId) return res.status(400).json({ error: 'User ID required' });

            // 👈 تحويل كل العمل المعقد إلى الـ Service
            const result = await meetingService.getLiveMeetings(userId, forceRefresh);

            res.json(result);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    async delete(req, res) {
        try {
            // 1. فحص صحة المعاملات (Params Validation)
            const { error, value } = deleteMeetingSchema.validate(req.params);

            if (error) {
                return res.status(400).json({
                    success: false,
                    error: "بيانات غير صالحة: " + error.details[0].message
                });
            }

            // 2. توجيه الطلب الآمن للـ Service (استخدام value.userId المفلترة)
            await meetingService.deleteMeeting(value.userId, value.meetingId);

            res.json({ success: true, message: 'Meeting deleted successfully' });
        } catch (error) {
            // معالجة الأخطاء (مثل خطأ الصلاحيات الذي رميناه من الـ Service)
            const statusCode = error.message.includes('غير مصرح') ? 403 : 500;
            res.status(statusCode).json({ success: false, error: error.message });
        }
    }
}

module.exports = new MeetingController();