// 실제 마케팅 close 텍스트가 어떻게 생성되는지 시뮬레이션
import { Redis } from '@upstash/redis';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

// 1. Guardian verdict 파싱 (data.ts parse() 로직 재현)
const enRaw = await redis.get('guardian:ai_verdict:en');

function parseJSON(data) {
  if (!data) return null;
  if (typeof data === 'string') { try { return JSON.parse(data); } catch { return data; } }
  return data;
}

function parse(v) {
  if (!v) return '';
  const p = parseJSON(v);
  if (typeof p === 'string') return p.substring(0, 300);
  const text = p?.realityInsight ?? p?.description ?? p?.text ?? p?.summary ?? p?.verdict ?? '';
  if (typeof text === 'string' && text.length > 0) {
    return text.replace(/^#\s+[^\n]+\n+/g, '').trim().substring(0, 300);
  }
  return JSON.stringify(p).substring(0, 300);
}

const insight = parse(enRaw);
console.log('=== PARSED INSIGHT (EN) ===');
console.log(`Length: ${insight.length} chars`);
console.log(insight);
console.log();

// 2. DOW 데이터
const dowRaw = await redis.get('yahoo:idx:dow');
const dow = parseJSON(dowRaw);
console.log('=== DOW DATA ===');
console.log(`changePct: ${dow?.changePct ?? dow?.changePercent ?? 'N/A'}`);
console.log();

// 3. 최종 X 텍스트 시뮬레이션 (280자)
const spy = -1.24;
const qqq = -1.54;
const dia = dow?.changePct ?? dow?.changePercent ?? 0;

const headline = `🏁 US Market Close — 2026-05-16`;
const data = `📊 SPY ${spy >= 0 ? '+':''}${spy.toFixed(2)}% | QQQ ${qqq >= 0 ? '+':''}${qqq.toFixed(2)}% | DOW ${dia >= 0 ? '+':''}${dia.toFixed(2)}%\n🔮 VIX 18.4 | GEX NEUTRAL | Dark Pool 61.8%`;
const insightLine = insight ? `🎯 ${insight.substring(0, 120)}` : '';
const cta = `📊 Full analysis → https://www.signumhq.com/intel-guardian`;

const parts = [headline, data, insightLine, cta].filter(Boolean);
const fullText = parts.join('\n\n');

console.log('=== SIMULATED X POST ===');
console.log(fullText);
console.log(`\n[Total: ${fullText.length} chars]`);
