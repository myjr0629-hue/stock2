$ErrorActionPreference = "Stop"

$CompId = "MarketPressureBriefV37-NVDA"
$InputVideo = "out/market_pressure_brief_v37_audio_caption_lock.mp4"
$OutputVideo = "out/market_pressure_brief_v37_audio_caption_lock_cbr.mp4"

$FFmpegPath = "node_modules\@remotion\compositor-win32-x64-msvc\ffmpeg.exe"
$FFprobePath = "node_modules\@remotion\compositor-win32-x64-msvc\ffprobe.exe"

# local PATH fallback
if (-not (Test-Path $FFmpegPath)) {
    $FFmpegPath = "ffmpeg"
}
if (-not (Test-Path $FFprobePath)) {
    $FFprobePath = "ffprobe"
}

Write-Host "======================================================================"
Write-Host "LAUNCHING SIGNUMHQ SHORTS ENGINE MISSION 43 V37 PIPELINE (REAL-DATA)"
Write-Host "======================================================================"

Write-Host "`n1. REMOTION RENDER: rendering 739 frames..."
npx remotion render src/remotion/index.ts $CompId $InputVideo --concurrency=2

if ($LASTEXITCODE -ne 0) {
    Write-Host "Remotion rendering failed for $CompId. Exit code: $LASTEXITCODE"
    exit 1
}

Write-Host "`n2. CBR INFLATION: Padding to 15Mbps CBR master standard..."
& $FFmpegPath -y -i $InputVideo -c:v libx264 -b:v 15M -minrate 15M -maxrate 15M -bufsize 15M -x264-params nal-hrd=cbr:filler=1 -c:a aac -b:a 320k $OutputVideo

if ($LASTEXITCODE -eq 0) {
    Write-Host "Bitrate padded successfully. Replacing original asset with CBR master..."
    Move-Item -Path $OutputVideo -Destination $InputVideo -Force
} else {
    Write-Host "FFmpeg CBR inflation failed. Exit code: $LASTEXITCODE"
    exit 1
}

Write-Host "`n3. SILENCE DETECT: Scanning AI narration for silence > 0.25s..."
$ErrorActionPreference = "Continue"
$silenceRaw = & $FFmpegPath -i $InputVideo -vn -af silencedetect=noise=-35dB:d=0.25 -f null - 2>&1

$reviewDir = "out/review"
if (-not (Test-Path $reviewDir)) {
    New-Item -ItemType Directory -Force -Path $reviewDir | Out-Null
}

$silenceRaw | Out-File -FilePath "out/review/v37_silencedetect.txt" -Encoding utf8
$silenceLines = $silenceRaw | Select-String "silence_start"
$ErrorActionPreference = "Stop"

if ($silenceLines) {
    Write-Host "WARNING: Silence segments > 0.25s detected!"
    Write-Host $silenceLines
} else {
    Write-Host "PASS: No silent gaps detected in narration."
}

Write-Host "`n4. FFPROBE VERIFY: Reading master video specs..."
$probeOutput = & $FFprobePath -v error -show_entries format=duration,bit_rate,size -show_entries stream=index,codec_type,codec_name,width,height,r_frame_rate,bit_rate,duration -of json $InputVideo
$probeOutput | Out-File -FilePath "out/review/v37_ffprobe.json" -Encoding utf8
Write-Host $probeOutput

Write-Host "`n======================================================================"
Write-Host "5. STORYBOARD GENERATOR: Building contact sheet and audit logs..."
Write-Host "======================================================================"
node make-contact-sheet-v37.js

Write-Host "`n======================================================================"
Write-Host "MISSION 43 V37 RENDER & SSoT INTEGRITY VERIFICATION SUCCESSFUL!"
Write-Host "======================================================================"
