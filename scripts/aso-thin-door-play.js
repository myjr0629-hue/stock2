#!/usr/bin/env node
/**
 * aso-thin-door-play — Play 스토어 검색의 «얇은 문»을 브라우저 없이 잰다.
 *
 * 왜: 애플 쪽은 무인증 search API 가 있는데(scripts/aso-thin-door.js) Play 는 없다.
 *   그런데 Play 검색 «웹 페이지»는 curl 로 읽힌다(2026-09-20 실측: 1.2MB, 앱 30개).
 *   Play 는 우리가 약한 쪽(별점 0)이라 여기 측정이 더 급하다.
 *
 * 세는 값: 결과 카드의 «앱 이름»에 질의가 실제로 든 개수 = 진짜 경쟁자.
 *          + 우리 3앱이 결과 안에 있는지(있으면 몇 번째).
 * 사용: node scripts/aso-thin-door-play.js [kr|us|jp]
 */
const CC = (process.argv[2] || 'kr').toLowerCase();
const HL = { kr: 'ko', us: 'en', jp: 'ja' }[CC] || 'ko';
const GL = CC.toUpperCase();
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
const OURS = { 'com.signumhq.app': 'SIGNUM', 'com.signumhq.undercurrent': 'UC', 'com.signumhq.wim': 'WIM' };

const TERMS = {
  kr: ['미국주식', '미국주식 앱', '프리마켓', '미국주식 실적', '실적발표 일정', '미국증시',
       '다크풀', '맥스페인', '애프터마켓', '시간외 주가', '옵션 플로우', '서학개미',
       '나스닥', '해외주식', '증시 캘린더', '주식 퀴즈'],
  us: ['premarket', 'premarket movers', 'earnings calendar', 'options flow', 'dark pool',
       'max pain', 'after hours stock', 'short volume', 'stock quiz'],
  jp: ['米国株', 'プレマーケット', '決算カレンダー', 'オプション フロー', 'ダークプール', '時間外 株価'],
};
const norm = (s) => (s || '').replace(/\s+/g, '').toLowerCase();

// 결과 카드에서 (패키지, 이름) 쌍을 뽑는다. Play 는 링크 뒤쪽에 이름이 오는 구조라
// 링크 위치를 기준으로 «뒤 2,000자» 안의 첫 그럴듯한 텍스트를 이름으로 본다.
function cards(html) {
  const out = []; const seen = new Set();
  const re = /\/store\/apps\/details\?id=([A-Za-z0-9_.]+)/g;
  let m;
  while ((m = re.exec(html))) {
    const id = m[1];
    if (seen.has(id)) continue;
    const win = html.slice(m.index, m.index + 2500);
    const t = [...win.matchAll(/>([^<>{}\n]{3,60})</g)].map((x) => x[1].trim())
      .find((x) => x && !/^https?:|^\/|google|Play$|^앱$|^게임$/i.test(x));
    if (!t) continue;
    seen.add(id); out.push({ id, name: t });
  }
  return out;
}

(async () => {
  const terms = TERMS[CC] || TERMS.kr;
  console.log(`Play 스토어 «얇은 문» 실측 — gl=${GL} hl=${HL} (검색 웹페이지 스크레이프)\n`);
  console.log('질의                  결과  이름일치  우리순위   1위 앱');
  const rows = [];
  for (const term of terms) {
    const url = `https://play.google.com/store/search?q=${encodeURIComponent(term)}&c=apps&hl=${HL}&gl=${GL}`;
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': `${HL}-${GL},${HL};q=0.9` } });
      const html = await r.text();
      if (html.length < 200000) { console.log(`  ${term.padEnd(18)} (본문 ${html.length} — 차단 의심)`); continue; }
      const cs = cards(html);
      const full = norm(term);
      const exact = cs.filter((c) => norm(c.name).includes(full)).length;
      const mine = cs.map((c, i) => (OURS[c.id] ? `${OURS[c.id]}#${i + 1}` : null)).filter(Boolean).join(',') || '—';
      const mark = exact === 0 ? '★' : exact <= 3 ? '○' : exact <= 7 ? '△' : '✕';
      console.log(`${mark} ${term.padEnd(18)} ${String(cs.length).padStart(4)} ${String(exact).padStart(8)}  ${mine.padEnd(12)} ${(cs[0] ? cs[0].name : '').slice(0, 26)}`);
      rows.push({ term, n: cs.length, exact, mine });
    } catch (e) { console.log(`  ${term.padEnd(18)} ERR ${String(e.message).slice(0, 40)}`); }
    await new Promise((z) => setTimeout(z, 500));
  }
  const absent = rows.filter((r) => r.mine === '—').length;
  console.log(`\n· 우리 앱이 «결과에 아예 없는» 질의: ${absent}/${rows.length}`);
  console.log('★=이름일치 0(완전 개방) ○≤3 △≤7 ✕>7');
})();
