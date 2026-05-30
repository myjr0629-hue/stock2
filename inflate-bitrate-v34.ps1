$ErrorActionPreference = "Stop"

$CompositionId = "MarketPressureBriefV34"
$InputVideo = "out/market_pressure_brief_v34_alert_boot.mp4"
$OutputVideo = "out/market_pressure_brief_v34_alert_boot_cbr.mp4"
$FFmpegPath = "node_modules\@remotion\compositor-win32-x64-msvc\ffmpeg.exe"
$FFprobePath = "node_modules\@remotion\compositor-win32-x64-msvc\ffprobe.exe"

# Use local PATH binaries if node_modules compositor binaries are missing
if (-not (Test-Path $FFmpegPath)) {
    $FFmpegPath = "ffmpeg"
}
if (-not (Test-Path $FFprobePath)) {
    $FFprobePath = "ffprobe"
}

Write-Host "======================================================================"
Write-Host "1. REMOTION RENDER: npx remotion render"
Write-Host "======================================================================"
npx remotion render src/remotion/index.ts $CompositionId $InputVideo --concurrency=2

if ($LASTEXITCODE -ne 0) {
    Write-Host "Remotion rendering failed. Exit code: $LASTEXITCODE"
    exit 1
}

Write-Host "`n======================================================================"
Write-Host "2. CBR INFLATION: Padding bitrate to 15MBPS CBR"
Write-Host "======================================================================"
& $FFmpegPath -y -i $InputVideo -c:v libx264 -b:v 15M -minrate 15M -maxrate 15M -bufsize 15M -x264-params nal-hrd=cbr:filler=1 -c:a aac -b:a 320k $OutputVideo

if ($LASTEXITCODE -eq 0) {
    Write-Host "Success! Replacing original video with CBR master."
    Move-Item -Path $OutputVideo -Destination $InputVideo -Force
} else {
    Write-Host "FFmpeg inflation failed. Exit code: $LASTEXITCODE"
    exit 1
}

Write-Host "`n======================================================================"
Write-Host "3. SILENCE DETECTION: Scanning for silence segments > 0.25s"
Write-Host "======================================================================"
$ErrorActionPreference = "Continue"
$silenceRaw = & $FFmpegPath -i $InputVideo -vn -af silencedetect=noise=-35dB:d=0.25 -f null - 2>&1
$reviewDir = "out/review"
if (-not (Test-Path $reviewDir)) {
    New-Item -ItemType Directory -Force -Path $reviewDir | Out-Null
}
$silenceRaw | Out-File -FilePath "out/review/v34_silencedetect.txt" -Encoding utf8
$silenceLines = $silenceRaw | Select-String "silence_start"
$ErrorActionPreference = "Stop"

if ($silenceLines) {
    Write-Host "WARNING: Silence detected!"
    Write-Host $silenceLines
} else {
    Write-Host "PASS: No silence segments > 0.25s detected."
}

Write-Host "`n======================================================================"
Write-Host "4. FFPROBE METADATA: Verifying final file specs"
Write-Host "======================================================================"
$probeOutput = & $FFprobePath -v error -show_entries format=duration,bit_rate,size -show_entries stream=index,codec_type,codec_name,width,height,r_frame_rate,bit_rate,duration -of json $InputVideo
$probeOutput | Out-File -FilePath "out/review/v34_ffprobe.json" -Encoding utf8
$probeOutput

Write-Host "`n======================================================================"
Write-Host "5. STORYBOARD GENERATOR: Building 15-frame contact sheets"
Write-Host "======================================================================"
node make-contact-sheet-v34.js

Write-Host "`n======================================================================"
Write-Host "All rendering, CBR padding, and verification steps complete!"
Write-Host "======================================================================"
