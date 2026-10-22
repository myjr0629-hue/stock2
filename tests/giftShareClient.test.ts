// 실행: npx tsx --test tests/giftShareClient.test.ts
// 설계(관문 3회 보류 뒤 재설계): 화면 진입 = 설정·재고 확인 + 기기 토큰 생성(서버 발행 0) ·
// 공유/복사 «완료» 뒤에만 그 토큰을 1회 등록 · 보낸 토큰은 즉시 폐기(재사용 0) · 재고 0·기기 일일 한도면 일반 공유.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import Module from 'node:module';
import { beforeEach, test } from 'node:test';
import ts from 'typescript';
import { execFileSync } from 'node:child_process';
import { createGiftPreparation } from '../src/lib/giftShare/client';
import { shareOrCopy } from '../src/lib/share/share';
import { arrive, recordTouch, inviteKeys } from '../src/lib/invite/engine';
import { memoryInviteStore } from '../src/lib/invite/memoryStore';
import { newInviteKey } from '../src/lib/invite/identity';

let values = new Map<string, string>();
function resetStorage() {
  values = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  } });
}
beforeEach(() => {
  resetStorage();
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { location: { origin: 'https://www.signumhq.com' } } });
});

const json = (body: unknown) => new Response(JSON.stringify(body));
const tick = () => new Promise(resolve => setImmediate(resolve));
const original = { title: 'SIGNUM HQ', text: '기존 종목 설명\n줄바꿈 · 日本語', url: 'https://www.signumhq.com/ko/flow/NVDA?from=share&via=ios' };
const giftOf = (p: { url: string }) => new URL(p.url).searchParams.get('gift');

/** 설정·등록 요청을 기록하는 모의 서버. 등록은 토큰별 1회만 issued, 이후 exists. */
function server(opts: { available?: () => boolean; enabled?: () => boolean; issue?: (token: string) => unknown; now?: () => number } = {}) {
  const registered = new Set<string>();
  const log = { config: 0, issues: [] as { token: string; device: string | null; at: number }[] };
  const request: typeof fetch = async (url, init) => {
    if (String(url).endsWith('share-config')) {
      log.config++;
      return json({ enabled: opts.enabled ? opts.enabled() : true, available: opts.available ? opts.available() : true, now: (opts.now ?? Date.now)() });
    }
    assert.equal(String(url), '/api/gift/issue'); assert.equal(init?.method, 'POST');
    const { token, at } = JSON.parse(String(init?.body));
    assert.ok(Number.isSafeInteger(at), '등록은 공유 완료 시각을 함께 보낸다');
    log.issues.push({ token, device: (init?.headers as any)?.['x-gift-device'] ?? null, at });
    if (opts.issue) { const r = opts.issue(token); if (r instanceof Error) throw r; return json(r); }
    registered.add(token);
    return json({ ok: true });
  };
  return { request, log, registered };
}

// 기존 공유 전송기를 별도로 읽어 실제 네이티브·복사 페이로드까지 대조한다.
const m = new Module(`${process.cwd()}/src/lib/share/share.ts`, module);
m.filename = `${process.cwd()}/src/lib/share/share.ts`;
(m as any)._compile(ts.transpileModule(execFileSync('git', ['show', '085c7c31a:src/lib/share/share.ts'], { encoding: 'utf8' }), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, m.filename!);
const oldShare = m.exports.shareOrCopy;

test('꺼짐: 기존 객체·공유/복사 바이트 동일, 저장소·발행 접근 0', async () => {
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get: () => { throw new Error('꺼짐 저장소 접근 금지'); } });
  let requests = 0;
  const client = createGiftPreparation(async () => { requests++; return json({ enabled: false }); });
  await client.refresh('ios');
  const payload = client.payload(original, 'ko', 'ios');
  assert.equal(payload, original);
  for (const locale of ['ko', 'en', 'ja']) for (const giftOnly of [true, false]) for (const via of ['ios', 'android', 'web'] as const) {
    assert.equal(client.payload(original, locale, via, 'abc234defg', giftOnly), original);
  }
  const sent: unknown[] = [];
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { share: async (d: unknown) => { sent.push(d); } } });
  await oldShare(original); await shareOrCopy(payload);
  assert.deepEqual(sent[0], sent[1]);
  (navigator as any).share = undefined;
  (navigator as any).clipboard = { writeText: async (s: string) => { sent.push(s); } };
  await oldShare(original); await shareOrCopy(payload);
  assert.equal(sent[2], sent[3]);
  for (const outcome of ['shared', 'copied', 'cancelled', 'failed'] as const) client.complete(outcome, payload, 'ios');
  await tick();
  assert.equal(requests, 1, '설정 조회 1회 외 요청 없음');
});

