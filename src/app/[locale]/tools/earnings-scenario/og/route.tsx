import { ImageResponse } from 'next/og';
import { toLoc } from '@/lib/earningsWeek';
import { SCENARIO_COPY } from '@/lib/earningsScenario/copy';

export const runtime = 'nodejs';
export const revalidate = 86400;

/** 기존 read-check OG의 글자 부분집합 글꼴·영문 대체 방식. 운영 자료 조회 없이 도구만 소개한다. */
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

export async function GET(_req: Request, { params }: { params: Promise<{ locale: string }> }) {
  const l = toLoc((await params).locale), wanted = SCENARIO_COPY[l];
  const font = l === 'en' ? null : await cjkFont(l, [wanted.title, wanted.direction, wanted.volatility, wanted.time, wanted.app, 'SIGNUM HQ'].join(''));
  const c = l !== 'en' && !font ? SCENARIO_COPY.en : wanted;
  return new ImageResponse(<div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%',
    background: '#0b1220', color: '#f8fafc', padding: '48px 60px', justifyContent: 'space-between', fontFamily: font ? 'EarningsScenario' : 'sans-serif' }}>
    <div style={{ display: 'flex', fontSize: 24, color: '#7dd3fc' }}>SIGNUM HQ</div>
    <div style={{ display: 'flex', fontSize: 44 }}>{c.title}</div>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 30 }}>
      {[c.direction, c.volatility, c.time].map(k => <div key={k} style={{ display: 'flex' }}>{k}</div>)}
    </div>
    <div style={{ display: 'flex', fontSize: 24, color: '#7dd3fc' }}>{c.app}</div>
  </div>, { width: 1200, height: 630, fonts: font ? [{ name: 'EarningsScenario', data: font, weight: 700, style: 'normal' }] : undefined,
    headers: { 'Cache-Control': 'public, max-age=0, s-maxage=86400' } });
}
