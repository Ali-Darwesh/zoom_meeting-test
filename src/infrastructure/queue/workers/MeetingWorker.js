// src/infrastructure/queue/workers/MeetingWorker.js
const { Worker } = require('bullmq');
const Redis = require('ioredis');

// Import architectural layers (Factory, Repository, Entity, Cache)
const ProviderFactory = require('../../providers/ProviderFactory');
const PrismaMeetingRepository = require('../../repositories/PrismaMeetingRepository');
const Meeting = require('../../../domain/entities/Meeting');
const cache = require('../../cache/RedisService');

// Establish a dedicated Redis connection for BullMQ
const connection = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: null });

// Initialize the data persistence repository
const meetingRepository = new PrismaMeetingRepository();

/**
 * Background Worker for processing meeting creation tasks.
 * Consumes jobs from the 'meeting-tasks' queue.
 * Orchestrates the Meeting Entity, Provider Factory, and Repository to create and save meetings asynchronously.
 * * @param {Object} job - The BullMQ job object containing the payload (meetingDetails and userId).
 * @returns {Promise<{dbId: string|number, joinUrl: string}>} The database ID and the provider's join URL upon success.
 * @throws {Error} Throws an error to trigger BullMQ's automatic retry mechanism if the process fails.
 */
const worker = new Worker('meeting-tasks', async (job) => {
    // 1. Extract essential data from the job payload
    const { meetingDetails, userId } = job.data;
    console.log(`[Worker] 🛠️ Processing ${meetingDetails.providerName} meeting for user: ${userId}`);

    try {
        // 2. Reconstruct the Domain Entity
        // This ensures data integrity and re-applies strict domain validation rules
        const meetingEntity = new Meeting({
            title: meetingDetails.title,
            startTime: meetingDetails.startTime,
            durationInMinutes: meetingDetails.durationInMinutes,
            providerName: meetingDetails.providerName,
            userId: userId
        });

        //  3. Architectural Magic: The Factory Pattern
        // Dynamically resolves the correct provider (e.g., ZoomProvider) based on the requested providerName.
        console.log(`[Worker]  Getting Provider for: ${meetingEntity.providerName}`);
        const provider = ProviderFactory.getProvider(meetingEntity.providerName);

        // 4. Execute Provider API Call
        // Thanks to the IVideoConferenceService interface, we can safely call 'createMeeting' blindly.
        console.log(`[Worker]  Communicating with ${meetingEntity.providerName} API...`);
        const processedMeeting = await provider.createMeeting(meetingEntity);

        // 5. Persistence Layer: Save to Database
        // The Repository abstracts away the ORM logic, keeping the worker clean.
        console.log(`[Worker]  Persistence layer: Saving to Database...`);
        const savedRecord = await meetingRepository.save(processedMeeting);

        // 6. Cache Invalidation
        // Purge the cache immediately so the user sees the new meeting on their next dashboard refresh.
        await cache.del(`zoom_live_meetings:${userId}`);
        console.log(`[Worker] 🗑️ Cache invalidated for user: ${userId}`);

        return { dbId: savedRecord.id, joinUrl: savedRecord.joinUrl };

    } catch (error) {
        // Log the technical error and re-throw it so BullMQ knows the job failed and can execute retries.
        console.error(`[Worker] ❌ Error in Job ${job.id}:`, error.message);
        throw error;
    }
}, {
    connection,
    concurrency: 5 // Parallel Processing: Allows the worker to process up to 5 jobs simultaneously
});

/**
 * Observability: Event listener for successfully completed jobs.
 * Logs the final generated Join URL.
 */
worker.on('completed', (job, result) => {
    console.log(`[Worker] 🟢 Job ${job.id} [${job.data.meetingDetails.providerName}] finished. URL: ${result.joinUrl}`);
});

/**
 * Observability: Event listener for failed jobs.
 * Triggers if the job fails even after all configured retry attempts are exhausted.
 */
worker.on('failed', (job, err) => {
    console.error(`[Worker] 🔴 Job ${job.id} failed after attempts. Error: ${err.message}`);
});

module.exports = worker;