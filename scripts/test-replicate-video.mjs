// ============================================================================
// Replicate Video Generation Test V2 — 수정된 모델명 + URL 핸들링
// Usage: node scripts/test-replicate-video.mjs
// ============================================================================

import Replicate from 'replicate';
import { writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

const OUTPUT_DIR = './scripts/test-videos';

async function ensureDir() {
  if (!existsSync(OUTPUT_DIR)) await mkdir(OUTPUT_DIR, { recursive: true });
}

async function saveVideo(output, filename) {
  try {
    let url;
    if (typeof output === 'string') {
      url = output;
    } else if (output && typeof output === 'object') {
      // FileOutput 객체인 경우
      url = output.toString ? output.toString() : String(output);
      if (url.startsWith('url()')) {
        // FileOutput의 내부 URL 추출
        const match = JSON.stringify(output);
        console.log(`  Raw output type: ${typeof output}, keys: ${Object.keys(output || {})}`);
        console.log(`  Raw output JSON: ${match.substring(0, 200)}`);
        return;
      }
    }
    
    if (!url || !url.startsWith('http')) {
      console.log(`  ⚠️ Cannot parse URL. Raw output: ${JSON.stringify(output).substring(0, 300)}`);
      return;
    }

    console.log(`  URL: ${url.substring(0, 100)}...`);
    const res = await fetch(url);
    const buf = Buffer.from(await res.arrayBuffer());
    const path = `${OUTPUT_DIR}/${filename}`;
    await writeFile(path, buf);
    console.log(`  ✅ Saved: ${path} (${(buf.length / 1024 / 1024).toFixed(1)}MB)`);
  } catch (e) {
    console.error(`  ❌ Save error: ${e.message}`);
  }
}

// ─── Test 1: Minimax Hailuo Video-01 ───
async function testHailuo() {
  console.log('\n🎬 Test 1: Minimax Hailuo video-01...');
  const start = Date.now();

  try {
    const output = await replicate.run('minimax/video-01', {
      input: {
        prompt: 'Cinematic dark trading floor with multiple glowing monitors showing stock charts, camera slowly panning right, dramatic blue and cyan lighting, financial data flowing across screens, institutional trading atmosphere',
        prompt_optimizer: true,
      }
    });

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`  ⏱️ Time: ${elapsed}s`);
    console.log(`  Output type: ${typeof output}`);
    
    // FileOutput 처리
    if (output && typeof output[Symbol.asyncIterator] === 'function') {
      // ReadableStream인 경우
      const chunks = [];
      for await (const chunk of output) chunks.push(chunk);
      const buf = Buffer.concat(chunks);
      const path = `${OUTPUT_DIR}/hailuo_trading_floor.mp4`;
      await writeFile(path, buf);
      console.log(`  ✅ Saved (stream): ${path} (${(buf.length / 1024 / 1024).toFixed(1)}MB)`);
    } else {
      await saveVideo(output, 'hailuo_trading_floor.mp4');
    }
  } catch (e) {
    console.error(`  ❌ Hailuo Error: ${e.message}`);
  }
}

// ─── Test 2: Kling v2.0 ───
async function testKling() {
  console.log('\n🎬 Test 2: Kling v2.0...');
  const start = Date.now();

  try {
    const output = await replicate.run('kwaivgi/kling-v2.0', {
      input: {
        prompt: 'A close-up of professional financial terminal screens showing real-time stock data, dark room, dramatic cyan glow, camera slowly zooming in, institutional quality',
        duration: 5,
        aspect_ratio: '9:16',
      }
    });

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`  ⏱️ Time: ${elapsed}s`);
    console.log(`  Output type: ${typeof output}`);
    
    if (output && typeof output[Symbol.asyncIterator] === 'function') {
      const chunks = [];
      for await (const chunk of output) chunks.push(chunk);
      const buf = Buffer.concat(chunks);
      const path = `${OUTPUT_DIR}/kling_terminal.mp4`;
      await writeFile(path, buf);
      console.log(`  ✅ Saved (stream): ${path} (${(buf.length / 1024 / 1024).toFixed(1)}MB)`);
    } else {
      await saveVideo(output, 'kling_terminal.mp4');
    }
  } catch (e) {
    console.error(`  ❌ Kling Error: ${e.message}`);
  }
}

// ─── Main ───
async function main() {
  await ensureDir();
  console.log('═══════════════════════════════════════');
  console.log('  Replicate Video Model Test V2');
  console.log('  Testing: Hailuo + Kling v2.0');
  console.log('═══════════════════════════════════════');

  await testHailuo();
  
  // 9초 대기 (rate limit 회피)
  console.log('\n  ⏳ Waiting 10s for rate limit...');
  await new Promise(r => setTimeout(r, 10000));
  
  await testKling();

  console.log('\n════════════════════════════════');
  console.log('  Tests complete!');
  console.log(`  Check: ${OUTPUT_DIR}/`);
  console.log('════════════════════════════════');
}

main().catch(console.error);
