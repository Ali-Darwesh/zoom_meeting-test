// src/domain/entities/Meeting.js
const crypto = require('crypto'); // استخدام مكتبة Node.js الأصلية

class Meeting {
    constructor({ title, startTime, durationInMinutes, providerName, userId }) {
        if (!title || !startTime || !providerName || !userId) {
            throw new Error("Missing required meeting fields");
        }

        // استخدام crypto المدمجة بدلاً من مكتبة uuid الخارجية
        this.id = crypto.randomUUID();

        this.title = title;
        this.startTime = new Date(startTime);
        this.durationInMinutes = durationInMinutes;
        this.providerName = providerName;
        this.userId = userId;

        this.providerMeetingId = null;
        this.joinUrl = null;
    }
}

module.exports = Meeting;