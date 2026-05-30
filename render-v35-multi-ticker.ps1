$ErrorActionPreference = "Stop"

# Assets and configurations
$Compositions = @("MarketPressureBriefV35-SPY", "MarketPressureBriefV35-NVDA")
$Tickers = @("spy", "nvda")

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
Write-Host "LAUNCHING SIGNUMHQ SHORTS ENGINE MISSION 42 V35 PIPELINE"
Write-Host "======================================================================"

for ($i = 0; $i -lt $Compositions.Length; $i++) {
    $CompId = $Compositions[$i]
    $Ticker = $Tickers[$i]
    
    $InputVideo = "out/market_pressure_brief_v35_$Ticker.mp4"
    $OutputVideo = "out/market_pressure_brief_v35_${Ticker}_cbr.mp4"
    
    Write-Host "`n----------------------------------------------------------------------"
    Write-Host "PROCESSING TICKER: [$Ticker.ToUpper()] via COMPOSITION: $CompId"
    Write-Host "----------------------------------------------------------------------"
    
    Write-Host "1. REMOTION RENDER: rendering 720 frames..."
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
        Write-Host "FFmpeg CBR inflation failed for $CompId. Exit code: $LASTEXITCODE"
        exit 1
    }
    
    Write-Host "`n3. SILENCE DETECT: Scanning AI narration for silence > 0.25s..."
    $ErrorActionPreference = "Continue"
    $silenceRaw = & $FFmpegPath -i $InputVideo -vn -af silencedetect=noise=-35dB:d=0.25 -f null - 2>&1
    
    $reviewDir = "out/review"
    if (-not (Test-Path $reviewDir)) {
        New-Item -ItemType Directory -Force -Path $reviewDir | Out-Null
    }
    
    $silenceRaw | Out-File -FilePath "out/review/v35_${Ticker}_silencedetect.txt" -Encoding utf8
    $silenceLines = $silenceRaw | Select-String "silence_start"
    $ErrorActionPreference = "Stop"
    
    if ($silenceLines) {
        Write-Host "WARNING: Silence segments > 0.25s detected for $Ticker!"
        Write-Host $silenceLines
    } else {
        Write-Host "PASS: No silent gaps detected in narration."
    }
    
    Write-Host "`n4. FFPROBE VERIFY: Reading master video specs..."
    $probeOutput = & $FFprobePath -v error -show_entries format=duration,bit_rate,size -show_entries stream=index,codec_type,codec_name,width,height,r_frame_rate,bit_rate,duration -of json $InputVideo
    $probeOutput | Out-File -FilePath "out/review/v35_${Ticker}_ffprobe.json" -Encoding utf8
    Write-Host $probeOutput
}

Write-Host "`n======================================================================"
Write-Host "5. STORYBOARD GENERATOR: Building 15-frame contact sheets for all tickers..."
Write-Host "======================================================================"
node make-contact-sheet-v35.js

Write-Host "`n======================================================================"
Write-Host "MISSION 42 V35 MULTI-RENDER SUCCESS: SPY & NVDA MASTER COPIES ARMED!"
Write-Host "======================================================================"
