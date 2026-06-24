export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const namespaceId = process.env.CLOUDFLARE_KV_NAMESPACE_ID;
    const apiToken = process.env.CLOUDFLARE_API_TOKEN;
    const keyName = process.env.CLOUDFLARE_KV_KEY_NAME || 'FOLLOWS_KV';

    try {
        const response = await fetch(
            `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces/${namespaceId}/values/${keyName}`,
            {
                headers: {
                    'Authorization': `Bearer ${apiToken}`,
                    'Content-Type': 'application/json',
                },
            }
        );

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Cloudflare KV Error:', errorText);
            if (response.status === 404) {
                return res.status(200).json([]);
            }
            throw new Error(`Cloudflare API responded with ${response.status}`);
        }

        let follows = await response.json();

        // If Cloudflare returns a string (sometimes happens if not properly stringified/parsed)
        if (typeof follows === 'string') {
            try {
                follows = JSON.parse(follows);
            } catch (e) {
                console.error('Failed to parse KV value as JSON:', follows);
                return res.status(200).json([]);
            }
        }

        // Ensure it's an array for the .map function
        const followsArray = Array.isArray(follows) ? follows : [follows];

        // Map Cloudflare KV data to the format the frontend expects
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
        console.error('Error fetching data from Cloudflare KV:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
}

function reconstructText(item) {
    let lines = ["📢 NEW ACCOUNT FOUND"];
    
    // Use the username as the main handle
    if (item.username) lines.push(item.username);
    
    // Display the Name if available
    if (item.displayName) lines.push(`Name: ${item.displayName}`);
    
    // Use the new simplified followers field
    if (item.followers !== undefined && item.followers !== null) {
        lines.push(`Followers: ${item.followers}`);
    }
    
    // Include these only if they still exist in the data (backward compatibility)
    if (item.description) lines.push(item.description);
    if (item.location) lines.push(`Location: ${item.location}`);
    
    return lines.join('\n');
}

function formatTwitterDate(dateString) {
    if (!dateString) return '';
    try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return dateString;
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        return `${months[date.getMonth()]} ${date.getDate()}`;
    } catch (e) {
        return dateString;
    }
}
