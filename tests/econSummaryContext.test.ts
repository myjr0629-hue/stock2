import assert from 'node:assert/strict';
import Module from 'node:module';
import { nearbyEconomicEvents } from '../src/lib/ai/econContext';

const next = { event: 'CPI', utcMs: Date.parse('2026-10-28T18:00:00Z'), etDate: '2026-10-28', etTime: '14:00', estimate: 2, previous: 3, unit: '%' };
const events = [
  null, {}, { event: "", date: "2026-10-28", time: "19:00" },
  { date: '2026-10-28', time: '12:00', event: 'Morning', impact: 'HIGH' },
  { date: '2026-10-28', time: '18:00', event: 'CPI', impact: 'HIGH' },
  { date: '2026-10-28', time: '19:00', event: 'Later', impact: 'HIGH' },
  { date: '2026-10-30', time: '18:01', event: 'Too late', impact: 'HIGH' },
];
assert.deepEqual(nearbyEconomicEvents(events, next), ['2026-10-28 19:00 UTC Later']);
const priority = Array.from({ length: 7 }, (_, i) => ({ date: '2026-10-29', time: `0${i}:00`, event: `Event ${i}`, impact: i === 6 ? 'HIGH' : 'LOW' }));
const chosen = nearbyEconomicEvents(priority, next);
assert.equal(chosen.length, 6); assert.ok(chosen.some(s => s.includes('Event 6'))); assert.ok(!chosen.some(s => s.includes('Event 5')));

const loader = (Module as any)._load;
let activeNext: any = { ...next, event: 'CPI MoM' };
let definitionCache: any = null, cooldown = false, modelCalls = 0;
let prompt = '', system = '';
const afterCalls: Array<() => Promise<void>> = [];
(Module as any)._load = function(request: string, ...args: any[]) {
  if (request === 'next/server') return { NextResponse: { json: (data: unknown) => data }, after: (fn: any) => afterCalls.push(fn) };
  if (request === 'next/cache') return { unstable_cache: (fn: any) => fn };
  if (request === '@/services/redisClient') return { getFromCache: async (key: string) => key === 'fmp:econ-calendar' ? { events } : key.endsWith(':cooldown') ? (cooldown ? {} : null) : key.startsWith('today-summary:econ-ai:v1:') ? definitionCache : null, setInCache: async () => true };
  if (request === '@/services/bedrockClient') return { callBedrock: async (args: any) => { modelCalls++; prompt = args.userPrompt; system = args.system; return { text: '{}' }; } };
  if (request === '@/lib/ai/freshTier') return { withFreshTier: (fn: any) => fn(), isFreshTierSkipped: () => false };
  if (request === '@/lib/intrinioMeter') return { upstashMeterStore: { setNxEx: async () => true } };
  if (request === '@/lib/todayPicks/summary') return { selectNextMajorEvent: () => activeNext, selectTodayEconomicEvent: () => null };
  return loader.call(this, request, ...args);
};
const route = require('../src/app/api/today-summary/route');
(Module as any)._load = loader;
(async () => {
  const response = await route.GET();
  assert.equal(response.aiPending, false); assert.equal(afterCalls.length, 0); assert.equal(modelCalls, 0);
  assert.match(response.ai.ko, /예상보다 높게 나오면.*낮게 나오면/);
  for (const values of [{ estimate: 2, previous: null }, { estimate: null, previous: null }]) {
    activeNext = { ...next, event: 'CPI MoM', unit: null, ...values };
    const result = await route.GET();
    assert.equal(result.ai, null);
    assert.equal(result.aiPending, true); afterCalls.length = 0; assert.equal(modelCalls, 0);
  }
  const definitionText = { ko: '물가의 변화를 살펴보는 지표입니다', en: 'Measures changes in consumer prices', ja: '消費者物価の変化を測る指標です' };
  definitionCache = { text: definitionText };
  for (const unit of ['index', null]) {
    activeNext = { ...next, event: 'PCE Price Index', unit, estimate: 120, previous: 115 };
    const result = await route.GET();
    assert.ok(result.ai.ko.endsWith(definitionText.ko));
    assert.doesNotMatch(result.ai.ko, /예상보다 높게 나오면/);
  }
  for (const [event, unit] of [['PCE Price Index', '%'], ['Nonfarm Payrolls', 'K'], ['GDP Growth Rate QoQ', null], ['Retail Sales MoM', 'index']]) {
    activeNext = { ...next, event, unit };
    const result = await route.GET();
    assert.match(result.ai.ko, /예상보다 높게 나오면/);
    assert.ok(!result.ai.ko.endsWith(definitionText.ko));
  }
  for (const event of ['GDP Price Index', 'ISM Manufacturing Employment', 'Trade Balance', 'Michigan Sentiment']) {
    activeNext = { ...next, event, estimate: event === 'Trade Balance' ? -130 : 2, previous: event === 'Trade Balance' ? -132 : 3 };
    const result = await route.GET();
    assert.equal(result.aiPending, false);
    for (const loc of ['ko', 'en', 'ja']) { assert.ok(result.ai[loc].endsWith(definitionText[loc as keyof typeof definitionText])); assert.doesNotMatch(result.ai[loc], /예상보다 높게 나오면|above expectations|予想より高ければ/); }
    if (event === 'Trade Balance') assert.match(result.ai.ko, /적자가 조금 줄어드는/);
  }
  assert.equal(modelCalls, 0); assert.equal(afterCalls.length, 0);
  definitionCache = null;
  const pending = await route.GET(); assert.equal(pending.aiPending, true); assert.ok(pending.ai.ko); assert.equal(afterCalls.length, 1);
  await afterCalls.shift()!();
  const definition = require('../src/lib/ai/econEventDefinition');
  assert.equal(modelCalls, 1); assert.equal(system, definition.EE_SYSTEM); assert.equal(prompt, definition.buildEconUserPrompt('Michigan Sentiment'));
  cooldown = true; assert.equal((await route.GET()).aiPending, false); assert.equal(afterCalls.length, 0);
  activeNext = { ...next, estimate: null }; cooldown = false;
  const noComparison = await route.GET(); assert.equal(noComparison.ai, null); assert.equal(noComparison.aiPending, true);
  console.log('econ summary: fixed interpretation and definition fallback passed');
})().catch(e => { console.error(e); process.exitCode = 1; });
