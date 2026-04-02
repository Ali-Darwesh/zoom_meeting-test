// src/presentation/controllers/MeetingController.js
const ScheduleMeetingAction = require('../../application/use-cases/ScheduleMeetingAction');
const { meetingSchema, deleteMeetingSchema } = require('../../application/validators/meetingValidator');
const meetingService = require('../../application/services/MeetingService'); // 👈 استدعاء الخدمة الجديدة

class MeetingController {
    /**
         * Handles the scheduling of a new meeting.
         * Validates the incoming payload and delegates the creation process to the ScheduleMeetingAction use case.
         * @param {Object} req - Express request object containing the meeting data in req.body.
         * @param {Object} res - Express response object.
         * @returns {Promise<void>} Responds with a 202 Accepted status upon successful queuing.
         */
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
    /**
         * Retrieves a list of live or cached meetings for a specific user.
         * @param {Object} req - Express request object containing userId and forceRefresh in req.query.
         * @param {Object} res - Express response object.
         * @returns {Promise<void>} Responds with a JSON object containing the meetings list.
         */
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
    /**
         * Deletes a specific meeting across the local database and the provider's API.
         * @param {Object} req - Express request object containing userId and meetingId in req.params.
         * @param {Object} res - Express response object.
         * @returns {Promise<void>} Responds with a success message upon successful deletion.
         */
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