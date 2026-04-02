// src/infrastructure/queue/workers/MeetingWorker.js
const { Worker } = require('bullmq');
const Redis = require('ioredis');

// استدعاء الطبقات الجديدة (Factory بدلاً من Provider محدد)
const ProviderFactory = require('../../providers/ProviderFactory');
const PrismaMeetingRepository = require('../../repositories/PrismaMeetingRepository');
const Meeting = require('../../../domain/entities/Meeting');
const cache = require('../../cache/RedisService');

// إعداد الاتصال بـ Redis
const connection = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: null });

// تهيئة المستودع (Repository)
const meetingRepository = new PrismaMeetingRepository();

const worker = new Worker('meeting-tasks', async (job) => {
    // 1. استخراج البيانات الأساسية
    const { meetingDetails, userId } = job.data;
    console.log(`[Worker] 🛠️ Processing ${meetingDetails.providerName} meeting for user: ${userId}`);

    try {
        // 2. إعادة بناء الكيان (Entity)
        const meetingEntity = new Meeting({
            title: meetingDetails.title,
            startTime: meetingDetails.startTime,
            durationInMinutes: meetingDetails.durationInMinutes,
            providerName: meetingDetails.providerName,
            userId: userId
        });

        // 🚀 3. السحر الهندسي: المصنع يختار المزود تلقائياً بناءً على providerName
        // سيعيد ZoomProvider أو أي مزود آخر تضيفه مستقبلاً (مثل GoogleMeetProvider)
        console.log(`[Worker] 🌐 Getting Provider for: ${meetingEntity.providerName}`);
        const provider = ProviderFactory.getProvider(meetingEntity.providerName);

        // 4. استدعاء الـ API الخاص بالمزود (كل المزودين يجب أن يملكوا نفس اسم الدالة)
        console.log(`[Worker] 📡 Communicating with ${meetingEntity.providerName} API...`);
        const processedMeeting = await provider.createMeeting(meetingEntity);

        // 5. حفظ النتيجة النهائية في قاعدة البيانات عبر الـ Repository
        console.log(`[Worker] 💾 Persistence layer: Saving to Database...`);
        const savedRecord = await meetingRepository.save(processedMeeting);

        // 6. تنظيف الكاش فوراً ليرى المستخدم الاجتماع الجديد في القائمة
        await cache.del(`zoom_live_meetings:${userId}`);
        console.log(`[Worker] 🗑️ Cache invalidated for user: ${userId}`);

        return { dbId: savedRecord.id, joinUrl: savedRecord.joinUrl };

    } catch (error) {
        // تسجيل الخطأ التقني ورميه لـ BullMQ ليدير عمليات إعادة المحاولة (Retries)
        console.error(`[Worker] ❌ Error in Job ${job.id}:`, error.message);
        throw error;
    }
}, {
    connection,
    concurrency: 5 // معالجة 5 مهام بالتوازي (Parallel Processing)
});

// مراقبة الحالة (Observability)
worker.on('completed', (job, result) => {
    console.log(`[Worker] 🟢 Job ${job.id} [${job.data.meetingDetails.providerName}] finished. URL: ${result.joinUrl}`);
});

worker.on('failed', (job, err) => {
    console.error(`[Worker] 🔴 Job ${job.id} failed after attempts. Error: ${err.message}`);
});

module.exports = worker;