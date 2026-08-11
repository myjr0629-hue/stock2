// ============================================================================
// hf-harvest — 힉스필드 «브라우저 콘솔» 수확기  (윈도우/맥 공용)
// ----------------------------------------------------------------------------
// 자격증명은 이 파일에 없다. 브라우저에 «이미 로그인된 세션»의 토큰을 그때그때 받아 쓴다.
//   → window.Clerk.session.getToken()   (60초 만료라 요청마다 새로 받는다)
//
// 쓰는 법
//   1. https://higgsfield.ai 에 로그인한다
//   2. https://higgsfield.ai/flow/video/prompt?model=seedance_2_5 를 연다
//   3. F12 → Console 에 이 파일 전체를 붙여넣는다
//   4. HF.add([...프롬프트 배열...])   ← 투입 시작
//   5. 진행 확인:  HF.status()
//   6. 완료본 뽑기: copy(HF.manifest())   → 클립보드에 JSON. 파일로 저장 후
//                   node scripts/hf-sync.mjs <그 파일>
//
// ⚠️ 이 탭을 다른 주소로 이동하면 수확기가 죽는다. 상태는 콘솔에서만 확인한다.
//
// ── 과금 가드 (2026-08-11 사고 후 강화) ────────────────────────────────────
//   · 호출 가능 모델은 seedance_2_5 «하나»뿐이다 (화이트리스트)
//   · 응답의 cost 가 «명시적 null» 이 아니면 큐를 즉시 정지한다
//   · text2image 는 use_unlim:true 를 보내도 cost:100 이 나온다 = 유료.
//     실제로 7편 = 700크레딧을 태웠다. 이 스크립트로는 호출조차 못 하게 막았다.
// ============================================================================

(() => {
  const API = 'https://fnf-api-gw.higgsfield.ai';
  const MODEL = 'seedance_2_5';            // ★ 화이트리스트. 다른 값 금지
  const CONCURRENT = 1;                    // 무제한 모드의 동시 생성 상한 (실측)
  const POLL_MS = 45000;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const S = {
    queue: [], sent: [], err: [], done: {},
    running: false, stopped: false, polls: 0,
  };

  const token = () => window.Clerk.session.getToken();

  /** 진행 중인 «영상» 잡 수 — 멈춘 이미지 잡이 영상 슬롯을 막지 않게 타입으로 거른다 */
  async function activeVideoJobs() {
    const t = await token();
    const r = await fetch(`${API}/fnf/jobs?limit=5`, {
      headers: { 'accept-language': 'en', authorization: `Bearer ${t}` },
    });
    if (!r.ok) return 99;
    const j = await r.json();
    const DONE = ['completed', 'failed', 'canceled', 'cancelled', 'nsfw', 'rejected'];
    return (j.jobs || []).filter((x) => x.job_set_type === MODEL && !DONE.includes(String(x.status))).length;
  }

  async function submit(prompt) {
    const t = await token();
    const body = {
      params: {
        prompt,
        width: 720, height: 1280, medias: [],
        resolution: '720p', generate_audio: true, bitrate_mode: 'high',
        batch_size: 1, model: 'default',
        use_unlim: true,                   // ★ 무제한. 빼면 과금된다
        duration: 5,                       // 무제한은 5초 고정 (다른 값 불가)
        aspect_ratio: '9:16',
      },
      use_unlim: true,
    };
    const r = await fetch(`${API}/fnf/jobs/v2/${MODEL}`, {
      method: 'POST',
      headers: { 'accept-language': 'en', authorization: `Bearer ${t}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (r.status !== 200) return { ok: false, status: r.status };
    const j = await r.json();
    const cost = j.job_sets && j.job_sets[0] && j.job_sets[0].cost;
    if (cost !== null) {                   // ★ undefined 도 막는다. null «만» 통과
      S.stopped = true;
      return { ok: false, status: `COST=${String(cost)} — 큐 정지` };
    }
    return { ok: true };
  }

  async function loop() {
    if (S.running) return;
    S.running = true; S.stopped = false;
    let fails = 0;
    while (S.queue.length && !S.stopped) {
      let busy;
      try { busy = await activeVideoJobs(); } catch { await sleep(6000); continue; }
      if (busy >= CONCURRENT) { await sleep(8000); continue; }

      const p = S.queue[0];
      let res;
      try { res = await submit(p); } catch (e) { res = { ok: false, status: 'EX ' + e.message }; }

      if (res.ok) {
        S.queue.shift(); S.sent.push(p.slice(0, 60)); fails = 0;
        await sleep(1500);
      } else {
        fails++; S.err.push(res);
        await sleep(9000);
        if (fails >= 8) S.stopped = true;
      }
    }
    S.running = false;
  }

  /** 완료본 누적 — jobs?limit 은 5가 상한이고 offset/page 가 안 먹어서 «폴링 누적»이 유일한 방법 */
  async function collect() {
    try {
      const t = await token();
      const r = await fetch(`${API}/fnf/jobs?limit=5`, {
        headers: { 'accept-language': 'en', authorization: `Bearer ${t}` },
      });
      const j = await r.json();
      for (const x of j.jobs || []) {
        if (x.status === 'completed' && x.results && x.results.raw && x.results.raw.url) {
          S.done[x.id] = { id: x.id, type: x.job_set_type, prompt: x.params.prompt, url: x.results.raw.url };
        }
      }
      S.polls++;
    } catch { /* 토큰 갱신 실패 등은 다음 폴에서 회복된다 */ }
  }

  collect();
  setInterval(collect, POLL_MS);

  window.HF = {
    /** 프롬프트 배열 투입 */
    add(list) { S.queue.push(...list); loop(); return S.queue.length; },
    /** 진행 상황 */
    status() {
      return { 대기: S.queue.length, 투입: S.sent.length, 수집: Object.keys(S.done).length,
               가동: S.running, 정지: S.stopped, 폴링: S.polls, 오류: S.err.slice(-3) };
    },
    /** hf-sync.mjs 에 넣을 매니페스트 (영상만) */
    manifest() { return JSON.stringify(Object.values(S.done).filter((d) => d.type === MODEL), null, 2); },
    /** 큐 비우기 */
    clear() { S.queue = []; return 'cleared'; },
    /** 즉시 정지 */
    stop() { S.stopped = true; return 'stopped'; },
    _state: S,
  };

  console.log('%cHF 수확기 준비됨', 'color:#9f0;font-weight:bold');
  console.log('HF.add([...]) · HF.status() · copy(HF.manifest()) · HF.stop()');
  return 'HF ready';
})();
