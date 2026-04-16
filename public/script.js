document.addEventListener('DOMContentLoaded', () => {
    const messageContainer = document.getElementById('message-container');
    let lastMessageCount = 0;

    async function fetchMessages() {
        try {
            const response = await fetch('/api/messages');
            const messages = await response.json();

            // Only re-render if we have new messages or if it's the first load
            if (messages.length === 0) {
                messageContainer.innerHTML = '<div class="no-messages">No projects found yet. Waiting for new alerts in the group...</div>';
                return;
            }

            // Simple diff check (could be improved, but fine for this example)
            if (messages.length !== lastMessageCount || (messages.length > 0 && lastMessageCount > 0 && messages[0].id !== lastMessageCount.lastId)) {
                renderMessages(messages);
                lastMessageCount = messages.length;
                lastMessageCount.lastId = messages[0].id;
            }
        } catch (error) {
            console.error('Error fetching messages:', error);
            if (lastMessageCount === 0) {
                messageContainer.innerHTML = '<div class="loading" style="color: red;">Error connecting to server.</div>';
            }
        }
    }

    function renderMessages(messages) {
        messageContainer.innerHTML = ''; // Clear container

        messages.forEach(msg => {
            const messageEl = document.createElement('div');
            messageEl.className = 'message';

            const date = new Date(msg.timestamp);
            const timeString = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' - ' + date.toLocaleDateString();

            // Attempt to parse the TeleFeed message into structured embed fields
            const parsedData = parseMessageText(msg.text);
            
            let contentHTML = '';

            if (parsedData.isStructured) {
                // Render as structured embed
                let fieldsHTML = '';
                parsedData.fields.forEach(field => {
                    fieldsHTML += `
                        <div class="embed-field">
                            <div class="embed-field-name">${escapeHTML(field.key)}</div>
                            <div class="embed-field-value">${escapeHTML(field.value)}</div>
                        </div>
                    `;
                });

                // If projectName exists, strip any @ symbols just in case, and trim
                const twitterHandle = parsedData.projectName ? parsedData.projectName.replace('@', '').trim() : '';
                
                contentHTML = `
                    <div class="embed-title">${escapeHTML(parsedData.title)}</div>
                    ${parsedData.projectName ? `<a href="https://x.com/${escapeHTML(twitterHandle)}" target="_blank" class="embed-project-name">${escapeHTML(parsedData.projectName)}</a>` : ''}
                    <div class="embed-fields">
                        ${fieldsHTML}
                    </div>
                `;
            } else {
                // Fallback for unstructured text
                contentHTML = `<div style="white-space: pre-wrap; font-size: 0.95rem;">${escapeHTML(msg.text)}</div>`;
            }

            messageEl.innerHTML = `
                <div class="embed-content">
                    ${contentHTML}
                </div>
                <div class="message-footer">
                    <span class="timestamp">${timeString}</span>
                </div>
            `;

            messageContainer.appendChild(messageEl);
        });
    }

    // Parses the specific text format into title, projectName, and key-value fields
    function parseMessageText(text) {
        const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        
        if (lines.length < 3) return { isStructured: false };

        const title = lines[0]; // e.g. "📢 NEW ACCOUNT FOUND"
        let projectName = '';
        const fields = [];
        let startIndex = 1;

        // The second line is usually the raw handle/project name, e.g. "PulsePredictor"
        // But let's check if it has a colon. If not, it's the project name.
        if (!lines[1].includes(':')) {
            projectName = lines[1];
            startIndex = 2;
        }

        // Known keys to help parse newline-separated formats
        const knownKeys = /^(Name|Followers|Following|Created|Tweets|Followed by)/i;

        // Parse remaining lines
        for (let i = startIndex; i < lines.length; i++) {
            const line = lines[i];
            
            // Skip pure timestamp lines if they snuck in
            if (line.match(/^\d{2}:\d{2}\s*-\s*\d{2}\/\d{2}\/\d{4}$/)) {
                continue;
            }

            const colonIndex = line.indexOf(':');
            let key = '';
            let value = '';
            
            if (colonIndex !== -1 && !line.match(/^\d{2}:\d{2}/)) { // ensure it's not a timestamp colon
                key = line.substring(0, colonIndex).trim();
                value = line.substring(colonIndex + 1).trim();
            } else {
                key = line;
                // If the next line exists and doesn't look like another known key, it's the value
                if (i + 1 < lines.length && !lines[i+1].match(knownKeys)) {
                    value = lines[i+1].trim();
                    i++; // Skip the value line in the next iteration
                }
            }

            // Exclude "Followed by" entirely as requested
            if (key.toLowerCase().includes('followed by')) {
                continue;
            }

            if (key) {
                fields.push({ key, value });
            }
        }

        // Consider it structured if we found at least 2 valid fields
        const validFields = fields.filter(f => f.value !== '').length;
        if (validFields >= 2) {
            return {
                isStructured: true,
                title,
                projectName,
                fields
            };
        }

        return { isStructured: false };
    }

    // Helper function to prevent XSS
    function escapeHTML(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // Fetch immediately, then poll every 3 seconds
    fetchMessages();
    setInterval(fetchMessages, 3000);
});