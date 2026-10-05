/* ============================================================================
 * naver-sa-status — 네이버 서치어드바이저 «사이트 상세»를 실제 마우스로 눌러 열고, 수집·색인·robots·사이트맵 화면의 글자를 읽는다.
 *   (읽기 전용 — 입력·제출·삭제·요청 버튼은 누르지 않는다. 눌러도 되는 것은 «메뉴 이동» 링크뿐이다.)
 *
 * 왜 (2026-10-05 10시 회차): 슬롯의 «실행» 구역에 naver_search_advisor 가 17일째(9/19 소유확인·사이트맵 제출 뒤) «다음: 며칠 뒤 수집 현황·색인 상태를
 *   읽고 robots 로 Yeti 차단 여부를 확인한다» 로 남아 있었다. 읽는 도구가 없어서 매 회차 «다음에»로 미뤄졌다(MISTAKES #48·#49: 만들기가 끝난
 *   일의 유지 작업은 첫 재배정 때 도구화한다). page-probe 는 주소를 «열기만» 해서 게시판(사이트 목록)까지만 읽혔다 — 상세 화면은 목록의 주소 글자를
 *   «눌러서» 들어가야 한다(주소를 짐작해 치지 않는다 — 메모리 click-dont-type-urls).
 *
 * 실행: bash scripts/ego-run.sh scripts/ego/naver-sa-status.mjs 180      (작업 파일 없음)
 * 출력: 결과 /tmp/ego/naver-sa-status.json + 화면 요약. 로그인 벽이면 LOGIN_WALL 로 끝난다(자격증명은 입력하지 않는다).
 * 세션: 이 브라우저의 네이버 세션은 대표 «개인» 계정(iEldora)이다 — 사이트 등록(9/18)이 그 계정으로 돼 있어 읽는 것만 한다.
 * ========================================================================== */
const L = await import('file:///Users/eunhoon/.gemini/antigravity/scratch/stock2/scripts/ego/lib.mjs');
const fs = (await import('node:fs')).default;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const SITE = 'https://www.signumhq.com';
const BOARD = 'https://searchadvisor.naver.com/console/board';
const DENY = /삭제|제출하|요청하기|저장|등록하|확인$|취소|탈퇴|해제|이전/;                // 눌러선 안 되는 글자
const ts = await L.space(); if (!ts) { console.log('SPACE_BUSY — 대표가 브라우저를 쓰고 있다. 되찾지 않는다.'); process.exit(0); }
const page = await ts.newPage();
const out = { at: new Date().toISOString(), site: SITE, steps: [] };
const nn = (s) => (s || '').replace(/\s+/g, ' ').trim();
const snap = async () => page.evaluate(() => ({ url: location.href, title: document.title, text: document.body.innerText.replace(/\n{2,}/g, '\n').slice(0, 2600) }));
// 글자로 «눌 것»을 다시 찾는다(좌표·번호 금지 — MISTAKES #51). exact=true 면 글자 전체 일치, 아니면 정규식.
const findClickable = (src, exact) => page.evaluate((a) => {
  const nz = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const re = a.exact ? null : new RegExp(a.src, 'i');
  const cand = [...document.querySelectorAll('a,button,[role=button],[role=menuitem],li,span,div,td')].filter((e) => {
    const b = e.getBoundingClientRect(); if (!(b.width > 0 && b.height > 0)) return false;
    const t = nz(e.innerText); if (!t || t.length > 60) return false;
    return a.exact ? t === a.src : re.test(t);
  });
  cand.sort((x, y) => { const bx = x.getBoundingClientRect(), by = y.getBoundingClientRect(); return bx.width * bx.height - by.width * by.height; });
  const e = cand[0]; if (!e) return null; e.scrollIntoView({ block: 'center' }); const b = e.getBoundingClientRect();
  return { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2), t: nz(e.innerText) };
}, { src, exact });
const clickText = async (src, exact, label) => {
  const p = await findClickable(src, exact); if (!p) return null;
  if (DENY.test(p.t)) { console.log('건너뜀(누르면 안 되는 글자):', p.t); return null; }
  await page.mouse.click(p.x, p.y, { label: label || 'menu nav' }); await wait(4500); return p;
};
try {
  try { await page.goto(BOARD); } catch {}
  await wait(6000);
  const first = await snap();
  if (/nid\.naver\.com|login/i.test(first.url) || /로그인/.test(first.text.slice(0, 200))) { console.log('LOGIN_WALL — 네이버 로그인 필요(자격증명은 입력하지 않는다)'); out.steps.push({ step: 'board', ...first }); throw new Error('login'); }
  // ① 사이트 목록의 주소 글자를 «눌러서» 상세로
  const into = await clickText('^' + SITE.replace(/[.]/g, '\\.') + '$', false, 'open site detail');
  if (!into) { console.log('사이트 행을 못 찾았다:', SITE); out.steps.push({ step: 'board-no-row', ...first }); throw new Error('norow'); }
  const detail = await snap(); out.steps.push({ step: '사이트 상세', ...detail }); const detailUrl = detail.url;
  console.log('상세:', detail.url, '|', detail.title);
  // ② 요약 화면의 «자세히 보기» 3개(콘텐츠 노출/클릭 · 사이트 진단 · 수집 현황)를 순서대로 «눌러서» 읽는다.
  //   ★10/5 실측: 왼쪽 메뉴 묶음(리포트·요청·검증)은 <a> 가 아니라 아이콘 글자가 붙은 div 라 글자 일치로 못 폈다 — 요약 화면의 «자세히 보기»(href="#", 클릭 핸들러)가
  //   같은 세 화면의 입구다. 요약 본문은 «사이트 상태(보안 인증서·HTTPS 리다이렉션·사이트맵)» 3줄을 이미 준다 → 첫 단계 글자에 들어 있다.
  const LABELS = ['콘텐츠 노출/클릭', '사이트 진단', '수집 현황'];
  for (let i = 0; i < LABELS.length; i++) {
    const p = await page.evaluate((idx) => {
      const nz = (s) => (s || '').replace(/\s+/g, ' ').trim();
      const a = [...document.querySelectorAll('a')].filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0 && nz(e.innerText) === '자세히 보기'; })[idx];
      if (!a) return null; a.scrollIntoView({ block: 'center' }); const b = a.getBoundingClientRect();
      return { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2) };
    }, i);
    if (!p) { out.steps.push({ step: LABELS[i], err: '자세히 보기 링크 없음' }); console.log('— [' + LABELS[i] + '] 링크 없음'); continue; }
    await page.mouse.click(p.x, p.y, { label: 'open report detail' }); await wait(6000);
    const s = await snap(); out.steps.push({ step: LABELS[i], ...s });
    console.log('— [' + LABELS[i] + ']', s.url, '\n  ', s.text.slice(0, 900).replace(/\n/g, ' | '));
    try { await page.goto(detailUrl); await wait(4000); } catch {}
  }
} catch (e) { if (!/^(login|norow)$/.test(String(e && e.message))) { out.err = String(e && e.message || e).slice(0, 200); console.log('오류:', out.err); } }
try { await page.close(); } catch {}
fs.mkdirSync('/tmp/ego', { recursive: true }); fs.writeFileSync('/tmp/ego/naver-sa-status.json', JSON.stringify(out, null, 1));
console.log('저장: /tmp/ego/naver-sa-status.json · 단계', out.steps.length);
