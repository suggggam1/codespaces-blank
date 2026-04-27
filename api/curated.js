export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const response = await fetch('https://www.frontrun.vc/api/platform/alpha-report');
        if (!response.ok) {
            throw new Error(`API responded with status: ${response.status}`);
        }
        const data = await response.json();
        
        // Add cache headers so Vercel caches the response for 6 hours (21600 seconds)
        // to prevent overloading the target API
        res.setHeader('Cache-Control', 's-maxage=21600, stale-while-revalidate=86400');
        res.status(200).json(data);
    } catch (error) {
        console.error('Error fetching curated data:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
}
