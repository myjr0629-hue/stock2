'use strict';
/* ============================================================================
 * 관제 콘솔 «실측 원천» 읽기 모듈 (2026-10-10, 대표 10/9 «관제는 정확하게 실시간으로»)
 *
 * 원칙 — 값은 원천 파일에서 «그대로» 읽는다. 없으면 null(화면에 «없음»), 0 으로 지어내지 않는다.
 *       모든 블록에 «원천 시각(at, ms)»을 싣는다. 화면이 N시간 전/회색을 판단한다.
 *       비밀값(키·토큰)은 읽지도 싣지도 않는다 — 광고·RC 로그에는 비밀이 없다(캠페인 수치만).
 *
 *  loadAds()           애플 광고 5개국   ← ~/signum-ego-io/<날짜>/ads-periods-*.log · ads-today-*.log · ads-periods-result.json
 *  loadInstalls()      RevenueCat 신규    ← ~/Documents/signum-work/<최신 날짜>/report/rc.log («플랫폼별»·«신규체험» JSON)
 *  loadRcOverview()    RevenueCat Overview ← rc.log 옆 rc-overview.json (없으면 «판독 대기»)
 *  loadRedeemSummary() 리딤 장부 집계     ← ~/signum-ego-io/redeem-summary.json (없으면 «판독 대기»)
 *  loadGoogleAds()     구글 광고(일본 안드) ← ~/signum-ego-io/hud-gads.json (판독기가 아직 없다 → 파일이 없으면 «판독 준비 중»)
 *  buildBrief()        «한눈에» 첫 화면용 한 묶음 — 위 원천을 «같은 하루 기준»으로 다시 짠다(2026-10-12 대표 «정확하지 않다·복잡하다»)
 *  loadTodo()          대표 할 일         ← ~/Documents/Project/recipt/대표-할일.md (최신판 그대로)
 *  loadRunner()        예약 게시 실행기   ← ~/signum-ego-io/<날짜>/pub/.day-sched-*.pid · <표>.tsv · day-sched-<표>.log
 *  loadRefresh()       자동 갱신 상태     ← scripts/hud/refresh-schedule.json(시각표) · ~/signum-ego-io/hud-refresh-state.json(refresh.js 가 적음)
 *  loadAsc()           App Store 분석     ← ~/signum-ego-io/hud-asc.json (refresh.js 가 하루 2회 asc-read.mjs 판독을 적는다 — 소스별·국가별 첫 다운로드·캠페인·오퍼·CPP·PPO)
 *  loadParticipation() 커뮤니티 참여      ← ~/Documents/signum-work/growth/communities/PARTICIPATION-LOG.md
 *  loadAiCredit()      AI 크레딧(월 $198 목표) ← ~/signum-ego-io/hud-ai-credit.json (scripts/hud/ai-credit.js 가 /api/admin/ai-ladder 의 숫자만 적는다 — 비밀값은 싣지 않는다)
 *  parseHuman()/parseGift()/parseViral()   collect.js 가 느린 명령(mkt-clicks-human·mkt-gift·mkt-viral)의 출력을 읽을 때 쓴다
 * ========================================================================== */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const HOME = os.homedir();
const DIRS = {
    egoIo: process.env.HUD_EGO_IO || path.join(HOME, 'signum-ego-io'),
    work: process.env.HUD_WORK || path.join(HOME, 'Documents', 'signum-work'),
    rcOverview: process.env.HUD_RC_OVERVIEW || null,
    redeemSummary: process.env.HUD_REDEEM_SUMMARY || path.join(process.env.HUD_EGO_IO || path.join(HOME, 'signum-ego-io'), 'redeem-summary.json'),
    todo: process.env.HUD_TODO_FILE || path.join(HOME, 'Documents', 'Project', 'recipt', '대표-할일.md'),
    participation: process.env.HUD_PARTICIPATION || path.join(HOME, 'Documents', 'signum-work', 'growth', 'communities', 'PARTICIPATION-LOG.md'),
    aiCredit: process.env.HUD_AI_CREDIT || path.join(HOME, 'signum-ego-io', 'hud-ai-credit.json'),
    gads: process.env.HUD_GADS || path.join(HOME, 'signum-ego-io', 'hud-gads.json'),
    integrity: process.env.HUD_INTEGRITY || path.join(HOME, 'signum-ego-io', 'integrity', 'latest.json'),
    asc: process.env.HUD_ASC || path.join(HOME, 'signum-ego-io', 'hud-asc.json'),
    refreshState: process.env.HUD_REFRESH_STATE || path.join(HOME, 'signum-ego-io', 'hud-refresh-state.json'),
    refreshSchedule: process.env.HUD_REFRESH_SCHEDULE || path.join(__dirname, 'refresh-schedule.json'),
};
const DATE_DIR = /^\d{4}-\d{2}-\d{2}$/;
const num = (s) => Number(String(s).replace(/,/g, ''));
const readText = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return null; } };
const mtime = (p) => { try { return Math.round(fs.statSync(p).mtimeMs); } catch { return null; } };
const listDirs = (root, n) => { try { return fs.readdirSync(root).filter((d) => DATE_DIR.test(d)).sort().slice(-n); } catch { return []; } };

