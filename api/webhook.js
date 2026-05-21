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

        // Extract project name to use for smarter duplication check
        const lines = cleanText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        let currentProjectName = '';
        if (lines.length >= 2 && !lines[1].includes(':')) {
            currentProjectName = lines[1].toLowerCase();
        }

        const messageData = {
            id: msg.message_id,
            text: cleanText,
            sender: msg.from?.username || msg.from?.first_name || 'Unknown',
            timestamp: msg.date * 1000, // Convert to milliseconds
            chatName: msg.chat?.title || 'Private Chat',
            projectName: currentProjectName // Store this to make future checks easier
        };

        // Anti-Duplication: check existing messages in Redis
        const existingMessages = await redis.lrange('telegram_messages', 0, 49) || [];
        
        const isDuplicate = existingMessages.some(m => {
            // Check 1: Exact text match
            if (m.text === cleanText) return true;
            
            // Check 2: Same project name
            // (If we previously saved it, use m.projectName. Otherwise, parse it from m.text)
            let mProjectName = m.projectName;
            if (mProjectName === undefined) {
                const mLines = m.text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
                if (mLines.length >= 2 && !mLines[1].includes(':')) {
                    mProjectName = mLines[1].toLowerCase();
                }
            }
            
            if (currentProjectName && mProjectName && currentProjectName === mProjectName) {
                return true;
            }
            
            return false;
        });

        if (!isDuplicate) {
            // Push the new message to the beginning of the list
            await redis.lpush('telegram_messages', JSON.stringify(messageData));
            
            // Keep only the latest 50 messages
            await redis.ltrim('telegram_messages', 0, 49);
            console.log('Successfully saved new message to Redis.');

            // Forward to Discord if URL is provided
            if (process.env.DISCORD_WEBHOOK_URL) {
                try {
                    let description = '';
                    const fields = [];
                    const knownKeys = /^(Name|Followers|Following|Created|Tweets|Followed by)/i;
                    
                    for (let i = 2; i < lines.length; i++) {
                        const line = lines[i];
                        if (line.match(/^\d{2}:\d{2}\s*-\s*\d{2}\/\d{2}\/\d{4}$/)) continue;
                        
                        const colonIndex = line.indexOf(':');
                        if (colonIndex !== -1 && !line.match(/^\d{2}:\d{2}/)) {
                            const k = line.substring(0, colonIndex).trim();
                            const v = line.substring(colonIndex + 1).trim();
                            if (!k.toLowerCase().includes('followed by')) {
                                fields.push({ name: k, value: v, inline: false });
                            }
                        } else {
                            if (!line.match(knownKeys)) {
                                description += line + '\n';
                            }
                        }
                    }

                    const embed = {
                        title: currentProjectName || 'New Alert',
                        url: currentProjectName ? `https://x.com/${currentProjectName.replace('@', '')}` : null,
                        description: description.trim(),
                        color: 16776960, // Yellow accent line
                        fields: fields
                    };

                    await fetch(process.env.DISCORD_WEBHOOK_URL, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ embeds: [embed] })
                    });
                    console.log('Successfully forwarded to Discord.');
                } catch (discordErr) {
                    console.error('Error forwarding to Discord:', discordErr);
                }
            }
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
