import { dispatchToAll } from '../src/app/api/cron/dispatch-v2/_shared';
import { ContentPackage } from '../src/lib/marketing-v2/core/types';

// Load environment variables
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function testJitter() {
  console.log('=== Simulating Dispatch V2 with Jitter Scheduling ===');

  const mockPkg: ContentPackage = {
    slot: 'pulse',
    date: '2026-05-26',
    preparedAt: new Date().toISOString(),
    images: {
      tweet: 'https://example.com/tweet.png',
      og: 'https://example.com/og.png',
      pin: 'https://example.com/pin.png'
    },
    text: {
      en: {
        headline: '📊 S&P 500 Test',
        data: 'SPY +0.50% | VIX 15.0',
        insight: 'Neutral volatility regime.',
        full: '📊 S&P 500 Test\n\nSPY +0.50% | VIX 15.0\n\nNeutral volatility regime.',
        disclaimer: 'Not financial advice.',
        cta: '📊 Details → https://www.signumhq.com',
        ctaFull: 'https://www.signumhq.com'
      },
      ko: {
        headline: '📊 S&P 500 테스트',
        data: 'SPY +0.50% | VIX 15.0',
        insight: '중립적 변동성 구간입니다.',
        full: '📊 S&P 500 테스트\n\nSPY +0.50% | VIX 15.0\n\n중립적 변동성 구간입니다.',
        disclaimer: '투자 권유가 아닙니다.',
        cta: '📊 전체 보기 → https://www.signumhq.com',
        ctaFull: 'https://www.signumhq.com'
      },
      ja: {
        headline: '📊 S&P 500 テスト',
        data: 'SPY +0.50% | VIX 15.0',
        insight: '中立的なボラティリティ区間。',
        full: '📊 S&P 500 テスト\n\nSPY +0.50% | VIX 15.0\n\n中立的なボラティリティ区간。',
        disclaimer: '投資助言ではありません。',
        cta: '📊 詳細 → https://www.signumhq.com',
        ctaFull: 'https://www.signumhq.com'
      }
    },
    metrics: {
      spy: 0.50,
      qqq: 0.60,
      vix: 15.0,
      gexRegime: 'neutral',
      darkPool: 38.5,
      fearGreed: 55,
      spyPrice: 520.0
    },
    hashtags: {
      en: { twitter: '#SPY #VIX', threads: '#SPY #VIX', bluesky: '#SPY #VIX', instagram: '#SPY #VIX', pinterest: '#SPY #VIX' },
      ko: { twitter: '#주식 #옵션', threads: '#주식 #옵션', bluesky: '#주식 #옵션', instagram: '#주식 #옵션', pinterest: '#주식 #옵션' },
      ja: { twitter: '#米国株', threads: '#米国株', bluesky: '#米国株', instagram: '#米国株', pinterest: '#米国株' }
    }
  };

  console.log('\nCalling dispatchToAll in DRY RUN mode with draft: false (should generate randomized schedule times)...');
  const results = await dispatchToAll(mockPkg, { dryRun: true, draft: false, region: 'all' });

  console.log('\n=== Dispatch Results ===');
  results.forEach(r => {
    console.log(`- Platform: ${r.platform} | Lang: ${r.lang} | Success: ${r.success} | DryRun: ${r.dryRun}`);
  });

  console.log('\nCalling dispatchToAll in DRY RUN mode with draft: true (drafts should publish immediately to draft queue, so no schedule time)...');
  const draftResults = await dispatchToAll(mockPkg, { dryRun: true, draft: true, region: 'all' });
  
  console.log('\n=== Draft Results ===');
  draftResults.forEach(r => {
    console.log(`- Platform: ${r.platform} | Lang: ${r.lang} | Success: ${r.success} | DryRun: ${r.dryRun}`);
  });
}

testJitter().catch(console.error);
