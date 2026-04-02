// src/presentation/controllers/ZoomAuthController.js
const axios = require('axios');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const cache = require('../../infrastructure/cache/RedisService');
const encryption = require('../../infrastructure/utils/EncryptionUtil');
/**
 * Presentation Layer: Zoom Authentication Controller
 * Handles the complete OAuth 2.0 authorization flow with Zoom, 
 * including redirection, token exchange, and connection status verification.
 */
class ZoomAuthController {

    /**
     * Initiates the Zoom OAuth flow by redirecting the user to Zoom's authorization page.
     * @param {Object} req - Express request object. Expects an optional 'userId' in the query string.
     * @param {Object} res - Express response object used for redirection.
     */
    login(req, res) {
        // In a production environment, userId should be extracted from a secure Session or JWT.
        // For development/testing, we accept it from the URL query or use a default mock UUID.
        const userId = req.query.userId || '123e4567-e89b-12d3-a456-426614174000';

        const zoomAuthUrl = `https://zoom.us/oauth/authorize?response_type=code&client_id=${process.env.ZOOM_CLIENT_ID}&redirect_uri=${process.env.ZOOM_REDIRECT_URI}&state=${userId}`;

        res.redirect(zoomAuthUrl);
    }

    /**
     * Handles the callback from Zoom after the user grants permission.
     * Exchanges the authorization code for an access token and persists it to the database.
     * @param {Object} req - Express request object containing 'code' and 'state' in the query string.
     * @param {Object} res - Express response object used to render the success/failure HTML page.
     */
    async callback(req, res) {
        // Extract the authorization code and the original userId (state) sent during login
        const { code, state: userId } = req.query;

        if (!code) {
            return res.status(400).send('❌ Zoom Authorization Failed: Code not received.');
        }

        try {
            // Prepare Zoom authentication headers (Client ID & Secret must be Base64 encoded)
            const authHeader = Buffer.from(`${process.env.ZOOM_CLIENT_ID}:${process.env.ZOOM_CLIENT_SECRET}`).toString('base64');

            // Exchange the authorization code for the actual access and refresh tokens
            const response = await axios.post('https://zoom.us/oauth/token', null, {
                params: {
                    grant_type: 'authorization_code',
                    code,
                    redirect_uri: process.env.ZOOM_REDIRECT_URI
                },
                headers: {
                    Authorization: `Basic ${authHeader}`,
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            });

            const { access_token, refresh_token, expires_in } = response.data;

            // Calculate the exact expiration timestamp
            const expiresAt = new Date(Date.now() + expires_in * 1000);

            // ⚠️ Dev/Test Step: Ensure the user exists in our database before attaching the token.
            // If the user doesn't exist, we create a dummy user record to satisfy foreign key constraints.
            let user = await prisma.user.findUnique({ where: { id: userId } });
            if (!user) {
                user = await prisma.user.create({
                    data: {
                        id: userId,
                        email: `dev_${userId}@test.com`,
                        name: "Test User"
                    }
                });
            }

            // Persist the OAuth tokens to the database securely
            await prisma.oAuthToken.upsert({
                where: { userId: user.id },
                update: { accessToken: encryption.encrypt(access_token), refreshToken: encryption.encrypt(refresh_token), expiresAt },
                create: { userId: user.id, accessToken: encryption.encrypt(access_token), refreshToken: encryption.encrypt(refresh_token), expiresAt }
            });

            // Invalidate any old tokens in the Redis cache to force the system to use the fresh ones
            await cache.del(`zoom_token:${userId}`);

            // Render a simple success screen to the user
            res.send(`
                <div style="font-family: sans-serif; text-align: center; margin-top: 50px;">
                    <h1 style="color: #4CAF50;">✅ Zoom Account Linked Successfully!</h1>
                    <p>Your token has been securely saved to the database. You can now return to Postman and test the API.</p>
                </div>
            `);

        } catch (error) {
            console.error('[OAuth Callback] Error:', error.response?.data || error.message);
            res.status(500).send('❌ An error occurred while communicating with the Zoom API.');
        }
    }

    /**
     * Checks if a specific user has an active Zoom connection (OAuth token) in the database.
     * @param {Object} req - Express request object containing 'userId' in the query string.
     * @param {Object} res - Express response object.
     * @returns {Promise<void>} Responds with a JSON boolean indicating connection status.
     */
    async checkStatus(req, res) {
        try {
            const userId = req.query.userId;

            if (!userId) {
                return res.status(400).json({ error: 'User ID is required' });
            }

            // Search the database for the user's OAuth credentials
            const tokenRecord = await prisma.oAuthToken.findUnique({
                where: { userId: userId }
            });

            // Return true if a record exists, otherwise false
            return res.json({ isConnected: !!tokenRecord });

        } catch (error) {
            console.error('[Check Status] Error:', error.message);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    }
}

module.exports = new ZoomAuthController();