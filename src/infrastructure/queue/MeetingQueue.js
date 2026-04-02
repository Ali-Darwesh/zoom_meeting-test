const { Queue } = require('bullmq');
const Redis = require('ioredis');

// 1. Establish a dedicated Redis connection for the Queue Producer
const connection = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: null });
// 2. Initialize the Job Queue
const meetingQueue = new Queue('meeting-tasks', { connection });

/**
 * Adds a new meeting creation task to the background queue.
 * Implements robust fault-tolerance mechanisms including automatic retries and exponential backoff
 * to handle temporary network failures or API rate limits gracefully.
 * * @param {Object} meetingData - The payload containing the validated Meeting entity and userId.
 * @returns {Promise<void>} Resolves when the task is successfully stored in Redis.
 */
const addMeetingTask = async (meetingData) => {
    await meetingQueue.add('create-zoom-meeting', meetingData, {
        // Resilience Strategy (Fault Tolerance):
        // If the Zoom API is temporarily down, the worker will automatically retry the job up to 3 times.
        attempts: 3,
        // Exponential Backoff Pattern:
        // Instead of retrying immediately (which might block the system or get us banned by Zoom),
        // we wait 5 seconds for the first retry, 25 seconds for the second, and so on.
        // This is a highly professional standard for rate-limit protection.
        backoff: { type: 'exponential', delay: 5000 }
    });
};

module.exports = { addMeetingTask };