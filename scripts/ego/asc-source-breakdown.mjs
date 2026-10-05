/* ASC 웹 분석 «출처 세부» 읽기 — 읽기 전용 (2026-10-05 11시 회차 신설 — 확장: 측정되는 직접 설치 경로)
 * 왜: 설치 판정은 «클릭»이 아니라 «설치»로 해야 하는데(클릭≠설치 r=-0.12), iOS 쪽은 합계·«소스 유형»(App Store Search 등)만 읽혔다
 *     (~/Documents/signum-work/redeem/ego-redeem-metrics.mjs). 스마트링크는 iOS 에서 pt·ct 토큰(=캠페인)을 붙여 앱스토어로 보내므로,
 *     ASC 분석이 «캠페인 토큰별»·«웹 리퍼러 도메인별»·«국가별» 다운로드·제품 페이지 조회를 주면 «어느 채널·어느 나라가 설치를 만드나»를 직접 읽는다.
 * 실행: bash scripts/ego-run.sh scripts/ego/asc-source-breakdown.mjs 150   → 결과 ~/signum-ego-io/<KST>/asc-breakdown-result.json · 마지막 줄 «ASC_BREAKDOWN {json}»
 * 방법: ASC 분석 «개요» → «소스» 탭을 한 번 눌러 분석 API 요청(주소·헤더)을 가로채고, 같은 API 에 «그룹 차원»만 바꿔 읽기 요청을 보낸다(ego-redeem-metrics.mjs 와 같은 방식).
 *       차원 이름은 비공개 API 라 후보를 차례로 시험한다 — 4xx 면 메시지 앞 160자를 그대로 적는다(없는 차원을 «0건»으로 읽지 않는다 — MISTAKES #18·#30).
 * 읽기 전용 — 클릭은 «소스» 탭 한 번뿐(입력·저장·제출·변경 없음). 가로챈 헤더(인증 값 포함)는 출력·저장하지 않는다. 앱 번호는 공개 값(스토어 주소의 id).
 */
