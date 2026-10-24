const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'watchlist-v3-dry-'));
const output = path.join(dir, 'comparison.json');
try {
    const r = spawnSync(process.execPath, ['scripts/watchlist-v3-compare.cjs', 'tests/fixtures/watchlist-v3/input.json', output], { encoding: 'utf8', timeout: 60000 });
    assert.equal(r.status, 0, r.stderr);
    const data = JSON.parse(fs.readFileSync(output, 'utf8'));
    assert.equal(data.mode, 'dry'); assert.equal(data.samples.length, 3);
    for (const s of data.samples) {
        assert.ok(s.old.system.includes('Do not start with the ticker'));
        assert.ok(s.new.system.includes('INSIGHT OPENING'));
        assert.ok(s.new.system.startsWith(s.old.system.split('\n\nSECOND OUTPUT')[0]), '칩 지시는 옛 판 그대로');
        assert.match(s.new.userPrompt, /CHIP FRAGMENTS/);
        assert.ok(!s.old.userPrompt.includes('STOCK_FACTS'));
        assert.ok(s.new.userPrompt.includes(s.old.userPrompt), 'same legacy evidence block');
        // 모델 입력에는 세션만 — 시세 가격·등락·수집 시각은 싣지 않는다
        assert.ok(['pre', 'reg', 'post', 'closed', 'reference'].includes(s.facts.quote.session));
        assert.equal(s.facts.quote.price, undefined); assert.equal(s.facts.quote.inputAsOf, undefined);
        assert.equal(s.parameters.temperature, 0.2);
    }
    const again = spawnSync(process.execPath, ['scripts/watchlist-v3-compare.cjs', 'tests/fixtures/watchlist-v3/input.json', output], { encoding: 'utf8', timeout: 60000 });
    assert.notEqual(again.status, 0, '기존 비교본을 덮어쓰지 않는다');
    assert.deepEqual(JSON.parse(fs.readFileSync(output, 'utf8')), data);
    console.log('dry 3표본 동일 입력·구/신 프롬프트·기존 JSON 보존 통과');
} finally { fs.rmSync(dir, { recursive: true, force: true }); }
