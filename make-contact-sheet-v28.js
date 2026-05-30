const cp = require('child_process');
const fs = require('fs');
const path = require('path');

const ffmpeg = require('ffmpeg-static');
const videoPath = 'out/market_pressure_brief_v28_revenue_candidate.mp4';
const outputPath = 'out/review/v28_contact_sheet.jpg';

// Ensure output directory exists
const outDir = 'out/review';
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

console.log('Generating real 5x2 tiled contact sheet image via FFmpeg-static...');

try {
  // Use select filter to grab 10 exact frames at 30fps:
  // 0.0s = 0, 0.5s = 15, 1.5s = 45, 3.0s = 90, 5.0s = 150, 7.5s = 225, 10.5s = 315, 13.5s = 405, 16.5s = 495, 18.4s (final frame) = 554
  const selectExpr = "select='eq(n,0)+eq(n,15)+eq(n,45)+eq(n,90)+eq(n,150)+eq(n,225)+eq(n,315)+eq(n,405)+eq(n,495)+eq(n,554)',scale=270:480,tile=5x2";
  
  cp.execSync(`"${ffmpeg}" -y -i "${videoPath}" -vf "${selectExpr}" -frames:v 1 "${outputPath}"`, { stdio: 'inherit' });
  console.log('Successfully created real tiled contact sheet at:', outputPath);
} catch (e) {
  console.error('Failed to create tiled contact sheet:', e);
  process.exit(1);
}

// Generate companion HTML sheet
const frames = [
  { time: '0.0s (f0)', name: 'Event Shock Hook' },
  { time: '0.5s (f15)', name: 'Glass Card Close-up' },
  { time: '1.5s (f45)', name: 'SPY Context Overlay' },
  { time: '3.0s (f90)', name: 'Most Charts Show Price' },
  { time: '5.0s (f150)', name: '1.3% Pressure Gap' },
  { time: '7.5s (f225)', name: 'Sequential Risk Map' },
  { time: '10.5s (f315)', name: 'Product Unlock Scanner' },
  { time: '13.5s (f405)', name: 'Revealed Market Structure' },
  { time: '16.5s (f495)', name: 'Premium Brand CTA' },
  { time: '18.4s (f554)', name: 'Final Frame Outro' }
];

let html = `<html>
<head>
  <title>V28 Institutional Rebuild - Contact Sheet</title>
  <style>
    body { background: #040710; color: #e2e8f0; font-family: 'Outfit', sans-serif; text-align: center; padding: 40px; margin: 0; }
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
  <h1>MARKET PRESSURE BRIEF V28</h1>
  <p>Revenue-Grade Viewer Lock-in Rebuild - Visual Storyboard Review</p>
  <div class="grid">
`;

// Extract individual stills to display on the HTML page as well
frames.forEach((f, idx) => {
  const frameIdx = [0, 15, 45, 90, 150, 225, 315, 405, 495, 554][idx];
  const stillName = `v28_frame_${String(frameIdx).padStart(3, '0')}.jpg`;
  const stillPath = path.join(outDir, stillName);
  
  try {
    cp.execSync(`"${ffmpeg}" -y -i "${videoPath}" -vf "select=eq(n\\,${frameIdx}),scale=270:480" -frames:v 1 "${stillPath}"`, { stdio: 'ignore' });
  } catch (e) {
    console.error(`Failed to export still for frame ${frameIdx}:`, e);
  }

  html += `
    <div class="card">
      <img src="${stillName}" width="270" height="480" />
      <div class="time">${f.time}</div>
      <div class="label">${f.name}</div>
    </div>
  `;
});

html += `
  </div>
  <div style="margin-top: 50px; font-size: 14px; color: #64748b;">
    Generated programmatically via SignumHQ Shorts Engine - Mission 35 V28
  </div>
</body>
</html>`;

fs.writeFileSync(path.join(outDir, 'v28_contact_sheet.html'), html);
console.log('Successfully created out/review/v28_contact_sheet.html and extracted all storyboard stills!');
