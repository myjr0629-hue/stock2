/* ============================================================================
 * page-probe — 주소 몇 개를 «열어서 읽기만» 한다(입력·제출·체크 없음). 확장 레인에서 «계정·약관·이메일 칸이 있나»를 화면으로 가를 때 쓴다.
 *   (findupapp-probe.mjs 를 일반화 — MISTAKES #49: 로그에만 있던 «검증 요령»을 첫 반복에 도구로)
 * 실행: bash scripts/ego-run.sh scripts/ego/page-probe.mjs 120   (작업 파일 ~/signum-ego-io/<KST>/page-probe-task.json {"urls":["https://…", …]} · 25분 안)
 * 출력: 주소마다 최종 URL(리다이렉트 = 로그인 벽 신호)·제목·입력칸·체크박스(약관)·버튼·«ログイン/Sign in/同意» 문구 여부·본문 앞부분. 결과 /tmp/ego/page-probe.json
 * ========================================================================== */
import fs from 'node:fs';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const L = await import('file:///Users/eunhoon/.gemini/antigravity/scratch/stock2/scripts/ego/lib.mjs');
const TP = await L.taskPath('page-probe-task.json'); L.assertFreshTask(TP);
let urls = []; try { urls = (JSON.parse(fs.readFileSync(TP, 'utf8')).urls || []).slice(0, 6); } catch (e) { console.log('작업 파일 읽기 실패:', String(e.message).slice(0, 80)); process.exit(1); }
if (!urls.length) { console.log('urls 가 비었다'); process.exit(1); }
const ts = await L.space(); if (!ts) { console.log('SPACE_BUSY — 대표가 브라우저를 쓰고 있다. 되찾지 않는다.'); process.exit(0); }
const page = await ts.newPage();
const out = { at: new Date().toISOString(), items: [] };
for (const u of urls) {
  const it = { url: u };
  try {
    await page.goto(u); await wait(6500);
    Object.assign(it, await page.evaluate(() => {
      const vis = (e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0; };
      const pick = (s) => [...document.querySelectorAll(s)].filter(vis);
      const t = document.body.innerText.replace(/\n{2,}/g, '\n');
      return {
        final: location.href, title: document.title,
        inputs: pick('input,textarea,select').map((e) => ({ type: e.type || e.tagName, name: e.name || '', ph: (e.placeholder || '').slice(0, 50) })).slice(0, 14),
        checks: pick('input[type=checkbox],[role=checkbox]').map((e) => ((e.closest('label') || e.parentElement || {}).innerText || '').replace(/\s+/g, ' ').slice(0, 100)).slice(0, 6),
        buttons: pick('button,[role=button],input[type=submit]').map((e) => (e.innerText || e.value || '').replace(/\s+/g, ' ').trim().slice(0, 36)).filter(Boolean).slice(0, 16),
        loginWords: /ログイン|Sign in|Log in|サインイン|Continue with|同意/.test(t), text: t.slice(0, 380).replace(/\n/g, ' | '),
      };
    }));
  } catch (e) { it.err = String(e && e.message || e).slice(0, 160); }
  out.items.push(it);
}
try { await page.close(); } catch {}
fs.mkdirSync('/tmp/ego', { recursive: true }); fs.writeFileSync('/tmp/ego/page-probe.json', JSON.stringify(out, null, 1));
for (const it of out.items) console.log('PROBE:', JSON.stringify(it).slice(0, 1300));
