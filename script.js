document.addEventListener('DOMContentLoaded', () => {
    const liveFeedContainer = document.getElementById('live-feed');
    const curatedFeedContainer = document.getElementById('curated-feed');
    const tabBtns = document.querySelectorAll('.tab-btn');
    
    let lastMessageCount = 0;
    let curatedLoaded = false;

    // Tab Switching Logic
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            // Remove active class from all
            tabBtns.forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.message-container').forEach(c => c.style.display = 'none');
            
            // Add active class to clicked
            btn.classList.add('active');
            const targetId = btn.getAttribute('data-target');
            document.getElementById(targetId).style.display = 'grid';

            // Load curated data if first time
            if (targetId === 'curated-feed' && !curatedLoaded) {
                fetchCuratedReport();
            }
        });
    });

    async function fetchCuratedReport() {
        try {
            const response = await fetch('/api/curated');
            const data = await response.json();
            
            if (data && data.available) {
                renderCuratedReport(data);
                curatedLoaded = true;
            } else {
                curatedFeedContainer.innerHTML = '<div class="no-messages">Curated report is currently unavailable.</div>';
            }
        } catch (error) {
            console.error('Error fetching curated report:', error);
            curatedFeedContainer.innerHTML = '<div class="loading" style="color: red;">Error loading curated report.</div>';
        }
    }

    function renderCuratedReport(data) {
        curatedFeedContainer.innerHTML = ''; // Clear container

        // Render Stats
        if (data.stats) {
            const statsContainer = document.createElement('div');
            statsContainer.className = 'stats-container';
            statsContainer.innerHTML = `
                <div class="stat-box">
                    <div class="stat-value">${data.stats.companies_this_week || 0}</div>
                    <div class="stat-label">Companies This Week</div>
                </div>
                <div class="stat-box">
                    <div class="stat-value">${data.stats.total_discovery_events || 0}</div>
                    <div class="stat-label">Discovery Events</div>
                </div>
                <div class="stat-box">
                    <div class="stat-value">${data.stats.active_users || 0}</div>
                    <div class="stat-label">Active Users</div>
                </div>
            `;
            curatedFeedContainer.appendChild(statsContainer);
        }

        // Render Companies
        if (data.companies && data.companies.length > 0) {
            // Filter out any potential duplicates from the API based on username
            const seenUsernames = new Set();
            const uniqueCompanies = data.companies.filter(company => {
                const identifier = (company.username || company.name || '').toLowerCase();
                if (seenUsernames.has(identifier)) return false;
                seenUsernames.add(identifier);
                return true;
            });

            uniqueCompanies.forEach(company => {
                const card = document.createElement('div');
                card.className = 'message';

                const confidenceClass = company.confidence ? `confidence-${company.confidence.toLowerCase()}` : '';

                card.innerHTML = `
                    <div class="embed-content">
                        <div class="company-header">
                            ${company.profile_image_url ? `<img src="${escapeHTML(company.profile_image_url)}" alt="Avatar" class="company-avatar" onerror="this.style.display='none'">` : ''}
                            <div class="company-info">
                                <a href="https://x.com/${escapeHTML(company.username)}" target="_blank" class="company-name">${escapeHTML(company.name || company.username)}</a>
                                <span class="company-username">@${escapeHTML(company.username)}</span>
                            </div>
                            ${company.confidence ? `<span class="confidence-badge ${confidenceClass}">${escapeHTML(company.confidence)}</span>` : ''}
                        </div>
                        
                        ${company.description ? `<div class="company-description">${escapeHTML(company.description)}</div>` : ''}
                        
                        <div class="embed-fields">
                            ${company.sector ? `
                            <div class="embed-field">
                                <div class="embed-field-name">Sector</div>
                                <div class="embed-field-value">${escapeHTML(company.sector)}</div>
                            </div>` : ''}
                            ${company.followers_count !== undefined ? `
                            <div class="embed-field">
                                <div class="embed-field-name">Followers</div>
                                <div class="embed-field-value">${company.followers_count}</div>
                            </div>` : ''}
                            ${company.signal_strength !== undefined ? `
                            <div class="embed-field">
                                <div class="embed-field-name">Signal Strength</div>
                                <div class="embed-field-value">${company.signal_strength}</div>
                            </div>` : ''}
                        </div>
                    </div>
                    <div class="message-footer">
                        <span class="timestamp">First seen: ${company.first_seen ? escapeHTML(company.first_seen) : 'Unknown'}</span>
                    </div>
                `;
                curatedFeedContainer.appendChild(card);
            });
        } else {
            const noData = document.createElement('div');
            noData.className = 'no-messages';
            noData.textContent = 'No companies found in this report.';
            curatedFeedContainer.appendChild(noData);
        }
    }

    async function fetchMessages() {
        try {
            const response = await fetch('/api/messages');
            const messages = await response.json();

            // Only re-render if we have new messages or if it's the first load
            if (messages.length === 0) {
                liveFeedContainer.innerHTML = '<div class="no-messages">No projects found yet. Waiting for new alerts in the group...</div>';
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
                liveFeedContainer.innerHTML = '<div class="loading" style="color: red;">Error connecting to server.</div>';
            }
        }
    }

    function renderMessages(messages) {
        liveFeedContainer.innerHTML = ''; // Clear container

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

            liveFeedContainer.appendChild(messageEl);
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

    // Poll curated report every 6 hours (21600000 ms)
    // Only fetch if it has been loaded at least once (tab was clicked)
    setInterval(() => {
        if (curatedLoaded) {
            fetchCuratedReport();
        }
    }, 6 * 60 * 60 * 1000);
});
