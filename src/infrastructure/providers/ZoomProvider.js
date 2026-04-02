// src/infrastructure/providers/ZoomProvider.js
const axios = require('axios');
const { PrismaClient } = require('@prisma/client');
const cache = require('../cache/RedisService');

const prisma = new PrismaClient();

class ZoomProvider {
    constructor() {
        this.baseURL = 'https://api.zoom.us/v2';
        this.oauthURL = 'https://zoom.us/oauth/token';
        this.clientId = process.env.ZOOM_CLIENT_ID;
        this.clientSecret = process.env.ZOOM_CLIENT_SECRET;
    }

    /**
     * دالة داخلية ذكية لجلب الـ Access Token
     * تبحث في الكاش أولاً، وإذا كان منتهياً تقوم بتجديده تلقائياً
     */
    async getValidAccessToken(userId) {
        const cacheKey = `zoom_token:${userId}`;

        // 1. محاولة الجلب من الذاكرة السريعة (Redis)
        let token = await cache.get(cacheKey);
        if (token) return token;

        // 2. إذا لم يكن في الكاش، نجلبه من قاعدة البيانات
        const userToken = await prisma.oAuthToken.findUnique({ where: { userId } });
        if (!userToken) {
            throw new Error('ERR_USER_NOT_AUTHORIZED: User has not connected Zoom account');
        }

        // 3. التحقق من الصلاحية (مع ترك هامش أمان 5 دقائق قبل الانتهاء الفعلي)
        const isExpired = new Date() > new Date(userToken.expiresAt.getTime() - 5 * 60000);

        if (isExpired) {
            // تجديد التوكن إذا كان منتهياً
            token = await this.refreshAccessToken(userId, userToken.refreshToken);
        } else {
            token = userToken.accessToken;
            // تخزينه في الكاش لمدة 55 دقيقة (التوكن الخاص بـ Zoom صالح لساعة)
            await cache.set(cacheKey, token, 3300);
        }

        return token;
    }

    /**
     * دالة مساعدة لتجديد التوكن عبر Zoom OAuth
     */
    async refreshAccessToken(userId, refreshToken) {
        // Zoom يتطلب إرسال الـ Client ID & Secret مشفرة بـ Base64 في الـ Header
        const authHeader = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');

        try {
            const response = await axios.post(this.oauthURL, null, {
                params: {
                    grant_type: 'refresh_token',
                    refresh_token: refreshToken
                },
                headers: {
                    Authorization: `Basic ${authHeader}`,
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            });

            const { access_token, refresh_token, expires_in } = response.data;
            const expiresAt = new Date(Date.now() + expires_in * 1000);

            // تحديث التوكن في قاعدة البيانات
            await prisma.oAuthToken.update({
                where: { userId },
                data: {
                    accessToken: access_token,
                    refreshToken: refresh_token,
                    expiresAt
                }
            });

            // تحديث الكاش بالتوكن الجديد
            await cache.set(`zoom_token:${userId}`, access_token, expires_in - 300);

            return access_token;

        } catch (error) {
            console.error('[ZoomProvider] Failed to refresh token:', error.response?.data || error.message);
            throw new Error('ERR_ZOOM_AUTH_FAILED');
        }
    }


    async createMeeting(meetingEntity) {
        // جلب توكن صالح للمستخدم صاحب الاجتماع
        const token = await this.getValidAccessToken(meetingEntity.userId);

        try {
            const response = await axios.post(`${this.baseURL}/users/me/meetings`, {
                topic: meetingEntity.title,
                type: 2, // 2 يعني اجتماع مجدول (Scheduled Meeting)
                start_time: meetingEntity.startTime.toISOString(),
                duration: meetingEntity.durationInMinutes,
                timezone: 'UTC',
                settings: {
                    host_video: true,
                    participant_video: true,
                    join_before_host: false,
                    waiting_room: true
                }
            }, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            const zoomData = response.data;

            // تحديث كائن الاجتماع بالبيانات الراجعة من زووم
            meetingEntity.providerMeetingId = zoomData.id.toString();
            meetingEntity.joinUrl = zoomData.join_url;
            meetingEntity.rawResponse = zoomData; // نحتفظ بالرد كاملاً لنخزنه في الـ JSONB في قاعدة البيانات

            return meetingEntity;

        } catch (error) {
            console.error('[ZoomProvider] API Error:', error.response?.data || error.message);
            throw new Error('ERR_ZOOM_MEETING_CREATION_FAILED');
        }
    }
    /**
     * جلب الاجتماعات القادمة مباشرة من Zoom API
     */
    async getUpcomingMeetings(userId) {
        // جلب توكن صالح للمستخدم
        const token = await this.getValidAccessToken(userId);

        try {
            const response = await axios.get(`${this.baseURL}/users/me/meetings`, {
                params: {
                    type: 'upcoming', // جلب الاجتماعات القادمة فقط
                    page_size: 100    // الحد الأقصى للصفحة
                },
                headers: {
                    Authorization: `Bearer ${token}`
                }
            });

            return response.data.meetings;

        } catch (error) {
            console.error('[ZoomProvider] Fetch Meetings Error:', error.response?.data || error.message);
            throw new Error('ERR_FETCHING_ZOOM_MEETINGS');
        }
    }
    async deleteMeeting(userId, meetingId) {
        const token = await this.getValidAccessToken(userId);
        try {
            await axios.delete(`${this.baseURL}/meetings/${meetingId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            return true;
        } catch (error) {
            console.error('[ZoomProvider] Delete Error:', error.response?.data || error.message);
            throw new Error('ERR_DELETE_ZOOM_MEETING');
        }
    }
}

module.exports = ZoomProvider;