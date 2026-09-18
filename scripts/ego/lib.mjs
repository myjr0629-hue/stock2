/* ============================================================================
 * ego 공용 라이브러리 — 매 사이클 /tmp 에 새 스크립트를 쓰던 것을 대체한다.
 *   실측(2026-09-18): 하루 265개 생성, 결과 보존 10%, 같은 작업 재시도 접두사 9종.
 *   원인은 «검증된 조작 절차»가 파일마다 흩어져 매번 다시 쓰였기 때문이다.
 *
 * 사용:  import { space, findPage, clickText, typeInto, waitFileChooser, cleanupPages } from './lib.mjs'
 *        (ego-browser nodejs 안에서 실행 — listTaskSpaces/taskSpace 는 전역이다)
 *
 * 여기 담긴 규칙은 전부 «실패로 배운 것»이다:
 *   · page.evaluate 는 인자를 «하나»만 넘긴다 → 객체로 묶는다
 *   · 텍스트 매칭 전에 공백을 정규화한다(\s+ → ' ')
 *   · scrollIntoView 뒤 좌표를 «다시» 재고 inView 를 확인한 뒤 클릭한다
 *   · 파일 선택기는 클릭 «전»에 waitFileChooser 를 건다
 *   · 페이지 예산(8) 초과 시 오래된 탭부터 닫는다
 *   · 네이티브 alert/confirm 은 평가를 막는다 → 미리 가로챈다
 * ========================================================================== */
export const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** 작업공간을 잡는다. 대표가 쓰고 있으면 «되찾지 않고» null 을 돌려준다(하드 스톱 존중). */
export async function space() {
    const list = await listTaskSpaces();
    const sp = (list || []).find((s) => s.profileId === 'Profile 1') || (list || [])[0];
    if (!sp) return null;
    try { await claimTaskSpace(sp.id); } catch (e) { console.log('claim 실패(대표 사용 중일 수 있다): ' + String(e.message).slice(0, 80)); }
    try { return await taskSpace(sp.id); } catch { return null; }
}

/** 원하는 도메인의 탭을 찾고 없으면 연다. 죽은 탭은 건너뛴다. */
export async function findPage(ts, re, url) {
    let pages = [];
    try { pages = await ts.pages(); } catch {}
    for (const p of pages) { try { const u = await p.url(); if (re && re.test(u)) return p; } catch {} }
    for (const p of pages) { try { await p.url(); if (!re) return p; } catch {} }
    let page = null;
    try { page = await ts.newPage(); } catch (e) {
        if (/budget/i.test(String(e.message))) { await cleanupPages(ts, 1); page = await ts.newPage(); } else throw e;
    }
    if (url) { try { await page.goto(url); } catch { /* 느린 사이트는 타임아웃 뒤에도 그려진다 */ } await wait(6000); }
    return page;
}

/** 첫 탭만 남기고 닫는다(페이지 예산 8 해소). 로그인은 프로필에 남으므로 안전하다. */
export async function cleanupPages(ts, keep = 1) {
    let pages = []; try { pages = await ts.pages(); } catch { return 0; }
    let closed = 0;
    for (let i = keep; i < pages.length; i++) { try { await pages[i].close(); closed++; } catch {} }
    return closed;
}

/** 네이티브 alert/confirm 가로채기 — 이것을 안 하면 evaluate 가 «대화상자» 로 막힌다. */
export async function trapDialogs(page) {
    await page.evaluate(() => { window.__dlg = []; window.alert = (m) => { window.__dlg.push('alert:' + m); }; window.confirm = (m) => { window.__dlg.push('confirm:' + m); return true; }; });
}
export const dialogs = (page) => page.evaluate(() => window.__dlg || []);

/** 섀도 DOM 까지 훑는 선택자(플레이 콘솔·애플 광고는 필수). */
// ⚠ eval 로 «선언»하면 strict 모드에서 밖으로 안 나온다(실측 실패) → «값을 돌려주는» 식으로 쓴다.
const DEEP = `(function(){const walk=(root,acc)=>{const k=root.querySelectorAll?root.querySelectorAll('*'):[];for(const e of k){if(e.shadowRoot)walk(e.shadowRoot,acc);acc.push(e);}return acc;};return walk;})()`;

