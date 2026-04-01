/**
 * SIGNUM HQ — Premium Shorts Renderer V4
 * Background images + Real logo + Hook-driven + TTS + BGM
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env.local') });

const puppeteer = require('puppeteer');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { PollyClient, SynthesizeSpeechCommand } = require('@aws-sdk/client-polly');
const ffmpegPath = require('ffmpeg-static');

const SHORTS_DIR = __dirname;
const TEMPLATE = path.join(SHORTS_DIR, 'template.html');
const FRAMES_DIR = path.join(SHORTS_DIR, 'frames');
const OUTPUT_DIR = path.join(SHORTS_DIR, 'output');
const AUDIO_DIR = path.join(SHORTS_DIR, 'audio');
const FPS = 30;
const DURATION = 30;

const MARKET = {
  date: 'Apr 1, 2026', session: 'POST-MARKET',
  spy: { price: '5,611', change: 0.77 },
  qqq: { price: '19,450', change: 1.12 },
  vix: 24.8, gex: 'NEUTRAL', direction: 'up',
};

const NARRATION = `<speak>
<prosody rate="105%" volume="loud">The S and P 500 just gained zero point 77 percent.</prosody>
<break time="400ms"/>
<prosody rate="100%">Let me break this down for you.</prosody>
<break time="300ms"/>
<prosody rate="95%">S and P closed at 5,611. The NASDAQ, up 1 point 12 percent at 19,450.</prosody>
<break time="500ms"/>
<prosody rate="100%" volume="loud">But here's what nobody's talking about.</prosody>
<break time="400ms"/>
<prosody rate="95%">The VIX is sitting at 24 point 8. That's elevated. The market is pricing in serious risk despite the rally.</prosody>
<break time="500ms"/>
<prosody rate="100%">And the options flow? GEX regime is neutral. Dealers are sitting on the fence.</prosody>
<break time="500ms"/>
<prosody rate="95%">Our AI structural analysis says: cautiously bullish. Surface strength, but watch for cracks underneath.</prosody>
<break time="600ms"/>
<prosody rate="100%" volume="loud">Follow Signum HQ for daily institutional-grade market intelligence.</prosody>
</speak>`;

function buildHTML(data) {
  let html = fs.readFileSync(TEMPLATE, 'utf-8');
  const isUp = data.direction === 'up';
  const accent = isUp ? '#10b981' : '#ef4444';
  const arrow = isUp ? '▲' : '▼';
  const direction = isUp ? 'gained' : 'dropped';
  const vixColor = data.vix > 25 ? '#ef4444' : data.vix > 20 ? '#f59e0b' : '#10b981';
  const vixPct = Math.min(95, Math.max(15, (data.vix / 40) * 100));
  const spyBar = Math.min(90, Math.max(25, Math.abs(data.spy.change) * 45));
  const qqBar = Math.min(90, Math.max(25, Math.abs(data.qqq.change) * 45));
  const verdict = isUp ? 'CAUTIOUSLY BULLISH' : 'RISK-OFF';
  const confidence = data.vix > 25 ? 62 : data.vix > 20 ? 71 : 84;
  const gexExplain = data.gex === 'NEUTRAL'
    ? 'Dealers are <strong>balanced</strong>. No strong directional bias. The market has <strong>maximum flexibility</strong> to move either way.'
    : data.gex === 'POSITIVE'
    ? 'Dealers are <strong>net long gamma</strong>. They buy dips and sell rallies — acting as a <strong>market stabilizer</strong>.'
    : 'Dealers are <strong>net short gamma</strong>. They chase momentum. <strong>Expect amplified moves</strong>.';
  const aiText = `Surface market strength with <strong>S&P +${data.spy.change.toFixed(2)}%</strong> masks underlying tension. VIX at <strong>${data.vix.toFixed(1)}</strong> signals hedging demand remains elevated. <strong>Watch institutional flow for confirmation.</strong>`;

  // File paths for images (Puppeteer loads file:// URLs)
  const logoPath = path.join(SHORTS_DIR, 'logo.svg').replace(/\\/g, '/');
  const bgHook = path.join(SHORTS_DIR, 'bg_hook.png').replace(/\\/g, '/');
  const bgDanger = path.join(SHORTS_DIR, 'bg_danger.png').replace(/\\/g, '/');
  const bgAI = path.join(SHORTS_DIR, 'bg_ai.png').replace(/\\/g, '/');

  const reps = {
    '{{ACCENT}}': accent, '{{ARROW}}': arrow, '{{DIRECTION}}': direction,
    '{{DATE}}': data.date, '{{SESSION}}': data.session,
    '{{SPY_PRICE}}': data.spy.price, '{{SPY_CHG}}': Math.abs(data.spy.change).toFixed(2),
    '{{QQQ_PRICE}}': data.qqq.price, '{{QQQ_CHG}}': Math.abs(data.qqq.change).toFixed(2),
    '{{VIX}}': data.vix.toFixed(1), '{{VIX_COLOR}}': vixColor, '{{VIX_PCT}}': vixPct.toFixed(0),
    '{{SPY_BAR}}': spyBar.toFixed(0), '{{QQQ_BAR}}': qqBar.toFixed(0),
    '{{GEX}}': data.gex, '{{GEX_EXPLAIN}}': gexExplain,
    '{{VERDICT}}': verdict, '{{AI_TEXT}}': aiText,
    '{{CONFIDENCE}}': String(confidence), '{{CONFIDENCE_PCT}}': String(confidence),
    '{{LOGO}}': `file:///${logoPath}`,
    '{{BG_HOOK}}': `file:///${bgHook}`,
    '{{BG_DANGER}}': `file:///${bgDanger}`,
    '{{BG_AI}}': `file:///${bgAI}`,
  };
  for (const [k, v] of Object.entries(reps)) html = html.split(k).join(v);
  return html;
}

async function generateTTS() {
  if (!fs.existsSync(AUDIO_DIR)) fs.mkdirSync(AUDIO_DIR, { recursive: true });
  const file = path.join(AUDIO_DIR, 'narration.mp3');
  console.log('🎙️ AWS Polly TTS...');
  try {
    const polly = new PollyClient({ region: 'us-east-1', credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }});
    const r = await polly.send(new SynthesizeSpeechCommand({
      Text: NARRATION, TextType: 'ssml', VoiceId: 'Matthew', Engine: 'neural',
      LanguageCode: 'en-US', OutputFormat: 'mp3',
    }));
    const chunks = []; for await (const c of r.AudioStream) chunks.push(c);
    fs.writeFileSync(file, Buffer.concat(chunks));
    console.log(`✅ TTS: ${(fs.statSync(file).size/1024).toFixed(1)} KB`);
    return file;
  } catch (e) { console.error('TTS error:', e.message); return null; }
}

function generateBGM() {
  const file = path.join(AUDIO_DIR, 'bgm.wav');
  console.log('🎵 BGM...');
  try {
    execSync([
      `"${ffmpegPath}"`, '-y',
      '-f lavfi -i', `"sine=frequency=55:duration=${DURATION}"`,
      '-f lavfi -i', `"sine=frequency=165:duration=${DURATION}"`,
      '-f lavfi -i', `"sine=frequency=440:duration=${DURATION}"`,
      '-filter_complex',
      `"[0]volume=0.05[a];[1]volume=0.02,tremolo=f=0.15:d=0.4[b];[2]volume=0.006,tremolo=f=0.4:d=0.7[c];[a][b][c]amix=inputs=3:duration=longest,afade=t=in:st=0:d=1.5,afade=t=out:st=${DURATION-2}:d=2[out]"`,
      '-map "[out]"', '-ar 44100 -ac 1',
      `"${file}"`,
    ].join(' '), { stdio: 'pipe' });
    console.log('✅ BGM ready');
    return file;
  } catch (e) { console.error('BGM error'); return null; }
}

async function captureFrames(html) {
  console.log('🎬 Puppeteer...');
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox','--disable-gpu','--allow-file-access-from-files'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });

  const tmp = path.join(SHORTS_DIR, '_render.html');
  fs.writeFileSync(tmp, html);
  await page.goto(`file:///${tmp.replace(/\\/g, '/')}`, { waitUntil: 'networkidle0', timeout: 30000 });
  await page.waitForFunction(() => document.fonts.ready);
  await new Promise(r => setTimeout(r, 1000));

  if (fs.existsSync(FRAMES_DIR)) fs.rmSync(FRAMES_DIR, { recursive: true });
  fs.mkdirSync(FRAMES_DIR, { recursive: true });

  const total = FPS * DURATION;
  console.log(`📸 ${total} frames (${DURATION}s @ ${FPS}fps)...`);

  await page.evaluate(() => document.getAnimations().forEach(a => a.pause()));

  for (let i = 0; i < total; i++) {
    await page.evaluate(t => document.getAnimations().forEach(a => { a.currentTime = t; }), (i / FPS) * 1000);
    await page.screenshot({ path: path.join(FRAMES_DIR, `f_${String(i).padStart(5,'0')}.png`), type: 'png' });
    if (i % 90 === 0) process.stdout.write(`  ${((i/total)*100).toFixed(0)}%\r`);
  }
  console.log(`\n✅ ${total} frames`);
  await browser.close();
  fs.unlinkSync(tmp);
}

function encode(ttsFile, bgmFile) {
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const date = new Date().toISOString().split('T')[0];
  const silent = path.join(OUTPUT_DIR, '_silent.mp4');
  const final = path.join(OUTPUT_DIR, `market_pulse_${date}.mp4`);

  console.log('🎞️ Encoding...');
  execSync([
    `"${ffmpegPath}"`, '-y', '-framerate', String(FPS),
    '-i', `"${FRAMES_DIR}/f_%05d.png"`,
    '-c:v libx264 -pix_fmt yuv420p -preset slow -crf 18',
    '-vf scale=1080:1920 -movflags +faststart',
    `"${silent}"`,
  ].join(' '), { stdio: 'pipe' });

  if (ttsFile && bgmFile) {
    console.log('🔊 Mixing audio...');
    execSync([
      `"${ffmpegPath}"`, '-y',
      `-i "${silent}" -i "${ttsFile}" -i "${bgmFile}"`,
      '-filter_complex "[1]volume=1.3,apad[tts];[2]volume=0.25[bgm];[tts][bgm]amix=inputs=2:duration=first[a]"',
      '-map 0:v -map "[a]" -c:v copy -c:a aac -b:a 192k -shortest -movflags +faststart',
      `"${final}"`,
    ].join(' '), { stdio: 'pipe' });
  } else if (ttsFile) {
    execSync(`"${ffmpegPath}" -y -i "${silent}" -i "${ttsFile}" -c:v copy -c:a aac -shortest "${final}"`, { stdio: 'pipe' });
  } else {
    fs.renameSync(silent, final);
  }
  if (fs.existsSync(silent)) try { fs.unlinkSync(silent); } catch {}
  const mb = (fs.statSync(final).size / 1024 / 1024).toFixed(2);
  console.log(`✅ ${final} (${mb} MB)`);
  return final;
}

async function main() {
  const t0 = Date.now();
  console.log('\n══════════════════════════════════════════');
  console.log('  SIGNUM HQ Shorts V4 — Final');
  console.log('  BG Images · Real Logo · Hook · TTS · BGM');
  console.log('══════════════════════════════════════════\n');

  // Verify assets
  ['bg_hook.png','bg_danger.png','bg_ai.png','logo.svg'].forEach(f => {
    const p = path.join(SHORTS_DIR, f);
    if (!fs.existsSync(p)) { console.error(`❌ Missing: ${f}`); process.exit(1); }
    console.log(`  ✓ ${f}`);
  });
  console.log('');

  const html = buildHTML(MARKET);
  const tts = await generateTTS();
  const bgm = generateBGM();
  await captureFrames(html);
  const mp4 = encode(tts, bgm);

  console.log('🧹 Cleanup...');
  if (fs.existsSync(FRAMES_DIR)) fs.rmSync(FRAMES_DIR, { recursive: true });
  console.log(`\n🎉 Done in ${((Date.now()-t0)/1000).toFixed(0)}s → ${mp4}`);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
