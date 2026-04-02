// src/presentation/controllers/ZoomAuthController.js
const axios = require('axios');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const cache = require('../../infrastructure/cache/RedisService');
class ZoomAuthController {

    // 1. مسار توجيه المستخدم لصفحة تسجيل الدخول في زووم
    login(req, res) {
        // في التطبيقات الحقيقية نأخذ الـ userId من الجلسة (Session/JWT)
        // للتجربة هنا، سنأخذه من الرابط، أو نستخدم الـ ID الوهمي الخاص بنا
        const userId = req.query.userId || '123e4567-e89b-12d3-a456-426614174000';

        // نمرر الـ userId داخل المتغير state لكي لا يضيع عندما يعود المستخدم من زووم
        const zoomAuthUrl = `https://zoom.us/oauth/authorize?response_type=code&client_id=${process.env.ZOOM_CLIENT_ID}&redirect_uri=${process.env.ZOOM_REDIRECT_URI}&state=${userId}`;

        res.redirect(zoomAuthUrl);
    }

    // 2. مسار العودة (Callback) الذي سيرسل إليه زووم الكود بعد موافقة المستخدم
    async callback(req, res) {
        const { code, state: userId } = req.query;

        if (!code) {
            return res.status(400).send('❌ فشل تفويض زووم: لم يتم استلام الكود.');
        }

        try {
            // تجهيز بيانات المصادقة لزووم (تشفير Client ID و Secret بـ Base64)
            const authHeader = Buffer.from(`${process.env.ZOOM_CLIENT_ID}:${process.env.ZOOM_CLIENT_SECRET}`).toString('base64');

            // طلب التوكن الفعلي من زووم باستخدام الكود
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

            // حساب وقت انتهاء التوكن
            const expiresAt = new Date(Date.now() + expires_in * 1000);

            // ⚠️ خطوة ذكية للتجربة: التأكد من وجود المستخدم في DB أولاً، وإن لم يكن موجوداً ننشئه
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

            // حفظ أو تحديث التوكن في جدول OAuthToken
            await prisma.oAuthToken.upsert({
                where: { userId: user.id },
                update: { accessToken: access_token, refreshToken: refresh_token, expiresAt },
                create: { userId: user.id, accessToken: access_token, refreshToken: refresh_token, expiresAt }
            });
            await cache.del(`zoom_token:${userId}`);
            // الرد على العميل بنجاح العملية
            res.send(`
                <div style="font-family: sans-serif; text-align: center; margin-top: 50px;">
                    <h1 style="color: #4CAF50;">✅ تم ربط حساب زووم بنجاح!</h1>
                    <p>تم حفظ التوكن في قاعدة البيانات. يمكنك الآن العودة لـ Postman وإرسال طلب إنشاء الاجتماع مرة أخرى.</p>
                </div>
            `);

        } catch (error) {
            console.error('[OAuth Callback] Error:', error.response?.data || error.message);
            res.status(500).send('❌ حدث خطأ أثناء الاتصال بـ Zoom API.');
        }
    }

    // 3. مسار للتحقق من حالة اتصال المستخدم
    async checkStatus(req, res) {
        try {
            const userId = req.query.userId;

            if (!userId) {
                return res.status(400).json({ error: 'User ID is required' });
            }

            // البحث عن التوكن الخاص بهذا المستخدم في قاعدة البيانات
            const tokenRecord = await prisma.oAuthToken.findUnique({
                where: { userId: userId }
            });

            // إذا وجدنا السجل، يعني أن المستخدم متصل
            if (tokenRecord) {
                return res.json({ isConnected: true });
            } else {
                return res.json({ isConnected: false });
            }

        } catch (error) {
            console.error('[Check Status] Error:', error.message);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    }
}

module.exports = new ZoomAuthController();