// 실행: npx tsx --test tests/giftShareClient.test.ts
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import Module from 'node:module';
import { test } from 'node:test';
import ts from 'typescript';
import { execFileSync } from 'node:child_process';
import { createGiftPreparation } from '../src/lib/giftShare/client';
import { shareOrCopy } from '../src/lib/share/share';

const token = () => randomBytes(32).toString('base64url');
const json = (body: unknown) => new Response(JSON.stringify(body));
const original = { title: 'SIGNUM HQ', text: '기존 종목 설명\n줄바꿈 · 日本語', url: 'https://www.signumhq.com/ko/flow/NVDA?from=share&via=ios' };

// 기존 공유 전송기를 별도로 읽어 실제 네이티브·복사 페이로드까지 대조한다.
const m = new Module(`${process.cwd()}/src/lib/share/share.ts`, module);
m.filename = `${process.cwd()}/src/lib/share/share.ts`;
(m as any)._compile(ts.transpileModule(execFileSync('git', ['show', '085c7c31a:src/lib/share/share.ts'], { encoding: 'utf8' }), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, m.filename!);
const oldShare = m.exports.shareOrCopy;

test('꺼짐: 기존 객체·공유/복사 바이트 동일, 발행 없음', async () => {
  let requests = 0;
  const client = createGiftPreparation(async () => { requests++; return json({ enabled: false }); });
  await client.refresh('ios');
  const payload = client.payload(original, 'ko', 'ios');
  assert.equal(payload, original);
  for (const locale of ['ko', 'en', 'ja']) for (const giftOnly of [true, false]) {
    assert.equal(client.payload(original, locale, 'ios', null, giftOnly), original);
  }
  const sent: unknown[] = [];
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { share: async (d: unknown) => { sent.push(d); } } });
  await oldShare(original); await shareOrCopy(payload);
  assert.deepEqual(sent[0], sent[1]);
  (navigator as any).share = undefined;
  (navigator as any).clipboard = { writeText: async (s: string) => { sent.push(s); } };
  await oldShare(original); await shareOrCopy(payload);
  assert.equal(sent[2], sent[3]);
  assert.equal(requests, 1);
});

test('켜짐: 3언어·iOS/Android·웹 링크, 콘텐츠/ref 보존, 클릭 시 발행 안 함', async () => {
  for (const lang of ['ko', 'en', 'ja']) for (const via of ['ios', 'android', 'web'] as const) {
    const t = token(); let calls = 0;
    const client = createGiftPreparation(async (url, options) => {
      calls++;
      if (String(url).endsWith('share-config')) return json({ enabled: true, available: true });
      assert.equal(options?.method, 'POST');
      assert.equal(!!(options?.headers as any)['x-gift-device'], via !== 'web');
      return json({ ok: true, token: t, expiresAt: Date.now() + 3600_000 });
    }, () => randomBytes(32).toString('hex'));
    await client.refresh(via);
    const payload = client.payload(original, lang, via, 'abc234defg');
    const u = new URL(payload.url);
    assert.equal(u.origin, 'https://www.signumhq.com'); assert.equal(u.pathname, '/app');
    assert.equal(u.searchParams.get('from'), 'gift'); assert.equal(u.searchParams.get('gift'), t);
    assert.equal(u.searchParams.get('l'), lang === 'en' ? null : lang);
    assert.equal(u.searchParams.get('ref'), 'abc234defg'); assert.equal(u.searchParams.get('via'), via);
    assert.ok(payload.text!.includes(original.text)); assert.ok(payload.text!.includes(original.url));
    assert.ok(!/500|200|선착순|first come|先着/.test(payload.text!));
    assert.equal(calls, 2);
    const gift = client.payload(original, lang, via, null, true);
    assert.ok(!gift.text!.includes(original.url));
  }
});

test('재고 0·상한/발행 실패·네트워크 실패·만료·오래된 준비는 일반 공유', async () => {
  let clock = Date.now(); let available = true; let fail = false; let issueOk = true;
  const client = createGiftPreparation(async url => {
    if (fail) throw new Error();
    return String(url).endsWith('share-config') ? json({ enabled: true, available }) : json({ ok: issueOk, token: token(), expiresAt: clock + 120_000 });
  }, () => randomBytes(32).toString('hex'), () => clock);
  await client.refresh('ios'); assert.notEqual(client.payload(original, 'ko', 'ios'), original);
  clock += 60_001; assert.equal(client.payload(original, 'ko', 'ios'), original);
  await client.refresh('ios');
  clock += 59_999; assert.equal(client.payload(original, 'ko', 'ios'), original, '확인 후 60초 미만이어도 토큰 만료 시 폴백');
  available = false; await client.refresh('ios'); assert.equal(client.payload(original, 'ko', 'ios'), original);
  const fallback = client.payload(original, 'ko', 'ios', null, true);
  assert.equal(new URL(fallback.url).searchParams.get('from'), 'share');
  assert.ok(!fallback.text!.includes('1개월')); assert.ok(!fallback.url.includes('code='));
  available = true; issueOk = false; await client.refresh('ios'); assert.equal(client.payload(original, 'ko', 'ios'), original);
  fail = true; await client.refresh('ios'); assert.equal(client.payload(original, 'ko', 'ios'), original);
});

test('동시 준비 한 번·취소 토큰 재사용·완료 후 다음 토큰 준비', async () => {
  let calls = 0;
  const client = createGiftPreparation(async url => {
    calls++;
    return String(url).endsWith('share-config') ? json({ enabled: true, available: true }) : json({ ok: true, token: token(), expiresAt: Date.now() + 3600_000 });
  }, () => randomBytes(32).toString('hex'));
  await Promise.all([client.refresh('ios'), client.refresh('ios')]); assert.equal(calls, 2);
  const first = client.payload(original, 'ko', 'ios');
  client.complete('cancelled', first, 'ios'); await client.refresh('ios');
  assert.equal(client.payload(original, 'ko', 'ios').url, first.url); assert.equal(calls, 3);
  client.complete('shared', first, 'ios'); await client.refresh('ios');
  assert.notEqual(client.payload(original, 'ko', 'ios').url, first.url); assert.equal(calls, 5);
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
