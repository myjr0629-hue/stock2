#!/usr/bin/env node
// ============================================================================
// IndexNow 전량 제출 — sitemap.xml 의 모든 URL 을 색인엔진에 즉시 통보
// ----------------------------------------------------------------------------
// 왜 (2026-08-22 실측):
//   public/a234...47.txt 키 파일은 «있었는데» 한 번도 제출한 적이 없었다.
//   sitemap 은 크롤러가 «올 때까지» 기다리는 수동 통보고,
//   IndexNow 는 우리가 «지금 보라»고 미는 능동 통보다.
//
//   api.indexnow.org 로 한 번 밀면 참여 엔진 전체로 전달된다:
//     Bing · Yandex · Seznam · Naver   ← 네이버가 들어있다(한국 트래픽)
//
//   구글은 IndexNow 미참여 → 구글은 sitemap + GSC 담당.
//
// 사용:  node scripts/indexnow-submit.js            (sitemap 전량)
//        node scripts/indexnow-submit.js url1 url2  (특정 URL 만)
// ============================================================================
const HOST = 'www.signumhq.com';
const KEY = 'a23324ff2f2e147eb4364b1661650b47';
const KEY_LOCATION = `https://${HOST}/${KEY}.txt`;
const ENDPOINT = 'https://api.indexnow.org/IndexNow';
const CHUNK = 1000; // 규격 상한은 10,000 이지만 실패 시 손실을 줄이려 작게 끊는다

async function sitemapUrls() {
  const r = await fetch(`https://${HOST}/sitemap.xml`);
  if (!r.ok) throw new Error(`sitemap ${r.status}`);
  const xml = await r.text();
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
}

async function submit(urls, i, total) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host: HOST, key: KEY, keyLocation: KEY_LOCATION, urlList: urls }),
  });
  const txt = await res.text().catch(() => '');
  // 200/202 = 접수. 그 외는 원문을 남긴다 — 조용한 실패가 제일 나쁘다.
  console.log(`  [${i}/${total}] ${urls.length}건 → HTTP ${res.status}${txt ? ` ${txt.slice(0, 200)}` : ''}`);
  return res.status === 200 || res.status === 202;
}

(async () => {
  const argv = process.argv.slice(2);
  const urls = argv.length ? argv : await sitemapUrls();
  console.log(`대상 ${urls.length}건 · 키 ${KEY_LOCATION}`);

  const chunks = [];
  for (let i = 0; i < urls.length; i += CHUNK) chunks.push(urls.slice(i, i + CHUNK));

  let ok = 0;
  for (let i = 0; i < chunks.length; i++) {
    if (await submit(chunks[i], i + 1, chunks.length)) ok += chunks[i].length;
    if (i < chunks.length - 1) await new Promise((r) => setTimeout(r, 1500));
  }
  console.log(`\n접수 ${ok}/${urls.length}`);
  process.exit(ok === urls.length ? 0 : 1);
})();
