$ErrorActionPreference = "Stop"

$InputVideo = "out/market_pressure_brief_v33_frame0_event_shock.mp4"
$OutputVideo = "out/market_pressure_brief_v33_frame0_event_shock_cbr.mp4"
$FFmpegPath = "node_modules\@remotion\compositor-win32-x64-msvc\ffmpeg.exe"
$FFprobePath = "node_modules\@remotion\compositor-win32-x64-msvc\ffprobe.exe"

# If node_modules binary doesn't exist, try local PATH ffmpeg/ffprobe
if (-not (Test-Path $FFmpegPath)) {
    $FFmpegPath = "ffmpeg"
}
if (-not (Test-Path $FFprobePath)) {
    $FFprobePath = "ffprobe"
}

Write-Host "--- INFLATING V33 BITRATE TO 15MBPS CBR WITH FILLER ---"
& $FFmpegPath -y -i $InputVideo -c:v libx264 -b:v 15M -minrate 15M -maxrate 15M -bufsize 15M -x264-params nal-hrd=cbr:filler=1 -c:a aac -b:a 320k $OutputVideo

if ($LASTEXITCODE -eq 0) {
    Write-Host "Success! Replacing original with CBR master."
    Move-Item -Path $OutputVideo -Destination $InputVideo -Force
} else {
    Write-Host "FFmpeg inflation failed with exit code $LASTEXITCODE"
    exit 1
}

Write-Host "`n--- RUNNING SILENCE DETECTION (<0.25s) ---"
$ErrorActionPreference = "Continue"
$silenceRaw = & $FFmpegPath -i $InputVideo -vn -af silencedetect=noise=-35dB:d=0.25 -f null - 2>&1
$silenceRaw | Out-File -FilePath "out/review/v33_silencedetect.txt" -Encoding utf8
$silenceLines = $silenceRaw | Select-String "silence_start"
$ErrorActionPreference = "Stop"

if ($silenceLines) {
    Write-Host "WARNING: SILENCE DETECTED!"
    Write-Host $silenceLines
} else {
    Write-Host "PASS: No silence > 0.25s detected."
}

Write-Host "`n--- DUMPING FFPROBE METADATA ---"
$probeOutput = & $FFprobePath -v error -show_entries format=duration,bit_rate,size -show_entries stream=index,codec_type,codec_name,width,height,r_frame_rate,bit_rate,duration -of json $InputVideo
$probeOutput | Out-File -FilePath "out/review/v33_ffprobe.json" -Encoding utf8
$probeOutput

Write-Host "`n--- RUNNING STORYBOARD CONTACT SHEET GENERATOR ---"
node make-contact-sheet-v33.js

Write-Host "`n--- ALL OPERATIONS COMPLETE ---"
