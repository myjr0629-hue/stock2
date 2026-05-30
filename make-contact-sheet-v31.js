const cp = require('child_process');
const fs = require('fs');
const path = require('path');

const ffmpeg = require('ffmpeg-static');
const videoPath = 'out/market_pressure_brief_v31_event_shock_revenue_cut.mp4';
const outputPath = 'out/review/v31_contact_sheet.jpg';

// Ensure output directory exists
const outDir = 'out/review';
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

console.log('Generating real 6x2 tiled contact sheet image via FFmpeg-static...');

try {
  // Use select filter to grab 12 exact frames at 30fps:
  // 0.0s = 0, 0.2s = 6, 0.5s = 15, 1.0s = 30, 1.8s = 54, 3.0s = 90, 5.0s = 150, 7.5s = 225, 10.5s = 315, 13.5s = 405, 16.5s = 495, final (18.4s) = 554
  const selectExpr = "select='eq(n,0)+eq(n,6)+eq(n,15)+eq(n,30)+eq(n,54)+eq(n,90)+eq(n,150)+eq(n,225)+eq(n,315)+eq(n,405)+eq(n,495)+eq(n,554)',scale=270:480,tile=6x2";
  
  cp.execSync(`"${ffmpeg}" -y -i "${videoPath}" -vf "${selectExpr}" -frames:v 1 "${outputPath}"`, { stdio: 'inherit' });
  console.log('Successfully created real tiled contact sheet at:', outputPath);
} catch (e) {
  console.error('Failed to create tiled contact sheet:', e);
  process.exit(1);
}

// Generate companion HTML sheet
const frames = [
  { time: '0.0s (f0)', frameIdx: 0, label: 'v31_frame_000.jpg', name: 'Hook Event Shock Frame 0' },
  { time: '0.2s (f6)', frameIdx: 6, label: 'v31_frame_006.jpg', name: 'Decrypted Intel Warning Flashing' },
  { time: '0.5s (f15)', frameIdx: 15, label: 'v31_frame_015.jpg', name: 'Active Volume Histogram & Curve' },
  { time: '1.0s (f30)', frameIdx: 30, label: 'v31_frame_030.jpg', name: 'Hook Shock Core Flow Vitality' },
  { time: '1.8s (f54)', frameIdx: 54, label: 'v31_frame_054.jpg', name: '91st Percentile High Density Event' },
  { time: '3.0s (f90)', frameIdx: 90, label: 'v31_frame_090.jpg', name: 'Normal Chart Contrast - Not the Wall' },
  { time: '5.0s (f150)', frameIdx: 150, label: 'v31_frame_150.jpg', name: 'Tension 1.3% Compression Gap Zoom' },
  { time: '7.5s (f225)', frameIdx: 225, label: 'v31_frame_225.jpg', name: 'THIS IS A PRESSURE MAP Activations' },
  { time: '10.5s (f315)', frameIdx: 315, label: 'v31_frame_315.jpg', name: 'Product Unlock Scanner Sweep' },
  { time: '13.5s (f405)', frameIdx: 405, label: 'v31_frame_405.jpg', name: 'Structure Behind Price Fully Unmasked' },
  { time: '16.5s (f495)', frameIdx: 495, label: 'v31_frame_495.jpg', name: 'Clean CTA Domain Box conversion' },
  { time: 'final (f554)', frameIdx: 554, label: 'v31_frame_final.jpg', name: 'Outro Loop Ghost Pulse Hook' }
];

let html = `<html>
<head>
  <title>V31 Event Shock + Product Desire - Contact Sheet</title>
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
  <h1>MARKET PRESSURE BRIEF V31</h1>
  <p>Event Shock + Product Desire Rebuild - Visual Storyboard Review</p>
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
    Generated programmatically via SignumHQ Shorts Engine - Mission 38 V31
  </div>
</body>
</html>`;

fs.writeFileSync(path.join(outDir, 'v31_contact_sheet.html'), html);
console.log('Successfully created out/review/v31_contact_sheet.html and extracted all storyboard stills!');
