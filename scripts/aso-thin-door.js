#!/usr/bin/env node
/**
 * aso-thin-door — 앱스토어 검색어의 «얇은 문»을 브라우저 없이 잰다.
 *
 * 왜: 2026-09-20 네이버에서 확인한 규칙을 스토어에도 그대로 쓴다 —
 *   경쟁 질의는 권위로 못 이긴다. **제목에 그 말이 든 결과가 0~3개인 질의**만 뚫린다.
 *   한국 ASO 기존 실측과도 맞는다: 「이긴 검색어는 전부 결과 10개 안쪽의 얇은 문」.
 *
 * 무인증 공개 API: https://itunes.apple.com/search?term=&country=&entity=software
 *   · resultCount = 그 질의에 걸리는 앱 수(애플이 반환하는 상한까지)
 *   · trackName 에 핵심어가 «실제로» 든 개수 = 진짜 경쟁자 수
 *   · 우리 앱(3종) 순위도 같이 본다
 *
 * 사용: node scripts/aso-thin-door.js [kr|us|jp] [--json]
 */
const CC = (process.argv[2] || 'kr').toLowerCase();
const asJson = process.argv.includes('--json');
const OURS = { 6783130444: 'SIGNUM', 6788779895: 'UC', 6794356135: 'WIM' };

const TERMS = {
  kr: ['미국주식', '미국주식 앱', '미국주식 실적', '프리마켓', '미국장 프리마켓', '실적발표 일정',
       '미국주식 실적발표', '서학개미', '해외주식', '미국증시', '나스닥', '옵션 플로우',
       '다크풀', '맥스페인', '시간외 주가', '애프터마켓', '미국주식 캘린더', '주식 퀴즈',
       '미국주식 뉴스', '증시 브리핑'],
  us: ['premarket', 'premarket movers', 'earnings calendar', 'options flow', 'dark pool',
       'max pain', 'gamma exposure', 'after hours stock', 'stock market news', 'unusual options',
       'stock quiz', 'market brief', 'short volume', 'sector heatmap'],
  jp: ['米国株', '米国株 アプリ', 'プレマーケット', '決算カレンダー', '米国株 決算',
       'オプション フロー', 'ダークプール', '時間外 株価', '株価 アプリ', '米国株 ニュース'],
};

const norm = (s) => (s || '').replace(/\s+/g, '').toLowerCase();

async function one(term) {
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&country=${CC}&entity=software&limit=50`;
  const r = await fetch(url, { headers: { 'User-Agent': 'signumhq-aso-probe/1.0' } });
  if (!r.ok) return { term, error: 'HTTP ' + r.status };
  const j = await r.json();
  const rs = j.results || [];
  // 핵심어: 공백을 뺀 질의 전체가 이름에 들어가는가 + 첫 토큰이 들어가는가
  const full = norm(term);
  const head = norm(term.split(' ')[0]);
  const exact = rs.filter((a) => norm(a.trackName).includes(full)).length;
  const loose = rs.filter((a) => norm(a.trackName).includes(head)).length;
  const mine = rs.map((a, i) => (OURS[a.trackId] ? { app: OURS[a.trackId], rank: i + 1 } : null)).filter(Boolean);
  return { term, n: rs.length, exact, loose, mine, top: rs.slice(0, 2).map((a) => a.trackName.slice(0, 26)) };
}

(async () => {
  const terms = TERMS[CC] || TERMS.kr;
  const out = [];
  for (const t of terms) { out.push(await one(t)); await new Promise((z) => setTimeout(z, 350)); }
  if (asJson) { console.log(JSON.stringify({ cc: CC, at: new Date().toISOString(), rows: out }, null, 1)); return; }
  console.log(`애플 스토어 «얇은 문» 실측 — country=${CC} (무인증 search API, limit 50)\n`);
  console.log('질의                       결과  제목일치  느슨  우리순위   1위 앱');
  for (const r of out.sort((a, b) => (a.exact ?? 99) - (b.exact ?? 99))) {
    if (r.error) { console.log(`${r.term.padEnd(24)} ${r.error}`); continue; }
    const mine = r.mine.length ? r.mine.map((m) => `${m.app}#${m.rank}`).join(',') : '—';
    const mark = r.exact === 0 ? '★' : r.exact <= 3 ? '○' : r.exact <= 7 ? '△' : '✕';
    console.log(`${mark} ${r.term.padEnd(22)} ${String(r.n).padStart(4)} ${String(r.exact).padStart(8)} ${String(r.loose).padStart(5)}  ${mine.padEnd(10)} ${r.top[0] || ''}`);
  }
  console.log('\n★=제목일치 0(완전 개방) ○≤3 △≤7 ✕>7 · «제목일치»는 앱 이름에 질의(공백무시)가 든 개수 = 진짜 경쟁자');
})();