/** 화면에 보이는 요소를 «텍스트로» 찾아 좌표를 돌려준다(공백 정규화 + inView 확인). */
export function findByText(page, re, { tags = 'button,a,span,div,li,label', deep = false, maxLen = 60 } = {}) {
    return page.evaluate(({ src, tags, deep, maxLen, DEEP }) => {
        const walk = deep ? eval(DEEP) : null;
        const rx = new RegExp(src);
        const all = deep ? walk(document, []) : [...document.querySelectorAll(tags)];
        const hit = all.find((e) => {
            const t = (e.innerText || e.getAttribute?.('aria-label') || e.getAttribute?.('title') || '').replace(/\s+/g, ' ').trim();
            if (!t || t.length > maxLen || !rx.test(t)) return false;
            const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0;
        });
        if (!hit) return null;
        hit.scrollIntoView({ block: 'center' });
        const r = hit.getBoundingClientRect();   // ★ 스크롤 «뒤에» 다시 잰다
        return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), t: (hit.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 40), inView: r.top > 0 && r.bottom < innerHeight };
    }, { src: re.source, tags, deep, maxLen, DEEP });
}

/** 텍스트로 찾아 «실제 마우스»로 누른다. 화면 밖이면 스크롤 뒤 재측정한다. */
export async function clickText(page, re, opts = {}) {
    let p = await findByText(page, re, opts);
    if (!p) return null;
    if (!p.inView) { await wait(500); p = await findByText(page, re, opts); if (!p) return null; }
    await page.mouse.click(p.x, p.y, {});
    await wait(opts.after ?? 1500);
    return p;
}

/** JS click — 좌표 클릭이 허공에 떨어지는 콘솔(플레이·네이버 발행 레이어)용. */
export function jsClick(page, re, { deep = false } = {}) {
    return page.evaluate(({ src, deep, DEEP }) => {
        const walk = deep ? eval(DEEP) : null;
        const rx = new RegExp(src);
        const all = deep ? walk(document, []) : [...document.querySelectorAll('button,a,li,label,div,span')];
        const e = all.find((x) => rx.test((x.innerText || '').replace(/\s+/g, ' ').trim()) && (x.innerText || '').length < 60 && x.getBoundingClientRect().width > 0);
        if (!e) return null; (e.closest('a') || e).click(); return (e.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 40);
    }, { src: re.source, deep, DEEP });
}

/** 편집기에 긴 글을 넣는다. 청크 + 줄바꿈은 Enter 키(문자 타이핑은 편집기를 깨뜨린다). */
export async function typeInto(page, point, lines, { chunk = 400, gap = 300 } = {}) {
    await page.mouse.click(point.x, point.y, {}); await wait(600);
    const arr = Array.isArray(lines) ? lines : [lines];
    for (let i = 0; i < arr.length; i++) {
        const s = arr[i] || '';
        for (let j = 0; j < s.length; j += chunk) { await page.cdp('Input.insertText', { text: s.slice(j, j + chunk) }); await wait(gap); }
        if (i < arr.length - 1) {
            await page.cdp('Input.dispatchKeyEvent', { type: 'keyDown', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13, key: 'Enter', code: 'Enter' });
            await page.cdp('Input.dispatchKeyEvent', { type: 'keyUp', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13, key: 'Enter', code: 'Enter' });
            await wait(60);
        }
    }
}

/** 파일 첨부 — 버튼이 OS 선택기를 «즉시» 열기 때문에 클릭 전에 건다. 실패하면 정적 input, 그다음 drop. */
export async function attachFiles(page, clickRe, files, { timeout = 10000 } = {}) {
    try {
        const [fc] = await Promise.all([page.waitForFileChooser({ timeout }), clickText(page, clickRe, { after: 0 })]);
        await fc.setFiles(files); return 'chooser';
    } catch {}
    for (const sel of ['input[type=file][accept*="image"]', 'input[type=file] >> nth=0', 'input[type=file]']) {
        try { await page.setInputFiles(sel, files); return 'input:' + sel; } catch {}
    }
    return null;
}

/** 공개 검증 — 비로그인 fetch 로 «독자가 보는 것»을 확인한다(로그인 화면은 증거가 아니다). */
export async function verifyPublic(page, url, checks) {
    const r = await page.evaluate(async ({ url, checks }) => {
        const res = await fetch(url, { cache: 'no-store' });
        const html = await res.text();
        const out = { status: res.status, bytes: html.length };
        for (const [k, pat] of Object.entries(checks)) out[k] = new RegExp(pat).test(html);
        return out;
    }, { url, checks });
    return r;
}
