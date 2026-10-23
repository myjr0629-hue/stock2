import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildTacticalPrompt, checkTacticalOutput, checkTacticalStored } from '@/lib/ai/tacticalPrompt';

const fixture = JSON.parse(readFileSync('tests/fixtures/tactical-v3/r3-outputs.json', 'utf8'));
assert.equal(fixture.outputs.length, 27);
for (const row of fixture.outputs) {
    const prompt = buildTacticalPrompt(fixture.contexts[row.session], row.locale);
    const label = `${row.session}/${row.locale}/${row.repeat}`;
    assert.deepEqual(checkTacticalOutput(row.text, row.locale, prompt), [], label);
    assert.deepEqual(checkTacticalStored(row.text, prompt), [], `복구 ${label}`);
}
console.log('통과 compare-v3-r3.md new 원문 27/27 생성·복구 재검사(새 실모델 생성 아님)');
