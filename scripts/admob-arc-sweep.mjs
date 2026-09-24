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
 * 사용: ego-browser nodejs < scripts/admob-arc-sweep.mjs   (검색어는 아래 TERMS, /tmp/ego/arc-terms.json 이 있으면 그것)
 * 결과: /tmp/ego/arc-blocked-<시각>.json + 콘솔 «차단 N건 · 건너뜀 …»
 * ========================================================================== */
process.on('unhandledRejection', (e) => console.log('(무시)', String((e && e.message) || e).slice(0, 80)));
const L = await import('file:///Users/eunhoon/.gemini/antigravity/scratch/stock2/scripts/ego/lib.mjs');
const fs = (await import('node:fs')).default;
let TERMS = ['종목', '777', '투자 자료', '폭등', '급등', '주식', '투자 포인트'];
try { TERMS = JSON.parse(fs.readFileSync('/tmp/ego/arc-terms.json', 'utf8')); } catch {}
const LEAD = /^https?:\/\/[a-z0-9-]+\.(shop|vip)\/?$/i;   // 리딩방 계열: 일회용 .shop/.vip 루트 도메인만
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
for (const term of TERMS) {
  try { await page.goto('https://admob.google.com/v2/pubcontrols/arc?authuser=1', { waitUntil: 'domcontentloaded' }); } catch {}
  await L.wait(15000);
  await page.click('loc=css:input[placeholder="필터링 또는 검색(일치검색의 경우 \\" \\" 사용)"]', { label: '검색칸' }); await L.wait(500);
  await page.keyboard.type(term, { delay: 60 }); await L.wait(1200); await page.keyboard.press('Enter'); await L.wait(14000);
  let n = 0, skipped = new Set();
  for (let loop = 0; loop < 40; loop++) {
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
}
fs.writeFileSync('/tmp/ego/arc-blocked-' + Date.now() + '.json', JSON.stringify(blocked, null, 1));
console.log(`합계: 차단 ${blocked.length}건 (검색어 ${TERMS.length}개)`);
try { await page.close(); } catch {}
blocked.forEach((b) => console.log('   ✓', b.term, b.url));
