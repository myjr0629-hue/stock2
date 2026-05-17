import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 15;

// Reddit blocks Vercel IPs from their JSON API.
// We use Google's cached search results for Reddit posts instead.
export async function GET(req: NextRequest) {
    try {
        const sub = req.nextUrl.searchParams.get('sub') || 'r/options';
        const cleanSub = sub.replace(/^r\//, '');
        const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') || '15'), 20);

        // Try multiple approaches
        let posts: any[] = [];

        // Approach 1: Reddit RSS feed (XML → parse)
        try {
            const rssUrl = `https://www.reddit.com/r/${cleanSub}/hot/.rss?limit=${limit}`;
            const rssRes = await fetch(rssUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (compatible; SignumBot/1.0)',
                    'Accept': 'application/rss+xml, application/xml, text/xml',
                },
            });
            if (rssRes.ok) {
                const xml = await rssRes.text();
                // Parse RSS entries
                const entries = xml.split('<entry>').slice(1);
                posts = entries.map((entry, idx) => {
                    const titleMatch = entry.match(/<title[^>]*>([\s\S]*?)<\/title>/);
                    const linkMatch = entry.match(/<link[^>]*href="([^"]*)"[^>]*\/>/);
                    const authorMatch = entry.match(/<name>\/u\/([^<]*)<\/name>/);
                    const updatedMatch = entry.match(/<updated>([^<]*)<\/updated>/);
                    const categoryMatch = entry.match(/<category[^>]*term="([^"]*)"[^>]*\/>/);

                    const title = (titleMatch?.[1] || '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
                    let url = linkMatch?.[1] || '';
                    if (url && !url.includes('/comments/')) {
                        // Skip non-post links
                        const altLink = entry.match(/href="(https:\/\/www\.reddit\.com\/r\/[^"]*\/comments\/[^"]*)"/);
                        if (altLink) url = altLink[1];
                    }
                    const author = authorMatch?.[1] || 'unknown';
                    const updated = updatedMatch?.[1] || '';
                    const flair = categoryMatch?.[1] || null;

                    // Extract post ID from URL
                    const idMatch = url.match(/\/comments\/([a-z0-9]+)/);
                    const id = idMatch?.[1] || `post_${idx}`;

                    return {
                        id,
                        title: title.replace(/\[.*?\]\s*/, ''), // Clean [subreddit] prefix from title
                        url: url.split('?')[0], // Remove query params
                        score: 0, // RSS doesn't provide score
                        numComments: 0, // RSS doesn't provide comment count
                        createdUtc: updated ? Math.floor(new Date(updated).getTime() / 1000) : Math.floor(Date.now() / 1000),
                        author,
                        flair: flair !== cleanSub ? flair : null,
                    };
                }).filter(p => p.title && p.url.includes('/comments/'));
            }
        } catch (rssErr) {
            console.error('[Reddit RSS]', rssErr);
        }

        // Approach 2: If RSS failed, try old.reddit.com JSON
        if (posts.length === 0) {
            try {
                const jsonUrl = `https://old.reddit.com/r/${cleanSub}/hot.json?limit=${limit}&raw_json=1`;
                const jsonRes = await fetch(jsonUrl, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36',
                    },
                });
                if (jsonRes.ok) {
                    const data = await jsonRes.json();
                    posts = (data?.data?.children || []).map((c: any) => {
                        const p = c.data;
                        return {
                            id: p.id,
                            title: p.title,
                            url: `https://www.reddit.com${p.permalink}`,
                            score: p.score,
                            numComments: p.num_comments,
                            createdUtc: p.created_utc,
                            author: p.author,
                            flair: p.link_flair_text || null,
                        };
                    });
                }
            } catch {}
        }

        if (posts.length === 0) {
            return NextResponse.json({ error: 'Reddit API unavailable. Use manual input.', posts: [] }, { status: 200 });
        }

        return NextResponse.json({ success: true, subreddit: `r/${cleanSub}`, posts });
    } catch (err: any) {
        console.error('[Reddit Posts]', err.message);
        return NextResponse.json({ error: err.message, posts: [] }, { status: 200 });
    }
}
