/* ============================================================================
 * x-post-replies — 내 X 글(리딤 B 글 등) 아래 «남이 쓴 답글»을 읽기만 한다(클릭·입력·게시 없음). 2026-10-05 09시 회차 신설.
 * 왜: 리딤 B 글(본문에 일회용 번호를 공개한 글)은 «회차마다 답글을 읽어 사용 보고가 있으면 갱신 답글 1개»를 쓰는 규칙인데(리딤 정본 §6-5),
 *   Threads 는 08시에 읽기 도구(threads-post-replies.mjs)가 생겼으나 X(미국 02:45·일본 07:21 B 글)는 읽는 도구가 없어 «다음 회차로» 미뤄졌다(MISTAKES #49 «로그에만 있는 요령은 첫 반복에 도구로»).
 * 사용: 작업 파일 ~/signum-ego-io/<KST>/x-post-replies-task.json = {"items":[{"status":"/signumhq_jp/status/2106872192336326769"}, …]} (최대 4)
 *       bash scripts/ego-run.sh scripts/ego/x-post-replies.mjs 150
 * 출력: 글마다 «본문 앞 60자 | 답글·리포스트·좋아요·조회 숫자(aria-label)» + «@작성자 | 본문 앞 110자 | 사용 표현 ✓» 를 위에서부터 최대 20개 + 끝에 «남이 쓴 답글 N개 · 사용 표현 M개».
 *   읽기 전용 — 글 속 스마트링크를 누르지 않는다(클릭 카운터 오염 방지, MISTAKES #51). 일회용 번호 모양(영숫자 8자 이상)은 출력에서 «[번호 가림]» 으로 가린다.
 *   «스팸 가능성 답글» 접힘은 열지 않는다(읽기 전용 — 접힘 안 답글은 센 개수에 안 든다). 로그인 시야라 비로그인 증거는 아니다(공개 확인은 x-public-check.mjs).
 * ========================================================================== */
process.on('unhandledRejection', (e) => console.log('(무시)', String((e && e.message) || e).slice(0, 80)));
const L = await import('file:///Users/eunhoon/.gemini/antigravity/scratch/stock2/scripts/ego/lib.mjs');
const fsx = (await import('node:fs')).default;
let T = { items: [] };
try { T = JSON.parse(fsx.readFileSync(await L.taskPath('x-post-replies-task.json'), 'utf8')); } catch { console.log('⛔ 작업 파일 x-post-replies-task.json 이 없다'); process.exit(1); }
const items = (T.items || []).filter((it) => /^\/[\w]+\/status\/\d+$/.test(String(it.status || ''))).slice(0, 4);
if (!items.length) { console.log('⛔ items 가 비었거나 주소 형식 불일치 — {"items":[{"status":"/<계정>/status/<숫자>"}]}'); process.exit(1); }
const list = await listTaskSpaces();
const sp = (list || []).find((s) => s.profileId === 'Profile 1') || (list || [])[0];
let ts; try { ts = await L.takeSpaceOrExit(sp.id); } catch { console.log('USER_CONTROL'); process.exit(1); }
await L.cleanupPages(ts, 2);
const page = await L.findPage(ts, /x\.com/, null);
await L.trapDialogs(page);
const result = [];
for (const it of items) {
  const me = it.status.split('/')[1].toLowerCase();
  try { await page.goto('https://x.com' + it.status, { waitUntil: 'domcontentloaded' }); } catch {}
  await L.wait(6500);
  for (let i = 0; i < 2; i++) { try { await page.mouse.wheel(0, 700); } catch {} await L.wait(1300); }
  const rows = await page.evaluate(function (ME) {
    const USED = /(使い|使え|使用|使った|入力しました|適用|ありがとう|ゲット|used|redeem|applied|worked|thanks|thank you|감사|사용|썼|적용)/i;
    const nn = function (s) { return (s || '').replace(/\s+/g, ' ').trim(); };
    const mask = function (s) { return s.replace(/[A-Za-z0-9]{8,}/g, '[번호 가림]'); };
    const out = [];
    for (const a of document.querySelectorAll('article')) {
      const un = a.querySelector('[data-testid="User-Name"]');
      const who = ((un && un.innerText.match(/@[\w]+/)) || [''])[0].replace('@', '');
      const tx = a.querySelector('[data-testid="tweetText"]');
      const grp = a.querySelector('[role="group"][aria-label]');
      out.push({ who: who, t: mask(nn(tx ? tx.innerText : a.innerText)).slice(0, 110), stats: grp ? mask(nn(grp.getAttribute('aria-label'))).slice(0, 90) : '', mine: who.toLowerCase() === ME, used: USED.test(nn(tx ? tx.innerText : '')) && who.toLowerCase() !== ME });
      if (out.length >= 21) break;
    }
    return out;
  }, me);
  const main = rows[0] || null;
  const others = rows.slice(1).filter((r) => !r.mine);
  console.log(`▶ ${it.status} | ${main ? main.t.slice(0, 60) : '(글을 못 읽음 — 로그인 끊김·삭제?)'} | ${main ? main.stats : ''}`);
  for (const r of rows.slice(1)) console.log(`   @${r.who} | ${r.t} | ${r.used ? '사용 표현 ✓' : ''}${r.mine ? ' (내 글)' : ''}`);
  console.log(`   남이 쓴 답글 ${others.length}개 · 사용 표현 ${others.filter((r) => r.used).length}개`);
  result.push({ status: it.status, read: !!main, others: others.length, used: others.filter((r) => r.used).length, stats: main ? main.stats : '' });
}
fsx.writeFileSync(L.ioDir() + '/x-post-replies-result.json', JSON.stringify({ at: new Date().toISOString(), result }, null, 1));
console.log('끝 — 읽기 전용(클릭·입력 없음)');
