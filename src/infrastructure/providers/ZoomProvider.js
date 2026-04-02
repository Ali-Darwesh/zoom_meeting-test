// src/infrastructure/providers/ZoomProvider.js
const axios = require('axios');
const { PrismaClient } = require('@prisma/client');
const cache = require('../cache/RedisService');
const encryption = require('../utils/EncryptionUtil'); // 👈 استدعاء طبقة التشفير

// 1. Import the interface
const IVideoConferenceService = require('../../application/interfaces/IVideoConferenceService');

const prisma = new PrismaClient();

// 2. Extend the interface to guarantee this class implements 'createMeeting'
class ZoomProvider extends IVideoConferenceService {

    // Initialize base API configurations using environment variables
    constructor() {
        super();
        this.baseURL = 'https://api.zoom.us/v2';
        this.oauthURL = 'https://zoom.us/oauth/token';
        this.clientId = process.env.ZOOM_CLIENT_ID;
        this.clientSecret = process.env.ZOOM_CLIENT_SECRET;
    }

    /**
     * Retrieves a valid Zoom access token for the given user.
     * Checks the Redis cache first, then the database, and automatically refreshes the token.
     */
    async getValidAccessToken(userId) {
        const cacheKey = `zoom_token:${userId}`;

        // Step 1: Check Redis cache (Tokens in cache are stored decrypted for speed)
        let token = await cache.get(cacheKey);
        if (token) return token;

        // Step 2: Fallback to Database
        const userToken = await prisma.oAuthToken.findUnique({ where: { userId } });
        if (!userToken) {
            throw new Error('ERR_USER_NOT_AUTHORIZED: User has not connected Zoom account');
        }

        // Step 3: Decrypt the token from DB 🔓
        // We decrypt it here to check expiration and to use it in API calls
        let decryptedAccessToken = encryption.decrypt(userToken.accessToken);
        let decryptedRefreshToken = encryption.decrypt(userToken.refreshToken);

        // Step 4: Expiration Check (Safe margin of 5 minutes)
        const isExpired = new Date() > new Date(userToken.expiresAt.getTime() - 5 * 60000);

        if (isExpired) {
            // Trigger refresh mechanism using the decrypted refresh token
            token = await this.refreshAccessToken(userId, decryptedRefreshToken);
        } else {
            // Token is still alive, store the decrypted version in Cache for the next 55 minutes
            token = decryptedAccessToken;
            await cache.set(cacheKey, token, 3300);
        }

        return token;
    }

    /**
     * Handles the OAuth 2.0 refresh flow.
     * Encrypts new tokens before saving to DB, but stores decrypted in Cache.
     */
    async refreshAccessToken(userId, refreshToken) {
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

            // Step 5: Encrypt new tokens before persisting to Database 🔐
            await prisma.oAuthToken.update({
                where: { userId },
                data: {
                    accessToken: encryption.encrypt(access_token),
                    refreshToken: encryption.encrypt(refresh_token),
                    expiresAt
                }
            });

            // Update Cache with the plain (decrypted) token for immediate use
            await cache.set(`zoom_token:${userId}`, access_token, expires_in - 300);

            return access_token;

        } catch (error) {
            console.error('[ZoomProvider] Failed to refresh token:', error.response?.data || error.message);
            throw new Error('ERR_ZOOM_AUTH_FAILED');
        }
    }

    // ... باقي الدوال (createMeeting, getUpcomingMeetings, deleteMeeting) تبقى كما هي 
    // لأنها تعتمد على getValidAccessToken التي أصبحت الآن تعيد توكن مفكوك التشفير وجاهز للاستخدام.

    async createMeeting(meetingEntity) {
        const token = await this.getValidAccessToken(meetingEntity.userId);
        try {
            const response = await axios.post(`${this.baseURL}/users/me/meetings`, {
                topic: meetingEntity.title,
                type: 2,
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
            meetingEntity.providerMeetingId = zoomData.id.toString();
            meetingEntity.joinUrl = zoomData.join_url;
            meetingEntity.rawResponse = zoomData;

            return meetingEntity;

        } catch (error) {
            console.error('[ZoomProvider] API Error:', error.response?.data || error.message);
            throw new Error('ERR_ZOOM_MEETING_CREATION_FAILED');
        }
    }

    async getUpcomingMeetings(userId) {
        const token = await this.getValidAccessToken(userId);
        try {
            const response = await axios.get(`${this.baseURL}/users/me/meetings`, {
                params: { type: 'upcoming', page_size: 100 },
                headers: { Authorization: `Bearer ${token}` }
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