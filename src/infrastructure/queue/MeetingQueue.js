const { Queue } = require('bullmq');
const Redis = require('ioredis');

const connection = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: null });
const meetingQueue = new Queue('meeting-tasks', { connection });

const addMeetingTask = async (meetingData) => {
    await meetingQueue.add('create-zoom-meeting', meetingData, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 }
    });
};

module.exports = { addMeetingTask };