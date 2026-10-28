import assert from 'node:assert/strict';
import { buildEconCompareSentence as compare } from '../src/lib/ai/econEventLine';
const input = { event: 'Trade Balance', estimate: '-130B', previous: '-132.1B', et: '08:30', kst: '21:30', calendar: [], earnings: [] };
assert.match(compare(input.event, input.estimate, input.previous, 'ko'), /적자가 조금 줄어드는/);
assert.match(compare(input.event, input.estimate, input.previous, 'ja'), /赤字がやや縮小/);
assert.match(compare(input.event, input.estimate, input.previous, 'en'), /smaller deficit/);
assert.match(compare('Unemployment Rate', '4.3%', '4.2%', 'ko'), /악화/);
assert.match(compare('CPI', '2.6%', '2.5%', 'ko'), /물가 상승률이 높아/);
for (const loc of ['ko', 'en', 'ja'] as const) {
  assert.doesNotMatch(compare('CPI', '320', '315', loc), /상승률|inflation|上昇率/i);
  assert.match(compare('CPI', '0.3%', '0.2%', loc), /상승률|inflation|上昇率/i);
  assert.match(compare('PCE Price Index', '2.8%', '2.7%', loc), /상승률|inflation|上昇率/i);
  assert.match(compare('GDP Price Index QoQ (Q3)', '2.8%', '2.7%', loc), /상승률|inflation|上昇率/i);
  assert.doesNotMatch(compare('GDP Price Index', '120', '115', loc), /상승률|inflation|上昇率/i);
  assert.doesNotMatch(compare('Personal Consumption Expenditures', '2.8%', '2.7%', loc), /상승률|inflation|上昇率/i);
  assert.match(compare('PPI', '0.3MoM', '0.2MoM', loc), /상승률|inflation|上昇率/i);
  assert.match(compare('CPI', '0.3% YoY', '0.2% YoY', loc), /상승률|inflation|上昇率/i);
  assert.match(compare('CPI', '0.3', '0.2', loc, 'YoY'), /상승률|inflation|上昇率/i);
}
assert.match(compare('Unknown', '2K', '1K', 'en'), /higher/);
assert.match(compare('Unknown', '100.5', '100', 'ko'), /비슷/);
assert.match(compare('Unknown', '1M', '1000K', 'en'), /similar/);
assert.match(compare('Unknown', '1%', '1K', 'en'), /Consensus 1%, prior 1K/);
import { interpretationText } from '../src/lib/ai/econInterpretations';
const allowed = [
  ['CPI MoM', '%'], ['CPI YoY', '%'], ['Core CPI MoM', '%'], ['Core CPI YoY', '%'],
  ['PCE Price Index', '%'], ['Core PCE Price Index', '%'], ['PPI MoM', '%'],
  ['Nonfarm Payrolls', 'K'], ['Unemployment Rate', '%'], ['Initial Jobless Claims', 'K'],
  ['GDP Growth Rate QoQ', '%'], ['Retail Sales MoM', '%'], ['ISM Manufacturing PMI', ''], ['ISM Services PMI', ''],
] as const;
for (const [event, unit] of allowed) {
  const text = interpretationText(`  ${event.toUpperCase()} (Oct) `, unit);
  assert.ok(text, event);
  assert.match(text.ko, /^예상보다 높게 나오면 .*, 낮게 나오면 .*읽힐 수 있습니다\.$/);
  assert.match(text.en, /above expectations.*below expectations/);
  assert.match(text.ja, /予想より高ければ.*低ければ/);
}
for (const name of ['GDP Price Index', 'ISM Manufacturing Employment', 'Trade Balance', 'Michigan Sentiment', 'CPI MoM Core', 'Nonfarm Payrolls Private', 'ISM Services PMI Employment', 'PPI YoY']) assert.equal(interpretationText(name, '%'), null, name);
for (const name of ['CPI MoM', 'Core PCE Price Index', 'PPI MoM', 'GDP Growth Rate QoQ', 'Retail Sales MoM']) assert.equal(interpretationText(name, 'index'), null, name);
console.log('econ comparison and fixed interpretations passed');
