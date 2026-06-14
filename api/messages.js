import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        // Fetch from Supabase 'follows' table as requested
        const { data: follows, error } = await supabase
            .from('follows')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(50);

        if (error) throw error;

        // Map Supabase data to the format the frontend expects
        // We attempt to preserve the 'text' field if it exists, 
        // or reconstruct it from columns if necessary.
        const mappedMessages = follows.map(item => {
            // If the table already has a 'text' column from the old bot alerts, use it.
            // Otherwise, we might need to build it so the frontend parser works,
            // or return the raw columns.
            
            return {
                id: item.id,
                text: item.text || reconstructText(item),
                timestamp: new Date(item.created_at).getTime(),
                projectName: item.username || item.projectName || ''
            };
        });
        
        res.status(200).json(mappedMessages);
    } catch (error) {
        console.error('Error fetching data from Supabase:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
}

// Helper to build a text block if the Supabase entry is structured but missing 'text'
function reconstructText(item) {
    if (item.raw_text) return item.text; // Use existing if available
    
    // Fallback: build a text block that matches the old TeleFeed format
    // so the frontend script.js 'parseMessageText' function continues to work perfectly.
    let lines = ["📢 NEW ACCOUNT FOUND"];
    if (item.username) lines.push(item.username);
    if (item.description) lines.push(item.description);
    if (item.name) lines.push(`Name: ${item.name}`);
    if (item.followers_count !== undefined) lines.push(`Followers: ${item.followers_count}`);
    if (item.following_count !== undefined) lines.push(`Following: ${item.following_count}`);
    if (item.created_at_twitter) lines.push(`Created: ${item.created_at_twitter}`);
    
    return lines.join('\n');
}
