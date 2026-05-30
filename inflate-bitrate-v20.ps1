$ErrorActionPreference = "Continue"

$InputVideo = "out/market_pressure_brief_v20_institutional_footprint.mp4"
$OutputVideo = "out/market_pressure_brief_v20_institutional_footprint_cbr.mp4"
$FFmpegPath = "node_modules\@remotion\compositor-win32-x64-msvc\ffmpeg.exe"

Write-Host "Inflating V20 bitrate to 15Mbps CBR..."

& $FFmpegPath -y -i $InputVideo -b:v 15M -minrate 15M -maxrate 15M -bufsize 30M -c:v libx264 -x264-params nal-hrd=cbr -c:a copy $OutputVideo

if ($LASTEXITCODE -eq 0) {
    Write-Host "Success! Replacing original with bloated master."
    Move-Item -Path $OutputVideo -Destination $InputVideo -Force
} else {
    Write-Host "FFmpeg failed with exit code $LASTEXITCODE"
    exit 1
}
