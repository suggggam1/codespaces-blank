import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

export default async function handler(req, res) {
    // Telegram webhooks must be POST requests
    if (req.method !== 'POST') {
        return res.status(405).send('Method Not Allowed');
    }

    try {
        const update = req.body;
        
        // We only care about message updates
        if (!update || !update.message) {
            return res.status(200).send('OK');
        }

        const msg = update.message;
        const targetGroupId = process.env.TELEGRAM_GROUP_ID;

        // Check if message belongs to the target group (if configured)
        if (targetGroupId && msg.chat.id.toString() !== targetGroupId) {
            return res.status(200).send('OK'); // Acknowledge anyway so Telegram stops sending it
        }

        let cleanText = msg.text || '[Media/Attachment]';

        // Clean up the TeleFeed formatting (Remove "Search: Profile Image" and "• Sent via TeleFeed")
        const searchPattern = /Search: Profile Image/i;
        const telefeedPattern = /• Sent via TeleFeed/i;
        
        if (cleanText.match(searchPattern)) {
            cleanText = cleanText.split(searchPattern)[0].trim();
        } else if (cleanText.match(telefeedPattern)) {
            cleanText = cleanText.split(telefeedPattern)[0].trim();
        }

        const messageData = {
            id: msg.message_id,
            text: cleanText,
            sender: msg.from?.username || msg.from?.first_name || 'Unknown',
            timestamp: msg.date * 1000, // Convert to milliseconds
            chatName: msg.chat?.title || 'Private Chat'
        };

        // Anti-Duplication: check existing messages in Redis
        const existingMessages = await redis.lrange('telegram_messages', 0, 49) || [];
        
        const isDuplicate = existingMessages.some(m => m.text === cleanText);

        if (!isDuplicate) {
            // Push the new message to the beginning of the list
            await redis.lpush('telegram_messages', JSON.stringify(messageData));
            
            // Keep only the latest 50 messages
            await redis.ltrim('telegram_messages', 0, 49);
            console.log('Successfully saved new message to Redis.');
        } else {
            console.log('Duplicate message ignored.');
        }

        // Always return 200 OK to Telegram
        res.status(200).send('OK');

    } catch (error) {
        console.error('Webhook Error:', error);
        // Still return 200 so Telegram doesn't aggressively retry on our internal errors
        res.status(200).send('OK');
    }
}
