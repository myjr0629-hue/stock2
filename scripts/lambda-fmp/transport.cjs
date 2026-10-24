const https = require('node:https');

// Timer covers connection AND body. Aborting destroys the actual ClientRequest/socket.
function httpsGet(url, timeoutMs = 15000, transport = https) {
  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const done = (error, result) => { clearTimeout(timer); error ? reject(new Error('FMP_TRANSPORT_ERROR')) : resolve(result); };
    try {
      const req = transport.get(url, { signal: controller.signal, headers: { 'User-Agent': 'SIGNUM-FMP/2.0' } }, res => {
        // Collect bytes and decode once: decoding each chunk splits multi-byte UTF-8
        // characters at chunk boundaries (same defect fixed in ec2-worker-utf8).
        const parts = []; let size = 0;
        const limit = res.statusCode >= 400 ? 8192 : 8*1024*1024;
        const body = () => Buffer.concat(parts).toString('utf8');
        res.on('data', chunk => {
          const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          if (size < limit) parts.push(part.subarray(0, limit-size));
          size += part.length;
          if (size > limit) {
            if (res.statusCode >= 400) { done(null, { status: res.statusCode, headers: res.headers, body: body() }); req.destroy(); }
            else { req.destroy(); done(true); }
          }
        });
        res.on('error', () => done(true));
        res.on('aborted', () => done(true));
        res.on('end', () => done(null, { status: res.statusCode, headers: res.headers, body: body() }));
      });
      req.on('error', () => done(true));
    } catch { done(true); }
  });
}
module.exports = { httpsGet };
