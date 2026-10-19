/** Exercise the real cache/13F/dark-pool/impliedMove adapters with a socket-free fetch stub. */
import assert from 'node:assert/strict';
let reads = 0;
(globalThis as any).fetch = async (input: string, init?: RequestInit) => {
    const url = new URL(String(input));
    assert.ok(url.pathname === '/get' || url.pathname === '/mget', 'only existing Redis read endpoints');
    assert.ok(!init?.method || init.method === 'GET', 'no writes');
    reads++;
    if (url.pathname === '/mget')
        return Response.json({ results: (url.searchParams.get('keys') ?? '').split(',').map(() => null) });
    return Response.json({ result: null });
};
async function main() {
    const { currentBadges } =
        require('../src/lib/guruLens/service') as typeof import('../src/lib/guruLens/service');
    const result = await currentBadges(['AAPL']);
    assert.equal(result.AAPL.holdingIndex, null);
    assert.equal(result.AAPL.money.count, 0);
    assert.equal(result.AAPL.money.overlap, false);
    assert.ok(reads > 0);
    console.log(
        `guruLens real adapters: ${reads} mocked Redis reads; vendor calls 0; writes 0; missing caches stay unknown`,
    );
}
main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
});
