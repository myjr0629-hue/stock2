$ErrorActionPreference = "Stop"

$VideoPath = "out/market_pressure_brief_v21_1_upload_candidate.mp4"
$FFprobePath = "node_modules\@remotion\compositor-win32-x64-msvc\ffprobe.exe"
$FFmpegPath = "node_modules\@remotion\compositor-win32-x64-msvc\ffmpeg.exe"

if (!(Test-Path $VideoPath)) {
    Write-Host "File not found: $VideoPath"
    exit 1
}

Write-Host "--- FFPROBE METRICS ---"
& $FFprobePath -v error -show_entries format=duration,bit_rate,size -show_entries stream=index,codec_type,codec_name,width,height,r_frame_rate,bit_rate,duration -of json $VideoPath

Write-Host "`n--- SILENCE DETECTION (<0.25s) ---"
$ErrorActionPreference = "Continue"
$silenceOutput = & $FFmpegPath -i $VideoPath -af silencedetect=noise=-35dB:d=0.25 -f null - 2>&1 | Select-String "silence_start"
$ErrorActionPreference = "Stop"

if ($silenceOutput) {
    Write-Host "SILENCE DETECTED!"
    Write-Host $silenceOutput
    exit 1
} else {
    Write-Host "PASS: No silence > 0.25s detected."
}
