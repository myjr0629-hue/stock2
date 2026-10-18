/** Offline: ts-node --transpile-only -O '{"module":"commonjs","moduleResolution":"node"}' tests/econCalendarNames.test.ts */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { formatEventName, fmtVal } from '../src/lib/econCalendarNames';

const fixture = JSON.parse(readFileSync(join(__dirname, 'fixtures/economic-calendar/observed-2026-10-18.json'), 'utf8'));

test('same-day distinct supplier names remain distinct in ko, ja and en (observed cache rows)', () => {
    for (const locale of ['ko', 'ja', 'en']) {
        const seen = new Map<string, string>();
        for (const row of fixture.events) {
            const key = `${row.date}:${formatEventName(row.event, locale, true)}`;
            assert.ok(!seen.has(key) || seen.get(key) === row.event,
                `${locale}: ${seen.get(key)} / ${row.event} => ${key}`);
            seen.set(key, row.event);
        }
    }
});

test('observed housing labels retain estimates, units and month suffixes', () => {
    const expected = [
        ['주택착공건수 (Sep)', '住宅着工件数 (Sep)', '1.3M'],
        ['주택착공건수 전월비 (Sep)', '住宅着工件数 前月比 (Sep)', '1.9%'],
        ['건축허가건수 (Sep)', '住宅建設許可件数 (Sep)', '1.4M'],
        ['건축허가건수 전월비 (Sep)', '住宅建設許可件数 前月比 (Sep)', '-0.7%'],
    ];
    fixture.events.forEach((row: any, i: number) => {
        assert.equal(formatEventName(row.event, 'ko', true), expected[i][0]);
        assert.equal(formatEventName(row.event, 'ja', true), expected[i][1]);
        assert.equal(fmtVal(row.estimate, row.unit), expected[i][2]);
    });
});

test('comparison periods, release stages and Core survive translation', () => {
    const cases = [
        ['GDP Growth Rate QoQ Adv (Q3)', '국내총생산(GDP) 전분기비 속보 (Q3)', '国内総生産(GDP) 前期比 速報 (Adv) (Q3)'],
        ['GDP Growth Rate QoQ Prel (Q3)', '국내총생산(GDP) 전분기비 예비 (Q3)', '国内総生産(GDP) 前期比 速報 (Q3)'],
        ['GDP Growth Rate QoQ Final (Q3)', '국내총생산(GDP) 전분기비 확정 (Q3)', '国内総生産(GDP) 前期比 確報 (Q3)'],
        ['Core Retail Sales MoM (Sep)', '소매판매 근원 전월비 (Sep)', '小売売上高 コア 前月比 (Sep)'],
        ['Core CPI YoY (Sep)', '근원 소비자물가지수(CPI) 전년비 (Sep)', 'コア消費者物価指数(CPI) 前年比 (Sep)'],
        ['Core PCE Price Index MoM (Sep)', '근원 PCE 물가지수 전월비 (Sep)', 'コアPCE価格指数 前月比 (Sep)'],
        ['CPI (YoY) (Sep)', '소비자물가지수(CPI) 전년비 (Sep)', '消費者物価指数(CPI) 前年比 (Sep)'],
        ['Retail Sales (MoM)', '소매판매 전월비', '小売売上高 前月比'],
        ['Housing Starts mOm (Sep)', '주택착공건수 전월비 (Sep)', '住宅着工件数 前月比 (Sep)'],
    ];
    for (const [raw, ko, ja] of cases) {
        assert.equal(formatEventName(raw, 'ko-KR', true), ko, raw);
        assert.equal(formatEventName(raw, 'ja-JP', true), ja, raw);
    }
    for (const locale of ['ko', 'ja']) {
        const names = cases.slice(0, 3).map(([raw]) => formatEventName(raw, locale, true));
        assert.equal(new Set(names).size, names.length, 'Prel and Adv must also stay distinct in Japanese');
    }
});

test('English and disabled localization preserve supplier spelling exactly', () => {
    for (const raw of ['FedWallerSpeech', '  Housing Starts MoM (Sep)  ', 'GDP Growth Rate QoQ Adv (Q3)']) {
        assert.equal(formatEventName(raw, 'en', true), raw);
        assert.equal(formatEventName(raw, 'en-US', true), raw);
        assert.equal(formatEventName(raw, 'ko', false), raw);
    }
    assert.equal(formatEventName('Unknown Release YoY (Sep)', 'ko', true), 'Unknown Release YoY (Sep)');
    assert.equal(formatEventName('FOMC Minutes', 'ko', true), 'FOMC 의사록');
    assert.equal(formatEventName('FedWallerSpeech', 'ko', true), '월러 연준 이사 연설');
    assert.equal(formatEventName('GDP 2nd Estimate (Q3)', 'ja', true), 'GDP改定値 (Q3)');
});
