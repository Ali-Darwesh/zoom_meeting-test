const { addMeetingTask } = require('../../infrastructure/queue/MeetingQueue');
const Meeting = require('../../domain/entities/Meeting');

// Core Use Case: Orchestrates the process of scheduling a new meeting.
// This class acts as the bridge between the Controller (Presentation layer)
// and the Background Workers (Infrastructure layer).
class ScheduleMeetingAction {
    async execute(meetingData, userId) {
        // Step 1: Strict Domain Validation
        const meeting = new Meeting({ ...meetingData, userId });

        // Step 2: Add task to queue
        await addMeetingTask({
            meetingDetails: meeting,
            userId: userId
        });

        // Step 3: Immediate Client Feedback (Fire and Forget)
        return {
            status: 'queued',
            message: 'Meeting creation is in progress.'
        };
    }
}
module.exports = ScheduleMeetingAction;