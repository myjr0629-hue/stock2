// T56c — EOD 스냅샷·이력 읽기 단일 비행(콜드 인스턴스 동시 요청이 큰 키를 요청마다 읽지 않게)
import test from 'node:test';
import assert from 'node:assert/strict';

test('동시 50요청 → 스냅샷·이력 프록시 GET 각 1회, 값은 같다', async () => {
  const realFetch = globalThis.fetch;
  const hits: Record<string, number> = {};
  globalThis.fetch = (async (input: any) => {
    const url = String(typeof input === 'string' ? input : input.url);
    const key = decodeURIComponent(url.split('key=')[1] || url);
    hits[key] = (hits[key] || 0) + 1;
    await new Promise((r) => setTimeout(r, 20));
    let result: any = null;
    if (key === 'intrinio:eod:snapshot') result = JSON.stringify({ date: '2026-11-05', prevDate: '2026-11-04', rows: [['NVDA', 1, 2, 0.5, 200, 10, 2, 1]] });
    if (key === 'intrinio:eod:history') result = JSON.stringify({ dates: ['a', 'b', 'c', 'd', 'e'], closes: { NVDA: [1, 2, 3, 4, 5] } });
    return new Response(JSON.stringify({ result }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as any;
  try {
    const mod = await import('../src/services/intrinioClient');
    const rows = await Promise.all(Array.from({ length: 50 }, () => mod.peekEodCloseRow('NVDA')));
    const hist = await Promise.all(Array.from({ length: 50 }, () => mod.getCloseHistory('NVDA')));
    assert.equal(hits['intrinio:eod:snapshot'], 1);
    assert.equal(hits['intrinio:eod:history'], 1);
    assert.ok(rows.every((r) => r && r.close === 200 && r.date === '2026-11-05'));
    assert.ok(hist.every((h) => h && h.closes.length === 5));
    // 메모가 살아 있는 동안은 추가 읽기 0
    await mod.peekEodCloseRow('NVDA');
    assert.equal(hits['intrinio:eod:snapshot'], 1);
  } finally {
    globalThis.fetch = realFetch;
  }
});
