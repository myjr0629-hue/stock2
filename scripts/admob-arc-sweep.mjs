/* ============================================================================
 * admob-arc-sweep — 애드몹 광고 심사 센터(ARC)에서 «리딩방» 광고만 찾아 차단한다(대표 지시 9/24·9/25).
 *
 * 왜 매 사이클 도는가(2026-09-25 실측): 이 광고주는 문구를 재사용하면서 광고주 이름·일회용 도메인을
 *   계속 바꿔 새 소재를 만든다(소재당 노출 10회 미만). 새 소재는 «노출된 뒤에야» ARC 에 올라오므로
 *   소재 단위 차단은 사후적이다 — 9/24 23시 66편 차단 후 4시간 만에 새 소재 9편(awdcfbw8.shop 등).
 *   카테고리가 없어 카테고리 차단에 안 걸리고(«벼락부자 되기» 미리보기에도 없음), Google Ads 수요라
 *   광고 소스 차단도 해당 없다 → 자주 훑어 «목록에 오르자마자» 막는 것이 할 수 있는 최선.
 * 범위: 도착 주소가 일회용 .shop/.vip «루트 도메인»인 소재만 차단(증권사·앱 광고 등은 건너뛰고 목록만 남긴다).
 * 계정: 대표 개인 애드몹(authuser=1). 매 실행 새 탭(재사용하면 페이지가 멈춘다).
 * 사용: bash scripts/ego-run.sh scripts/admob-arc-sweep.mjs 540   (검색어는 아래 TERMS, ~/signum-ego-io/arc-terms.json 이 있으면 그것)
 *       한 번에 5분 예산만큼 돌고 멈춘 자리(~/signum-ego-io/arc-cursor.json)부터 다음에 잇는다. 진행 = ~/signum-ego-io/<날짜>/arc-progress.log
 * 결과: ~/signum-ego-io/<날짜>/arc-blocked-<시각>.json + 콘솔 «차단 N건 · 건너뜀 …»
 * ========================================================================== */
process.on('unhandledRejection', (e) => console.log('(무시)', String((e && e.message) || e).slice(0, 80)));
const L = await import('file:///Users/eunhoon/.gemini/antigravity/scratch/stock2/scripts/ego/lib.mjs');
const fs = (await import('node:fs')).default;
let TERMS = ['3배', '특급', '터질', '폭등주', '종목', '777', '투자 자료', '폭등', '급등', '주식', '투자 포인트', '유망', '주목', '상담', '분석', '하반기']; // ★2026-09-26 대표 캡처 4편 문구 · ★2026-09-29 17시 대표 캡처 «aaolonsto — 내일 3배 터질 특급 폭등주» → «3배»·«특급»으로 2건(awdasew2.shop·awmchdw10.shop) 차단 // ★2026-09-26 대표 캡처 4편(«하반기 유망 종목 분석»·«2026년 주목받는 종목은»·«지금 무료 상담을 통해…») 문구 추가
// ★2026-09-30: /tmp 는 재부팅 때 지워진다(09:03 커서 소실) → 커서·검색어는 날짜 없는 ~/signum-ego-io/, 결과·진행 기록은 오늘 폴더(L.ioDir)
const IO_ROOT = L.ioDir().replace(/\/[0-9-]+$/, '');
for (const f of [IO_ROOT + '/arc-terms.json', '/tmp/ego/arc-terms.json']) { try { TERMS = JSON.parse(fs.readFileSync(f, 'utf8')); break; } catch {} }
// ★2026-09-26 대표 «안 나오게 해결» — 리딩방 소재가 .shop/.vip 밖의 싸구려 일회용 TLD 로 옮겨가도 잡는다(루트 도메인만 · 증권사·앱스토어 주소는 여전히 건너뛴다)
const LEAD = /^https?:\/\/[a-z0-9-]+\.(shop|vip|xyz|top|site|online|store|click|link|live|fun|icu|cfd|sbs|bond|cyou|buzz|lol|monster|rest|quest)\/?$/i;
const list = await listTaskSpaces();
const sp = (list || []).find((s) => s.profileId === 'Profile 1') || (list || [])[0];
let ts; try { ts = await takeOverTaskSpace(sp.id); } catch (e) { console.log('USER_CONTROL'); process.exit(1); }
for (const t of await ts.tabs()) { if (/admob\.google\.com/.test(t.url || '')) { try { const pg = t.label ? ts.page(t.label) : await ts.adopt(t.page); await pg.close(); } catch (e) { console.log('탭 닫기 실패', String(e.message).slice(0, 60)); } } }
const page = await ts.newPage();
const blocked = [];
const cardsOf = (snap) => { const lines = snap.split('\n'); const out = [];
  for (let i = 0; i < lines.length; i++) { const b = lines[i].match(/button "광고 차단" \[ref=(\d+)/); if (!b) continue;
    let url = null; for (let k = i - 1; k > i - 14 && k >= 0; k--) { if (!/link "도착 URL"/.test(lines[k])) continue; const m = lines[k].match(/(?:loc=href:|url=)(https?:\/\/[^,\]\s]+)/); if (m) { url = m[1]; break; } }
    out.push({ ref: b[1], url }); }
  return out; };