const fmtNY = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });
const nyDay = (ms) => fmtNY.format(new Date(ms));
const utcDay = (ms) => new Date(ms).toISOString().slice(0, 10);
const addDays = (ymd, n) => { const d = new Date(ymd + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const kstDay = (ms) => new Date(ms + 9 * 3600e3).toISOString().slice(0, 10);
const kstParse = (ymd, hm) => Date.parse(`${ymd}T${hm.length === 4 ? '0' + hm : hm}:00+09:00`);

/** 뉴욕(America/New_York) 하루의 시작(00:00)을 epoch(ms)로 — 광고 «어제 완결» 판정과 클릭(ET 하루)의 «한국 시각 창» 표시에 쓴다. 여름시간이면 한국 13:00, 11/1 이후 14:00. */
const NY_PARTS = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
function nyOffsetMin(ms) {
    const p = {}; NY_PARTS.formatToParts(new Date(ms)).forEach((x) => { p[x.type] = x.value; });
    return Math.round((Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(ms / 1000) * 1000) / 60000);   // 뉴욕이 UTC 보다 늦다 → 음수(-240·-300)
}
function nyMidnightMs(ymd) {
    const [y, m, d] = ymd.split('-').map(Number), guess = Date.UTC(y, m - 1, d, 0, 0, 0);
    return guess - nyOffsetMin(guess - nyOffsetMin(guess + 12 * 3600e3) * 60e3) * 60e3;
}

/** 짧은 TTL 캐시 — 10초 폴링마다 파일을 전부 다시 읽지 않는다. */
const memo = (fn, ttlMs) => { let at = 0, val; return (...a) => { const t = Date.now(); if (t - at < ttlMs) return val; val = fn(...a); at = t; return val; }; };

// ─────────────────────────────────────────────────────────────────────────────
// ① 애플 광고
// ─────────────────────────────────────────────────────────────────────────────
const COUNTRY = { SG: '싱가포르', HK: '홍콩', TW: '대만', JP: '일본', KR: '한국', US: '미국' };
const ADS_ORDER = ['SG', 'HK', 'TW', 'JP', 'KR', 'US'];   // 대표 지시 순서 · US 는 일시 정지(지출 있을 때만 본다)
const CAMP_RE = /^\s+SIGNUM ([A-Z]{2}) - (.+?)\s+(실행 중|일시 정지됨|[가-힣]+(?: [가-힣]+)?)\s+지출 \$([\d,.]+)\s+노출 ([\d,]+)\s+탭 ([\d,]+)\s+설치 ([\d,]+)\s+CPA \$([\d,.]+)(?: · CPT \$([\d,.]+))?/;
const TOTAL_RE = /합계(?:=합계)?\s*\|\s*\$([\d,.]+)\s*\|\s*\$([\d,.]+)\s*\|\s*\$([\d,.]+)\s*\|\s*\$([\d,.]+)\s*\|\s*([\d,]+)\s*\|\s*([\d,]+)\s*\|\s*([\d,]+)/;

/** ads-periods-*.log / ads-today-*.log 텍스트 → [{period, rows, total}] */
function parseAdsText(text) {
    const out = []; let cur = null;
    const push = () => { if (cur && cur.rows.length) out.push(cur); cur = null; };
    for (const ln of text.split('\n')) {
        let m = /^\[(.+?)\]/.exec(ln);
        if (m) { push(); cur = { period: m[1].trim(), rows: [], total: null }; continue; }
        m = /기간 선택=\{"t":"([^"]+)"/.exec(ln);
        if (m) { push(); cur = { period: m[1].trim(), rows: [], total: null }; continue; }
        if (!cur) continue;
        m = CAMP_RE.exec(ln);
        if (m) { cur.rows.push({ code: m[1], name: m[2].trim(), state: m[3], spend: num(m[4]), impr: num(m[5]), taps: num(m[6]), installs: num(m[7]), cpa: num(m[8]), cpt: m[9] != null ? num(m[9]) : null }); continue; }
        m = TOTAL_RE.exec(ln);
        if (m) cur.total = { spend: num(m[1]), impr: num(m[5]), taps: num(m[6]), installs: num(m[7]) };
    }
    push();
    return out;
}
/** ads-periods-result.json → 같은 모양 */
function parseAdsResult(j) {
    const out = [];
    for (const p of Array.isArray(j) ? j : []) {
        const rows = [];
        for (const r of p.per || []) {
            const m = /^SIGNUM ([A-Z]{2}) - (.+)$/.exec(r.c || ''); if (!m) continue;
            rows.push({ code: m[1], name: m[2], state: r.st, spend: num(r.spend), impr: num(r.impr), taps: num(r.taps), installs: num(r.inst), cpa: num(r.cpa), cpt: r.cpt != null ? num(r.cpt) : null });
        }
        const t = TOTAL_RE.exec(String(p.total || ''));
        if (rows.length) out.push({ period: p.period, rows, total: t ? { spend: num(t[1]), impr: num(t[5]), taps: num(t[6]), installs: num(t[7]) } : null });
    }
    return out;
}

function adsReads(egoRoot, daysBack) {
    const reads = [];
    for (const d of listDirs(egoRoot, daysBack)) {
        const dir = path.join(egoRoot, d);
        let files = []; try { files = fs.readdirSync(dir); } catch { continue; }
        for (const f of files) {
            if (!/^(ads-(periods|today)-\d{4}\.log|ads-periods-result\.json)$/.test(f)) continue;
            const p = path.join(dir, f), at = mtime(p); if (at == null) continue;
            const t = readText(p); if (!t) continue;
            let parsed = [];
            try { parsed = f.endsWith('.json') ? parseAdsResult(JSON.parse(t)) : parseAdsText(t); } catch { continue; }
            for (const r of parsed) reads.push(Object.assign({ readAt: at, file: p }, r));
        }
    }
    return reads;
}

/** 기간별로 «가장 최근에 읽은» 것만 고른다. 날짜는 읽은 시각의 뉴욕 날짜로 계산한다(대표 지시: 뉴욕 기준). */
function loadAds({ egoRoot = DIRS.egoIo, daysBack = 5 } = {}) {
    const reads = adsReads(egoRoot, daysBack);
    const pick = (period) => reads.filter((r) => r.period === period).sort((a, b) => b.readAt - a.readAt)[0] || null;
    const shape = (r, kind) => {
        if (!r) return null;
        const today = nyDay(r.readAt);
        const label = kind === 'yesterday' ? addDays(today, -1) : kind === 'today' ? today : null;
        // 같은 나라의 캠페인이 둘 이상이면(US 2개) 나라 단위로 합친다. 상태는 하나라도 «실행 중»이면 실행 중.
        const agg = {};
        for (const x of r.rows) {
            const a = agg[x.code] = agg[x.code] || { code: x.code, country: COUNTRY[x.code] || x.code, state: x.state, spend: 0, impr: 0, taps: 0, installs: 0, campaigns: 0 };
            a.spend += x.spend; a.impr += x.impr; a.taps += x.taps; a.installs += x.installs; a.campaigns++;
            if (x.state === '실행 중') a.state = '실행 중';
        }
        const countries = ADS_ORDER.filter((c) => agg[c]).concat(Object.keys(agg).filter((c) => !ADS_ORDER.includes(c))).map((c) => {
            const a = agg[c]; a.spend = +a.spend.toFixed(2); a.cpa = a.installs ? +(a.spend / a.installs).toFixed(2) : null; return a;
        });
        const sumOf = (k) => r.rows.reduce((a, x) => a + x[k], 0);
        const sum = { spend: +sumOf('spend').toFixed(2), impr: sumOf('impr'), taps: sumOf('taps'), installs: sumOf('installs') };
        // 합계는 «콘솔 합계 줄»을 우선한다(캠페인 행은 센트 반올림이 달라 0.01 어긋난다) — 행 합이 크게 다르면 totalMatches=false
        const total = r.total ? Object.assign({}, r.total) : sum;
        total.cpa = total.installs ? +(total.spend / total.installs).toFixed(2) : null;
        // 콘솔은 «최근 3시간 반영 안 됨»(콘솔 안내문 실측) → 뉴욕 어제가 «완결»이려면 뉴욕 자정 + 3시간 뒤에 읽어야 한다(한국 16:00·11/1 이후 17:00).
        //   그 전에 읽은 «어제»는 마감 직전 몇 시간이 빠진 «거의 완결»이다(10/12 13:41 판독 = 뉴욕 00:41 → 어제 21:41~24:00 뉴욕이 빠졌을 수 있다).
        const completeAt = nyMidnightMs(today) + 3 * 3600e3;
        const complete = kind === 'today' ? false : r.readAt >= completeAt;
        return {
            period: r.period, readAt: r.readAt, file: r.file.replace(HOME, '~'),
            nyDate: label, nyFrom: kind === 'week' ? addDays(today, -7) : null, nyTo: kind === 'week' ? addDays(today, -1) : null,
            complete, completeAt: kind === 'today' ? null : completeAt, missingH: kind === 'today' || complete ? 0 : +((completeAt - r.readAt) / 3600e3).toFixed(1),
            countries, total, rowSum: sum,
            totalMatches: r.total ? (Math.abs(r.total.spend - sum.spend) < 0.051 && r.total.installs === sum.installs && r.total.impr === sum.impr && r.total.taps === sum.taps) : null,
        };
    };
    let state = null;
    try { state = JSON.parse(fs.readFileSync(path.join(egoRoot, 'ads-session-state.json'), 'utf8')); } catch { /* 없으면 null */ }
    const y = shape(pick('어제'), 'yesterday'), t = shape(pick('오늘'), 'today'), w = shape(pick('최근 7일'), 'week');
    return {
        yesterday: y, today: t, week: w,
        session: state ? { streak: state.streak || 0, kind: state.kind || '', lastOkAt: state.lastOkAt || null, lastFailAt: state.lastFailAt || null } : null,
        countries: COUNTRY, order: ADS_ORDER,
        // 가장 최근 «정상 판독» — 위 세 기간 중 가장 늦은 판독 시각(없으면 null)
        readAt: [y, t, w].filter(Boolean).reduce((a, x) => Math.max(a, x.readAt), 0) || null,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// ② RevenueCat 신규 고객(설치 근사)
// ─────────────────────────────────────────────────────────────────────────────
/** 시험 고객 — 실적에서 «빼고 따로 표시»한다(대표 지시).
 *  ★2026-10-12 바로잡음: 옛 값은 2명(메모리 android-rc-zero-check-with-emulator 의 에뮬레이터 2회)이었는데, 이후 redeem-report.py 의 TEST_CUSTOMERS 가
 *  «10/5 안드 신규 9 중 7 = 전부 시험(에뮬레이터 4회 + 구글 Play 사전 출시 점검 기기 3대)»로 확정했다 → 7. 시험이 더 생기면 redeem-report.py 와 여기를 같이 고친다. */
const TEST_CUSTOMERS = [{ date: '2026-10-05', platform: 'android', n: 7, note: '에뮬레이터 4회 + 구글 Play 사전 출시 점검 기기 3대(redeem-report.py 기록)' }];
/** 회사 목표 — 하루 신규 설치(RevenueCat 신규 고객) 최소 100건(대표 10/12). */
const DAILY_INSTALL_GOAL = 100;

function monthNum(s) { return { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 }[s]; }
function rcDate(label) { const m = /^([A-Z][a-z]{2}) (\d{1,2}) '(\d{2})$/.exec(String(label).trim()); return m ? `20${m[3]}-${String(monthNum(m[1])).padStart(2, '0')}-${String(m[2]).padStart(2, '0')}` : null; }

/** rc.log 한 줄의 JSON 파싱 — 1200자 잘림으로 깨진 경우 labels·dates·rows 를 정규식으로 건진다. */
function parseRcLine(line) {
    const i = line.indexOf('{'); if (i < 0) return null;
    const body = line.slice(i);
    let j = null; try { j = JSON.parse(body); } catch { /* 잘림 */ }
    if (!j) {
        const dates = (/"dates":\[(.*?)\]/.exec(body) || [])[1]; const labels = (/"labels":\[(.*?)\]/.exec(body) || [])[1];
        const rows = [...body.matchAll(/\[("[\d,]*"(?:,"[\d,]*")+)\]/g)].map((m) => m[1].split(',').map((x) => x.replace(/"/g, '')));
        if (!dates || !labels || !rows.length) return null;
        j = { dates: JSON.parse('[' + dates + ']'), labels: JSON.parse('[' + labels + ']'), rows };
    }
    return j;
}

// 차트 빈칸은 미관측이다. Number('')가 0으로 바꾸지 않게 수량 형식부터 검사한다.
function rcCount(value) {
    if (typeof value === 'string') {
        const raw = value.trim();
        if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(raw)) return null;
        value = Number(raw.replace(/,/g, ''));
    }
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}
/** 차트 JSON(parseRcLine 결과) → {date: 값} — 첫 데이터 행(전체)만. «신규체험» 차트처럼 행이 하나인 표용. */
function seriesByDate(j, rowIdx = 0) {
    if (!j || !Array.isArray(j.dates) || !Array.isArray(j.rows) || !j.rows[rowIdx]) return null;
    const cols = j.dates.map(rcDate).filter(Boolean), out = {};
    cols.forEach((d, k) => { out[d] = rcCount(j.rows[rowIdx][k]); });
    return out;
}

function loadInstalls({ work = DIRS.work, now = Date.now() } = {}) {
    const readings = [];
    let dirs = []; try { dirs = fs.readdirSync(work).filter((d) => DATE_DIR.test(d)).sort().reverse(); } catch { return null; }
    for (const d of dirs) {
        const p = path.join(work, d, 'report', 'rc.log'); const t = readText(p); if (!t) continue;
        try {
            // 자동 판독(refresh.js → rc-auto.mjs)은 첫 줄에 «읽음: <ISO>» 를 적는다 — 파일 수정 시각보다 정확한 «읽은 순간».
            const readLine = t.split('\n').find((l) => /^읽음:/.test(l)), readIso = readLine ? Date.parse(readLine.replace(/^읽음:\s*/, '').trim()) : NaN;
            const readAt = Number.isFinite(readIso) ? readIso : mtime(p);
            const plat = t.split('\n').find((l) => /^플랫폼별/.test(l));
            const all = t.split('\n').find((l) => /^전체:/.test(l));
            const validChart = v => v && Array.isArray(v.dates) && Array.isArray(v.rows) && v.rows.length && v.rows.every(Array.isArray) && (!v.labels || Array.isArray(v.labels));
            const platform = plat ? parseRcLine(plat) : null, aggregate = all ? parseRcLine(all) : null;
            const jp = validChart(platform) ? platform : null, ja = validChart(aggregate) ? aggregate : null;
            const j = jp || ja; if (!j || !j.dates || !j.rows) continue;
            // 열 = 날짜들 + «Row Average»(마지막)
            const cols = j.dates.filter((x) => rcDate(x)).map((x) => ({ label: x, date: rcDate(x) }));
            const n = cols.length;
            const labels = (j.labels || []).map((x) => String(x).trim()).filter((x) => x && x !== 'Segments');
            // 플랫폼 JSON: labels = [Segments, Total, iOS, Android] · rows 같은 순서. «전체:» 만 있으면 rows[0] = 전체
            const named = {}; if (jp) { labels.forEach((lb, k) => { named[lb.toLowerCase()] = (j.rows[k] || []).slice(0, n).map(rcCount); }); }
            const total = (named.total || (ja ? ja.rows[0].slice(0, n).map(rcCount) : (j.rows[0] || []).slice(0, n).map(rcCount)));
            const ios = named.ios || null, android = named.android || null;
            // 읽은 날(UTC)과 같거나 늦은 열은 «진행 중(부분)» — 그날이 끝나지 않았다
            const readDay = utcDay(readAt);
            // 시험 고객은 «원본 − 시험 = 실제»로 따로 센다(대표 지시: 실적에서 빼고 표시). 플랫폼 분리가 없으면 합계에서만 뺀다.
            const testOn = (date, plat2) => TEST_CUSTOMERS.filter((x) => x.date === date && (!plat2 || x.platform === plat2)).reduce((a, x) => a + x.n, 0);
            const days = cols.map((c, k) => {
                const ti = testOn(c.date, 'ios'), ta = testOn(c.date, 'android'), tt = ti + ta;
                const row = { date: c.date, total: total[k], ios: ios ? ios[k] : null, android: android ? android[k] : null, partial: c.date >= readDay, test: tt };
                row.real = { total: row.total == null ? null : Math.max(0, row.total - tt), ios: row.ios == null ? null : Math.max(0, row.ios - ti), android: row.android == null ? null : Math.max(0, row.android - ta) };
                return row;
            });
            const full = days.filter((x) => !x.partial);
            const sum = (arr, key) => arr.reduce((a, x) => a + (x[key] == null ? 0 : x[key]), 0);
            const sumReal = (arr, key) => arr.reduce((a, x) => a + (x.real[key] == null ? 0 : x.real[key]), 0);
            // 신규 체험(New Trials) = 애플 오퍼 코드 사용(10/12 실측: 체험 8건 전부 «SIGNUM PRO 1 Month Free» 코드). rc.log 에 «신규체험(ok):» 줄이 있을 때만 — 없으면 null(0 으로 지어내지 않는다).
            const trialLine = t.split('\n').find((l) => /^신규체험\(ok\):/.test(l));
            const trialSeries = trialLine ? seriesByDate(parseRcLine(trialLine)) : null;
            if (trialSeries) days.forEach((x) => { x.trials = trialSeries[x.date] == null ? null : trialSeries[x.date]; });
            readings.push({
                readAt, auto: Number.isFinite(readIso), utcToday: utcDay(readAt), file: p.replace(HOME, '~'), range: cols.length ? `${cols[0].date}~${cols[n - 1].date}` : null,
                platformSplit: !!jp, trialsRead: !!trialSeries, days,
                last: full.length ? full[full.length - 1] : null,                    // 마지막 «완결일»
                partial: days.find((x) => x.partial) || null,
                week: { total: sum(full, 'total'), ios: ios ? sum(full, 'ios') : null, android: android ? sum(full, 'android') : null, days: full.length,
                        real: { total: sumReal(full, 'total'), ios: ios ? sumReal(full, 'ios') : null, android: android ? sumReal(full, 'android') : null } },
                tests: TEST_CUSTOMERS.filter((x) => days.some((y) => y.date === x.date)),
            });
        } catch { /* 손상된 과거 파일 하나는 건너뛰고 다른 정상 판독을 유지한다. */ }
    }
    readings.sort((a, b) => b.readAt - a.readAt);
    if (!readings.length) return null;
    const history = new Map();
    for (const r of readings) for (const d of r.days) if (!history.has(d.date)) history.set(d.date, { ...d, readAt: r.readAt, source: r.file });
    return { ...readings[0], historyDays: [...history.values()].sort((a, b) => a.date.localeCompare(b.date)) };
}

// KPI source contracts: null means unobserved; zero is a measured value.
const RC_OVERVIEW_NAMES = ['Active Subscriptions', 'Active Trials', 'MRR', 'New Customers', 'Revenue'];
const REDEEM_FIELDS = ['distributed', 'confirmedUsed', 'remaining', 'today', 'total'];
const kpiNumber = (x) => typeof x === 'number' && Number.isFinite(x) ? x : null;
const kpiCount = (x) => kpiNumber(x) !== null && x >= 0 && Number.isSafeInteger(x) ? x : null;
const kpiAt = (j) => typeof j?.readAt === 'string' && Number.isFinite(Date.parse(j.readAt)) ? Date.parse(j.readAt) : null;

function loadRcOverview({ work = DIRS.work, file = DIRS.rcOverview, now = Date.now() } = {}) {
    if (!file) {
        for (const day of listDirs(work, 3650).reverse()) {
            const candidate = path.join(work, day, 'report', 'rc-overview.json');
            if (fs.existsSync(candidate)) { file = candidate; break; }
        }
    }
    let j = null;
    try { if (file) j = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* pending */ }
    const valid = j?.schemaVersion === 1 && !j.signin && j.metrics && kpiAt(j) !== null;
    const metrics = Object.fromEntries(RC_OVERVIEW_NAMES.map((name) => {
        const card = valid ? j.metrics[name] : null;
        const value = (name === 'MRR' || name === 'Revenue' ? kpiNumber : kpiCount)(card?.value);
        return [name, { label: typeof card?.label === 'string' ? card.label : null, value,
            display: value !== null && typeof card?.display === 'string' ? card.display : null }];
    }));
    const missing = RC_OVERVIEW_NAMES.filter((name) => metrics[name].value === null);
    const readAt = valid ? kpiAt(j) : null;
    const state = missing.length === RC_OVERVIEW_NAMES.length ? 'pending' : missing.length ? 'partial' : 'ok';
    return { state, msg: state === 'pending' ? '판독 대기' : null, readAt, ageMs: readAt === null ? null : now - readAt,
        stale: readAt !== null && now - readAt > 40 * 60e3, file: file ? file.replace(HOME, '~') : null,
        metrics, missing, period: valid && typeof j.period === 'string' ? j.period.slice(0, 160) : null, trialToPaidConversion: null };
}

function loadRedeemSummary({ file = DIRS.redeemSummary, now = Date.now() } = {}) {
    let j = null; try { j = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* pending */ }
    const valid = j?.schemaVersion === 1 && j.basis === 'ledger_comment_confirmation' && j.platforms && kpiAt(j) !== null;
    const platforms = Object.fromEntries(['ios', 'android'].map((name) => {
        const p = valid ? j.platforms[name] : null;
        const counts = Object.fromEntries(REDEEM_FIELDS.map((key) => [key, p?.error ? null : kpiCount(p?.[key])]));
        const missing = REDEEM_FIELDS.filter((key) => counts[key] === null);
        return [name, { state: missing.length === REDEEM_FIELDS.length ? 'pending' : missing.length ? 'partial' : 'ok', ...counts, missing }];
    }));
    const total = Object.fromEntries(REDEEM_FIELDS.map((key) => [key,
        Object.values(platforms).every((p) => p[key] !== null) ? Object.values(platforms).reduce((sum, p) => sum + p[key], 0) : null,
    ]));
    const state = Object.values(platforms).every((p) => p.state === 'pending') ? 'pending'
        : Object.values(platforms).every((p) => p.state === 'ok') ? 'ok' : 'partial';
    const readAt = valid ? kpiAt(j) : null;
    return { state, msg: state === 'pending' ? '판독 대기' : null, readAt, ageMs: readAt === null ? null : now - readAt,
        stale: readAt !== null && now - readAt > 24 * 3600e3, file: file.replace(HOME, '~'),
        basis: 'ledger_comment_confirmation', platforms, total };
}

// ─────────────────────────────────────────────────────────────────────────────
// ③ 대표 할 일 — 파일 그대로(최신판만). 누적하지 않는다.
// ─────────────────────────────────────────────────────────────────────────────
function parseTodo(md) {
    const out = { title: '', versionAt: null, note: '', sections: [], footer: [] };
    let cur = null, footer = false;
    for (const raw of md.split(/\r?\n/)) {
        if (/^#\s+/.test(raw) && !out.title) {
            out.title = raw.replace(/^#\s+/, '').trim();
            const m = /\((\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2})\s*KST\)/.exec(out.title); if (m) out.versionAt = kstParse(m[1], m[2]);
            continue;
        }
        if (/^>\s?/.test(raw)) { out.note += (out.note ? ' ' : '') + raw.replace(/^>\s?/, '').trim(); continue; }
        if (/^-{3,}\s*$/.test(raw)) { footer = true; cur = null; continue; }
        const h2 = /^##\s+(.+)$/.exec(raw);
        if (h2 && !footer) { cur = { h: h2[1].trim(), items: [], paras: [] }; out.sections.push(cur); continue; }
        if (!raw.trim()) continue;
        if (footer) { out.footer.push(raw.replace(/^\s*[-*]\s+/, '').trim()); continue; }
        if (!cur) continue;
        const li = /^(\s*)[-*]\s+(?:\[( |x|X)\]\s+)?(.*)$/.exec(raw);
        if (li) {
            const node = { text: li[3].trim(), checked: li[2] == null ? null : li[2] !== ' ', children: [] };
            const indent = li[1].length;
            const last = cur.items[cur.items.length - 1];
            if (indent >= 2 && last) last.children.push(node); else cur.items.push(node);
        } else cur.paras.push(raw.trim());
    }
    for (const s of out.sections) {
        s.kind = /대기\s*중|할 일 없음/.test(s.h) ? 'wait' : /채팅/.test(s.h) ? 'chat' : /준비/.test(s.h) ? 'prep' : 'do';
        const boxes = s.items.filter((i) => i.checked != null);
        s.open = s.kind === 'wait' ? 0 : (boxes.length ? boxes.filter((i) => !i.checked).length : ((s.items.length || s.paras.length) ? 1 : 0));
    }
    const sum = (k) => out.sections.filter((s) => s.kind === k).reduce((a, s) => a + s.open, 0);
    out.counts = { do: sum('do'), chat: sum('chat'), prep: sum('prep'), wait: out.sections.filter((s) => s.kind === 'wait').reduce((a, s) => a + s.items.length + s.paras.length, 0) };
    out.counts.open = out.counts.do + out.counts.chat + out.counts.prep;
    return out;
}
function loadTodo({ file = DIRS.todo } = {}) {
    const t = readText(file); if (t == null) return null;
    const j = parseTodo(t);
    return Object.assign(j, { fileAt: mtime(file), file: file.replace(HOME, '~'), at: j.versionAt || mtime(file) });
}

// ─────────────────────────────────────────────────────────────────────────────
// ④ 예약 게시 실행기 (day-sched.sh — 모델 없음)
// ─────────────────────────────────────────────────────────────────────────────
const psInfo = (pid) => {
    try {
        const s = execFileSync('ps', ['-p', String(pid), '-o', 'etime=,command='], { encoding: 'utf8', timeout: 2000, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
        if (!s) return null;
        const m = /^(\S+)\s+(.*)$/.exec(s); return m ? { etime: m[1], cmd: m[2] } : null;
    } catch { return null; }
};
function loadRunner({ egoRoot = DIRS.egoIo, now = Date.now() } = {}) {
    const pubs = [];
    for (const d of listDirs(egoRoot, 4).reverse()) {
        const p = path.join(egoRoot, d, 'pub'); let rp = null; try { rp = fs.realpathSync(p); } catch { continue; }
        if (!pubs.includes(rp)) pubs.push(rp);
    }
    const runners = [];
    for (const pub of pubs) {
        let files = []; try { files = fs.readdirSync(pub); } catch { continue; }
        for (const f of files) {
            const m = /^\.day-sched-(.+)\.pid$/.exec(f); if (!m) continue;
            const name = m[1], pid = parseInt(readText(path.join(pub, f)) || '', 10);
            const info = Number.isFinite(pid) ? psInfo(pid) : null;
            const alive = !!(info && /day-sched/.test(info.cmd));
            const tsv = readText(path.join(pub, name + '.tsv')) || '';
            const log = readText(path.join(pub, `day-sched-${name}.log`)) || '';
            const slots = tsv.split('\n').filter((l) => l.trim() && !l.startsWith('#')).map((l) => {
                const [id, at, acct, kind, lang, tickers] = l.split('\t');
                const atMs = /^\d{12}$/.test(at || '') ? kstParse(`${at.slice(0, 4)}-${at.slice(4, 6)}-${at.slice(6, 8)}`, `${at.slice(8, 10)}:${at.slice(10, 12)}`) : null;
                const rc = new RegExp('↳ ' + id.replace(/[^\w-]/g, '') + ' 종료코드 (\\d+)').exec(log);
                const skipped = new RegExp('⏭ ' + id.replace(/[^\w-]/g, '') + ' 건너뜀').test(log);
                const state = rc ? (rc[1] === '0' ? 'done' : 'fail') : skipped ? 'skipped' : (atMs && atMs < now - 45 * 60e3 ? 'missed' : 'pending');
                return { id, at: atMs, acct, kind, lang, tickers: tickers || '', state, rc: rc ? Number(rc[1]) : null };
            }).sort((a, b) => (a.at || 0) - (b.at || 0));
            const next = slots.find((s) => s.state === 'pending') || null;
            const flags = files.filter((x) => x === 'STOP' || /^SKIP-/.test(x));
            const lastLines = log.split('\n').filter((l) => l.trim()).slice(-3);
            const posted = (readText(path.join(pub, 'posted.tsv')) || '').split('\n').filter(Boolean).slice(-4).reverse().map((l) => {
                const [ep, ch, url] = l.split('\t'); return { at: Number(ep) * 1000, ch, url };
            });
            runners.push({ name, pid: Number.isFinite(pid) ? pid : null, alive, etime: info ? info.etime : null, slots, next,
                done: slots.filter((s) => s.state === 'done').length, total: slots.length, flags, lastLines, posted, logAt: mtime(path.join(pub, `day-sched-${name}.log`)) });
        }
    }
    runners.sort((a, b) => (b.alive - a.alive) || ((b.logAt || 0) - (a.logAt || 0)));
    return { runners, alive: runners.filter((r) => r.alive), at: now };
}

// ─────────────────────────────────────────────────────────────────────────────
// ⑤ 커뮤니티 참여 기록
// ─────────────────────────────────────────────────────────────────────────────
function loadParticipation({ file = DIRS.participation, max = 8 } = {}) {
    const t = readText(file); if (t == null) return null;
    const entries = []; let date = null;
    for (const ln of t.split('\n')) {
        const d = /^##\s+(\d{4}-\d{2}-\d{2})/.exec(ln); if (d) { date = d[1]; continue; }
        if (/^##\s/.test(ln)) { date = null; continue; }
        const h = /^###\s+(?:\d+\.\s+)?(.+)$/.exec(ln);
        if (h && date) {
            const title = h[1].replace(/\*\*/g, '').trim();
            // 머리글의 모양이 제각각이라(제목 — 상태 — 계정) 칸을 나누지 않고 «전체 문장»을 보여 주고 색만 판정한다.
            const neg = /미게시|미실행|막힘|안 함|보류|0개|로그인 안|불가|거절/.test(title);
            const pos = /게시 완료|등록 완료|참여 완료|제출 완료|공개/.test(title);
            entries.push({ date, title, tone: neg ? 'warn' : pos ? 'ok' : 'info' });
        }
    }
    return { at: mtime(file), file: file.replace(HOME, '~'), recent: entries.slice(-max).reverse(), count: entries.length };
}

// ─────────────────────────────────────────────────────────────────────────────
// ⑤-b 자동 갱신(모델 없는 예약 실행) — 시각표와 «마지막 결과»
//   refresh.js 가 launchd(com.signumhq.hud-refresh)로 시각표대로 RevenueCat·광고 콘솔을 읽어 위 원천 파일을 새로 쓴다(대표 10/10).
//   여기서는 «다음 갱신 시각»과 «마지막 시도의 결과(성공·건너뜀·로그인 필요)»만 읽는다. 시각표는 refresh.js 와 같은 파일 하나다.
// ─────────────────────────────────────────────────────────────────────────────
function loadSchedule(file = DIRS.refreshSchedule) {
    let j = null; try { j = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
    const clean = (a) => (Array.isArray(a) ? a : []).filter((x) => /^\d{1,2}:\d{2}$/.test(x)).map((x) => x.padStart(5, '0')).sort();
    return { rc: clean(j.rc), ads: clean(j.ads), asc: clean(j.asc), retryAfterMin: Number(j.retryAfterMin) || 25, windowMin: Number(j.windowMin) || 120 };
}
/** 시각표(KST HH:MM 목록) → 어제·오늘·내일의 epoch(ms) 오름차순 */
function slotMs(times, now) {
    const d0 = kstDay(now), out = [];
    for (const off of [-1, 0, 1]) { const ymd = addDays(d0, off); for (const t of times) out.push(kstParse(ymd, t)); }
    return out.sort((a, b) => a - b);
}
const prevSlot = (times, now) => { const s = slotMs(times, now).filter((x) => x <= now); return s.length ? s[s.length - 1] : null; };
const nextSlot = (times, now) => slotMs(times, now).find((x) => x > now) || null;

const JOB_NAME = { rc: 'RevenueCat', ads: '애플 광고', asc: 'App Store 분석' };
function loadRefresh({ file = DIRS.refreshState, now = Date.now(), schedule = loadSchedule() } = {}) {
    if (!schedule) return null;
    let st = {}; try { st = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { st = {}; }
    const jobs = {};
    for (const k of ['rc', 'ads', 'asc']) {
        if (k === 'asc' && !(schedule.asc || []).length) continue;                                          // 옛 시각표(asc 없음)는 이 작업이 없다
        const s = st[k] || {}, prev = prevSlot(schedule[k], now), next = nextSlot(schedule[k], now);
        // «예정 시각이 지났는데(재시도 간격+10분) 시도 기록이 없다» = 등록이 풀렸거나 맥이 잠들었다 → 화면이 알린다
        const overdue = prev != null && (st.installedAt || 0) < prev && now - prev > (schedule.retryAfterMin + 10) * 60e3 && !((s.lastStartAt || 0) >= prev - 60e3);
        jobs[k] = {
            name: k === 'ads' && s.source === 'api' ? '광고(API)' : JOB_NAME[k], source: s.source || null, times: schedule[k], prev, next, overdue,        // 광고를 API 로 읽은 회차면 «광고(API)» (2026-10-11)
            running: !!(s.runningSince && now - s.runningSince < 30 * 60e3),
            lastStartAt: s.lastStartAt || null, lastEndAt: s.lastEndAt || null, lastOkAt: s.lastOkAt || null, lastFailAt: s.lastFailAt || null,
            status: s.status || null, kind: s.kind || '', msg: s.msg || '', streak: s.streak || 0,
        };
    }
    const nexts = Object.values(jobs).map((j) => j.next).filter(Boolean);
    return { jobs, next: nexts.length ? Math.min(...nexts) : null, installedAt: st.installedAt || null, stateAt: mtime(file), schedule };
}

// ─────────────────────────────────────────────────────────────────────────────
// ⑥ 느린 명령 출력 파서 (collect.js 가 쓴다)
// ─────────────────────────────────────────────────────────────────────────────
/** node scripts/mkt-clicks-human.js <일수> 의 첫 표 → 태그 가족별 «중복 제외» 합.
 *  같은 글·같은 홈에서 여러 링크(sg·uc·wim·code)가 한꺼번에 세어지므로(홈 링크 4개가 같은 방문자를 4번 센다 — 10/4 실측)
 *  가족(태그)마다 «사람 폰이 가장 많은 한 행»만 대표로 쓴다. 따라서 phone 은 «최소치»다. phoneRowSum 은 중복을 그대로 더한 값. */
function parseHuman(text) {
    const head = /최근 (\d+)일 ET: (\d{4}-\d{2}-\d{2})~(\d{4}-\d{2}-\d{2})/.exec(text);
    if (!head) return null;
    const lines = text.split('\n');
    let i = lines.findIndex((l) => /^앱:태그/.test(l)); if (i < 0) return null;
    const rows = [];
    for (i++; i < lines.length && lines[i].trim(); i++) {
        const m = /^(\w+):(\S+)\s+(\d+)\s+(\d+)\s+(\d+)\s+│\s+(\d+)\s+(\d+%|-)\s+│\s+(\d+)\/(\d+)\/(\d+)\/(\d+)\/(\d+)/.exec(lines[i]);
        if (!m) continue;
        rows.push({ app: m[1], tag: m[2], ios: +m[3], android: +m[4], pc: +m[5], raw: +m[6], nonHuman: +m[8] + +m[9] + +m[10] + +m[11] + +m[12] });
    }
    const fam = (t) => (t === 'home_hero' ? 'home' : t);
    const by = {};
    for (const r of rows) (by[fam(r.tag)] = by[fam(r.tag)] || []).push(r);
    const tags = Object.entries(by).map(([tag, rs]) => {
        const rep = rs.slice().sort((a, b) => ((b.ios + b.android) - (a.ios + a.android)) || (b.pc - a.pc) || (b.raw - a.raw))[0];
        return { tag, ios: rep.ios, android: rep.android, pc: rep.pc, raw: rep.raw, rawAll: rs.reduce((a, x) => a + x.raw, 0), repApp: rep.app, rows: rs.length };
    }).sort((a, b) => ((b.ios + b.android) - (a.ios + a.android)) || (b.pc - a.pc) || (b.raw - a.raw) || a.tag.localeCompare(b.tag));
    const sum = (arr, f) => arr.reduce((a, x) => a + f(x), 0);
    const failed = (/조회 실패 (\d+)건/.exec(text) || [])[1];
    return {
        days: +head[1], etFrom: head[2], etTo: head[3],
        ios: sum(tags, (x) => x.ios), android: sum(tags, (x) => x.android), pc: sum(tags, (x) => x.pc), raw: sum(tags, (x) => x.raw),
        phone: sum(tags, (x) => x.ios + x.android),
        phoneRowSum: sum(rows, (x) => x.ios + x.android), pcRowSum: sum(rows, (x) => x.pc), rawRowSum: sum(rows, (x) => x.raw),
        tags: tags.slice(0, 14), tagCount: tags.length, rowCount: rows.length, failed: failed ? +failed : 0,
    };
}

/** node scripts/mkt-gift.js --days N 의 ①②③ 중 ①(보낸 쪽)·②(받은 쪽) 합계. */
function parseGift(text) {
    const head = /최근 (\d+)일\(ET (\d{4}-\d{2}-\d{2}) ~ (\d{4}-\d{2}-\d{2})\)/.exec(text);
    if (!head) return null;
    const pop = { shown: 0, tap: 0, sent: 0 }; const entries = [];
    for (const m of text.matchAll(/^\s+(gift_\w+)\s+(\w+)\s+(\d+)\s+(\d+)\s+(\d+)\s*$/gm)) {
        entries.push({ surface: m[1], via: m[2], shown: +m[3], tap: +m[4], sent: +m[5] });
        pop.shown += +m[3]; pop.tap += +m[4]; pop.sent += +m[5];
    }
    const daily = [];
    for (const m of text.matchAll(/^\s+(\d{4}-\d{2}-\d{2})\s+(\d+) \((\d+)·(\d+)·(\d+)\)\s+(\d+)\s+(\d+)·(\d+)·(\d+)·(\d+)\s+(\d+)·(\d+)·(\d+)·(\d+)·(\d+)\s+(\d+)\s*$/gm)) {
        daily.push({ date: m[1], human: +m[2], ios: +m[3], android: +m[4], pc: +m[5], couponView: +m[6], tapApply: +m[7], tapCopy: +m[8], tapPlay: +m[9], tapInstall: +m[10], raw: +m[16] });
    }
    const tot = /합계\s+사람\s+(\d+)\s+→\s+쿠폰 화면\s+(\d+)\s+→\s+적용 단추\s+(\d+)\s*\/\s*개인 번호 배정\s+(\d+)/.exec(text);
    const inviters = /사람 클릭이 있었던 id (\d+)개 · 그중 친구가 적용\/배정까지 간 id (\d+)개/.exec(text);
    return {
        days: +head[1], etFrom: head[2], etTo: head[3],
        sender: pop, entries, daily,
        receiver: tot ? { human: +tot[1], couponView: +tot[2], applyTap: +tot[3], claimed: +tot[4] } : null,
        inviters: inviters ? { withHumanClick: +inviters[1], reachedApply: +inviters[2] } : null,
    };
}

/** node scripts/mkt-viral.js <일수> --json 의 «마지막 JSON 줄»(kind:'viral') → 화면용 값(바이럴 계수 k·퍼널).
 *  못 읽은 칸은 null 그대로 둔다(0 으로 채우지 않는다). 전부 못 읽었거나 모양이 다르면 null — collect.js 가 이전 값을 남기고 err 를 적는다.
 *  초대 id 같은 개별 값은 애초에 JSON 에 없다. */
function parseViral(text) {
    const lines = String(text || '').split('\n').map((l) => l.trim()).filter(Boolean);
    let j = null;
    for (let i = lines.length - 1; i >= 0 && !j; i--) {
        if (lines[i][0] !== '{') continue;
        try { const o = JSON.parse(lines[i]); if (o && o.kind === 'viral') j = o; } catch { /* 앞줄로 */ }
    }
    if (!j || !j.total || typeof j.total !== 'object' || !Array.isArray(j.daily) || !j.daily.length) return null;
    const n = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : null);
    const str = (x, max) => (typeof x === 'string' ? x.slice(0, max) : null);
    const pick = (o, fields) => { const r = {}; for (const f of fields) r[f] = n(o && o[f]); return r; };
    const FUNNEL = ['tap', 'sent', 'open', 'clkIos', 'clkAndroid', 'clkDesktop', 'clk', 'coupon', 'match', 'credit'];
    const keys = n(j.keys), unread = n(j.unread);
    if (keys != null && unread != null && keys > 0 && unread >= keys) return null;        // 전부 못 읽음
    const brief = (d) => (d ? { date: str(d.date, 10), k: n(d.k), senders: n(d.senders), match: n(d.match), sent: n(d.sent) } : null);
    return {
        days: n(j.days), etFrom: str(j.etFrom, 10), etTo: str(j.etTo, 10), probe: !!j.probe,
        today: brief(j.today), yesterday: brief(j.yesterday),
        daily: j.daily.slice(0, 14).map((d) => Object.assign(pick(d, FUNNEL.concat(['senders', 'arrive', 'arriveIos', 'arriveAndroid', 'mint', 'k', 'unread'])), { date: str(d.date, 10), kLower: !!d.kLower })),
        total: Object.assign(pick(j.total, FUNNEL.concat(['arrive', 'arriveIos', 'arriveAndroid', 'mint', 'sendersUnique', 'sendersDaySum', 'sendersUnread', 'k'])), {}),
        surfaces: (Array.isArray(j.surfaces) ? j.surfaces : []).slice(0, 8).map((s) => Object.assign(pick(s, FUNNEL), { id: str(s.id, 12) })),
        conv: pick(j.conv, ['sentToClick', 'clickToMatch', 'matchToCredit']),
        line: str(j.line, 240), keys, unread,
        // 일부 키를 못 읽었다는 «하한» 경고 — 화면이 숫자 옆에 보여 준다
        warn: str(j.err, 200),
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// ⑥ AI 크레딧 — 이번 달 누적 / 목표 · 오늘 목표 속도 · 실제 속도 · 단계 · 다음 갱신일
// ─────────────────────────────────────────────────────────────────────────────
/** 스냅샷 파일 → 화면용 값. 없거나 깨졌으면 null(화면에 «없음»), 숫자를 지어내지 않는다. */
function loadAiCredit({ file = DIRS.aiCredit, now = Date.now() } = {}) {
    const txt = readText(file); if (!txt) return null;
    let j; try { j = JSON.parse(txt); } catch { return null; }
    const f = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : null);
    if (!j || f(j.spentUsd) == null || f(j.targetUsd) == null) return null;
    const at = f(j.at) ?? mtime(file);
    return {
        at, ageMin: at ? Math.round((now - at) / 60000) : null,
        spentUsd: j.spentUsd, targetUsd: j.targetUsd, capUsd: f(j.capUsd),
        todayTargetUsd: f(j.todayTargetUsd), last24hUsd: f(j.last24hUsd),
        level: f(j.level), mode: typeof j.mode === 'string' ? j.mode : null, ratio: f(j.ratio),
        projectedEndUsd: f(j.projectedEndUsd), projectedUsedPct: f(j.projectedUsedPct),
        renewsAt: typeof j.renewsAt === 'string' ? j.renewsAt : null, daysLeft: f(j.daysLeft),
        file,
    };
}


// ─────────────────────────────────────────────────────────────────────────────
// ⑧ 데이터 무결성(가격·등락·시간외·옵션 레벨) — scripts/integrity/watch.js 가 15분마다 쓰는 latest.json 한 개를 «그대로» 읽는다
//   정상 n / 오류 n(종목·항목) 한 줄 + 오류 항목 목록. 감시기가 40분 넘게 안 돌았으면 stale(멈춤 의심).
// ─────────────────────────────────────────────────────────────────────────────
function loadIntegrity({ file = DIRS.integrity, now = Date.now() } = {}) {
    const txt = readText(file); if (!txt) return { state: 'none' };
    let j; try { j = JSON.parse(txt); } catch { return { state: 'broken' }; }
    if (!j || typeof j.at !== 'number') return { state: 'broken' };
    const ageMin = Math.round((now - j.at) / 60000);
    const errs = Array.isArray(j.errorList) ? j.errorList : [];
    return {
        state: ageMin > 40 ? 'stale' : (errs.length ? 'err' : 'ok'),
        at: j.at, ageMin, line: j.line || null, session: j.session || null,
        symbols: j.symbols ?? null, ok: j.ok ?? null, errorSymbols: j.errorSymbols ?? 0, errors: j.errors ?? errs.length, warns: j.warns ?? 0, delays: j.delays ?? 0, infos: j.infos ?? 0, transient: j.transient ?? 0,
        errorList: errs.slice(0, 8).map((e) => ({ sym: e.sym || null, door: e.door || null, code: e.code || null, field: e.field || null, msg: String(e.msg || '').slice(0, 220) })),
        file,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// ⑦ 구글 광고(일본 안드 설치 캠페인) — 판독기가 아직 없다
//   애플과 달리 API 없이 ego 콘솔로만 읽을 수 있는데 ego 공간 0·3·5 는 다른 작업이 쓰는 중이다(대표 10/12) → «판독 준비 중»으로 정직하게 표시한다.
//   판독기가 생기면 아래 모양의 파일 한 개만 써 주면 화면이 바로 채워진다(관제 코드는 그대로):
//     ~/signum-ego-io/hud-gads.json = { "at": <읽은 시각 ms>, "day": "YYYY-MM-DD"(캠페인 시간대 = 뉴욕), "status": "Enabled", "spendKrw": 숫자, "installs": 숫자, "clicks": 숫자, "impressions": 숫자 }
// ─────────────────────────────────────────────────────────────────────────────
const GOOGLE_CAMPAIGN = { name: 'SIGNUM-AND-INST-JP-ja-P1', country: '일본', platform: '안드로이드', budgetKrwPerDay: 7000, publishedOn: '2026-10-12' };
function loadGoogleAds({ file = DIRS.gads, now = Date.now() } = {}) {
    const txt = readText(file);
    if (!txt) return { meta: GOOGLE_CAMPAIGN, state: 'pending', read: null };
    let j; try { j = JSON.parse(txt); } catch { return { meta: GOOGLE_CAMPAIGN, state: 'pending', read: null, err: '판독 파일이 깨졌다' }; }
    const f = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : null);
    const at = f(j.at) ?? mtime(file);
    if (at == null || f(j.spendKrw) == null) return { meta: GOOGLE_CAMPAIGN, state: 'pending', read: null, err: '판독 파일에 지출이 없다' };
    const inst = f(j.installs);
    return { meta: GOOGLE_CAMPAIGN, state: 'ok', read: { at, ageMs: now - at, day: typeof j.day === 'string' ? j.day : null, status: typeof j.status === 'string' ? j.status : null,
        spendKrw: j.spendKrw, installs: inst, clicks: f(j.clicks), impressions: f(j.impressions), cpiKrw: inst ? Math.round(j.spendKrw / inst) : null } };
}

// ─────────────────────────────────────────────────────────────────────────────
// ⑦-b App Store Connect «앱 분석» — 소스별·국가별 첫 다운로드(대표 10/14 «전방위적으로 설치를 늘려줘라»)
//   refresh.js 가 하루 2회(09:40·17:40 KST) asc-read.mjs(ego, 로그인된 ASC 세션)로 읽어 ~/signum-ego-io/hud-asc.json 에 적는다. 여기서는 그 파일만 읽는다.
//   ⚠ 애플 하루 = UTC. 분석 데이터는 하루 넘게 늦다 → «어제(UTC)»가 아직 집계 전이면 가장 최근 집계일 값을 «그 날짜를 밝혀» 보인다(어제인 척하지 않는다).
//   ⚠ 웹 추천 «도메인»(clien.net·cafe.naver.com 등)은 애플 개인정보 임계값 미달이면 빈 목록이다(0 이 아니라 «안 보임»). 캠페인 토큰(ct=clien)과 소스 유형 «웹 추천»이 대신 읽힌다.
// ─────────────────────────────────────────────────────────────────────────────
const ASC_STALE_MS = 18 * 3600e3;       // 하루 2회(09:40·17:40) — 가장 긴 간격이 17:40→다음날 09:40(16시간) → 18시간 넘으면 «묵음»
const ASC_SRC_LABEL = { Search: '검색', Other: '탐색', AppRef: '앱 추천', WebRef: '웹 추천', 'Volume Purchase': '기관 구입', Unknown: '불명' };
const ASC_SRC_ORDER = ['WebRef', 'Other', 'Search', 'AppRef', 'Volume Purchase', 'Unknown'];
function loadAsc({ file = DIRS.asc, now = Date.now() } = {}) {
    const txt = readText(file); if (!txt) return { state: 'none' };
    let j; try { j = JSON.parse(txt); } catch { return { state: 'broken' }; }
    if (!j || !Array.isArray(j.days) || !j.bySource || !Array.isArray(j.bySource.units)) return { state: 'broken' };
    const readAt = Number(j.readAt || j.at) || mtime(file);
    const idx = j.latestDay ? j.days.indexOf(j.latestDay) : -1;
    const at = (g, i = idx) => (g && i >= 0 ? Number(g.v[i]) || 0 : 0);
    const sum = (arr, i) => (arr || []).reduce((a, g) => a + at(g, i), 0);
    const pvBy = {}; (j.bySource.pageViewUnique || []).forEach((g) => { pvBy[g.key] = g; });
    const imBy = {}; (j.bySource.impressions || []).forEach((g) => { imBy[g.key] = g; });
    const sources = (j.bySource.units || []).map((g) => ({ key: g.key, label: ASC_SRC_LABEL[g.key] || g.title || g.key, units: at(g), pv: at(pvBy[g.key]), impr: at(imBy[g.key]), units30: g.tot }))
        .filter((x) => x.units > 0 || x.pv > 0).sort((a, b) => (b.units - a.units) || (ASC_SRC_ORDER.indexOf(a.key) - ASC_SRC_ORDER.indexOf(b.key)));
    const countries = ((j.byStore && j.byStore.units) || []).map((g) => ({ name: g.title || g.key, units: at(g), units30: g.tot })).filter((x) => x.units > 0).sort((a, b) => b.units - a.units);
    const campaigns = ((j.campaigns && j.campaigns.units) || []).map((g) => { const pv = ((j.campaigns.pageViewUnique || []).find((x) => x.key === g.key)) || null; const im = ((j.campaigns.impressions || []).find((x) => x.key === g.key)) || null;
        return { id: g.key, units: at(g), pv: at(pv), impr: at(im), units30: g.tot }; }).filter((x) => x.units > 0 || x.units30 > 0).sort((a, b) => (b.units - a.units) || (b.units30 - a.units30));
    const total = (j.total && j.total.units) ? Number(j.total.units[idx]) || 0 : sum(j.bySource.units);
    const prev7 = idx >= 7 && j.total && j.total.units ? +(j.total.units.slice(idx - 7, idx).reduce((a, b) => a + b, 0) / 7).toFixed(1) : null;
    const offerDaily = j.offers && Array.isArray(j.offers.daily) ? j.offers.daily : null;
    const offerCountAt = (i) => {
        const raw = offerDaily && i >= 0 ? offerDaily[i] : null;
        const value = typeof raw === 'number' ? kpiCount(raw) : typeof raw === 'string' && /^\d+$/.test(raw) ? kpiCount(Number(raw)) : null;
        // 과거 판독기는 빈 날짜도 0으로 채웠다. 0은 새 관측 표식이 있을 때만 확정한다.
        const observed = j.offers && j.offers.dailyObserved;
        return j.offers?.meetsThreshold === false || (Array.isArray(observed) ? observed[i] !== true : value === 0) ? null : value;
    };
    const offerTodayDate = utcDay(now), todayIdx = j.days.indexOf(offerTodayDate);
    const offerStartsToday = offerCountAt(todayIdx);
    const yUtc = utcDay(now - 864e5);
    return {
        state: j.ok ? 'ok' : 'err', err: j.ok ? null : String(j.error || '판독 실패').slice(0, 160),
        readAt, ageMs: now - readAt, stale: now - readAt > ASC_STALE_MS, file,
        latestDay: j.latestDay || null, wantDay: yUtc, ready: !!(j.latestDay && j.latestDay >= yUtc),
        total, prev7, sources, countries: countries.slice(0, 6), campaigns: campaigns.slice(0, 4),
        offerStarts: offerCountAt(idx), offerStarts30: j.offers && j.offers.total != null ? j.offers.total : null,
        offerStartsToday, offerTodayDate,
        domainsHidden: !!(j.domainReferrer && j.domainReferrer.d30 && !j.domainReferrer.d30.error && !j.domainReferrer.d30.meetsThreshold),
        ppo: (j.ppo || []).map((t) => ({ id: t.id, name: t.name, status: t.status, start: t.start, end: t.end, treatments: t.treatments || [] })),
        cpp: (j.cpp || []).map((c) => ({ id: c.id, name: c.name, meetsThreshold: c.meetsThreshold, pageViews: c.pageViews, downloads: c.downloads, conversion: c.conversion })),
        fails: (j.fails || []).length,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// ⑧ «한눈에» 첫 화면 — 숫자의 «하루 기준»을 한 곳에서 정한다
//   대표 10/12 «관제가 정확하지도 않고 너무 복잡하다» — 원인: 4가지 하루가 섞여 있었다.
//     RevenueCat = UTC 하루(한국 09:00~다음날 09:00) · 클릭 = 미국 동부(ET) 하루(한국 13:00~다음날 13:00) · 광고 = 뉴욕 하루(같은 13:00) + 콘솔 3시간 지연 · 게시 = 한국 달력 하루.
//   그래서 첫 화면은 (1) 설치를 맨 위에 «오늘(UTC 하루 진행 중)» 로 크게, (2) 나머지 숫자마다 «기준 하루와 그 시작 시각(한국 시각)» 을 같이 적는다.
//   값이 없거나 판독이 실패했으면 옛 값을 새 값처럼 보이지 않게 stale/fail 표식을 달아 준다(화면이 회색·빨간 줄로 그린다).
// ─────────────────────────────────────────────────────────────────────────────
const RC_STALE_MS = 40 * 60e3;          // RevenueCat 은 15분마다 읽는다 → 두 번 건너뛰면(30분) + 여유 = 40분이 넘으면 «묵음»
const CLICK_STALE_MS = 40 * 60e3;       // 클릭 수집기 12분마다
const SLOW_STALE_MS = 6 * 3600e3;       // 광고(하루 4회)·그 밖
/** 발행 원장 한 줄이 «외부에 공개된 글»인가. 원장에는 내부 기록도 같이 쌓인다 — 10/12 오늘 15건 중 diff_kit_1012 2건은 스토어 문구 교체·로컬 문서 기록이라 글이 아니었다.
 *  제외: 공개 주소가 아닌 것(file://·앱스토어 상품 페이지) · 색인 요청(indexnow·naver_search_advisor) · diff_kit_* 내부 기록. */
function isPublicPost(e) {
    const ch = String((e && e.ch) || ''), url = String((e && e.url) || '');
    if (/^file:/i.test(url) || /apps\.apple\.com|play\.google\.com\/store/.test(url)) return false;
    if (/^(indexnow|naver_search_advisor)$/.test(ch) || /^diff_kit/.test(ch)) return false;
    return true;
}

const CH_LABEL = {
    clien: '클리앙', clien2: '클리앙 2호', clien3: '클리앙 3호', ppomppu: '뽐뿌', ppomppu2: '뽐뿌 2호', ruliweb: '루리웹', disquiet: '디스콰이엇', home: '홈페이지', seo: '검색(SEO)',
    x_us: 'X 미국', x_jp: 'X 일본', x_reply: 'X 답글', bluesky: '블루스카이', threads: '스레즈', medium: 'Medium', indiehackers: 'Indie Hackers', note: 'note(일본)', okky: 'OKKY',
    naver_blog: '네이버 블로그', naver_kin: '지식iN', quora: 'Quora', reddit: '레딧', linkedin: '링크드인', github: 'GitHub', zenn: 'Zenn', macrumors: '맥루머스', share: '공유·선물',
};
const stripMd = (t) => String(t || '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[*`]/g, '').replace(/\s+/g, ' ').trim();

function buildBrief({ installs, ads, google, todo, metrics, marketing, refresh, asc, now = Date.now() } = {}) {
    metrics = metrics || {}; const H = metrics.human || {};
    const jobs = (refresh && refresh.jobs) || {};
    const failOf = (j) => (j && j.lastFailAt && (!j.lastOkAt || j.lastFailAt > j.lastOkAt)) ? { kind: j.kind || 'error', msg: j.msg || '', at: j.lastFailAt, streak: j.streak || 0, login: j.kind === 'session' || j.kind === 'signin' } : null;

    // ── ① 설치 — RevenueCat 신규 고객, «오늘 = UTC 하루(진행 중)»
    const todayUtc = utcDay(now), yUtc = addDays(todayUtc, -1);
    const dayStartMs = Date.parse(todayUtc + 'T00:00:00Z');
    const inst = { goal: DAILY_INSTALL_GOAL, date: todayUtc, dayStartMs, dayEndMs: dayStartMs + 86400e3, elapsedMs: now - dayStartMs, leftMs: dayStartMs + 86400e3 - now, fail: failOf(jobs.rc), state: 'none' };
    const pick = (d) => d && { date: d.date, total: d.real.total, ios: d.real.ios, android: d.real.android, test: d.test, rawTotal: d.total, trials: d.trials == null ? null : d.trials };
    if (installs) {
        const sameDay = installs.utcToday === todayUtc;                         // 마지막 판독이 «지금의 UTC 하루» 안에서 이뤄졌나(UTC 자정 직후엔 새 하루 첫 판독 전이다)
        const tRow = sameDay ? installs.days.find((d) => d.date === todayUtc) : null;
        const yRow = installs.days.find((d) => d.date === yUtc);
        Object.assign(inst, {
            state: tRow ? 'ok' : 'pending', today: tRow ? pick(tRow) : null,
            yesterday: yRow && !yRow.partial ? pick(yRow) : null,
            yesterdayPartial: yRow && yRow.partial ? pick(yRow) : null,          // UTC 자정을 막 넘겨 어제 열이 아직 «부분»인 채 — 완결로 쓰지 않는다
            days: installs.days.map((d) => Object.assign(pick(d), { partial: d.partial })),
            avg7: installs.week.days ? +(installs.week.real.total / installs.week.days).toFixed(1) : null, week7: installs.week.real, weekRaw: installs.week.total,
            readAt: installs.readAt, ageMs: now - installs.readAt, stale: now - installs.readAt > RC_STALE_MS, tests: installs.tests, file: installs.file,
            pct: tRow ? Math.round((tRow.real.total / DAILY_INSTALL_GOAL) * 100) : null,
        });
    }

    // ── ② 코드 사용 = 신규 체험(애플 오퍼 코드) — 같은 UTC 하루
    const codes = { state: 'pending' };
    if (installs && installs.trialsRead) {
        const t = installs.days.find((d) => d.date === todayUtc && installs.utcToday === todayUtc), y = installs.days.find((d) => d.date === yUtc);
        const done = installs.days.filter((d) => !d.partial);
        Object.assign(codes, { state: 'ok', today: t && t.trials != null ? t.trials : null, yesterday: y && !y.partial && y.trials != null ? y.trials : null, week: done.reduce((a, d) => a + (d.trials || 0), 0), weekDays: done.length,
            pctOfInstalls: t && t.trials != null && t.real.total ? Math.round((t.trials / t.real.total) * 100) : null, readAt: installs.readAt, stale: now - installs.readAt > RC_STALE_MS });
    }

    // ── ② 채널별 사람 클릭 — ET 하루(한국 13:00~)
    const win = (w) => {
        if (!w || w.phone == null) return { state: 'none', err: (w && w.err) || null };
        return { state: 'ok', etFrom: w.etFrom, etTo: w.etTo, startMs: nyMidnightMs(w.etFrom), endMs: nyMidnightMs(addDays(w.etTo, 1)), phone: w.phone, ios: w.ios, android: w.android, pc: w.pc,
            at: w.at, ageMs: w.at ? now - w.at : null, stale: !w.at || now - w.at > CLICK_STALE_MS, err: w.err || null, failed: w.failed || 0, tags: w.tags || [] };
    };
    const d1 = win(H.d1), d7 = win(H.d7);
    const wk = {}; (d7.tags || []).forEach((r) => { wk[r.tag] = r; });
    const rows = (d1.tags || []).filter((r) => r.ios + r.android + r.pc > 0).slice(0, 7).map((r) => ({
        tag: r.tag, label: CH_LABEL[r.tag] || r.tag, ios: r.ios, android: r.android, pc: r.pc, wPhone: wk[r.tag] ? wk[r.tag].ios + wk[r.tag].android : null }));
    const clicks = { today: Object.assign({}, d1, { tags: undefined, rows }), week: Object.assign({}, d7, { tags: undefined }) };

    // ── ② 오늘 올린 글 — 한국 달력 하루
    const mk = marketing || {};
    const pubRows = (mk.todayRows || []).filter(isPublicPost);
    const posts = { date: mk.today, count: mk.todayPublic != null ? mk.todayPublic : (mk.todayCount || 0), ledgerCount: mk.todayCount || 0, yesterday: mk.yesterdayPublic != null ? mk.yesterdayPublic : (mk.yesterdayCount || 0),
        by: mk.todayByPublic || mk.todayBy || {}, ledgerAt: mk.ledgerAt || null, lastAt: mk.lastPublishAt || null,
        recent: pubRows.filter((r) => r.at).sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 4).map((r) => ({ ch: r.ch, url: r.url || '', at: Date.parse(r.at) })) };

    // ── ③ 광고
    const apple = { state: 'none', fail: failOf(jobs.ads) };
    if (ads && (ads.yesterday || ads.today || ads.week)) {
        const blk = (b) => b && { nyDate: b.nyDate, nyFrom: b.nyFrom, nyTo: b.nyTo, spend: b.total.spend, impr: b.total.impr, taps: b.total.taps, installs: b.total.installs, cpa: b.total.installs ? +(b.total.spend / b.total.installs).toFixed(2) : null,
            readAt: b.readAt, complete: b.complete, missingH: b.missingH, completeAt: b.completeAt };
        const y = ads.yesterday, t = ads.today, w = ads.week;
        const idx = (b) => { const o = {}; if (b) b.countries.forEach((c) => { o[c.code] = c; }); return o; };
        const yi = idx(y), ti = idx(t), wi = idx(w);
        const codesAll = Array.from(new Set(ADS_ORDER.concat(Object.keys(yi), Object.keys(ti), Object.keys(wi))));
        const crow = codesAll.map((c) => { const a = yi[c], b = wi[c], d = ti[c]; const any = a || b || d;
            return { code: c, name: COUNTRY[c] || c, running: !!(any && any.state === '실행 중'), ySpend: a ? a.spend : null, yInst: a ? a.installs : null, wSpend: b ? b.spend : null, wInst: b ? b.installs : null, wCpa: b ? b.cpa : null, tSpend: d ? d.spend : null }; })
            .filter((r) => r.running || (r.ySpend || 0) > 0 || (r.wSpend || 0) > 0 || (r.tSpend || 0) > 0);
        const lastOk = (ads.session && ads.session.lastOkAt) || ads.readAt;
        Object.assign(apple, { state: 'ok', y: blk(y), t: blk(t), w: blk(w), rows: crow, lastOkAt: lastOk, ageMs: now - ads.readAt, stale: now - ads.readAt > SLOW_STALE_MS,
            idle: codesAll.filter((c) => !crow.find((r) => r.code === c) && (yi[c] || wi[c] || ti[c])).map((c) => COUNTRY[c] || c) });
    }
    const g = google || loadGoogleAds({ now });
    // 판독 실패 해결책 — 대표 할 일에 «애플 광고 API 연결»이 올라와 있으면 그것이 영구 해결이다(로그인이 아니라 API 키로 읽는다).
    const apiFix = todo && todo.sections.find((x) => /애플 광고 API/.test(x.h));
    if (apiFix) apple.fixHint = '영구 해결: 대표 할 일 ' + (stripMd(apiFix.h).split(/\s+/)[0] || '').replace(/\.$/, '') + '(애플 광고 API 연결, 5분 1회) — API 로 읽으면 로그인이 필요 없다';

    // ── ④ 대표 할 일 — 제목 줄만 위에서 5개
    const tdo = { state: 'none', items: [], total: 0 };
    if (todo) {
        const act = todo.sections.filter((x) => x.kind === 'do' || x.kind === 'chat');
        const rest = todo.sections.filter((x) => x.kind === 'prep');
        const pickSec = act.concat(rest).filter((x) => x.open > 0 || x.items.length || x.paras.length);
        Object.assign(tdo, { state: 'ok', total: act.filter((x) => x.open > 0).length, prep: rest.filter((x) => x.open > 0).length, at: todo.at, fileAt: todo.fileAt,
            items: pickSec.slice(0, 5).map((x) => ({ h: stripMd(x.h), kind: x.kind, n: x.open })) });
    }

    // ── 원천 상태(한 줄) — 어디가 묵었나
    const hc = (label, at, staleMs, fail, extra) => ({ label, at: at || null, ageMs: at ? now - at : null, state: fail ? 'fail' : (!at || now - at > staleMs ? 'stale' : 'ok'), detail: extra || '' });
    const health = [
        hc('RevenueCat', installs && installs.readAt, RC_STALE_MS, inst.fail, inst.fail ? inst.fail.msg : '15분마다'),
        hc('애플 광고', apple.state === 'ok' ? apple.lastOkAt : null, SLOW_STALE_MS, apple.fail, apple.fail ? (apple.fail.login ? '로그인 필요' : apple.fail.kind) : '하루 4회'),
        hc('사람 클릭', H.d1 && H.d1.at, CLICK_STALE_MS, null, '12분마다'),
        hc('게시 장부', mk.ledgerAt, SLOW_STALE_MS, null, ''),
        hc('대표 할 일', todo && todo.at, 24 * 3600e3, null, ''),
    ];
    // ── ② App Store 분석(소스별 첫 다운로드) — 판독 실패(로그인 만료 포함)는 «빨갛게 정직하게»
    const ascBlk = Object.assign({ state: 'none', fail: failOf(jobs.asc), times: (refresh && refresh.schedule && refresh.schedule.asc) || [], next: jobs.asc ? jobs.asc.next : null }, asc || {});
    // 갱신 상태 파일보다 나중에 성공한 원천도 회복 증거다. 이후 실패는 그대로 유지한다.
    if (ascBlk.fail && asc && asc.state === 'ok' && Number.isFinite(asc.readAt) && asc.readAt > ascBlk.fail.at) ascBlk.fail = null;
    if (!asc) ascBlk.state = 'none';
    ascBlk.lastOkAt = jobs.asc ? jobs.asc.lastOkAt : null;
    health.splice(2, 0, hc('App Store 분석', asc && asc.readAt, ASC_STALE_MS, ascBlk.fail, ascBlk.fail ? (ascBlk.fail.login ? '로그인 필요' : ascBlk.fail.kind) : '하루 2회'));
    return { now, installs: inst, codes, clicks, posts, ads: { apple, google: g }, asc: ascBlk, todo: tdo, health };
}

module.exports = {
    loadRcOverview, loadRedeemSummary,
    DIRS, loadAiCredit, loadIntegrity, loadGoogleAds, loadAsc, buildBrief, isPublicPost, nyMidnightMs, DAILY_INSTALL_GOAL, COUNTRY, ADS_ORDER, TEST_CUSTOMERS, nyDay, utcDay, addDays, memo,
    parseAdsText, parseAdsResult, loadAds, parseRcLine, rcDate, loadInstalls, parseTodo, loadTodo, loadRunner, loadParticipation, parseHuman, parseGift, parseViral,
    kstDay, kstParse, loadSchedule, prevSlot, nextSlot, loadRefresh,
    ...require('./v2-sources'),
};
