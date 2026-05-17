// Quick check: marketing data sources in Redis
import { Redis } from '@upstash/redis';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const keys = [
  'guardian:ai_verdict:en',
  'guardian:ai_verdict:ko', 
  'guardian:ai_verdict:ja',
  'rlsi:current',
  'guardian:briefing:latest',
  'yahoo:idx:dow',
  'yahoo:idx:spx',
  'yahoo:idx:nasdaq',
  'yahoo:vix',
  'analysis:gex:regime',
  'marketing:dp:latest:SPY',
  'cnn:feargreed',
];

for (const key of keys) {
  try {
    const val = await redis.get(key);
    if (val === null || val === undefined) {
      console.log(`❌ ${key}: NULL`);
    } else {
      const str = typeof val === 'string' ? val : JSON.stringify(val);
      const preview = str.substring(0, 120);
      console.log(`✅ ${key}: ${preview}${str.length > 120 ? '...' : ''}`);
    }
  } catch (e) {
    console.log(`⚠️ ${key}: ERROR - ${e.message}`);
  }
}
