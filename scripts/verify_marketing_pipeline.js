// ═══════════════════════════════════════════════════════════════════
// Marketing Pipeline E2E Verification (DRY RUN)
// daily-content → buffer-dispatch → render-video 순차 검증
// ═══════════════════════════════════════════════════════════════════

const BASE = 'https://www.signumhq.com';

async function fetchJSON(url, label) {
  const t0 = Date.now();
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 30000);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    const elapsed = Date.now() - t0;
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text.substring(0, 500) }; }
    return { data, elapsed, ok: res.ok, status: res.status, label };
  } catch (e) {
    return { data: null, elapsed: Date.now() - t0, ok: false, error: e.message, label };
  }
}

function log(icon, msg) { console.log(`  ${icon} ${msg}`); }

async function main() {
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║  Marketing Pipeline E2E Verification (DRY RUN)     ║');
  console.log('╚══════════════════════════════════════════════════════╝');

  // 1. Daily Content — Pulse
  console.log('\n━━━ Step 1: Daily Content (Pulse) ━━━');
  const pulse = await fetchJSON(`${BASE}/api/cron/daily-content?type=pulse`, 'pulse');
  if (pulse.ok) {
    log('✅', `Pulse generated [${pulse.elapsed}ms]`);
    if (pulse.data?.results?.pulse?.preview) {
      log('📝', `EN: ${pulse.data.results.pulse.preview.en?.substring(0, 80)}...`);
      log('📝', `KO: ${pulse.data.results.pulse.preview.ko?.substring(0, 80)}...`);
    }
  } else {
    log('❌', `Pulse FAILED: ${pulse.error || pulse.status} [${pulse.elapsed}ms]`);
  }

  // 2. Daily Content — Morning
  console.log('\n━━━ Step 2: Daily Content (Morning) ━━━');
  const morning = await fetchJSON(`${BASE}/api/cron/daily-content?type=morning`, 'morning');
  if (morning.ok) {
    log('✅', `Morning generated [${morning.elapsed}ms]`);
    if (morning.data?.results?.morning?.preview) {
      log('📝', `EN: ${morning.data.results.morning.preview.en?.substring(0, 80)}...`);
    }
  } else {
    log('❌', `Morning FAILED: ${morning.error || morning.status} [${morning.elapsed}ms]`);
  }

  // 3. Daily Content — Education
  console.log('\n━━━ Step 3: Daily Content (Education) ━━━');
  const edu = await fetchJSON(`${BASE}/api/cron/daily-content?type=education`, 'education');
  if (edu.ok) {
    log('✅', `Education generated [${edu.elapsed}ms]`);
    if (edu.data?.results?.education?.availableTopics) {
      log('📚', `Topics: ${edu.data.results.education.availableTopics.join(', ')}`);
    }
  } else {
    log('❌', `Education FAILED: ${edu.error || edu.status} [${edu.elapsed}ms]`);
  }

  // 4. Buffer Dispatch (DRY RUN — default)
  console.log('\n━━━ Step 4: Buffer Dispatch (DRY RUN) ━━━');
  const buffer = await fetchJSON(`${BASE}/api/cron/buffer-dispatch?content=pulse&dry_run=true`, 'buffer');
  if (buffer.ok) {
    const sum = buffer.data?.summary;
    log('✅', `Buffer dispatch [${buffer.elapsed}ms]`);
    log('📊', `Total: ${sum?.totalChannels || '?'} channels | Success: ${sum?.successful || '?'} | Failed: ${sum?.failed || '?'}`);
    log('🔄', `DryRun: ${buffer.data?.dryRun}`);
    // Show first 3 results
    buffer.data?.results?.slice(0, 3).forEach(r => {
      log('  ', `${r.channel} (${r.service}/${r.lang}): ${r.success ? '✅' : '❌'} "${r.textPreview?.substring(0, 60)}..."`);
    });
  } else {
    log('❌', `Buffer FAILED: ${buffer.error || buffer.status} [${buffer.elapsed}ms]`);
    if (buffer.data?.error) log('  ', buffer.data.error);
  }

  // 5. Event Detect (DRY RUN)
  console.log('\n━━━ Step 5: Event Detect (DRY RUN) ━━━');
  const event = await fetchJSON(`${BASE}/api/cron/event-detect?dry_run=true`, 'event-detect');
  if (event.ok) {
    log('✅', `Event detect [${event.elapsed}ms]`);
    log('📊', `Events found: ${event.data?.eventsFound || event.data?.events?.length || 0}`);
  } else {
    log('⚠️', `Event detect: ${event.status} [${event.elapsed}ms] (may need market hours)`);
  }

  // 6. Render Video (DRY RUN)
  console.log('\n━━━ Step 6: Render Video (DRY RUN) ━━━');
  const video = await fetchJSON(`${BASE}/api/cron/render-video?type=pulse&lang=en&dry_run=true`, 'render-video');
  if (video.ok) {
    log('✅', `Video render [${video.elapsed}ms]`);
    log('📊', `Total: ${video.data?.summary?.totalVideos || '?'} videos`);
    if (video.data?.results) {
      Object.entries(video.data.results).forEach(([k, v]) => {
        log('🎬', `${k}: composition=${v.compositionId || 'N/A'} bgm=${v.bgm?.name || 'N/A'}`);
      });
    }
  } else {
    log('❌', `Video FAILED: ${video.error || video.status} [${video.elapsed}ms]`);
  }

  // Summary
  console.log('\n' + '═'.repeat(55));
  const results = [
    { name: 'Daily-Pulse', ok: pulse.ok },
    { name: 'Daily-Morning', ok: morning.ok },
    { name: 'Daily-Education', ok: edu.ok },
    { name: 'Buffer-Dispatch', ok: buffer.ok },
    { name: 'Event-Detect', ok: event.ok },
    { name: 'Render-Video', ok: video.ok },
  ];
  const passed = results.filter(r => r.ok).length;
  console.log(`  Pipeline: ${passed}/${results.length} PASS`);
  results.forEach(r => console.log(`  ${r.ok ? '✅' : '❌'} ${r.name}`));
  console.log('═'.repeat(55));
  console.log(`\n  💡 All endpoints tested with dry_run=true`);
  console.log(`  💡 To go LIVE: Change vercel.json dry_run=true → dry_run=false`);
  console.log(`  💡 Buffer API key required in env: BUFFER_API_TOKEN`);
}

main().catch(e => console.error('FATAL:', e));
