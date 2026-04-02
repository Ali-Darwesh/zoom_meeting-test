require('dotenv').config();
const express = require('express');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

// 1. استيراد المسارات (Routes)
const meetingRoutes = require('./src/presentation/routes/meetingRoutes');
const zoomAuthRoutes = require('./src/presentation/routes/zoomAuthRoutes');

// 2. تشغيل الـ Worker في الخلفية
require('./src/infrastructure/queue/workers/MeetingWorker');

const app = express();
const PORT = process.env.PORT || 3000;

// 🛡️ 3. إعدادات الحماية (Middleware)
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { error: "عدد طلبات كبير جداً، يرجى المحاولة لاحقاً." }
});

app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
            connectSrc: ["'self'"],
            imgSrc: ["'self'", "data:"]
        },
    },
}));

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 🛣️ 4. تسجيل المسارات (Routing)
// أي طلب يبدأ بـ /api/meetings يذهب لملف الاجتماعات
app.use('/api', limiter, meetingRoutes);

// أي طلب يبدأ بـ /api/zoom يذهب لملف المصادقة
app.use('/api/zoom', zoomAuthRoutes);

app.listen(PORT, () => {
    console.log(`🚀 Server: http://localhost:${PORT}`);
    console.log(`📡 Background Worker is active`);
});