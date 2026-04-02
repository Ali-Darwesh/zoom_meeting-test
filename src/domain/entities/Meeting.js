// src/domain/entities/Meeting.js
const crypto = require('crypto');


// Core Entity: Represents a Meeting in our domain
// This class ensures that any meeting object created is always valid and consistent
class Meeting {
    constructor({ title, startTime, durationInMinutes, providerName, userId }) {
        // Step 1: Strict Validation
        // Prevent creating a corrupted meeting object if core data is missing
        if (!title || !startTime || !providerName || !userId) {
            throw new Error("Missing required meeting fields");
        }

        // Step 2: Generate Internal Identity
        // Using native randomUUID is faster and removes the need for external 'uuid' package
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