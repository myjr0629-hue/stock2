import { ImageResponse } from 'next/og';
import { toLoc } from '@/lib/earningsWeek';
import { resolveReceiptWeek } from '@/lib/earnings/earningsReceipts';
import { RECEIPT_COPY } from '@/lib/earnings/earningsReceiptsCopy';
import { readEarningsReceipts } from '@/services/earningsReceiptsService';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** 기존 OG와 같은 글자 부분집합 방식. 외부 글꼴 불가 시 내장 영문 글꼴로 카드 유지. */
async function cjkFont(loc: 'ko' | 'ja', text: string): Promise<ArrayBuffer | null> {
  try {
    const chars = [...new Set(text.split(''))].sort().join('');
    const family = loc === 'ko' ? 'Noto+Sans+KR' : 'Noto+Sans+JP';
    const css = await fetch(`https://fonts.googleapis.com/css2?family=${family}:wght@700&text=${encodeURIComponent(chars)}`,
      { signal: AbortSignal.timeout(3000), cache: 'force-cache' });
    if (!css.ok) return null;
    const url = (await css.text()).match(/src:\s*url\(([^)]+)\)\s*format\('(?:opentype|truetype)'\)/)?.[1];
    if (!url || new URL(url).hostname !== 'fonts.gstatic.com') return null;
    const res = await fetch(url, { signal: AbortSignal.timeout(3000), cache: 'force-cache' });
    return res.ok ? await res.arrayBuffer() : null;
  } catch { return null; }
}

export async function GET(req: Request, { params }: { params: Promise<{ locale: string }> }) {
  const want = toLoc((await params).locale);
  const week = resolveReceiptWeek(new URL(req.url).searchParams.get('week'));
  const data = await readEarningsReceipts(week);
  const lines = (l: typeof want) => {
    const c = RECEIPT_COPY[l], s = data.summary;
    const count = l === 'ko' ? [`확정 일정 ${s.total}`, `사전 비교 ${s.pre}`, `범위 안 ${s.within} · 밖 ${s.outside}`,
      `사후 보강 ${s.backfilled} · 시점 미확인 ${s.unverified} · 결측 ${s.missing}`]
      : l === 'ja' ? [`確定日程 ${s.total}`, `事前比較 ${s.pre}`, `範囲内 ${s.within} · 外 ${s.outside}`,
        `事後補完 ${s.backfilled} · 時点未確認 ${s.unverified} · 欠損 ${s.missing}`]
        : [`Scheduled ${s.total}`, `Pre-announcement pairs ${s.pre}`, `Within ${s.within} · Outside ${s.outside}`,
          `Later ${s.backfilled} · Unverified ${s.unverified} · Missing ${s.missing}`];
    const limitation = l === 'ko' ? '예상은 만기까지 · 실제는 한 거래일 · 방법과 누락 공개'
      : l === 'ja' ? '予想は満期まで · 実際は1営業日 · 方法と欠損を公開'
        : 'Implied: through expiry · Actual: one session · Method & gaps disclosed';
    const empty = data.emptyReason ? `${c.noRecord}: ${c.issues[data.emptyReason]}`
      : s.missing === s.total ? `${c.noRecord}: ${c.issues[data.rows[0].issues[0]]}` : '';
    return { c, count, limitation, empty };
  };
  let v = lines(want);
  const font = want === 'en' ? null : await cjkFont(want,
    [v.c.title, ...v.count, v.limitation, v.empty, 'SIGNUM HQ ET0123456789- ·'].join(''));
  if (want !== 'en' && !font) v = lines('en');
  return new ImageResponse(
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%',
      background: '#0b1220', color: '#f8fafc', padding: '48px 60px', justifyContent: 'space-between',
      fontFamily: font ? 'Receipt' : 'sans-serif' }}>
      <div style={{ display: 'flex', fontSize: 24, color: '#7dd3fc' }}>SIGNUM HQ</div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', fontSize: 46 }}>{v.c.title}</div>
        <div style={{ display: 'flex', fontSize: 24, color: '#cbd5e1', marginTop: 12 }}>{week} - {data.weekEnd} ET</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', fontSize: 30, gap: 8 }}>
        {v.count.map((line) => <div key={line} style={{ display: 'flex' }}>{line}</div>)}
        {v.empty && <div style={{ display: 'flex', fontSize: 22, color: '#fbbf24' }}>{v.empty}</div>}
      </div>
      <div style={{ display: 'flex', fontSize: 21, color: '#cbd5e1' }}>{v.limitation}</div>
    </div>,
    { width: 1200, height: 630,
      fonts: font ? [{ name: 'Receipt', data: font, weight: 700, style: 'normal' }] : undefined,
      headers: { 'Cache-Control': 'public, max-age=0, s-maxage=300' } },
  );
}
