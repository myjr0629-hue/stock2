/* ============================================================================
 * gsc-sitemap-resubmit — Search Console «데이터셋 사이트»(myjr0629-hue.github.io/options-market-structure-daily/) 사이트맵 «다시 제출».
 *   gsc_ghpages 레인. 삭제(Remove)는 하지 않는다 — 같은 이름을 Add a new sitemap → SUBMIT 으로 재제출해 재수집을 요청한다(비파괴).
 *
 * 왜(2026-10-04): 9/24 에 낸 sitemap.xml 이 10일째 «Couldn't fetch»·발견 0 인데, URL 은 공개 200·application/xml·21 URL(curl 실측)이었다.
 *   읽기 전용 판독(gsc-dataset-watch.mjs)만 돌아 «제거 후 재제출이 다음 회차 첫 일»로 3회차째 미뤄졌다. 삭제 없이 재제출부터 한다.
 * 사용: bash scripts/ego-run.sh scripts/ego/gsc-sitemap-resubmit.mjs 180  → 결과 /tmp/ego/gsc-sitemap-resubmit-<KST 날짜>.json + 요약 출력
 * 로그인은 contact@(u/0) 기본 세션 — 로그인 화면이 나오면 LOGIN_REQUIRED 로 끝낸다(계정 정보 입력 금지).
 * 입력은 실제 마우스·키보드로(좌표는 요소 위치를 읽어 계산 — 주소·좌표를 짐작하지 않는다).
 * ========================================================================== */
import fs from 'node:fs';
const RID = encodeURIComponent('https://myjr0629-hue.github.io/options-market-structure-daily/');
const BASE = 'https://search.google.com/search-console';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const L = await import('file:///Users/eunhoon/.gemini/antigravity/scratch/stock2/scripts/ego/lib.mjs');
const task = await L.space(); if (!task) { console.log('SPACE_BUSY — 대표가 브라우저를 쓰고 있다. 되찾지 않는다.'); process.exit(0); }
const page = await task.newPage(); // 이 스크립트 전용 탭 — 끝에서 닫는다
const read = () => page.evaluate(() => ({ url: location.href, t: document.body.innerText.replace(/\n{2,}/g, '\n').slice(0, 2200) }));
const out = { at: new Date().toISOString() };
const brief = (o) => { if (!o) return '(없음)'; const t = o.t.replace(/\n/g, ' | '); const k = t.indexOf('PrivacyTerms'); return (k >= 0 ? t.slice(k + 12) : t).slice(0, 900); };
try {
  await page.goto(`${BASE}/sitemaps?resource_id=${RID}`); await wait(9000);
  out.before = await read();
  if (/accounts\.google\.com|ServiceLogin/.test(out.before.url)) { console.log('LOGIN_REQUIRED — 구글 로그인 필요(대표). 계정 정보는 입력하지 않는다.'); out.error = 'LOGIN_REQUIRED'; }
  else {
    // 입력칸·SUBMIT 위치 — 보이는 것만, 찾기와 클릭을 분리한다(MISTAKES: 넓은 셀렉터 클릭 금지)
    const pos = await page.evaluate(() => {
      const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      const c = (e) => { const r = e.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; };
      const btn = [...document.querySelectorAll('button,[role=button]')].filter((b) => /^submit$/i.test((b.innerText || '').trim()) && vis(b))[0];
      // ★10/4 첫 시도 실패: 첫 번째 보이는 input 은 페이지 맨 위 «URL 검사» 검색창(y=32)이었다 → 사이트맵 칸이 비어 제출이 안 됐다.
      //   SUBMIT 과 «같은 줄»(세로 중심 차 40px 안)에 있고 그 왼쪽에 있는 input 만 고른다.
      const bc = btn ? c(btn) : null;
      const inps = [...document.querySelectorAll('input')].filter(vis).map((e) => ({ e, p: c(e) }))
        .filter((o) => bc && Math.abs(o.p.y - bc.y) <= 40 && o.p.x < bc.x).sort((a, b) => Math.abs(a.p.y - bc.y) - Math.abs(b.p.y - bc.y));
      const inp = inps[0] ? inps[0].e : null;
      return { inp: inp ? { ...c(inp), label: inp.getAttribute('aria-label') || inp.placeholder || '', n: inps.length } : null, btn: bc };
    });
    out.pos = pos;
    if (!pos.inp || !pos.btn) { out.error = 'NO_FORM(입력칸·SUBMIT 못 찾음)'; }
    else {
      await page.mouse.click(pos.inp.x, pos.inp.y); await wait(600);
      await page.keyboard.type('sitemap.xml', { delay: 25 }); await wait(900);
      await page.mouse.click(pos.btn.x, pos.btn.y); await wait(6000);
      out.afterSubmit = await read();
      // 결과 대화상자(Sitemap submitted successfully 등)는 «닫기»만 — 다른 것은 누르지 않는다
      const close = await page.evaluate(() => {
        const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
        const b = [...document.querySelectorAll('button,[role=button]')].filter((x) => /^(got it|close|done|ok)$/i.test((x.innerText || '').trim()) && vis(x))[0];
        if (!b) return null; const r = b.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), t: (b.innerText || '').trim() };
      });
      if (close) { await page.mouse.click(close.x, close.y); await wait(1500); out.closed = close.t; }
      out.after = await read();
    }
  }
} catch (e) { out.error = String(e && e.message || e).slice(0, 160); }
try { await page.close(); } catch {}
fs.mkdirSync('/tmp/ego', { recursive: true });
fs.writeFileSync(`/tmp/ego/gsc-sitemap-resubmit-${day}.json`, JSON.stringify(out, null, 1));
console.log('POS:', JSON.stringify(out.pos));
console.log('BEFORE:', brief(out.before));
console.log('AFTER_SUBMIT:', brief(out.afterSubmit));
console.log('AFTER:', brief(out.after));
if (out.error) console.log('오류:', out.error);