test('켜짐 준비: 서버 발행 없이 기기 토큰 · 3언어·iOS/Android·웹 링크 · 콘텐츠/ref 보존', async () => {
  for (const lang of ['ko', 'en', 'ja']) for (const via of ['ios', 'android', 'web'] as const) {
    resetStorage();
    const s = server();
    const client = createGiftPreparation(s.request, () => randomBytes(32).toString('hex'));
    await client.refresh(via);
    assert.equal(s.log.issues.length, 0, '화면 진입은 발행하지 않는다');
    const payload = client.payload(original, lang, via, 'abc234defg');
    const u = new URL(payload.url);
    assert.equal(u.origin, 'https://www.signumhq.com'); assert.equal(u.pathname, '/app');
    assert.equal(u.searchParams.get('from'), 'gift'); assert.match(u.searchParams.get('gift')!, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(u.searchParams.get('l'), lang === 'en' ? null : lang);
    assert.equal(u.searchParams.get('ref'), 'abc234defg'); assert.equal(u.searchParams.get('via'), via);
    assert.ok(payload.text!.includes(original.text)); assert.ok(payload.text!.includes(original.url));
    assert.ok(!/500|200|선착순|first come|先着/.test(payload.text!));
    const gift = client.payload(original, lang, via, null, true);
    assert.ok(!gift.text!.includes(original.url));
    assert.equal(s.log.config, 1);
  }
});

test('공유·복사(·수동 복사 창 가능성 있는 실패) 뒤에만 그 토큰을 1회 등록 · 보낸 토큰은 즉시 폐기 · 중복 완료 통지 무시', async () => {
  for (const outcome of ['shared', 'copied', 'failed'] as const) for (const via of ['ios', 'android', 'web'] as const) {
    resetStorage();
    const s = server();
    const client = createGiftPreparation(s.request, () => 'a'.repeat(64));
    await client.refresh(via);
    const first = client.payload(original, 'ko', via);
    client.complete('cancelled', first, via); await tick();
    assert.equal(s.log.issues.length, 0, '취소는 등록하지 않는다');
    assert.equal(giftOf(client.payload(original, 'ko', via)), giftOf(first), '취소 뒤 재시도는 아직 아무에게도 안 간 같은 토큰');
    client.complete(outcome, first, via); await tick();
    assert.deepEqual(s.log.issues.map(x => x.token), [giftOf(first)]);
    assert.equal(s.log.issues[0].device, via === 'web' ? null : 'a'.repeat(64));
    client.complete(outcome, first, via); client.complete('shared', first, via); await tick();
    assert.equal(s.log.issues.length, 1, '같은 완료 통지는 한 번만 등록');
    if (via !== 'web') {
      const next = client.payload(original, 'ko', via);
      assert.ok(giftOf(next)); assert.notEqual(giftOf(next), giftOf(first), '다음 공유는 새 토큰');
    } else {
      assert.equal(giftOf(client.payload(original, 'ko', via)), null, '웹은 하루 1회 — 이후 일반 공유');
    }
    assert.equal(values.get('signumhq.gift.sent.v1'), undefined, '등록 확인 뒤 재시도 장부 비움');
  }
});

test('관문 회귀(10211609·10212017): 공유 없이 재로딩·동시 문서 여러 개 → 발행 0, 문서마다 다른 토큰', async () => {
  const s = server();
  const docs = [];
  for (let document = 0; document < 6; document++) {
    const client = createGiftPreparation(s.request, () => '시험용-기기'.padEnd(64, '0'));
    await client.refresh('ios');
    docs.push(client);
  }
  assert.equal(s.log.issues.length, 0);
  const opened = docs.map(d => d.payload(original, 'ko', 'ios'));
  const tokens = opened.map(giftOf).filter(Boolean);
  assert.equal(tokens.length, 3, '동시에 띄운 시트 6개 중 선물 링크는 기기 한도(3)만큼 — 나머지는 일반 공유');
  assert.equal(new Set(tokens).size, tokens.length, '문서마다 다른 토큰');
  // 실제 공유는 한 번 → 등록 한 번(나머지 시트는 취소)
  docs[2].complete('shared', opened[2], 'ios');
  for (const i of [0, 1, 3, 4, 5]) docs[i].complete('cancelled', opened[i], 'ios');
  await tick();
  assert.equal(s.log.issues.length, 1);
});

test('관문 회귀(10211928): 공유 도중 재조회 장애·일시 소진이 있어도 보낸 토큰은 다시 나가지 않는다', async () => {
  for (const trouble of ['fail', 'empty', 'off'] as const) {
    resetStorage();
    let state: 'ok' | 'fail' | 'empty' | 'off' = 'ok';
    const s = server({ available: () => state !== 'empty', enabled: () => state !== 'off' });
    const request: typeof fetch = async (url, init) => { if (state === 'fail' && String(url).endsWith('share-config')) throw new Error('장애'); return s.request(url, init); };
    const client = createGiftPreparation(request, () => 'b'.repeat(64));
    await client.refresh('ios');
    const sent = client.payload(original, 'ko', 'ios');
    state = trouble; await client.refresh('ios');
    client.complete('shared', sent, 'ios'); await tick();
    state = 'ok'; await client.refresh('ios');
    const next = client.payload(original, 'ko', 'ios');
    assert.ok(giftOf(next)); assert.notEqual(giftOf(next), giftOf(sent), trouble);
    assert.equal(s.log.issues.filter(x => x.token === giftOf(sent)).length, 1, trouble);
  }
});

test('기기 일일 한도(앱 3·웹 1, KST 날짜) 도달 뒤엔 일반 공유 — 등록 실패할 선물 문구를 붙이지 않는다', async () => {
  let clock = Date.parse('2026-10-22T14:00:00Z'); // KST 23:00
  const s = server({ now: () => clock });
  const client = createGiftPreparation(s.request, () => 'c'.repeat(64), () => clock);
  await client.refresh('ios');
  for (let i = 0; i < 3; i++) {
    const p = client.payload(original, 'ko', 'ios');
    assert.ok(giftOf(p), `${i + 1}번째`);
    client.complete('shared', p, 'ios'); await tick();
  }
  assert.equal(client.payload(original, 'ko', 'ios'), original);
  const other = createGiftPreparation(s.request, () => 'c'.repeat(64), () => clock);
  await other.refresh('ios');
  assert.equal(other.payload(original, 'ko', 'ios'), original, '다른 문서도 같은 기기 한도');
  clock = Date.parse('2026-10-22T15:00:01Z'); // KST 다음 날 00:00
  await client.refresh('ios');
  assert.ok(giftOf(client.payload(original, 'ko', 'ios')));
  assert.equal(s.log.issues.length, 3);
});

test('등록 응답 유실: 같은 토큰을 5분 간격·최대 5회 다시 등록, 성공하면 장부에서 제거', async () => {
  let clock = Date.now(); let down = true;
  const s = server({ issue: () => down ? new Error('유실') : { ok: true }, now: () => clock });
  const client = createGiftPreparation(s.request, () => 'd'.repeat(64), () => clock);
  await client.refresh('android');
  const sent = client.payload(original, 'ja', 'android');
  client.complete('copied', sent, 'android'); await tick();
  assert.equal(s.log.issues.length, 1);
  await client.refresh('android'); assert.equal(s.log.issues.length, 1, '5분 안에는 재시도하지 않는다');
  clock += 5 * 60_000; await client.refresh('android');
  assert.equal(s.log.issues.length, 2);
  // 문서를 다시 열어도 같은 기기의 장부로 이어서 재시도한다
  down = false; clock += 5 * 60_000;
  const reopened = createGiftPreparation(s.request, () => 'd'.repeat(64), () => clock);
  await reopened.refresh('android');
  assert.deepEqual(s.log.issues.map(x => x.token), Array(3).fill(giftOf(sent)));
  assert.equal(new Set(s.log.issues.map(x => x.at)).size, 1, '재시도는 처음 공유 완료 시각을 그대로 보낸다');
  assert.equal(values.get('signumhq.gift.sent.v1'), undefined);
  // 계속 실패하면 최대 5회 뒤 포기
  resetStorage(); down = true;
  const s2 = server({ issue: () => new Error('계속 실패'), now: () => clock });
  const c2 = createGiftPreparation(s2.request, () => 'e'.repeat(64), () => clock);
  await c2.refresh('ios'); c2.complete('shared', c2.payload(original, 'ko', 'ios'), 'ios'); await tick();
  for (let i = 0; i < 10; i++) { clock += 5 * 60_000; await c2.refresh('ios'); }
  assert.equal(s2.log.issues.length, 5);
});

test('재고 0·설정 장애·오래된 확인(60초)·저장소 장애·기기 열쇠 없음은 일반 공유, 등록 0', async () => {
  let clock = Date.now(); let available = true; let fail = false;
  const s = server({ available: () => available, now: () => clock });
  const request: typeof fetch = async (url, init) => { if (fail) throw new Error(); return s.request(url, init); };
  const client = createGiftPreparation(request, () => 'f'.repeat(64), () => clock);
  await client.refresh('ios'); assert.notEqual(client.payload(original, 'ko', 'ios'), original);
  clock += 60_001; assert.equal(client.payload(original, 'ko', 'ios'), original);
  available = false; await client.refresh('ios'); assert.equal(client.payload(original, 'ko', 'ios'), original);
  const fallback = client.payload(original, 'ko', 'ios', null, true);
  assert.equal(new URL(fallback.url).searchParams.get('from'), 'share');
  assert.ok(!fallback.text!.includes('1개월')); assert.ok(!fallback.url.includes('code=')); assert.ok(!fallback.url.includes('gift='));
  available = true; fail = true; await client.refresh('ios'); assert.equal(client.payload(original, 'ko', 'ios'), original);
  for (const failure of ['getItem', 'setItem'] as const) {
    resetStorage();
    (localStorage as any)[failure] = () => { throw new Error('시험용 저장 장애'); };
    const c = createGiftPreparation(s.request, () => 'f'.repeat(64));
    await c.refresh('ios');
    assert.equal(c.payload(original, 'ko', 'ios'), original, failure);
  }
  resetStorage();
  const noKey = createGiftPreparation(s.request, () => null);
  await noKey.refresh('android');
  assert.equal(noKey.payload(original, 'ko', 'android'), original, '앱 기기 열쇠가 없으면 익명 등록이 되므로 준비하지 않는다');
  assert.equal(s.log.issues.length, 0);
});

test('관문 회귀: 소진 폴백도 신규 수신자의 추천 터치를 기록한다', async () => {
  const client = createGiftPreparation(async () => json({ enabled: true, available: false }));
  await client.refresh('ios');
  for (const locale of ['ko', 'en', 'ja']) for (const via of ['ios', 'android'] as const) {
    const ref = 'abc234defg';
    const payload = client.payload(original, locale, via, ref, true);
    const u = new URL(payload.url);
    const store = memoryInviteStore();
    assert.equal(await recordTouch(store, { ref: u.searchParams.get('ref'), from: u.searchParams.get('from'),
      os: via, ipHash: '시험용-수신자', human: true, vercelEnv: 'preview' }), true);
    const touch = JSON.parse((await store.get(inviteKeys('preview').touch(via, '시험용-수신자')))!);
    assert.equal(touch.r, ref);
    const arrival = await arrive(store, { key: newInviteKey(), os: via, ipHash: '시험용-수신자', vercelEnv: 'preview' });
    assert.equal(arrival.matched && arrival.credited, true);
    if (arrival.matched) assert.equal(arrival.inviterRef, ref);
    assert.equal(u.searchParams.has('gift'), false);
    assert.equal(u.searchParams.has('code'), false);
    assert.ok(!payload.text!.includes('1개월'));
  }
});

test('관문 회귀: 프리뷰 선물은 등록과 같은 출처로 전달한다', async () => {
  const origin = 'https://signum-preview.example';
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { location: { origin } } });
  const s = server();
  const client = createGiftPreparation(async (url, init) => {
    assert.equal(new URL(String(url), origin).origin, origin);
    return s.request(url, init);
  }, () => '1'.repeat(64));
  await client.refresh('ios');
  const p = client.payload(original, 'ko', 'ios');
  assert.equal(new URL(p.url).origin, origin);
  assert.equal(p.text!.includes(original.url), true);
  client.complete('shared', p, 'ios'); await tick();
  assert.equal(s.log.issues.length, 1);
});

