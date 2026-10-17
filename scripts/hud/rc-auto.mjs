/* RevenueCat 신규 고객(설치 근사) «무인» 판독 — 모델 없이 도는 관제 갱신용 (2026-10-10, 대표 «관제는 정확하게 실시간으로»)
 * 바탕: ~/Documents/signum-work/2026-10-09/report/rc-7d.mjs (고정 날짜) → 날짜를 «지금» 에서 계산한다.
 * 범위(UTC): 오늘-7일 ~ 오늘 = 완결일 7개 + 오늘(부분) 1개. RevenueCat 차트의 하루는 UTC 다 (= 한국 09:00 ~ 다음날 09:00).
 * 실행: node scripts/hud/refresh.js run rc   (내부에서 scripts/ego-run.sh 로 ego 잠금·대기열을 지켜 이 파일을 돌린다)
 * 출력(표준출력) = rc.log 본문. 첫 줄 «읽음:» 은 읽은 시각(ISO) — 관제가 «오늘 부분» 의 기준 시각으로 쓴다.
 * 읽기 전용 · 로그인 시도 없음: 로그인 화면이면 SIGNIN 만 찍고 끝낸다(비밀번호는 대표 몫).
 * ※ ego 스크립트라 셸 환경변수가 가지 않는다 — 입력은 전부 시계에서 계산한다. */
// Self-contained: refresh.js copies this source into the ego IO directory.
// This callback also runs against synthetic DOM fixtures in verify-kpi.js.
export function readOverviewDocument() {
  const names = ['Active Subscriptions', 'Active Trials', 'MRR', 'New Customers', 'Revenue'];
  const patterns = [/^active\s+subscriptions?$/i, /^active\s+trials?$/i, /^(mrr|monthly\s+recurring\s+revenue)$/i, /^new\s+customers?$/i, /^revenue$/i];
  const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim();
  const nameIndex = (s) => patterns.findIndex((p) => p.test(norm(s).replace(/\s*\([^)]*\)\s*$|[:?ⓘ]+$/g, '').trim()));
  const visible = (el) => el.getClientRects().length > 0;
  const elements = [...document.querySelectorAll('body *')].filter(visible);
  const labels = elements.filter((el) => nameIndex(el.innerText) >= 0 && ![...el.children].some((ch) => nameIndex(ch.innerText) >= 0));
  const metrics = Object.fromEntries(names.map((name) => [name, { label: null, value: null, display: null }]));
  const parse = (text) => {
    const display = norm(text);
    // Entire numeric line only: excludes change percentages, dates, and descriptions.
    const m = /^(-)?(?:(?:US\$|[$€£¥]|USD|EUR|GBP|JPY)\s*)?(-)?([\d,]+(?:\.\d+)?)\s*([kmb])?(?:\s*(?:USD|EUR|GBP|JPY))?$/i.exec(display);
    if (!m) return null;
    if (m[1] && m[2]) return null;
    const value = Number(m[3].replace(/,/g, '')) * (m[1] || m[2] ? -1 : 1) * ({ k: 1e3, m: 1e6, b: 1e9 }[(m[4] || '').toLowerCase()] || 1);
    return Number.isFinite(value) ? { display, value } : null;
  };
  for (const label of labels) {
    const idx = nameIndex(label.innerText), name = names[idx];
    if (metrics[name].value !== null) continue;
    let box = label.parentElement;
    for (let depth = 0; box && depth < 5; depth++, box = box.parentElement) {
      // Do not cross into a neighbouring card or the page-wide navigation.
      if (labels.some((other) => other !== label && box.contains(other))) break;
      const text = box.innerText || '';
      if (text.length > 600) break;
      const values = text.split(/\n/).map(parse).filter(Boolean);
      if (values.length) { metrics[name] = { label: norm(label.innerText), ...values[0] }; break; }
    }
  }
  const period = elements.map(el => norm(el.innerText)).find(s => /^(?:Last|Past) \d+ days$|^最近\s*\d+\s*日$|^최근\s*\d+일$/i.test(s)) || null;
  return {
    metrics, period,
    signin: /\/login|\/signin/i.test(location.pathname) || /log in|sign in/i.test((document.body.innerText || '').slice(0, 400)),
    missing: names.filter((name) => metrics[name].value === null),
  };
}

