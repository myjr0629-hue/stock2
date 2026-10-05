/* 광고그룹에 «맞춤 제품 페이지» 광고를 만든다 — 크리에이티브만, 예산·입찰 무변경.
 * ★2026-10-05 기본 = 드라이런(화면만 읽고 만들지 않음). ego 스크립트에는 셸 환경변수가 안 간다(메모리 ego-scripts-ignore-shell-env) —
 *   예전 «DRY=1» 스위치는 한 번도 먹지 않아 늘 «실행»이었다(10/5 22시 회차 발견, MISTAKES #105 같은 유형).
 *   실제로 만들려면 작업 파일 ~/signum-ego-io/<KST 날짜>/ads-cpp-task.json = {"commit":true,"ag":"…","cp":"…","name":"…"} (25분 안 작성분만). */
const L = await import('file:///Users/eunhoon/.gemini/antigravity/scratch/stock2/scripts/ego/lib.mjs');
let T = {}; try { const fsm = (await import('node:fs')).default; const tp = await L.taskPath('ads-cpp-task.json'); if (Date.now() - fsm.statSync(tp).mtimeMs < 25 * 60e3) T = JSON.parse(fsm.readFileSync(tp, 'utf8')); } catch {}
const DRY = T.commit !== true;
const AG = T.ag || '2151021409', CP = T.cp || '2144650799', NAME = T.name || 'CPP web home';
console.log(DRY ? '모드: 드라이런(작업 파일 commit:true 일 때만 생성)' : `모드: 생성 — CP ${CP} · AG ${AG} · ${NAME}`);
const ts = await L.space(); if (!ts) { console.log('SPACE_BUSY'); process.exit(0); }
const page = await L.findPage(ts, /app-ads\.apple\.com/);
await page.goto(`https://app-ads.apple.com/cm/app/23872040/report/campaign/${CP}/adgroup/${AG}`); await L.wait(13000);
if (/idmsa|signin/.test(await page.url())) { console.log('SESSION_EXPIRED'); process.exit(0); }
await L.trapDialogs(page);
console.log('광고소재탭=' + JSON.stringify(await L.clickText(page, /^광고 소재$/, { deep: true, after: 10000 })));
const before = await page.evaluate(() => (document.body.innerText || '').replace(/\s+/g, ' ').match(/광고 관리[\s\S]{0,300}/)?.[0]?.slice(0, 280) || null);
console.log('현재=' + JSON.stringify(before));
console.log('광고생성=' + JSON.stringify(await L.clickText(page, /^광고 생성$/, { deep: true, after: 9000 })));
const dlg = await page.evaluate(() => {
  const walk=(r,a)=>{const k=r.querySelectorAll?r.querySelectorAll('*'):[];for(const e of k){if(e.shadowRoot)walk(e.shadowRoot,a);a.push(e);}return a;};
  const all = walk(document, []); const txt = (e) => (e.innerText || '').replace(/\s+/g, ' ').trim();
  return {
    heads: [...new Set(all.filter(e => /^(H1|H2|H3)$/.test(e.tagName)).map(txt).filter(Boolean))].slice(0, 6),
    options: [...new Set(all.filter(e => /기본 제품 페이지|web home|맞춤형 제품 페이지|사용 가능한 제품 페이지/.test(txt(e)) && txt(e).length < 60).map(txt))].slice(0, 8),
    inputs: all.filter(e => e.tagName === 'INPUT' && e.getBoundingClientRect().width > 0).map(e => ({ t: e.type, ph: (e.placeholder || '').slice(0, 24), checked: e.checked })).slice(0, 8),
    buttons: [...new Set(all.filter(e => e.tagName === 'BUTTON' && txt(e) && txt(e).length < 20 && e.getBoundingClientRect().width > 0).map(txt))].slice(0, 14),
  };
});
console.log('대화상자=' + JSON.stringify(dlg));
console.log('dialogs=' + JSON.stringify(await L.dialogs(page)));
if (DRY) { console.log('DRY — 만들지 않음'); process.exit(0); }