test('연결 표면 JSX는 운영 기준과 동일하고 클릭에서 공유 전에 await 없음', () => {
  const fs = require('node:fs');
  const paths = ['src/components/share/ShareButton.tsx', 'src/lib/invite/useInvite.ts', 'src/lib/gift/useGift.ts'];
  for (const path of paths) {
    const current = fs.readFileSync(path, 'utf8');
    const before = execFileSync('git', ['show', `085c7c31a:${path}`], { encoding: 'utf8' });
    const jsx = (source: string) => {
      const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      const roots: string[] = [];
      const visit = (node: ts.Node) => {
        if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node)) roots.push(node.getText(ast));
        else ts.forEachChild(node, visit);
      };
      visit(ast); return roots;
    };
    assert.deepEqual(jsx(current), jsx(before));
    const start = current.indexOf("shareBeacon('tap'");
    const end = current.indexOf('await shareOrCopy', start);
    assert.ok(end > start); assert.ok(!current.slice(start, end).includes('await '));
  }
});

test('관문 회귀(10220553 ②): 공유·복사 모두 실패해 수동 복사 창에 선물 주소가 보이면 그 토큰을 등록하고 폐기', async () => {
  const s = server();
  const client = createGiftPreparation(s.request, () => '7'.repeat(64));
  await client.refresh('ios');
  const p = client.payload(original, 'ko', 'ios');
  const prompted: string[] = [];
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { clipboard: { writeText: async () => { throw new Error('권한'); } } } });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => { throw new Error('없음'); } } });
  (globalThis as any).window.prompt = (_: string, u: string) => { prompted.push(u); return null; };
  const out = await shareOrCopy(p);
  assert.equal(out, 'failed'); assert.equal(prompted[0], p.url);
  client.complete(out, p, 'ios'); await tick();
  assert.deepEqual(s.log.issues.map(x => x.token), [giftOf(p)]);
  assert.notEqual(giftOf(client.payload(original, 'ko', 'ios')), giftOf(p));
  delete (globalThis as any).document;
});
// 자정 경계 관문 회귀(10220544·10220553①·10220559·10220607)는 실제 서버 함수·Lua 를 연결한 tests/giftShareMidnight.test.ts 로 옮겼다.
