// ============================================================================
// EC2 Screenshot Capture Worker
// Puppeteer + Chromium — EC2에서 직접 실행
// HTTP 서버 포트 3100
//
// 사용법:
//   POST http://localhost:3100/capture
//   { "url": "https://signumhq.com/marketing/templates/pulse?spy=1.2", "width": 1200, "height": 675 }
//   → PNG 바이너리 반환
//
//   GET http://localhost:3100/health → { status: "ok" }
// ============================================================================

const http = require('http');
const puppeteer = require('puppeteer-core');

const PORT = 3100;
const CHROME_PATH = '/usr/bin/chromium-browser';

// 브라우저 풀 (Cold start 방지 — 1개 인스턴스 재사용)
let browserInstance = null;

async function getBrowser() {
  if (browserInstance && browserInstance.isConnected()) {
    return browserInstance;
  }
  
  console.log('[CaptureWorker] Launching Chromium...');
  browserInstance = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',    // /dev/shm 대신 /tmp 사용 (메모리 절약)
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu',
      '--disable-extensions',
      '--disable-background-networking',
      '--disable-default-apps',
      '--disable-sync',
      '--disable-translate',
      '--single-process',            // 메모리 절약 (t3.small)
      '--font-render-hinting=none',  // 서버 환경 최적화
    ],
  });
  
  console.log('[CaptureWorker] ✅ Chromium launched');
  return browserInstance;
}

async function captureScreenshot(url, width = 1200, height = 675, delay = 2000, cookies = null) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  
  try {
    // Viewport 설정 (Retina 2x)
    await page.setViewport({
      width,
      height,
      deviceScaleFactor: 2,
    });
    
    // 관리자 인증 쿠키 주입 (대시보드 캡처용)
    if (cookies && Array.isArray(cookies)) {
      // 직접 쿠키 배열: [{ name, value, domain }]
      await page.setCookie(...cookies);
      console.log(`[CaptureWorker] 🔐 Injected ${cookies.length} auth cookies`);
    } else if (cookies && typeof cookies === 'string') {
      // Supabase auth token 직접 전달 시 쿠키로 변환
      const domain = new URL(url).hostname;
      await page.setCookie({
        name: 'sb-access-token',
        value: cookies,
        domain,
        path: '/',
        httpOnly: true,
        secure: true,
      });
      console.log(`[CaptureWorker] 🔐 Injected auth token as cookie`);
    }
    
    // 불필요한 리소스 차단 (속도 최적화)
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const type = req.resourceType();
      if (['media', 'websocket', 'manifest'].includes(type)) {
        req.abort();
      } else {
        req.continue();
      }
    });
    
    // 페이지 로드
    await page.goto(url, {
      waitUntil: 'networkidle0',
      timeout: 30000,
    });
    
    // 렌더링 대기
    if (delay > 0) {
      await new Promise(r => setTimeout(r, delay));
    }
    
    // 스크린샷 캡처
    const screenshot = await page.screenshot({
      type: 'png',
      clip: { x: 0, y: 0, width, height },
    });
    
    const authNote = cookies ? ' (authenticated)' : '';
    console.log(`[CaptureWorker] ✅ ${width}×${height} → ${(screenshot.length / 1024).toFixed(0)}KB${authNote} from ${url.substring(0, 80)}`);
    return screenshot;
    
  } finally {
    await page.close();
  }
}

// HTTP 서버
const server = http.createServer(async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }
  
  // Health check
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      status: 'ok',
      browser: browserInstance?.isConnected() ? 'connected' : 'idle',
      uptime: process.uptime(),
    }));
  }
  
  // Capture endpoint
  if (req.url === '/capture' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { url, width, height, delay, cookies } = JSON.parse(body);
        
        if (!url) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          return res.end(JSON.stringify({ error: 'url required' }));
        }
        
        const screenshot = await captureScreenshot(
          url,
          width || 1200,
          height || 675,
          delay || 2000,
          cookies || null  // 인증 쿠키 (선택사항)
        );
        
        res.writeHead(200, {
          'Content-Type': 'image/png',
          'Content-Length': screenshot.length,
          'X-Capture-Size': `${width || 1200}x${height || 675}`,
        });
        res.end(screenshot);
        
      } catch (err) {
        console.error('[CaptureWorker] ❌ Error:', err.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }
  
  // GET capture (간편 테스트용)
  if (req.url?.startsWith('/capture?')) {
    const params = new URL(req.url, `http://localhost:${PORT}`).searchParams;
    const url = params.get('url');
    const width = parseInt(params.get('w') || '1200');
    const height = parseInt(params.get('h') || '675');
    const delay = parseInt(params.get('delay') || '2000');
    
    if (!url) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'url required' }));
    }
    
    try {
      const screenshot = await captureScreenshot(url, width, height, delay);
      res.writeHead(200, {
        'Content-Type': 'image/png',
        'Content-Length': screenshot.length,
      });
      res.end(screenshot);
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }
  
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found. Use POST /capture or GET /health' }));
});

// Pre-warm: 서버 시작 시 브라우저 미리 로드
server.listen(PORT, async () => {
  console.log(`[CaptureWorker] 🚀 Screenshot server on port ${PORT}`);
  try {
    await getBrowser();
    console.log('[CaptureWorker] ✅ Browser pre-warmed — zero cold start');
  } catch (err) {
    console.error('[CaptureWorker] Browser pre-warm failed:', err.message);
  }
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('[CaptureWorker] Shutting down...');
  if (browserInstance) await browserInstance.close();
  server.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  if (browserInstance) await browserInstance.close();
  server.close();
  process.exit(0);
});
