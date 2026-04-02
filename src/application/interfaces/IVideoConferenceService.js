//Interface: Defines the standard contract for all video conference providers.
class IVideoConferenceService {
    async createMeeting(meetingEntity) {
        throw new Error('ERR_METHOD_NOT_IMPLEMENTED');
    }
}
module.exports = IVideoConferenceService;