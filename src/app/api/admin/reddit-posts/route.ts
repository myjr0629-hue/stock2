import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 15;

export async function GET(req: NextRequest) {
    try {
        const sub = req.nextUrl.searchParams.get('sub') || 'r/options';
        const sort = req.nextUrl.searchParams.get('sort') || 'hot';
        const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') || '15'), 25);

        const cleanSub = sub.replace(/^r\//, '');
        const url = `https://www.reddit.com/r/${cleanSub}/${sort}.json?limit=${limit}&raw_json=1`;

        const res = await fetch(url, {
            headers: {
                'User-Agent': 'SignumHQ/1.0 (market analysis tool)',
            },
            next: { revalidate: 120 }, // cache 2 min
        });

        if (!res.ok) {
            return NextResponse.json({ error: `Reddit API ${res.status}` }, { status: res.status });
        }

        const data = await res.json();
        const posts = (data?.data?.children || []).map((c: any) => {
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
                selftext: (p.selftext || '').substring(0, 200),
            };
        });

        return NextResponse.json({
            success: true,
            subreddit: `r/${cleanSub}`,
            sort,
            posts,
            fetchedAt: new Date().toISOString(),
        });
    } catch (err: any) {
        console.error('[Reddit Posts]', err.message);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
