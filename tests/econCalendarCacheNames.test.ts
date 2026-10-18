/** Offline: ts-node --transpile-only -O '{"module":"commonjs","moduleResolution":"node"}' tests/econCalendarCacheNames.test.ts */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { formatEventName } from '../src/lib/econCalendarNames';

type CacheNames = {
    _capture: { endpoint: string; capturedAt: string; eventCount: number; namesSha256: string };
    source: string;
    events: Array<{ date: string; event: string }>;
};

function readCacheNames(): CacheNames {
    return JSON.parse(readFileSync(join(__dirname, 'fixtures/economic-calendar/cache-names-2026-10-18.json'), 'utf8'));
}

test('complete public cache name capture is present, nonempty and unfiltered', () => {
    const fixture = readCacheNames();
    assert.equal(fixture.source, 'REDIS');
    assert.equal(fixture._capture.endpoint, 'https://www.signumhq.com/api/guardian/economic-calendar');
    assert.ok(Number.isFinite(Date.parse(fixture._capture.capturedAt)));
    assert.ok(fixture.events.length > 0, 'an empty cache cannot verify translation collisions');
    assert.equal(fixture.events.length, fixture._capture.eventCount, 'retain every event, including repeated names');
    for (const row of fixture.events) {
        assert.equal(typeof row.event, 'string');
        assert.ok(row.event.length > 0);
        assert.match(row.date, /^\d{4}-\d{2}-\d{2}/);
    }
    const names = fixture.events.map(row => row.event);
    assert.equal(createHash('sha256').update(JSON.stringify(names)).digest('hex'), fixture._capture.namesSha256);
});

test('all public cache names stay distinct on the same date in ko, ja and en', () => {
    const { events } = readCacheNames();
    const collisions: string[] = [];
    for (const locale of ['ko', 'ja', 'en']) {
        const seen = new Map<string, string>();
        for (const row of events) {
            const label = formatEventName(row.event, locale, true);
            const key = JSON.stringify([row.date.slice(0, 10), label]);
            const previous = seen.get(key);
            if (previous !== undefined && previous !== row.event) {
                collisions.push(`${locale} ${row.date}: ${previous} / ${row.event} => ${label}`);
            }
            seen.set(key, row.event);
            assert.equal(formatEventName(row.event, 'en', true), row.event);
            assert.equal(formatEventName(row.event, locale, false), row.event);
        }
    }
    assert.deepEqual(collisions, []);
});
