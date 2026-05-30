const cp = require('child_process');
const fs = require('fs');
const path = require('path');

const ffmpeg = require('ffmpeg-static');
const videoPath = 'out/market_pressure_brief_v30_intelligence_leak_revenue_cut.mp4';
const outputPath = 'out/review/v30_contact_sheet.jpg';

// Ensure output directory exists
const outDir = 'out/review';
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

console.log('Generating real 6x2 tiled contact sheet image via FFmpeg-static...');

try {
  // Use select filter to grab 11 exact frames at 30fps:
  // 0.0s = 0, 0.3s = 9, 0.7s = 21, 1.5s = 45, 3.0s = 90, 5.0s = 150, 7.5s = 225, 10.5s = 315, 13.5s = 405, 16.5s = 495, final (18.4s) = 554
  const selectExpr = "select='eq(n,0)+eq(n,9)+eq(n,21)+eq(n,45)+eq(n,90)+eq(n,150)+eq(n,225)+eq(n,315)+eq(n,405)+eq(n,495)+eq(n,554)',scale=270:480,tile=6x2";
  
  cp.execSync(`"${ffmpeg}" -y -i "${videoPath}" -vf "${selectExpr}" -frames:v 1 "${outputPath}"`, { stdio: 'inherit' });
  console.log('Successfully created real tiled contact sheet at:', outputPath);
} catch (e) {
  console.error('Failed to create tiled contact sheet:', e);
  process.exit(1);
}

// Generate companion HTML sheet
const frames = [
  { time: '0.0s (f0)', frameIdx: 0, label: 'v30_frame_000.jpg', name: 'Event Shock Instantly Alive' },
  { time: '0.3s (f9)', frameIdx: 9, label: 'v30_frame_009.jpg', name: 'Decrypted Intel Flashing' },
  { time: '0.7s (f21)', frameIdx: 21, label: 'v30_frame_021.jpg', name: 'Glass Card Off-Exchange' },
  { time: '1.5s (f45)', frameIdx: 45, label: 'v30_frame_045.jpg', name: 'Active Mini-Chart Visual Density' },
  { time: '3.0s (f90)', frameIdx: 90, label: 'v30_frame_090.jpg', name: 'Normal Chart Limitations & Wall' },
  { time: '5.0s (f150)', frameIdx: 150, label: 'v30_frame_150.jpg', name: '1.3% Gap Dynamic Spring Zoom' },
  { time: '7.5s (f225)', frameIdx: 225, label: 'v30_frame_225.jpg', name: 'Sequential Risk Map Hierarchy' },
  { time: '10.5s (f315)', frameIdx: 315, label: 'v30_frame_315.jpg', name: 'Product Unlock Scanner Sweep' },
  { time: '13.5s (f405)', frameIdx: 405, label: 'v30_frame_405.jpg', name: 'Structure Behind Price Revealed' },
  { time: '16.5s (f495)', frameIdx: 495, label: 'v30_frame_495.jpg', name: 'Premium CTA Conversion Domain' },
  { time: 'final (f554)', frameIdx: 554, label: 'v30_frame_final.jpg', name: 'Outro Loop Pulse Hook' }
];

let html = `<html>
<head>
  <title>V30 Intelligence Leak - Contact Sheet</title>
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
  <h1>MARKET PRESSURE BRIEF V30</h1>
  <p>Intelligence Leak Revenue Cut - Visual Storyboard Review</p>
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
    Generated programmatically via SignumHQ Shorts Engine - Mission 37 V30
  </div>
</body>
</html>`;

fs.writeFileSync(path.join(outDir, 'v30_contact_sheet.html'), html);
console.log('Successfully created out/review/v30_contact_sheet.html and extracted all storyboard stills!');