async function run() {
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  // Only the existing space 0 is allowed; never create a named space or take user control.
  const spaces = await listTaskSpaces();
  const sp = (spaces || []).find((s) => String(s.id) === '0');
  if (!sp || sp.ownership !== 'agent') { console.log('SPACE_BUSY'); return; }
  let task;
  try { await claimTaskSpace(0); task = await taskSpace(0); }
  catch { console.log('SPACE_BUSY'); return; }
  const day = (ms) => new Date(ms).toISOString().slice(0, 10);
  const now = Date.now();
  const TO = day(now), FROM = day(now - 7 * 86400e3);
  console.log(`읽음: ${new Date(now).toISOString()}`);
  console.log(`범위(UTC): ${FROM}~${TO} · 완결일 ${FROM}~${day(now - 86400e3)} · 오늘(부분) ${TO}`);
  const page = await task.newPage();
  const overviewUrl = 'https://app.revenuecat.com/projects/a3ecb903/overview';
  const BASE = `https://app.revenuecat.com/projects/a3ecb903/charts/customers_new_v3?range=Last+7+days%3A${FROM}%3A${TO}&chart_type=Line`;
  const read = () => page.evaluate(() => {
    const tbs = [...document.querySelectorAll('table')];
    const labels = tbs[0] ? [...tbs[0].rows].map((r) => r.innerText.replace(/\s+/g, ' ').trim()) : [];
    const dates = tbs[1] ? [...tbs[1].rows[0].cells].map((c) => c.innerText.trim()).filter((x) => x) : [];
    const rows = tbs[1] ? [...tbs[1].rows].slice(1).map((r) => [...r.cells].map((c) => c.innerText.trim())) : [];
    const head = (document.body.innerText || '').slice(0, 400);
    return { url: location.origin + location.pathname, labels, dates, rows, signin: /log in|sign in/i.test(head) || /\/login|\/signin/.test(location.pathname) };
  });
  // 표가 그려질 때까지 기다린다(고정 대기 9초는 느린 날 빈 표를 읽었다) — 날짜 열이 7개 이상이고 숫자 행이 minRows 개 이상이면 끝.
  const readWhenReady = async (minRows, maxMs = 40000) => {
    const t0 = Date.now(); let r = null;
    while (Date.now() - t0 < maxMs) {
      await wait(2000);
      r = await read();
      if (r.signin) return r;
      if (r.dates.length >= 8 && r.rows.length >= minRows && r.rows.every((x) => x.length >= r.dates.length && /^[\d,]+$/.test(x[0] || ''))) { await wait(1200); return await read(); }
    }
    return r || { url: '', labels: [], dates: [], rows: [], signin: false };
  };
  try {
    // Missing/renamed cards stay null. Failure here does not stop the existing charts.
    try {
      await page.goto(overviewUrl).catch(() => {});
      let overview;
      const until = Date.now() + 25000;
      do {
        overview = await page.evaluate(readOverviewDocument);
        if (overview.signin || !overview.missing.length) break;
        await wait(1000);
      } while (Date.now() < until);
      if (overview.signin) { console.log('SIGNIN — RevenueCat 로그인 필요. 판독 실패'); return; }
      // Do not stamp values from a previous chart after failed navigation.
      if ((await page.url()).split('?')[0].replace(/\/$/, '') === overviewUrl) {
        console.log('RC_OVERVIEW ' + JSON.stringify({ schemaVersion: 1, readAt: new Date().toISOString(), source: 'RevenueCat Overview', url: overviewUrl,
          ...overview, trialToPaidConversion: null }));
      }
    } catch { console.log('Overview(실패): 판독 대기'); }
    await page.goto(BASE).catch(() => {});
    let r = await readWhenReady(1);
    if (r.signin) { console.log('SIGNIN — RevenueCat 로그인 필요. 판독 실패'); }
    else {
      console.log('전체:', JSON.stringify(r));
      // 플랫폼별: 주소에 segment=platform 을 붙이면 클릭 없이 열린다(10/9 판독 URL 에서 확인). 안 되면 원래 클릭 절차로 후퇴.
      await page.goto(BASE + '&segment=platform').catch(() => {});
      let p = await readWhenReady(3, 30000), how = 'url';
      if (!(p.rows.length >= 3 && p.labels.some((x) => /android/i.test(x)))) {
        how = 'click';
        await page.goto(BASE).catch(() => {});
        try {
          // Preserve the old, verified menu sequence using v2.1.0 Page selectors.
          await page.waitForSelector('loc=role:button[name="Segment"]', { timeout: 8000 });
          await page.click('loc=role:button[name="Segment"]');
          await page.click('text="Apps and platforms"');
          await page.click('text="Platform"');
          p = await readWhenReady(3, 30000);
        } catch { /* Keep the total-only result when the menu has changed. */ }
      }
      const okP = p.rows.length >= 3 && p.labels.some((x) => /android/i.test(x)) && !p.signin;
      console.log('플랫폼별(' + (okP ? 'ok' : '실패') + '):', JSON.stringify(p));
      console.log('플랫폼 경로: ' + how);
      // ── 신규 체험(New Trials) — 애플 오퍼 코드 사용 = 신규 체험 시작(2026-10-12 실측: 체험 8건 전부 «SIGNUM PRO 1 Month Free» 코드). 관제 «코드 사용» 칸의 원천.
      //    위 값은 이미 찍혔다 → 이 단계는 실패해도 절대 던지지 않고(try/catch), 25초를 넘기지 않는다(ego 잠금을 오래 쥐지 않는다). 안드 Play 프로모션은 이 차트에 안 잡힌다.
      try {
        await page.goto(`https://app.revenuecat.com/projects/a3ecb903/charts/trials_new_v3?range=Last+7+days%3A${FROM}%3A${TO}&chart_type=Line`).catch(() => {});
        const tr = await readWhenReady(1, 25000);
        const okT = !tr.signin && tr.rows.length >= 1 && tr.labels.some((x) => /new trials/i.test(x));
        console.log('신규체험(' + (okT ? 'ok' : '실패') + '):', JSON.stringify(tr));
      } catch { console.log('신규체험(실패): 표를 못 읽음'); }
    }
  } finally { try { await page.close(); } catch {} }
}

// Importing in ordinary Node tests never connects to a browser.
if (typeof listTaskSpaces === 'function') await run();
