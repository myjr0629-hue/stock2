$ErrorActionPreference = "Stop"

$VideoPath = "out/market_pressure_brief_v22_event_first_revenue_cut.mp4"
$FFprobePath = "node_modules\@remotion\compositor-win32-x64-msvc\ffprobe.exe"
$FFmpegPath = "node_modules\@remotion\compositor-win32-x64-msvc\ffmpeg.exe"

if (!(Test-Path $VideoPath)) {
    Write-Host "File not found: $VideoPath"
    exit 1
}

Write-Host "--- FFPROBE METRICS ---"
$probeOutput = & $FFprobePath -v error -show_entries format=duration,bit_rate,size -show_entries stream=index,codec_type,codec_name,width,height,r_frame_rate,bit_rate,duration -of json $VideoPath
$probeOutput | Out-File -FilePath "out/review/v22_ffprobe.json" -Encoding utf8
$probeOutput

Write-Host "`n--- SILENCE DETECTION (<0.25s) ---"
$ErrorActionPreference = "Continue"
$silenceRaw = & $FFmpegPath -i $VideoPath -af silencedetect=noise=-35dB:d=0.25 -f null - 2>&1
$silenceRaw | Out-File -FilePath "out/review/v22_silencedetect.txt" -Encoding utf8
$silenceLines = $silenceRaw | Select-String "silence_start"
$ErrorActionPreference = "Stop"

if ($silenceLines) {
    Write-Host "SILENCE DETECTED!"
    Write-Host $silenceLines
    exit 1
} else {
    Write-Host "PASS: No silence > 0.25s detected."
}
