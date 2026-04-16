import { Redis } from '@upstash/redis';

// Initialize Redis client. Vercel automatically populates UPSTASH_REDIS_REST_URL 
// and UPSTASH_REDIS_REST_TOKEN when you link an Upstash Redis database.
const redis = Redis.fromEnv();

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        // Fetch up to the 50 most recent messages
        // Messages are stored as JSON strings in a Redis List
        const rawMessages = await redis.lrange('telegram_messages', 0, 49) || [];
        
        // Return parsed messages (or empty array if none)
        res.status(200).json(rawMessages);
    } catch (error) {
        console.error('Error fetching messages from Redis:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
}
