import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 15;

export async function GET(req: NextRequest) {
    try {
        const sub = req.nextUrl.searchParams.get('sub') || 'r/options';
        const sort = req.nextUrl.searchParams.get('sort') || 'hot';
        const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') || '15'), 25);

        const cleanSub = sub.replace(/^r\//, '');
        const url = `https://old.reddit.com/r/${cleanSub}/${sort}.json?limit=${limit}&raw_json=1`;

        const res = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
                'Accept': 'application/json',
                'Accept-Language': 'en-US,en;q=0.9',
            },
        });

        if (!res.ok) {
            const txt = await res.text().catch(() => '');
            console.error(`[Reddit] ${res.status} from ${url}:`, txt.substring(0, 200));
            return NextResponse.json({ error: `Reddit ${res.status}`, detail: txt.substring(0, 100) }, { status: res.status });
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
            };
        });

        return NextResponse.json({ success: true, subreddit: `r/${cleanSub}`, posts });
    } catch (err: any) {
        console.error('[Reddit Posts]', err.message);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
