// ============================================================================
// /api/cron/indexnow — 갱신된 URL 을 IndexNow 로 한 번에 통보한다.
// ----------------------------------------------------------------------------
// 왜 이게 값싼 최대 카드인가 (2026-08-20 조사):
//   IndexNow 는 «가입 자체가 없다». 키 파일 하나를 공개 경로에 두고 POST 하면
//   허브가 참여 검색엔진 전체로 팬아웃한다. 실측한 참여자 목록에 **naver 가 있다**
//   (https://www.indexnow.org/searchengines.json). 우리 최대 병목이 «한국 검색 색인 0»
//   인데, 네이버에 갱신을 직접 통보할 수 있는 유일한 무료·무가입 경로가 이것이다.
//   구글은 비참여이므로 구글은 sitemap + Search Console 로 따로 간다.
//
// ⚠️ 하루 최대 1만 URL. 우리 sitemap 은 513개라 전량 제출해도 여유가 크다.
// ⚠️ 키 파일(public/<key>.txt)이 200 으로 서빙되지 않으면 전량 거부된다.
//    배포 후 반드시 «파일 내용»으로 확인할 것 — HTTP 200 만으로는 판정하지 않는다.
// ============================================================================

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const HOST = 'www.signumhq.com';
const KEY = process.env.INDEXNOW_KEY || 'a23324ff2f2e147eb4364b1661650b47';
const ENDPOINT = 'https://api.indexnow.org/IndexNow';

/** sitemap.xml 에서 현재 URL 전량을 읽는다 — 사이트맵이 곧 단일 출처다. */
async function collectUrls(): Promise<string[]> {
  const res = await fetch(`https://${HOST}/sitemap.xml`, { cache: 'no-store' });
  if (!res.ok) return [];
  const xml = await res.text();
  return Array.from(xml.matchAll(/<loc>([^<]+)<\/loc>/g))
    .map((m) => m[1].trim())
    .filter((u) => u.startsWith(`https://${HOST}/`))
    .slice(0, 10_000);
}

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const { searchParams } = new URL(request.url);
  const auth = request.headers.get('authorization');
  if (process.env.NODE_ENV === 'production' && cronSecret) {
    const ok = auth === `Bearer ${cronSecret}` || searchParams.get('secret') === cronSecret;
    if (!ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const urlList = await collectUrls();
    if (!urlList.length) {
      return NextResponse.json({ ok: false, error: 'sitemap 에서 URL 을 못 읽음' }, { status: 500 });
    }

    // 키 파일이 실제로 서빙되는지 «내용»으로 먼저 확인 — 이게 틀리면 전량 거부된다.
    const keyProbe = await fetch(`https://${HOST}/${KEY}.txt`, { cache: 'no-store' });
    const keyBody = keyProbe.ok ? (await keyProbe.text()).trim() : '';
    if (keyBody !== KEY) {
      return NextResponse.json(
        { ok: false, error: '키 파일 불일치 — IndexNow 가 전량 거부한다', expected: KEY, got: keyBody.slice(0, 40) },
        { status: 500 },
      );
    }

    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ host: HOST, key: KEY, keyLocation: `https://${HOST}/${KEY}.txt`, urlList }),
    });

    return NextResponse.json({
      ok: res.ok,
      status: res.status,
      submitted: urlList.length,
      note: 'IndexNow 허브가 bing·naver·yandex·seznam 등 참여 엔진으로 팬아웃한다. 구글은 비참여.',
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
