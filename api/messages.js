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
        const mappedMessages = follows.map(item => {
            return {
                id: item.id,
                text: reconstructText(item),
                timestamp: new Date(item.created_at).getTime(),
                projectName: item.username || '',
                avatar: item.avatar || '' // Direct avatar URL from Supabase
            };
        });
        
        res.status(200).json(mappedMessages);
    } catch (error) {
        console.error('Error fetching data from Supabase:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
}

// Helper to build a text block from the new Supabase schema
function reconstructText(item) {
    let lines = ["📢 NEW ACCOUNT FOUND"];
    
    // 1. Username (Handle)
    if (item.username) lines.push(item.username);
    
    // 2. Description (Bio)
    if (item.description) lines.push(item.description);
    
    // 3. Followers Count
    if (item.followers_count !== undefined && item.followers_count !== null) {
        lines.push(`Followers: ${item.followers_count}`);
    }

    // 4. Posts Count
    if (item.posts_count !== undefined && item.posts_count !== null) {
        lines.push(`Tweets: ${item.posts_count}`);
    }

    // 5. Account Created At
    if (item.user_created_at) {
        lines.push(`Created: ${formatTwitterDate(item.user_created_at)}`);
    }

    // 6. Location
    if (item.location) {
        lines.push(`Location: ${item.location}`);
    }

    // 7. Tracked Account (Who followed them)
    if (item.tracked_account) {
        lines.push(`Followed by: ${item.tracked_account}`);
    }
    
    return lines.join('\n');
}

// Helper to format Twitter date string (e.g., "Mon Jun 15 01:33:44 +0000 2026")
// to just "Month Date" as requested (e.g., "Jun 15")
function formatTwitterDate(dateString) {
    if (!dateString) return '';
    try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return dateString;
        
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        // Just return Month and Date as requested
        return `${months[date.getMonth()]} ${date.getDate()}`;
    } catch (e) {
        return dateString;
    }
}
