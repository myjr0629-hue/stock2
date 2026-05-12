// EC2 내부 E2E 테스트: Capture → stdout으로 결과 출력
const http = require('http');

const data = JSON.stringify({
  url: 'https://signumhq.com/templates/og/pulse?spy=0.84&vix=18.39&gex=neutral&dp=47&lang=en&format=tweet',
  width: 1200,
  height: 675,
  delay: 2000,
});

const req = http.request({
  hostname: 'localhost',
  port: 3100,
  path: '/capture',
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Content-Length': data.length }
}, res => {
  let chunks = [];
  res.on('data', c => chunks.push(c));
  res.on('end', () => {
    const buf = Buffer.concat(chunks);
    if (res.statusCode === 200 && buf[0] === 0x89 && buf[1] === 0x50) {
      console.log('CAPTURE_OK size=' + buf.length + ' sizeKB=' + (buf.length/1024).toFixed(0));
    } else {
      console.log('CAPTURE_FAIL status=' + res.statusCode + ' body=' + buf.toString().substring(0, 200));
    }
  });
});
req.write(data);
req.end();
