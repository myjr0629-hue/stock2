const cp = require('child_process');
const fs = require('fs');
const path = require('path');

const ffmpeg = require('ffmpeg-static');
const videoPath = 'out/market_pressure_brief_v29_premium_intelligence_cut.mp4';
const outputPath = 'out/review/v29_contact_sheet.jpg';

// Ensure output directory exists
const outDir = 'out/review';
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

console.log('Generating real 5x2 tiled contact sheet image via FFmpeg-static...');

try {
  // Use select filter to grab 10 exact frames at 30fps:
  // 0.0s = 0, 0.5s = 15, 1.5s = 45, 3.0s = 90, 4.5s = 135, 6.0s = 180, 8.0s = 240, 10.5s = 315, 14.0s = 420, final (18.4s) = 554
  const selectExpr = "select='eq(n,0)+eq(n,15)+eq(n,45)+eq(n,90)+eq(n,135)+eq(n,180)+eq(n,240)+eq(n,315)+eq(n,420)+eq(n,554)',scale=270:480,tile=5x2";
  
  cp.execSync(`"${ffmpeg}" -y -i "${videoPath}" -vf "${selectExpr}" -frames:v 1 "${outputPath}"`, { stdio: 'inherit' });
  console.log('Successfully created real tiled contact sheet at:', outputPath);
} catch (e) {
  console.error('Failed to create tiled contact sheet:', e);
  process.exit(1);
}

// Generate companion HTML sheet
const frames = [
  { time: '0.0s (f0)', frameIdx: 0, label: 'v29_frame_000.jpg', name: 'Event Shock Hook' },
  { time: '0.5s (f15)', frameIdx: 15, label: 'v29_frame_015.jpg', name: 'Glass Card Alert' },
  { time: '1.5s (f45)', frameIdx: 45, label: 'v29_frame_045.jpg', name: 'Off-Exchange Context' },
  { time: '3.0s (f90)', frameIdx: 90, label: 'v29_frame_090.jpg', name: 'Normal Chart Limitations' },
  { time: '4.5s (f135)', frameIdx: 135, label: 'v29_frame_135.jpg', name: 'Not the Wall Emphasis' },
  { time: '6.0s (f180)', frameIdx: 180, label: 'v29_frame_180.jpg', name: '1.3% Pressure Gap' },
  { time: '8.0s (f240)', frameIdx: 240, label: 'v29_frame_240.jpg', name: 'Sequential Risk Map' },
  { time: '10.5s (f315)', frameIdx: 315, label: 'v29_frame_315.jpg', name: 'Product Unlock Sweep' },
  { time: '14.0s (f420)', frameIdx: 420, label: 'v29_frame_420.jpg', name: 'Revealed Order Flow' },
  { time: '18.4s (f554)', frameIdx: 554, label: 'v29_frame_final.jpg', name: 'Premium Brand Outro' }
];

let html = `<html>
<head>
  <title>V29 Premium Intelligence - Contact Sheet</title>
  <style>
    body { background: #03050c; color: #e2e8f0; font-family: 'Outfit', sans-serif; text-align: center; padding: 40px; margin: 0; }
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
  <h1>MARKET PRESSURE BRIEF V29</h1>
  <p>Premium Intelligence Cut - Visual Storyboard Review</p>
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
    Generated programmatically via SignumHQ Shorts Engine - Mission 36 V29
  </div>
</body>
</html>`;

fs.writeFileSync(path.join(outDir, 'v29_contact_sheet.html'), html);
console.log('Successfully created out/review/v29_contact_sheet.html and extracted all storyboard stills!');
