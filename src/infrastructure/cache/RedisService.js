const { createClient } = require('redis');
// Infrastructure Layer: Redis Cache Service
class RedisService {
    constructor() {
        // Initialize the Redis client using the connection string from environment variables
        this.client = createClient({ url: process.env.REDIS_URL });
        // Attach a global error listener to prevent the Node.js process from crashing
        // if the Redis server goes down unexpectedly
        this.client.on('error', (err) => console.error('Redis Error', err));
        this.connect();
    }
    // Ensures the client is actually connected before performing operations
    async connect() {
        if (!this.client.isOpen) await this.client.connect();
    }
    // Caches data in memory for extremely fast retrieval
    // ttlSeconds (Time-To-Live) defines how long the data stays alive before auto-deleting. Default is 1 hour.
    async set(key, value, ttlSeconds = 3600) {
        await this.client.set(key, JSON.stringify(value), { EX: ttlSeconds });
    }
    // Retrieves and parses cached data
    async get(key) {
        const data = await this.client.get(key);
        // Convert the stringified JSON back into a usable JavaScript object
        // Returns null if the key doesn't exist or has expired (Cache Miss)
        return data ? JSON.parse(data) : null;
    }
    // Deletes a specific key from the cache (Cache Invalidation)
    async del(key) {
        try {
            if (!this.client.isOpen) await this.connect();
            await this.client.del(key);
        } catch (error) {
            console.error('[Redis] Error deleting key:', error.message);
        }
    }
}
// Export a Singleton instance (new RedisService())
// This guarantees that all files requiring this module share the EXACT same Redis connection in memory
module.exports = new RedisService();