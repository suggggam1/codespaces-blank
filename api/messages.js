export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const workerUrl = process.env.CLOUDFLARE_WORKER_URL;

    console.log('Fetching from Worker URL:', workerUrl);

    if (!workerUrl) {
        console.error('CLOUDFLARE_WORKER_URL is missing!');
        return res.status(500).json({ error: 'CLOUDFLARE_WORKER_URL not configured' });
    }

    try {
        const response = await fetch(workerUrl, {
            headers: {
                'Content-Type': 'application/json',
            },
        });

        console.log('Worker Response Status:', response.status);

        if (!response.ok) {
            const err = await response.text();
            console.error('Worker Error Response:', err);
            throw new Error(`Cloudflare Worker responded with ${response.status}`);
        }

        let follows = await response.json();

        // Ensure it's an array
        const followsArray = Array.isArray(follows) ? follows : [follows];

        // Map data to the format the frontend expects
        // This keeps the Vercel backend as a "smart proxy" that ensures 
        // the frontend doesn't break if the worker format changes slightly.
        const mappedMessages = followsArray.map(item => {
            if (!item) return null;
            return {
                id: item.id || Math.random().toString(36).substr(2, 9),
                text: reconstructText(item),
                timestamp: item.detectedAt ? new Date(item.detectedAt).getTime() : Date.now(),
                projectName: item.username || '',
                avatar: item.avatar || ''
            };
        }).filter(Boolean);
        
        res.status(200).json(mappedMessages);
    } catch (error) {
        console.error('Error fetching data from Cloudflare Worker:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
}

function reconstructText(item) {
    // If the worker already provides the fully formatted text, use it.
    if (item.text) return item.text;

    let lines = ["📢 NEW ACCOUNT FOUND"];
    if (item.username) lines.push(item.username);
    if (item.displayName) lines.push(`Name: ${item.displayName}`);
    if (item.followers !== undefined && item.followers !== null) {
        lines.push(`Followers: ${item.followers}`);
    }
    if (item.description) lines.push(item.description);
    if (item.location) lines.push(`Location: ${item.location}`);
    
    return lines.join('\n');
}
