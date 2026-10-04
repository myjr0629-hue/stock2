/* ============================================================================
 * findupapp-submit — FindUpApp(findupapp.com · 무료·로그인 불필요·심사 없음 앱 발견 사이트)에 우리 «공개 스토어 URL»을 등록한다.
 *   입력은 스토어 국가(select)·스토어 URL 두 칸뿐(10/5 03:09 findupapp-probe 실측 — 약관 체크박스·이메일·로그인 없음).
 *   계정 생성·약관 동의·개인정보 입력이 «전혀» 없는 경로다. 보안 확인(캡차)이 «눈에 보이면» 우회하지 않고 끝낸다(CAPTCHA_STOP).
 * 실행: bash scripts/ego-run.sh scripts/ego/findupapp-submit.mjs 240
 * 작업 파일(필수·25분 안): ~/signum-ego-io/<KST>/findupapp-task.json
 *   {"go": false, "items": [{"country": "JP", "url": "https://apps.apple.com/jp/app/…/id…"}, …]}
 *   · go 가 true 가 «아니면» 드라이런 — 칸을 채우고 값만 읽어 출력한다(등록 버튼을 누르지 않는다). 되돌릴 수 없는 동작은 기본 드라이런.
 * URL 은 «붙여넣기»(Input.insertText)로 넣고, 입력 뒤 값을 읽어 같은지 확인한다(MISTAKES #54).
 * ========================================================================== */
