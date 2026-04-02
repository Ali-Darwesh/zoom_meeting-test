const express = require('express');
const router = express.Router();
const zoomAuthController = require('../controllers/ZoomAuthController');

// جميع هذه المسارات ستبدأ بـ /api/zoom في ملف server.js
router.get('/', zoomAuthController.login);
router.get('/callback', zoomAuthController.callback);
router.get('/status', zoomAuthController.checkStatus);

module.exports = router;