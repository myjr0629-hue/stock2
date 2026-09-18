/* 페이지 예산(8) 해소 — 첫 탭만 남기고 닫는다. 로그인은 프로필에 남아 안전하다. */
const L = await import('file:///Users/eunhoon/.gemini/antigravity/scratch/stock2/scripts/ego/lib.mjs');
const ts = await L.space(); if (!ts) { console.log('SPACE_BUSY'); process.exit(0); }
console.log('닫은 탭 ' + (await L.cleanupPages(ts, 1)) + '개');
