const { createClient } = require('redis');

class RedisService {
    constructor() {
        this.client = createClient({ url: process.env.REDIS_URL });
        this.client.on('error', (err) => console.error('Redis Error', err));
        this.connect();
    }
    async connect() {
        if (!this.client.isOpen) await this.client.connect();
    }
    async set(key, value, ttlSeconds = 3600) {
        await this.client.set(key, JSON.stringify(value), { EX: ttlSeconds });
    }
    async get(key) {
        const data = await this.client.get(key);
        return data ? JSON.parse(data) : null;
    }
    async del(key) {
        try {
            if (!this.client.isOpen) await this.connect();
            await this.client.del(key);
        } catch (error) {
            console.error('[Redis] Error deleting key:', error.message);
        }
    }
}
module.exports = new RedisService();