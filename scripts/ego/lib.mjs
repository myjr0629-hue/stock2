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
import fsMod from 'node:fs';
import osMod from 'node:os';
export const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** ★2026-09-30 재부팅 사고 뒤: ego 쪽 입출력(작업 파일·캡처·대화상자 기록) 폴더.
 *   /tmp 는 재부팅 때 통째로 지워진다(09:03 실측). ~/Documents 는 macOS 개인정보 보호(TCC) 때문에 ego 의 Node 가
 *   읽기에서 «멈춘다»(09:1x 실측: 홈 폴더 읽기 즉시 · 문서 폴더 읽기 6초 무응답). → 홈 바로 아래 ~/signum-ego-io/<KST 날짜>/ 를 쓴다.
 *   사람이 볼 사본(준비본·캡처)은 bash 쪽에서 ~/Documents/signum-work/<날짜>/cycle/ 로 복사한다. */
export function ioDir() {
    const kst = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
    const d = `${osMod.homedir()}/signum-ego-io/${kst}`;
    try { fsMod.mkdirSync(d, { recursive: true }); } catch {}
    return d;
}
/** 작업 파일 찾기: 오늘 ego-io 폴더 → (옛 위치) /tmp/ego 순서. 둘 다 없으면 오늘 폴더 경로를 돌려준다(읽기에서 명확히 실패). */
export async function taskPath(name) {
    const d = ioDir();
    for (const p of [`${d}/${name}`, `/tmp/ego/${name}`]) { try { if (fsMod.existsSync(p)) return p; } catch {} }
    return `${d}/${name}`;
}

/** ★2026-10-04 09시: 작업 파일이 «낡았으면» 발행을 거부한다(MISTAKES #52).
 *  09:35 에 «원고 만들기(파이썬)가 길이 검사에서 죽었는데 뒤의 발행 명령이 그대로 이어져», 08:02 의 X 일본어(NVDA) 작업 파일로
 *  같은 글을 다시 올릴 뻔했다(발행 전에 -9 로 막음). 08:18 네이버 META 작업 파일도 «올린 채» 남아 있었다.
 *  이번 글의 작업 파일은 «방금 쓴 것»이어야 한다 — 기본 25분 안. 복사(cp)·json.dump 는 수정 시각이 새로 찍히므로 통과한다. */
export function assertFreshTask(path, maxMin = 25) {
    let age = null;
    try { age = (Date.now() - fsMod.statSync(path).mtimeMs) / 60000; } catch { return; }
    if (age > maxMin) {
        console.log(`⛔ 작업 파일이 ${Math.round(age)}분 전 것이다(${path}) — 낡은 작업 파일로 같은 글을 다시 올릴 수 있다. 이번 글의 작업 파일을 «방금» 새로 쓴 뒤 다시 실행한다.`);
        process.exit(1);
    }
}

/** ★2026-10-05: 운영 세션이 «붙잡아 둔» 공간(예: 대표 결제를 기다리는 구글 광고 탭) — space()·takeSpace() 가 고르지 않는다.
 *  10/4 에 회차 정리가 구글 광고 작업 탭을 닫은 일이 있었다. 예약 파일: ~/signum-ego-io/reserved-spaces.json
 *  = {"spaces":[{"id":"5","until":"<ISO 시각>","why":"…"}]} · until 이 지나면 저절로 풀린다. 파일이 없거나 깨지면 예약 없음. */
export function reservedSpaceIds() {
    try {
        const j = JSON.parse(fsMod.readFileSync(`${osMod.homedir()}/signum-ego-io/reserved-spaces.json`, 'utf8'));
        const now = Date.now();
        return (j.spaces || []).filter((r) => !r.until || Date.parse(r.until) > now).map((r) => String(r.id));
    } catch { return []; }
}

/** 작업공간을 잡는다. 대표가 쓰고 있으면 «되찾지 않고» null 을 돌려준다(하드 스톱 존중). */
export async function space() {
    const list = await listTaskSpaces();
    // ★10/4 10:16: 핀터레스트 편집기가 «브라우저 알림 권한» 프롬프트를 띄우자 공간 0(mkt)이 «사용자 제어»(agentDelegatedToUser)로
    //   넘어갔고, 그 뒤 모든 ego 채널이 SPACE_BUSY 로 멈췄다. 사용자 제어 공간은 되찾지 않는다(대표 하드 스톱 존중) —
    //   대신 «같은 프로필(로그인 공유)의 에이전트 소유 공간»을 쓴다. 공간 0 이 다시 에이전트 소유가 되면 목록 맨 앞이라 그것을 쓴다.
    const reserved = reservedSpaceIds();
    const p1 = (list || []).filter((s) => s.profileId === 'Profile 1' && !reserved.includes(String(s.id)));
    const userHeld = (s) => /user/i.test(String(s.ownership || '')) && s.ownership !== 'agent';
    const sp = p1.find((s) => !userHeld(s)) || (p1.length ? null : (list || [])[0]);
    if (!sp) { console.log('ego: Profile 1 공간이 모두 사용자 제어 — 되찾지 않는다'); return null; }
    if (p1[0] && p1[0] !== sp) console.log(`ego: 공간 ${p1[0].id}(${p1[0].name})이 사용자 제어라 공간 ${sp.id}(${sp.name}) 사용`);
    try { await claimTaskSpace(sp.id); } catch (e) { console.log('claim 실패(대표 사용 중일 수 있다): ' + String(e.message).slice(0, 80)); }
    try { return await taskSpace(sp.id); } catch { return null; }
}

/** ★2026-10-04 13시: 발행기 35곳이 «Profile 1 의 첫 공간 + takeOverTaskSpace(sp.id)» 로 공간을 잡았다. 공간 0 이 사용자 제어
 *  (agentDelegatedToUser)면 그 호출이 대표 제어를 «빼앗는다»(slot 경고 «발행기 실행 금지»의 정체 · MISTAKES #56) — 10:38 의 2e69fdb96 은
 *  lib.space() 만 고쳐서 발행기에는 닿지 않았다(13:00 회차가 Threads 발행기 코드를 읽다가 발견).
 *  → 한 함수로 모은다: 원하는 공간이 «사용자 제어가 아니면» 옛 동작 그대로 takeOverTaskSpace, 사용자 제어면 «건드리지 않고»
 *  space() 와 같은 규칙으로 같은 프로필(로그인 공유)의 에이전트 소유 공간을 쓴다. 모두 사용자 제어면 null(takeSpaceOrExit 은 USER_CONTROL 로 종료). */
export async function takeSpace(wantedId) {
    const list = (await listTaskSpaces()) || [];
    const userHeld = (s) => /user/i.test(String(s.ownership || '')) && s.ownership !== 'agent';
    const want = list.find((s) => s.id === wantedId);
    if (want && !userHeld(want) && !reservedSpaceIds().includes(String(want.id))) return await takeOverTaskSpace(want.id);
    return await space();
}
export async function takeSpaceOrExit(wantedId) {
    const ts = await takeSpace(wantedId);
    if (!ts) { console.log('USER_CONTROL'); process.exit(1); }
    return ts;
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
