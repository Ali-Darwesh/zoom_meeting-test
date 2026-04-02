// src/application/services/MeetingService.js
const ZoomProvider = require('../../infrastructure/providers/ZoomProvider');
const zoomProvider = new ZoomProvider();
const cache = require('../../infrastructure/cache/RedisService');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
class MeetingService {

    // دالة جلب الاجتماعات الحية من الكاش أو زووم
    async getLiveMeetings(userId, forceRefresh) {
        // 1. قفل أمني: التأكد من أن المستخدم مربوط بزووم
        const tokenExists = await prisma.oAuthToken.findUnique({ where: { userId } });
        if (!tokenExists) {
            return { source: 'none', meetings: [] };
        }

        const cacheKey = `zoom_live_meetings:${userId}`;

        if (forceRefresh === 'true' || forceRefresh === true) {
            await cache.del(cacheKey);
        }

        // 2. الجلب من الكاش (إذا كان موجوداً، لا نرهق قاعدة البيانات أو زووم)
        const cachedMeetings = await cache.get(cacheKey);
        if (cachedMeetings) {
            return { source: 'cache', meetings: cachedMeetings };
        }

        // 3. إذا لم يكن هناك كاش، نجلب البيانات الحية من زووم
        console.log('🔄 Syncing local Database with Zoom API...');
        const zoomMeetings = await zoomProvider.getUpcomingMeetings(userId);

        // --- خوارزمية المزامنة الذكية (Database Sync Algorithm) ---

        // أ) استخراج قائمة بأرقام الاجتماعات القادمة من زووم
        const zoomMeetingIds = zoomMeetings.map(m => m.id.toString());

        // ب) حلقة مرورية (Loop): إضافة الجديد، وتحديث المتغير
        // استخدام upsert يعني: إذا وجدته قم بتحديثه، وإذا لم تجده قم بإنشائه
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

        // ج) تنظيف قاعدة البيانات: حذف أي اجتماع محلي لم يعد موجوداً في زووم
        // نحذف فقط اجتماعات هذا المستخدم التي الـ ID الخاص بها ليس في قائمة زووم الجديدة
        await prisma.meeting.deleteMany({
            where: {
                userId: userId,
                zoomMeetingId: { notIn: zoomMeetingIds }
            }
        });

        // ---  نهاية خوارزمية المزامنة ---

        // 4. توحيد شكل البيانات للواجهة
        const formattedMeetings = zoomMeetings.map(m => ({
            id: m.id, // نرسل ID زووم للواجهة لكي يسهل التعامل معه
            title: m.topic,
            startTime: m.start_time,
            joinUrl: m.join_url
        }));

        // 5. حفظ النتيجة المتزامنة في الكاش لمدة 60 ثانية لحماية النظام
        await cache.set(cacheKey, formattedMeetings, 60);

        return { source: 'database_synced', meetings: formattedMeetings };
    }
    // دالة حذف الاجتماع
    async deleteMeeting(userId, meetingId) {
        // 1. البحث في قاعدة البيانات باستخدام zoomMeetingId (لأن الواجهة ترسل رقم زووم)
        // حولنا meetingId إلى نص (String) ليتطابق مع نوع الحقل في Prisma
        const meeting = await prisma.meeting.findUnique({
            where: { zoomMeetingId: meetingId.toString() }
        });

        // 2. التحقق من وجود الاجتماع
        if (!meeting) {
            throw new Error("الاجتماع غير موجود أو تم حذفه مسبقاً");
        }

        // 3. الحماية من ثغرة IDOR
        if (meeting.userId !== userId) {
            throw new Error("عملية مرفوضة: غير مصرح لك بحذف اجتماعات مستخدمين آخرين");
        }

        // 4. الحذف من سيرفرات Zoom
        await zoomProvider.deleteMeeting(userId, meeting.zoomMeetingId);

        // 5. الحذف من قاعدة بياناتنا المحلية (نستخدم الـ ID الأساسي للاجتماع الذي وجدناه)
        await prisma.meeting.delete({
            where: { id: meeting.id }
        });

        // 6. إبطال الكاش فوراً
        await cache.del(`zoom_live_meetings:${userId}`);

        return true;
    }
}

module.exports = new MeetingService();