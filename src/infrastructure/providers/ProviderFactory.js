const ZoomProvider = require('./ZoomProvider');
// const GoogleMeetProvider = require('./GoogleMeetProvider'); // للمستقبل

class ProviderFactory {
    static getProvider(name) {
        switch (name.toLowerCase()) {
            case 'zoom':
                return new ZoomProvider();
            case 'google-meet':
                // return new GoogleMeetProvider(); // سيعمل بمجرد إضافة الملف
                throw new Error("Google Meet لم يتم تفعيله برمجياً بعد");
            default:
                throw new Error(`المزود ${name} غير مدعوم`);
        }
    }
}

module.exports = ProviderFactory;