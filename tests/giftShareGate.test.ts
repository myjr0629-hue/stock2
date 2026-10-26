// 실제 useGiftShare 클릭 경로에 캐시된 기존 설정을 공급한다. 네트워크·브라우저 접근 없음.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import Module from 'node:module';
import { test } from 'node:test';
import ts from 'typescript';
import { createGiftPreparation, type SharePayload } from '../src/lib/giftShare/client';
import { memoryAtomic } from './_giftStateMemory';

const now = Date.parse('2026-10-23T12:00:00+09:00');
const json = (body: unknown) => new Response(JSON.stringify(body));
const tick = async () => { for (let i = 0; i < 20; i++) await new Promise(r => setImmediate(r)); };
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function storage() {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (k: string) => values.get(k) ?? null,
    setItem: (k: string, v: string) => { values.set(k, v); },
    removeItem: (k: string) => { values.delete(k); },
    get length() { return values.size; }, key: (i: number) => [...values.keys()][i] ?? null,
  } });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { location: { origin: 'https://www.signumhq.com' } } });
}
const filename = `${process.cwd()}/src/lib/gift/useGift.ts`;
const hookCode = ts.transpileModule(readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;
function hook(client: ReturnType<typeof createGiftPreparation>, locale: string, via: 'ios' | 'android' | 'web', surface: string) {
  const sent: SharePayload[] = [];
  const m = new Module(filename, module);
  m.filename = filename;
  m.require = ((id: string) => {
    if (id === 'react') return {
      useState: () => [{ code: 'TESTONLYPRO', android: true }, () => {}], // 기존 설정 캐시로 입구가 이미 열린 상태
      useEffect: () => {}, useRef: () => ({ current: false }), useCallback: (fn: unknown) => fn,
    };
    if (id === '@/lib/giftShare/useGiftVisibility') return { useGiftVisibility: () => () => {} };
    if (id === '@/lib/giftShare/funnelClient') return { giftFunnel: () => {}, giftPayloadMetric: () => '', giftOutcomeMetric: () => {} };
    if (id === '@/lib/giftShare/usePreparedGift') return { usePreparedGift: () => client };
    if (id === '@/lib/invite/identity') return { getInviteRef: () => 'abc234defg', markInviteShared: () => {} };
    if (id === '@/lib/share/share') return {
      ...require('../src/lib/share/share'), shareVia: () => via, shareBeacon: () => {},
      shareOrCopy: async (p: SharePayload) => { sent.push(p); return 'cancelled'; },
    };
    if (id === './gift') return require('../src/lib/gift/gift');
    return require(id);
  }) as typeof m.require;
  (m as any)._compile(hookCode, filename);
  return { share: m.exports.useGiftShare(locale, surface).share as () => Promise<unknown>, sent };
}
/**
 * 토큰 없음 = 새 선물 토큰 0. ★2026-10-26: 선물 «메뉴»(gift_set·gift_dash·gift_pop)는 선물 없는 일반 안내 대신
 * 기존 운영 선물(이미 공개된 맞춤 코드 링크 — 꺼짐 확정 때와 같은 문구)로 되돌아간다. 새 토큰 발급·예약과 무관.
 */
function general(p: SharePayload) {
  const u = new URL(p.url);
  assert.equal(u.searchParams.has('gift'), false);
  assert.equal(u.searchParams.get('code'), 'TESTONLYPRO');
  assert.equal(u.searchParams.get('from'), 'gift');
  assert.equal(u.searchParams.get('ref'), 'abc234defg');
  assert.ok(/PRO/.test(`${p.title}`) && /🎁/.test(`${p.text}`));
}

test('최초 설정 미조회·대기·유실·늦은 도착: 실제 선물 입구는 예약 성공 응답 전 일반 공유만 발송', async () => {
  for (const locale of ['ko', 'en', 'ja']) for (const via of ['ios', 'android', 'web'] as const)
    for (const surface of ['gift_set', 'gift_dash', 'gift_pop']) for (const lost of [false, true]) {
      storage();
      const config = deferred<Response>(); const reservation = deferred<Response>();
      const mem = memoryAtomic();
      let reserves = 0;
      const client = createGiftPreparation(async url => {
        if (String(url).endsWith('share-config')) return config.promise;
        assert.equal(url, '/api/gift/reserve'); reserves++; return reservation.promise;
      }, () => 'd'.repeat(64), () => now, undefined, mem.atomic);
      const h = hook(client, locale, via, surface);
      await h.share(); general(h.sent.at(-1)!); // effect 실행 전 클릭
      const pending = client.refresh(via);
      await h.share(); general(h.sent.at(-1)!);
      assert.equal(reserves, 0); assert.equal(mem.calls, 0);
      if (lost) {
        config.reject(new Error('설정 응답 유실')); await pending;
        await h.share(); general(h.sent.at(-1)!);
        assert.equal(reserves, 0); continue;
      }
      config.resolve(json({ enabled: true, available: true, now })); await tick();
      assert.equal(reserves, 1);
      await h.share(); general(h.sent.at(-1)!); // 설정만 도착, 예약 미완료
      reservation.resolve(json({ ok: true })); await pending;
      await h.share();
      const p = h.sent.at(-1)!;
      assert.match(new URL(p.url).searchParams.get('gift')!, /^[A-Za-z0-9_-]{43}$/);
      assert.equal(new URL(p.url).searchParams.has('code'), false);
      assert.ok(p.text?.includes('PRO'));
      await tick();
    }
});

/** origin/main(플래그 도입 전 운영)의 gift.ts — 꺼짐 확정 선물 입구는 이것과 바이트 동일해야 한다. */
function baselineGift() {
  const path = 'src/lib/gift/gift.ts';
  const code = ts.transpileModule(execFileSync('git', ['show', `origin/main:${path}`], { encoding: 'utf8' }), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const m = new Module(`${process.cwd()}/${path}`, module);
  m.filename = `${process.cwd()}/${path}`;
  m.require = ((id: string) => id === '@/lib/share/share' ? require('../src/lib/share/share') : require(id)) as typeof m.require;
  (m as any)._compile(code, m.filename);
  return m.exports;
}

test('꺼짐 확정: 기존 선물 입구 = origin/main 운영 선물 바이트 동일·예약/장부 0, 재조회 대기·유실 중 유지, 켜짐 응답 뒤 해제', async () => {
  const old = baselineGift();
  // origin/main useGiftShare 의 공유 객체 = 이 세 줄(정적 확인) — 그 값을 기준 gift.ts 로 만든다.
  const oldHook = execFileSync('git', ['show', 'origin/main:src/lib/gift/useGift.ts'], { encoding: 'utf8' });
  for (const line of ['title: GIFT_COPY[lang].shareTitle,', 'text: giftShareText(lang, cfg.android),', 'url: buildGiftUrl(cfg.code, ref, lang),'])
    assert.ok(oldHook.includes(line));
  for (const locale of ['ko', 'en', 'ja']) for (const via of ['ios', 'android', 'web'] as const)
    for (const surface of ['gift_set', 'gift_dash', 'gift_pop']) {
      storage();
      const mem = memoryAtomic();
      let reserves = 0; let mode: 'off' | 'pending' | 'lost' | 'on' = 'off';
      const pend = deferred<Response>();
      const c = createGiftPreparation(async url => {
        if (String(url).endsWith('share-config')) {
          if (mode === 'pending') return pend.promise;
          if (mode === 'lost') throw new Error('설정 응답 유실');
          return json(mode === 'off' ? { enabled: false, available: false } : { enabled: true, available: false, now });
        }
        reserves++; return json({ ok: true });
      }, () => 'd'.repeat(64), () => now, undefined, mem.atomic);
      const h = hook(c, locale, via, surface);
      const lang = locale as 'ko' | 'en' | 'ja';
      const expected = { title: old.GIFT_COPY[lang].shareTitle, text: old.giftShareText(lang, true), url: old.buildGiftUrl('TESTONLYPRO', 'abc234defg', lang) };
      await h.share(); general(h.sent.at(-1)!); // 최초 미조회 = 확정 아님 → 일반 공유(기존 관문 유지)
      await c.refresh(via);
      await h.share(); assert.deepEqual(h.sent.at(-1), expected);
      mode = 'pending'; const p = c.refresh(via);
      await h.share(); assert.deepEqual(h.sent.at(-1), expected); // 재조회 대기 중에도 꺼짐 확정 유지
      pend.resolve(json({ enabled: false, available: false })); await p;
      mode = 'lost'; await c.refresh(via);
      await h.share(); assert.deepEqual(h.sent.at(-1), expected); // 조회 실패는 확정 상태를 바꾸지 않는다
      assert.equal(reserves, 0); assert.equal(mem.calls, 0); // 꺼짐 동안 예약·기기 장부 접근 0
      mode = 'on'; await c.refresh(via);
      await h.share(); assert.deepEqual(h.sent.at(-1), expected); // 켜짐 응답(재고 없음) → 새 토큰 0, 기존 운영 선물로 대체(10/26)
      assert.equal(reserves, 0);
    }
});

test('설정 응답 불명·예약 실패/불명/유실도 실제 선물 입구는 일반 공유', async () => {
  for (const failure of ['badConfig', 'reserveFalse', 'reserveUnknown', 'reserveLost']) {
    storage(); let reserves = 0;
    const c = createGiftPreparation(async url => {
      if (String(url).endsWith('share-config')) return json(failure === 'off' ? { enabled: false }
        : failure === 'badConfig' ? {} : { enabled: true, available: true, now });
      reserves++;
      if (failure === 'reserveLost') throw new Error('예약 응답 유실');
      return json(failure === 'reserveFalse' ? { ok: false } : {});
    }, () => 'd'.repeat(64), () => now, undefined, memoryAtomic().atomic);
    await c.refresh('ios');
    const h = hook(c, 'ko', 'ios', 'gift_set'); await h.share(); general(h.sent[0]);
    assert.equal(reserves, failure === 'badConfig' ? 0 : 1);
  }
});

test('기존 예약이 있어도 설정 재조회 지연·유실 중에는 일반 공유, 늦은 정상 응답 뒤에만 복구', async () => {
  for (const lost of [false, true]) {
    storage();
    const next = deferred<Response>(); let configs = 0; let reserves = 0;
    const c = createGiftPreparation(async url => {
      if (String(url).endsWith('share-config')) return ++configs === 1
        ? json({ enabled: true, available: true, now }) : next.promise;
      reserves++; return json({ ok: true });
    }, () => 'd'.repeat(64), () => now, undefined, memoryAtomic().atomic);
    await c.refresh('ios'); assert.equal(reserves, 1);
    const h = hook(c, 'ko', 'ios', 'gift_pop');
    const pending = c.refresh('ios'); await h.share(); general(h.sent.at(-1)!);
    if (lost) next.reject(new Error('재조회 유실'));
    else next.resolve(json({ enabled: true, available: true, now }));
    await pending; await h.share();
    if (lost) general(h.sent.at(-1)!);
    else assert.ok(new URL(h.sent.at(-1)!.url).searchParams.get('gift'));
    assert.equal(reserves, 1);
    await tick();
  }
});

test('설정 조회 중 동시 탭: 예약 응답 전 선물 0, 성공 응답을 받은 탭만 선물 발급', async () => {
  storage();
  const mem = memoryAtomic(); const replies = new Map<string, ReturnType<typeof deferred<Response>>>();
  const clients = Array.from({ length: 9 }, () => createGiftPreparation(async (url, init) => {
    if (String(url).endsWith('share-config')) return json({ enabled: true, available: true, now });
    const token = JSON.parse(String(init?.body)).token;
    const reply = deferred<Response>(); replies.set(token, reply); return reply.promise;
  }, () => 'd'.repeat(64), () => now, undefined, mem.atomic));
  const hooks = clients.map(c => hook(c, 'ko', 'ios', 'gift_dash'));
  const pending = clients.map(c => c.refresh('ios'));
  await Promise.all(hooks.map(h => h.share())); hooks.forEach(h => general(h.sent.at(-1)!));
  await tick(); assert.equal(replies.size, 3);
  await Promise.all(hooks.map(h => h.share())); hooks.forEach(h => general(h.sent.at(-1)!));
  const successful = replies.keys().next().value!;
  for (const [token, reply] of replies) reply.resolve(json({ ok: token === successful }));
  await Promise.all(pending);
  await Promise.all(hooks.map(h => h.share()));
  const gifts = hooks.map(h => h.sent.at(-1)!).filter(p => new URL(p.url).searchParams.has('gift'));
  assert.equal(gifts.length, 1); assert.equal(new URL(gifts[0].url).searchParams.get('gift'), successful);
});

test('소스 grep 관문: 새 선물 URL 생성 1곳·판정 호출 1곳, 기존 공용 쿠폰 생성 우회 0', () => {
  const sources = execFileSync('rg', ['--files', 'src', '-g', '*.{ts,tsx,js,mjs,cjs}'], { encoding: 'utf8' })
    .trim().split('\n').map(path => ({ path, source: readFileSync(path, 'utf8') }));
  // 기존 공개 코드 링크는 꺼짐 확정 분기 한 곳에서만 만든다(정의 1·호출 1).
  assert.deepEqual(sources.filter(x => /\bbuildGiftUrl\b/.test(x.source)).map(x => x.path).sort(), ['src/lib/gift/gift.ts', 'src/lib/gift/useGift.ts']);
  const hookSrc = readFileSync('src/lib/gift/useGift.ts', 'utf8');
  assert.equal((hookSrc.match(/buildGiftUrl\(/g) || []).length, 1);
  // 기존 공개 코드 링크는 «꺼짐 확정» 또는 «토큰 없음»에서만 쓴다(새 토큰 링크에 섞지 않는다).
  assert.match(hookSrc, /const legacy = \{[^}]*url: buildGiftUrl\(cfg\.code, ref, lang\),\s*\};/);
  assert.match(hookSrc, /const prepared = preparedGift\.confirmedOff\(\) \? null : preparedGift\.payload\(/);
  assert.match(hookSrc, /const payload = attached \? prepared : legacy;/);
  const writers = sources.flatMap(({ path, source }) => [...source.matchAll(/searchParams\.(?:set|append)\(\s*['"]gift['"]|\bgift=/g)].map(() => path)).sort();
  // 수신한 토큰의 링크·QR 전달은 신규 발급이 아니다. 전달 함수·호출자도 아래 목록으로 고정한다.
  assert.deepEqual(writers, ['src/lib/giftShare/client.ts', 'src/lib/giftShare/config.ts', 'src/lib/giftShare/landing.ts', 'src/lib/marketing/desktopHandoff.ts']);
  assert.deepEqual(sources.filter(x => /\bwithGift\(/.test(x.source)).map(x => x.path).sort(), [
    'src/app/[locale]/flow/[ticker]/page.tsx', 'src/app/[locale]/rankings/[id]/page.tsx',
    'src/components/share/ShareLanding.tsx', 'src/lib/giftShare/config.ts', 'src/lib/invite/kinds.ts',
  ]);
  const client = readFileSync('src/lib/giftShare/client.ts', 'utf8');
  assert.equal((client.match(/serverReservations\.set\(/g) || []).length, 1);
  assert.ok(client.indexOf('if (!await register(token, now(), via, true, key))') < client.indexOf('serverReservations.set('));
  const gate = client.slice(client.indexOf('  const issueToken ='), client.indexOf('  const payload ='));
  assert.match(gate, /serverReservations\.get\(ready\)/);
  assert.match(gate, /\|\| !server \|\|/);
  const payload = client.slice(client.indexOf('  const payload ='), client.indexOf('  const complete ='));
  assert.equal((payload.match(/issueToken\(via\)/g) || []).length, 1);
  assert.ok(payload.indexOf('const token = issueToken(via)') < payload.indexOf("u.searchParams.set('gift', token)"));
  assert.ok(payload.indexOf('if (!token) return') < payload.indexOf("u.searchParams.set('gift', token)"));
  assert.ok(!/if\s*\(!enabled\)\s*return original/.test(payload));
  assert.deepEqual(sources.filter(x => /\b(?:gift|preparedGift)\.payload\(/.test(x.source)).map(x => x.path).sort(),
    ['src/components/share/ShareButton.tsx', 'src/lib/gift/useGift.ts', 'src/lib/invite/useInvite.ts']);
  assert.ok(!/searchParams\.(?:set|append)\(\s*['"]code['"]/.test(readFileSync('src/lib/gift/useGift.ts', 'utf8')));
  // gift.ts 의 code 설정은 기존 buildGiftUrl 안 1곳뿐
  const giftSrc = readFileSync('src/lib/gift/gift.ts', 'utf8');
  assert.equal((giftSrc.match(/searchParams\.(?:set|append)\(\s*['"]code['"]/g) || []).length, 1);
  const fn = giftSrc.slice(giftSrc.indexOf('export function buildGiftUrl'), giftSrc.indexOf('// ── 문구'));
  assert.match(fn, /searchParams\.set\('code', code\)/);
  const client2 = readFileSync('src/lib/giftShare/client.ts', 'utf8');
  assert.equal((client2.match(/lastKnownOff = /g) || []).length, 2); // 초기 false + 성공 응답 대입 1곳
});
