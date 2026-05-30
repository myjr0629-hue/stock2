$InputVideo = "out/market_pressure_brief_v21_2_upload_candidate.mp4"
$OutputImage = "out/review/v21_2_contact_sheet.jpg"
$FFmpegPath = "node_modules\@remotion\compositor-win32-x64-msvc\ffmpeg.exe"

& $FFmpegPath -i $InputVideo -vf "select='not(mod(n,45))',scale=270:480,tile=4x3" -frames:v 1 -y $OutputImage