process.on('unhandledRejection', (e) => console.log('(무시)', String((e && e.message) || e).slice(0, 80)));
const L = await import('file:///Users/eunhoon/.gemini/antigravity/scratch/stock2/scripts/ego/lib.mjs');
const fs = (await import('node:fs')).default;
const T0 = Date.now(); const el = () => Math.round((Date.now() - T0) / 1000) + 's';
const log = (...a) => console.log(`[${el()}]`, ...a);
const APP_ID = '6783130444';
const DAYS = 14;
const ts = await L.space(); if (!ts) { console.log('SPACE_BUSY — 사용자 제어 공간뿐이다. 되찾지 않는다.'); console.log('ASC_BREAKDOWN {"error":"SPACE_BUSY"}'); process.exit(0); }
const page = await ts.newPage();
const d = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);   // 분석 날짜는 UTC 일자
const OUT = { at: new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 16) + ' KST', days: DAYS, ok: false, steps: [] };
try {
  await page.goto(`https://appstoreconnect.apple.com/apps/${APP_ID}/analytics/overview?dateSpec=d30`).catch(() => {}); await L.wait(8000);
  log('열림', String(await page.url()).replace(/\?.*/, ''));   // ego 의 page.url() 은 Promise — 첫 시험(10/5 11시)에서 .replace 가 죽었다
  await page.evaluate(() => {
    window.__log = [];
    const of = window.fetch;
    window.fetch = async function (u, o) { const res = await of.apply(this, arguments); try { const url = String((u && u.url) || u); if (/analytics\/api\/v1\/data\/timeseries/.test(url)) window.__log.push({ url, h: o && o.headers }); } catch { /* 가로채기 실패는 무시 */ } return res; };
  });
  const clicked = await L.clickText(page, /^소스$|^Sources$/, { tags: 'a,button,span,div', after: 9000 });
  OUT.steps.push('소스 탭 클릭=' + clicked);
  const h0 = (await page.evaluate(() => window.__log || []))[0];
  if (!h0) { OUT.error = '분석 API 요청 가로채기 실패(로그인 만료·화면 구조 변경 의심) — «판독 실패», 0 이 아니다'; }
  else {
    const res = await page.evaluate(async (arg) => {
      const { h0, start, end, appId } = arg;   // ego 의 evaluate 는 인자 하나만 넘긴다
      const call = async (body) => {
        const r = await fetch(h0.url, { method: 'POST', headers: h0.h, credentials: 'include', body: JSON.stringify(body) });
        const t = await r.text();
        if (r.status !== 200) return { __err: r.status + ' ' + t.slice(0, 200).replace(/\s+/g, ' ') };
        try { return JSON.parse(t); } catch { return { __err: '200 이지만 JSON 아님: ' + t.slice(0, 80) }; }
      };
      // 끝 날짜가 아직 집계 전이면 400 — 하루씩 당겨 최대 2번 다시
      let range = { frequency: 'day', startTime: start + 'T00:00:00Z', endTime: end + 'T00:00:00Z' };
      for (let k = 0; k < 2; k++) {
        const probe = await call({ adamId: [appId], measures: ['units'], ...range });
        if (!probe.__err || !/^400/.test(probe.__err)) break;
        const e = new Date(range.endTime); e.setUTCDate(e.getUTCDate() - 1); range = { ...range, endTime: e.toISOString().slice(0, 10) + 'T00:00:00Z' };
      }
      const out = { range, dims: {} };
      const sum = (g, m) => (g.data || []).reduce((a, x) => a + (Number(x[m]) || 0), 0);
      // 차원 후보 — 알려진 것(source)을 맨 앞에 두어 양성 대조군으로 쓴다(이게 안 읽히면 후보 시험 전체를 믿지 않는다)
      // 첫 시험(10/5 11시): source·storefront·platform·pageType·campaignId·domainReferrer 는 200(앞의 둘만 값 있음), campaign·webReferrer·territory 는 400 → 아래 목록은 «값이 나온/200 인 것»만 남기고
      //   «출처 필터를 건 세부»(웹 리퍼러 도메인·앱 리퍼러·캠페인 토큰)를 더한다. 필터 모양(dimensionFilters[{dimensionKey, optionKeys}])은 ASC 웹이 쓰는 모양이라 추정 — 400 이면 메시지가 그대로 찍힌다.
      const probes = [
        { dim: 'source' }, { dim: 'storefront' }, { dim: 'platform' }, { dim: 'pageType' },
        { dim: 'domainReferrer', fk: 'source', fo: ['WebRef'] }, { dim: 'appReferrer', fk: 'source', fo: ['AppRef'] }, { dim: 'campaignId', fk: 'source', fo: ['WebRef', 'AppRef'] },
        { dim: 'domainReferrer' }, { dim: 'appReferrer' }, { dim: 'campaignId' },
      ];
      for (const p of probes) {
        const row = {}, key = p.dim + (p.fk ? '|' + p.fk + '=' + p.fo.join('+') : '');
        for (const m of ['units', 'pageViewUnique']) {
          const body = { adamId: [appId], measures: [m], ...range, group: { metric: m, dimension: p.dim, rank: 'DESCENDING', limit: 15 } };
          if (p.fk) body.dimensionFilters = [{ dimensionKey: p.fk, optionKeys: p.fo }];
          const v = await call(body);
          row[m] = v.__err ? v.__err : (v.results || []).map((g) => [String((g.group && g.group.key) || '(키 없음)').slice(0, 60), sum(g, m)]).filter((x) => x[1] > 0);
        }
        out.dims[key] = row;
      }
      return out;
    }, { h0, start: d(DAYS), end: d(1), appId: APP_ID });
    OUT.range = res.range; OUT.dims = res.dims; OUT.ok = !!(res.dims && res.dims.source && Array.isArray(res.dims.source.units));
    for (const [dim, row] of Object.entries(res.dims || {})) {
      const show = (v) => (typeof v === 'string' ? '✗ ' + v.slice(0, 110) : v.length ? v.slice(0, 8).map((x) => x[0] + '=' + x[1]).join(' · ') : '(0건)');
      log(dim.padEnd(15), '다운로드:', show(row.units), '| 제품페이지조회:', show(row.pageViewUnique));
    }
  }
} catch (e) { OUT.error = String(e).slice(0, 200); log('오류', OUT.error); }
try { await page.close(); } catch { /* 닫기 실패 무시 */ }
try { fs.writeFileSync(L.ioDir() + '/asc-breakdown-result.json', JSON.stringify(OUT)); } catch { /* 저장 실패 무시 */ }
console.log('ASC_BREAKDOWN ' + JSON.stringify({ at: OUT.at, ok: OUT.ok, range: OUT.range, error: OUT.error }));