import fs from 'node:fs';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const L = await import('file:///Users/eunhoon/.gemini/antigravity/scratch/stock2/scripts/ego/lib.mjs');
const TP = await L.taskPath('findupapp-task.json');
L.assertFreshTask(TP);
let task0; try { task0 = JSON.parse(fs.readFileSync(TP, 'utf8')); } catch (e) { console.log('작업 파일 읽기 실패:', TP, String(e.message).slice(0, 80)); process.exit(1); }
const GO = task0.go === true;
const items = Array.isArray(task0.items) ? task0.items : [];
if (!items.length) { console.log('items 가 비었다'); process.exit(1); }
console.log(`모드=${GO ? 'GO(등록 버튼 누름)' : 'DRYRUN(칸만 채우고 읽음)'} · 항목 ${items.length}`);
const ts = await L.space(); if (!ts) { console.log('SPACE_BUSY — 대표가 브라우저를 쓰고 있다. 되찾지 않는다.'); process.exit(0); }
const page = await ts.newPage(); // 이 스크립트 전용 탭 — 끝에서 닫는다
const COUNTRY = { JP: /日本|Japan|\bJP\b/i, US: /アメリカ|United States|米国|\bUS\b/i, KR: /韓国|Korea|\bKR\b/i };
const state = () => page.evaluate(() => {
  const sel = document.querySelector('select');
  const inp = document.querySelector('input[name="findup-store-url"]');
  const btn = [...document.querySelectorAll('button')].find((b) => /確認して登録/.test(b.innerText || ''));
  return {
    url: location.href,
    selected: sel ? (sel.options[sel.selectedIndex] || {}).text : null,
    options: sel ? [...sel.options].map((o) => o.text.replace(/\s+/g, ' ').trim()).slice(0, 40) : [],
    value: inp ? inp.value : null,
    btn: btn ? { t: btn.innerText.trim(), disabled: !!btn.disabled } : null,
  };
});
const challenge = () => page.evaluate(() => {
  const vis = (e) => { const b = e.getBoundingClientRect(); return b.width > 20 && b.height > 20; };
  const frames = [...document.querySelectorAll('iframe')].filter((f) => vis(f) && /challenges\.cloudflare|turnstile|recaptcha|hcaptcha/i.test(f.src || ''));
  const txt = document.body.innerText;
  return { frames: frames.length, text: /人間であることを確認|Verify you are human|セキュリティ確認/.test(txt) && frames.length > 0 };
});
const results = [];
for (const it of items) {
  const r = { url: it.url, country: it.country };
  try {
    await page.goto('https://findupapp.com/ja/submit'); await wait(5500);
    // ① 스토어 국가 select — 네이티브 setter + change 이벤트(React 제어 컴포넌트)
    const want = COUNTRY[it.country] || new RegExp(it.country, 'i');
    r.pickedCountry = await page.evaluate((src) => {
      const sel = document.querySelector('select'); if (!sel) return null;
      const rx = new RegExp(src, 'i');
      const o = [...sel.options].find((x) => rx.test(x.text) || rx.test(x.value));
      if (!o) return { err: 'no-option', options: [...sel.options].map((x) => x.text).slice(0, 30) };
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(sel, o.value);
      sel.dispatchEvent(new Event('input', { bubbles: true })); sel.dispatchEvent(new Event('change', { bubbles: true }));
      return { text: o.text.trim(), value: o.value };
    }, want.source);
    await wait(800);
    // ② URL 입력 — 비우고(0자 확인) 붙여넣기
    const box = await page.evaluate(() => {
      const inp = document.querySelector('input[name="findup-store-url"]'); if (!inp) return null;
      inp.scrollIntoView({ block: 'center' });
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(inp, '');
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      const b = inp.getBoundingClientRect(); return { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2) };
    });
    if (!box) { r.err = 'URL 입력칸 없음'; results.push(r); continue; }
    await page.mouse.click(box.x, box.y, {}); await wait(500);
    await page.cdp('Input.insertText', { text: it.url }); await wait(900);
    r.state = await state();
    r.valueOk = r.state.value === it.url;
    if (!r.valueOk) { r.err = '입력값 불일치: ' + JSON.stringify(r.state.value); results.push(r); continue; }
    if (!GO) { r.dry = true; results.push(r); continue; }
    // ③ 등록 — «確認して登録» 한 번
    let ch = await challenge();
    if (ch.text) { r.err = 'CAPTCHA_STOP — 보안 확인 화면(우회하지 않는다)'; results.push(r); break; }
    const hit = await L.clickText(page, /^確認して登録$/, { tags: 'button', after: 5000 });
    r.clicked1 = hit;
    // 등록은 «비동기 분석»이다(버튼이 «アプリを解析中...» 으로 바뀐다 — 10/5 03:11 실측: 약 30초 안에 목록 맨 위로 올라온다).
    // 탭을 바로 닫지 말고 최대 60초 폴링: 주소가 /submit 을 벗어나거나, 분석 문구가 사라지거나, 오류·중복 문구가 뜰 때까지.
    const snap = () => page.evaluate(() => ({ url: location.href, t: document.body.innerText.replace(/\n{2,}/g, '\n').slice(0, 900), btns: [...document.querySelectorAll('button,[role=button]')].filter((b) => b.getBoundingClientRect().width > 0).map((b) => (b.innerText || '').replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 14) }));
    r.after1 = await snap();
    for (let i = 0; i < 20; i++) {
      const analyzing = r.after1.btns.some((b) => /解析中/.test(b));
      const left = !/\/submit/.test(r.after1.url);
      const msg = /登録(が)?完了|登録しました|既に|すでに|登録済|エラー|失敗|できませんでした|無効/.test(r.after1.t.split('FAQ')[0]);
      if (left || msg || !analyzing) break;
      await wait(3000); r.after1 = await snap();
      if ((await challenge()).text) { r.err = 'CAPTCHA_STOP — 보안 확인 화면(우회하지 않는다)'; break; }
    }
    if (r.err) { results.push(r); break; }
    // 약관·동의 화면이 보이면 «누르지 않고» 끝낸다(안전선).
    if (/(利用規約|プライバシーポリシー)に同意|同意して/.test(r.after1.t)) { r.err = 'CONSENT_STOP — 약관 동의 화면(누르지 않는다)'; results.push(r); break; }
    const fin = r.after1.btns.find((b) => /^(この内容で)?(登録する|確定|公開する)$/.test(b));
    if (fin) {
      r.clicked2 = await L.clickText(page, new RegExp('^' + fin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$'), { tags: 'button,[role=button]', after: 5000 });
      r.after2 = await snap();
    }
  } catch (e) { r.err = String(e && e.message || e).slice(0, 200); }
  results.push(r);
}
try { await page.close(); } catch {}
fs.mkdirSync('/tmp/ego', { recursive: true });
fs.writeFileSync('/tmp/ego/findupapp-submit-result.json', JSON.stringify({ at: new Date().toISOString(), go: GO, results }, null, 1));
for (const r of results) console.log('RESULT:', JSON.stringify(r).slice(0, 1800));
