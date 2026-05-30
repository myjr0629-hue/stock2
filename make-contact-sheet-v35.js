const cp = require('child_process');
const fs = require('fs');
const path = require('path');

const ffmpeg = require('ffmpeg-static');
const outDir = 'out/review';

// Ensure output directory exists
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

const tickers = ['SPY', 'NVDA'];

tickers.forEach((ticker) => {
  const lowerTicker = ticker.toLowerCase();
  const videoPath = `out/market_pressure_brief_v35_${lowerTicker}.mp4`;
  const outputPath = `out/review/v35_${lowerTicker}_contact_sheet.jpg`;

  if (!fs.existsSync(videoPath)) {
    console.warn(`[Storyboard Warning] Video file not found: ${videoPath}. Skipping storyboard generation for ${ticker}.`);
    return;
  }

  console.log(`Generating real 5x3 tiled contact sheet image via FFmpeg-static for V35 ${ticker}...`);

  try {
    const selectExpr = "select='eq(n,0)+eq(n,6)+eq(n,12)+eq(n,30)+eq(n,75)+eq(n,135)+eq(n,180)+eq(n,255)+eq(n,270)+eq(n,330)+eq(n,405)+eq(n,465)+eq(n,540)+eq(n,630)+eq(n,719)',scale=270:480,tile=5x3";
    cp.execSync(`"${ffmpeg}" -y -i "${videoPath}" -vf "${selectExpr}" -frames:v 1 "${outputPath}"`, { stdio: 'inherit' });
    console.log(`Successfully created real tiled contact sheet for ${ticker} at:`, outputPath);
  } catch (e) {
    console.error(`Failed to create tiled contact sheet for ${ticker}:`, e);
    return;
  }

  // Generate companion HTML sheet
  const frames = [
    { time: '0.0s (f0)', frameIdx: 0, label: `v35_${lowerTicker}_frame_000.jpg`, name: `${ticker} Boot Scans - Glitchy logo & system boots` },
    { time: '0.2s (f6)', frameIdx: 6, label: `v35_${lowerTicker}_frame_006.jpg`, name: `${ticker} Boot Scans - [SYSTEM SCAN ACTIVE]` },
    { time: '0.4s (f12)', frameIdx: 12, label: `v35_${lowerTicker}_frame_012.jpg`, name: `Breaking News Shock - Institutional blocks exposed` },
    { time: '1.0s (f30)', frameIdx: 30, label: `v35_${lowerTicker}_frame_030.jpg`, name: 'Breaking News Shock - Squeeze ready regime badge' },
    { time: '2.5s (f75)', frameIdx: 75, label: `v35_${lowerTicker}_frame_075.jpg`, name: `Breaking News Shock - Near ${ticker}'s resistance wall` },
    { time: '4.5s (f135)', frameIdx: 135, label: `v35_${lowerTicker}_frame_135.jpg`, name: 'Normal Chart Contrast - Scanner unmasks core structure' },
    { time: '6.0s (f180)', frameIdx: 180, label: `v35_${lowerTicker}_frame_180.jpg`, name: 'Normal Chart Contrast - Core ceiling, Base, Gamma Flip' },
    { time: '8.5s (f255)', frameIdx: 255, label: `v35_${lowerTicker}_frame_255.jpg`, name: 'Elastic Pacing Zoom - Gap compression zoom begins' },
    { time: '9.0s (f270)', frameIdx: 270, label: `v35_${lowerTicker}_frame_270.jpg`, name: 'Elastic Pacing Zoom - Screen shake tension active' },
    { time: '11.0s (f330)', frameIdx: 330, label: `v35_${lowerTicker}_frame_330.jpg`, name: 'Elastic Pacing Zoom - Deep zoom boundary convergence' },
    { time: '13.5s (f405)', frameIdx: 405, label: `v35_${lowerTicker}_frame_405.jpg`, name: 'High-Impact Insight - "Not a prediction. A tactical map."' },
    { time: '15.5s (f465)', frameIdx: 465, label: `v35_${lowerTicker}_frame_465.jpg`, name: 'High-Impact Insight - Extreme squeeze tension loaded' },
    { time: '18.0s (f540)', frameIdx: 540, label: `v35_${lowerTicker}_frame_540.jpg`, name: 'Outro Brand Lock - Neon domain box locked' },
    { time: '21.0s (f630)', frameIdx: 630, label: `v35_${lowerTicker}_frame_630.jpg`, name: 'Outro Brand Lock - [SEE HIDDEN STRUCTURE]' },
    { time: 'final (f719)', frameIdx: 719, label: `v35_${lowerTicker}_frame_final.jpg`, name: 'Outro Loop Cue - Red wall loop alignment transition' }
  ];

  let html = `<html>
<head>
  <title>V35 ${ticker} 데일리 모닝 특보 - Storyboard</title>
  <style>
    body { background: #020409; color: #e2e8f0; font-family: 'Outfit', sans-serif; text-align: center; padding: 40px; margin: 0; }
    h1 { font-size: 32px; color: ${ticker === 'NVDA' ? '#22c55e' : '#22d3ee'}; margin-bottom: 8px; font-weight: 900; letter-spacing: 0.05em; }
    p { color: #94a3b8; font-size: 16px; margin-bottom: 40px; }
    .grid { display: flex; flex-wrap: wrap; justify-content: center; gap: 24px; max-width: 1600px; margin: 0 auto; }
    .card { background: rgba(34, 211, 238, 0.03); border: 1px solid rgba(34, 211, 238, 0.12); padding: 16px; border-radius: 12px; transition: all 0.3s ease; width: 270px; }
    .card:hover { border-color: ${ticker === 'NVDA' ? '#22c55e' : '#22d3ee'}; box-shadow: 0 0 20px ${ticker === 'NVDA' ? 'rgba(34,197,94,0.2)' : 'rgba(34,211,238,0.2)'}; }
    img { border-radius: 6px; border: 1px solid #1e293b; display: block; margin-bottom: 12px; }
    .time { font-family: monospace; font-size: 14px; color: #fbbf24; font-weight: bold; }
    .label { font-size: 13px; color: #94a3b8; margin-top: 4px; }
  </style>
</head>
<body>
  <h1>MARKET PRESSURE BRIEF V35 (${ticker})</h1>
  <p>Live Morning Spec - Visual Storyboard Review</p>
  <div class="grid">
`;

  // Extract individual stills
  frames.forEach((f) => {
    const stillPath = path.join(outDir, f.label);
    try {
      cp.execSync(`"${ffmpeg}" -y -i "${videoPath}" -vf "select=eq(n\\,${f.frameIdx}),scale=270:480" -frames:v 1 "${stillPath}"`, { stdio: 'ignore' });
    } catch (e) {
      console.error(`Failed to export still for ${f.label}:`, e);
    }

    html += `
      <div class="card">
        <img src="${f.label}" width="270" height="480" />
        <div class="time">${f.time}</div>
        <div class="label">${f.name}</div>
      </div>
    `;
  });

  html += `
  </div>
  <div style="margin-top: 50px; font-size: 14px; color: #64748b;">
    Generated programmatically via SignumHQ Shorts Engine - Mission 42 V35
  </div>
</body>
</html>`;

  fs.writeFileSync(path.join(outDir, `v35_${lowerTicker}_contact_sheet.html`), html);
  console.log(`Successfully created out/review/v35_${lowerTicker}_contact_sheet.html and extracted all stills!`);
});
