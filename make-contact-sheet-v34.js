const cp = require('child_process');
const fs = require('fs');
const path = require('path');

const ffmpeg = require('ffmpeg-static');
const videoPath = 'out/market_pressure_brief_v34_alert_boot.mp4';
const outputPath = 'out/review/v34_contact_sheet.jpg';

// Ensure output directory exists
const outDir = 'out/review';
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

console.log('Generating real 5x3 tiled contact sheet image via FFmpeg-static for V34...');

try {
  // Use select filter to grab 15 exact frames at 30fps:
  // 0.0s=0, 0.2s=6, 0.4s=12, 1.0s=30, 2.5s=75, 4.5s=135, 6.0s=180, 8.5s=255, 9.0s=270, 11.0s=330, 13.5s=405, 15.5s=465, 18.0s=540, 21.0s=630, final=719
  const selectExpr = "select='eq(n,0)+eq(n,6)+eq(n,12)+eq(n,30)+eq(n,75)+eq(n,135)+eq(n,180)+eq(n,255)+eq(n,270)+eq(n,330)+eq(n,405)+eq(n,465)+eq(n,540)+eq(n,630)+eq(n,719)',scale=270:480,tile=5x3";
  
  cp.execSync(`"${ffmpeg}" -y -i "${videoPath}" -vf "${selectExpr}" -frames:v 1 "${outputPath}"`, { stdio: 'inherit' });
  console.log('Successfully created real tiled contact sheet at:', outputPath);
} catch (e) {
  console.error('Failed to create tiled contact sheet:', e);
  process.exit(1);
}

// Generate companion HTML sheet
const frames = [
  { time: '0.0s (f0)', frameIdx: 0, label: 'v34_frame_000.jpg', name: 'Signature Scan Alert Boot System - System starting, glitchy logo' },
  { time: '0.2s (f6)', frameIdx: 6, label: 'v34_frame_006.jpg', name: 'Signature Scan Alert Boot System - [SYSTEM_BOOT_SCAN_ACTIVE]' },
  { time: '0.4s (f12)', frameIdx: 12, label: 'v34_frame_012.jpg', name: 'Breaking News Shock Event Delivery - Off-exchange flow detected' },
  { time: '1.0s (f30)', frameIdx: 30, label: 'v34_frame_030.jpg', name: 'Breaking News Shock Event Delivery - 91st %ILE badge, flow particles' },
  { time: '2.5s (f75)', frameIdx: 75, label: 'v34_frame_075.jpg', name: 'Breaking News Shock Event Delivery - High impact price vector' },
  { time: '4.5s (f135)', frameIdx: 135, label: 'v34_frame_135.jpg', name: 'Normal Chart vs Hidden Structure - Scanner unmasks structures' },
  { time: '6.0s (f180)', frameIdx: 180, label: 'v34_frame_180.jpg', name: 'Normal Chart vs Hidden Structure - Call Wall, Put Floor, Gamma Flip' },
  { time: '8.5s (f255)', frameIdx: 255, label: 'v34_frame_255.jpg', name: 'Elastic Pacing Zoom - Gap compression zoom begins' },
  { time: '9.0s (f270)', frameIdx: 270, label: 'v34_frame_270.jpg', name: 'Elastic Pacing Zoom - Gap compression shake active' },
  { time: '11.0s (f330)', frameIdx: 330, label: 'v34_frame_330.jpg', name: 'Elastic Pacing Zoom - Gap compression deep zoom, high intensity' },
  { time: '13.5s (f405)', frameIdx: 405, label: 'v34_frame_405.jpg', name: 'High-Impact Insight Payoff - "Not a call. A pressure map."' },
  { time: '15.5s (f465)', frameIdx: 465, label: 'v34_frame_465.jpg', name: 'High-Impact Insight Payoff - Pressure concentrates near boundary' },
  { time: '18.0s (f540)', frameIdx: 540, label: 'v34_frame_540.jpg', name: 'Premium Outro - Centered signum logo & domain box' },
  { time: '21.0s (f630)', frameIdx: 630, label: 'v34_frame_630.jpg', name: 'Premium Outro - [SEE THE HIDDEN MARKET STRUCTURE]' },
  { time: 'final (f719)', frameIdx: 719, label: 'v34_frame_final.jpg', name: 'Outro Loop Cue - Smooth transition blend back to Frame 0' }
];

let html = `<html>
<head>
  <title>V34 Alert Boot & 24s Rebuild - Contact Sheet</title>
  <style>
    body { background: #020409; color: #e2e8f0; font-family: 'Outfit', sans-serif; text-align: center; padding: 40px; margin: 0; }
    h1 { font-size: 32px; color: #22d3ee; margin-bottom: 8px; font-weight: 900; letter-spacing: 0.05em; }
    p { color: #94a3b8; font-size: 16px; margin-bottom: 40px; }
    .grid { display: flex; flex-wrap: wrap; justify-content: center; gap: 24px; max-width: 1600px; margin: 0 auto; }
    .card { background: rgba(34, 211, 238, 0.03); border: 1px solid rgba(34, 211, 238, 0.12); padding: 16px; border-radius: 12px; transition: all 0.3s ease; width: 270px; }
    .card:hover { border-color: #22d3ee; box-shadow: 0 0 20px rgba(34,211,238,0.2); }
    img { border-radius: 6px; border: 1px solid #1e293b; display: block; margin-bottom: 12px; }
    .time { font-family: monospace; font-size: 14px; color: #fbbf24; font-weight: bold; }
    .label { font-size: 13px; color: #94a3b8; margin-top: 4px; }
  </style>
</head>
<body>
  <h1>MARKET PRESSURE BRIEF V34</h1>
  <p>Alert Boot & 24s Rebuild - Visual Storyboard Review</p>
  <div class="grid">
`;

// Extract individual stills to display on the HTML page and output files
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
    Generated programmatically via SignumHQ Shorts Engine - Mission 41 V34
  </div>
</body>
</html>`;

fs.writeFileSync(path.join(outDir, 'v34_contact_sheet.html'), html);
console.log('Successfully created out/review/v34_contact_sheet.html and extracted all storyboard stills!');
