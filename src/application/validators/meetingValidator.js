const Joi = require('joi');
// Centralized list of supported video conferencing providers.
const allowedProviders = ['zoom', 'google-meet'];
// Schema 1: Create Meeting Validation
const meetingSchema = Joi.object({
    title: Joi.string().min(3).max(100).required().messages({
        'string.empty': 'عنوان الاجتماع لا يمكن أن يكون فارغاً',
        'string.min': 'العنوان يجب أن يكون 3 أحرف على الأقل',
        'string.max': 'العنوان يجب أن يكون 100 حرف على الأكثر'
    }),
    startTime: Joi.date().greater('now').required().messages({
        'date.greater': 'لا يمكن جدولة اجتماع في الماضي'
    }),
    durationInMinutes: Joi.number().integer().min(1).max(1440).default(40),
    userId: Joi.string().uuid().required(), // التأكد من أنه UUID صالح
    providerName: Joi.string().valid(...allowedProviders).required().messages({
        'any.only': 'مزود الخدمة هذا غير مدعوم حالياً'
    })
});
// Schema 2: Delete Meeting Validation
const deleteMeetingSchema = Joi.object({
    userId: Joi.string().uuid().required().messages({
        'string.guid': 'معرف المستخدم غير صالح'
    }),
    meetingId: Joi.string().required().messages({
        'string.empty': 'معرف الاجتماع مطلوب'
    })
});

module.exports = { meetingSchema, deleteMeetingSchema };