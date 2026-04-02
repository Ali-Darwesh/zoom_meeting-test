// src/presentation/routes/meetingRoutes.js
const express = require('express');
const router = express.Router();
const meetingController = require('../controllers/MeetingController');
const rateLimit = require('express-rate-limit');
// 🛡️ إنشاء محدد طلبات مخصص لزر التحديث فقط
const refreshLimiter = rateLimit({
    windowMs: 60 * 1000, // إطار زمني: دقيقة واحدة (60 ثانية)
    max: 30, // الحد الأقصى: 5 طلبات في الدقيقة لكل عنوان IP
    message: {
        error: 'لقد تجاوزت الحد المسموح لتحديث القائمة (5 مرات في الدقيقة). يرجى الانتظار قليلاً لحماية النظام.'
    },
    standardHeaders: true, // إرسال معلومات الحد في الـ Headers
    legacyHeaders: false,
});

// تطبيق المحدد (refreshLimiter) فقط على طلب الجلب (GET)
router.get('/meetings', refreshLimiter, meetingController.list);
router.post('/meetings', meetingController.schedule);
router.delete('/meetings/:userId/:meetingId', meetingController.delete);
module.exports = router;