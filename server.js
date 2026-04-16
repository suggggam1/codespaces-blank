require('dotenv').config();
const express = require('express');
const cors = require('cors');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.static('public')); // Serve the frontend

// In-memory storage for messages
const messages = [];

// Initialize Telegram Bot
const token = process.env.TELEGRAM_BOT_TOKEN;
let bot;

if (token) {
    bot = new TelegramBot(token, { polling: true });
    console.log('Telegram bot initialized.');

    // Listen for any kind of message
    bot.on('message', (msg) => {
        const chatId = msg.chat.id;
        
        // We only want to process group messages if a specific group ID is set,
        // or just accept all messages if no specific group is configured.
        const targetGroupId = process.env.TELEGRAM_GROUP_ID;
        
        if (!targetGroupId || msg.chat.id.toString() === targetGroupId) {
            let cleanText = msg.text || '[Media/Attachment]';
            
            // Clean up the TeleFeed formatting
            // Remove "Search: Profile Image" and everything after it
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
                sender: msg.from.username || msg.from.first_name || 'Unknown',
                timestamp: msg.date * 1000, // Convert to milliseconds
                chatName: msg.chat.title || 'Private Chat'
            };

            // Check for duplicates based on exact text content
            const isDuplicate = messages.some(m => m.text === cleanText);
            
            if (!isDuplicate) {
                console.log('New message received:', messageData);
                
                // Store message and keep only the latest 50
                messages.unshift(messageData);
                if (messages.length > 50) {
                    messages.pop();
                }
            } else {
                console.log('Duplicate message ignored:', cleanText.substring(0, 30) + '...');
            }
        }
    });

    bot.on('polling_error', (error) => {
        console.error('Polling error:', error.code, error.message);
    });
} else {
    console.warn('⚠️ TELEGRAM_BOT_TOKEN is not set in the .env file. Bot is not running.');
}

// API Endpoint to get messages
app.get('/api/messages', (req, res) => {
    res.json(messages);
});

// Start the server
app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});