// ★2026-09-29 07:5x: 검색어 12개 × 약 45초(고정 대기 15+14초 + 스냅샷) ≈ 9분 > ego-run 제한(480초) → 강제 종료되면
//   결과를 «맨 끝»에만 쓰던 구조라 전부 유실됐다(9/27 03:51 이후 완주 0회 — 막힌 게 아니라 느렸다. ARC 는 로그인·검색칸 정상).
//   → 시간 예산(5분) 안에서만 새 검색어를 시작하고, 다음 실행은 멈춘 자리부터(커서) 돈다. 결과·진행은 검색어마다 파일에 쓴다.
const T0 = Date.now(); const BUDGET = 300000;
const CUR = IO_ROOT + '/arc-cursor.json';
const OUT = L.ioDir() + '/arc-blocked-' + T0 + '.json';
let start = 0; try { start = (JSON.parse(fs.readFileSync(CUR, 'utf8')).next || 0) % TERMS.length; } catch {}
const done = [];
for (let step = 0; step < TERMS.length; step++) {
  if (Date.now() - T0 > BUDGET) break;
  const idx = (start + step) % TERMS.length; const term = TERMS[idx];
  try { await page.goto('https://admob.google.com/v2/pubcontrols/arc?authuser=1', { waitUntil: 'domcontentloaded' }); } catch {}
  await L.wait(15000);
  await page.click('loc=css:input[placeholder="필터링 또는 검색(일치검색의 경우 \\" \\" 사용)"]', { label: '검색칸' }); await L.wait(500);
  await page.keyboard.type(term, { delay: 60 }); await L.wait(1200); await page.keyboard.press('Enter'); await L.wait(14000);
  let n = 0, skipped = new Set();
  for (let loop = 0; loop < 40; loop++) {
    if (Date.now() - T0 > BUDGET + 90000) break; // 차단이 많은 날에도 URL 차단 단계가 돌 시간을 남긴다
    const snap = String(await page.snapshot({ scope: 'full_page' }));
    const cards = cardsOf(snap);
    cards.filter((c) => !(c.url && LEAD.test(c.url))).forEach((c) => skipped.add(c.url || '(주소없음)'));
    let target = cards.find((c) => c.url && LEAD.test(c.url));
    if (!target) { await L.wait(8000); const again = cardsOf(String(await page.snapshot({ scope: 'full_page' }))); target = again.find((c) => c.url && LEAD.test(c.url)); if (!target) break; }
    await page.click('@' + target.ref, { label: '광고 차단 ' + target.url }); await L.wait(2500);
    const after = String(await page.snapshot());
    const confirm = after.match(/dialog[\s\S]{0,600}?button "(차단|광고 차단)" \[ref=(\d+)/);
    if (confirm) { await page.click('@' + confirm[2], { label: '차단 확인' }); await L.wait(2500); }
    blocked.push({ term, url: target.url }); n++;
    await L.wait(6000);
  }
  console.log(`## ${term}: 차단 ${n}건 · 건너뜀 ${[...skipped].join(', ') || '없음'}`);
  done.push(term);
  fs.writeFileSync(CUR, JSON.stringify({ next: (idx + 1) % TERMS.length, at: new Date().toISOString() }));
  fs.writeFileSync(OUT, JSON.stringify(blocked, null, 1));
  fs.appendFileSync(L.ioDir() + '/arc-progress.log', `${new Date().toISOString()} ${term}: 차단 ${n} · 건너뜀 ${[...skipped].join(', ') || '없음'}\n`);
}
fs.writeFileSync(OUT, JSON.stringify(blocked, null, 1));

// ★2026-09-26 대표 «검색한 것 차단할 수 있는데 왜 안 해» — 소재 차단만으로는 같은 도메인의 «새 소재»가 다시 나온다.
//   막은 소재의 도메인을 «광고주 URL» 차단 목록(계정 전체·앞으로 올 소재까지)에도 넣는다. 한도 500(9/26 73개 사용).
const BLK = '/Users/eunhoon/.gemini/antigravity/scratch/stock2/.agent/marketing/admob-url-blocklist.json';
let known = []; try { known = JSON.parse(fs.readFileSync(BLK, 'utf8')).domains || []; } catch {}
const fresh = [...new Set(blocked.map((b) => (String(b.url).match(/^https?:\/\/([^/]+)/) || [])[1]).filter(Boolean).map((d) => d.toLowerCase()))].filter((d) => !known.includes(d));
if (fresh.length) {
  try {
    try { await page.goto('https://admob.google.com/v2/pubcontrols/urls?authuser=1', { waitUntil: 'domcontentloaded' }); } catch {}
    await L.wait(12000);
    await page.click('loc=role:searchbox[name="하나의 URL 또는 쉼표로 구분된 여러 개의 URL을 입력하세요."]', { label: 'URL 입력칸' }); await L.wait(400);
    await page.keyboard.insertText(fresh.join(', ')); await L.wait(800);
    await page.click('text="검색"', { label: '검색' }).catch(async () => { await page.keyboard.press('Enter'); });
    await L.wait(7000);
    const sn = String(await page.snapshot()); const ln = sn.split('\n'); const ix = ln.findIndex((l) => /text "모두 차단"/.test(l));
    let ref = null; for (let k = ix; k >= Math.max(0, ix - 4); k--) { const m = ln[k].match(/button[^\n]*\[ref=(\d+)/); if (m) { ref = m[1]; break; } }
    if (ref) { await page.click('@' + ref, { label: 'URL 모두 차단' }); await L.wait(6000); }
    // ★2026-09-26 실측: URL 이 1개일 때 «모두 차단»이 먹지 않았다(profitablenews.com 이 «허용됨»으로 남음) →
    //   누른 뒤 상태를 다시 읽고, «허용됨»이 남은 줄은 그 줄의 스위치(«<도메인> 차단»)를 직접 켠다.
    const sn2 = String(await page.snapshot());
    for (const d of fresh) {
      const st = await page.evaluate((d) => { const t = (document.body.innerText || '').replace(/\s+/g, ' '); const m = t.match(new RegExp(d.replace(/[.]/g, '\\.') + ' (허용됨|차단됨)')); return m ? m[1] : null; }, d);
      if (st === '허용됨') { const sw = sn2.split('\n').find((l) => l.includes('switch "' + d + ' 차단"')); const r2 = sw && (sw.match(/\[ref=(\d+)/) || [])[1]; if (r2) { await page.click('@' + r2, { label: d + ' 차단' }); await L.wait(2500); } }
    }
    const final = await page.evaluate((ds) => { const t = (document.body.innerText || '').replace(/\s+/g, ' '); return ds.map((d) => { const m = t.match(new RegExp(d.replace(/[.]/g, '\\.') + ' (허용됨|차단됨)')); return d + ':' + (m ? m[1] : '?'); }); }, fresh);
    const ok = fresh.filter((d, i) => /차단됨/.test(final[i]));
    if (ok.length) fs.writeFileSync(BLK, JSON.stringify({ updated: new Date().toISOString(), domains: [...known, ...ok].sort() }, null, 1));
    console.log(`광고주 URL 차단 목록: ${final.join(', ')}`);
    if (ok.length < fresh.length) console.log('⚠ 일부 URL 이 «차단됨»으로 확인되지 않았다 — 수동 확인 필요');
  } catch (e) { console.log('⚠ 광고주 URL 차단 실패', String(e.message).slice(0, 80)); }
}
console.log(`합계: 차단 ${blocked.length}건 (이번 검색어 ${done.length}/${TERMS.length}개: ${done.join(', ')} · 다음 시작 = ${TERMS[(start + done.length) % TERMS.length]})`);
try { await page.close(); } catch {}
blocked.forEach((b) => console.log('   ✓', b.term, b.url));
