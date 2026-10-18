// Import a saved, complete public API response. This script makes no network requests.
// curl -s --fail https://www.signumhq.com/api/guardian/economic-calendar -o /tmp/signum-econ-calendar-2.json
// node scripts/capture-econ-cache-names.mjs /tmp/signum-econ-calendar-2.json
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

try {
    assert.equal(process.argv.length, 3, 'Pass the saved public API response path');
    const response = JSON.parse(readFileSync(process.argv[2], 'utf8'));
    assert.ok(response.source === 'REDIS', 'Expected a populated public Redis cache response');
    assert.ok(response._fixture === undefined, 'A reconstructed fixture is not a public API capture');
    assert.ok(Array.isArray(response.events) && response.events.length > 0, 'Expected the complete nonempty events array');
    // Project every row without filtering or deduplicating; copy no other payload fields.
    const events = response.events.map(row => {
        assert.ok(row && typeof row.event === 'string' && row.event.length > 0, 'Invalid event name');
        assert.ok(typeof row.date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(row.date), 'Invalid event date');
        return { date: row.date, event: row.event };
    });
    const names = events.map(row => row.event);
    const fixture = {
        _capture: {
            endpoint: 'https://www.signumhq.com/api/guardian/economic-calendar',
            capturedAt: new Date().toISOString(),
            eventCount: response.events.length,
            namesSha256: createHash('sha256').update(JSON.stringify(names)).digest('hex'),
        },
        source: response.source,
        events,
    };
    const destination = fileURLToPath(new URL('../tests/fixtures/economic-calendar/cache-names-2026-10-18.json', import.meta.url));
    writeFileSync(destination, `${JSON.stringify(fixture, null, 2)}\n`);
    console.log(`Captured all ${events.length} events (${new Set(names).size} distinct names)`);
} catch (error) {
    // Do not print arbitrary input payloads on validation failures.
    console.error(error instanceof SyntaxError ? 'Invalid JSON response' : error instanceof Error ? error.message : 'Capture failed');
    process.exitCode = 1;
}
