import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildTacticalPrompt, checkTacticalOutput, checkTacticalStored } from '@/lib/ai/tacticalPrompt';

// r7 PRE/REG는 운영 실입력, r6 REG/POST와 r7 POST는 파생. 저장된 원문만 재검사한다.
for (const round of ['r6', 'r7']) {
    const fixture = JSON.parse(readFileSync(`tests/fixtures/tactical-v3/${round}-outputs.json`, 'utf8'));
    assert.equal(fixture.outputs.length, 27);
    for (const row of fixture.outputs) {
        const prompt = buildTacticalPrompt(fixture.contexts[row.session], row.locale);
        const label = `${round}/${row.session}/${row.locale}/${row.repeat}`;
        assert.deepEqual(checkTacticalOutput(row.text, row.locale, prompt), [], label);
        assert.deepEqual(checkTacticalStored(row.text, prompt), [], `복구 ${label}`);
    }
}
console.log('통과 r6/r7 new 저장 원문 각 27/27 생성·복구 재검사');
