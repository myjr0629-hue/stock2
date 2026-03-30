const https = require('https');

function bufferQuery(queryStr) {
  return new Promise((resolve) => {
    const body = JSON.stringify({ query: queryStr });
    const options = {
      hostname: 'api.buffer.com',
      port: 443,
      path: '/',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer afILPK3AZJt0aOMG03pXv-L7cALR_tQgYZlMXln3ORX',
        'Content-Length': Buffer.byteLength(body)
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    });
    req.on('error', (e) => resolve({ error: e.message }));
    req.write(body);
    req.end();
  });
}

(async () => {
  // Step 1: Get channels
  console.log('=== Step 1: Fetching channels ===');
  const chResult = await bufferQuery(`{
    channels(input: { organizationId: "69a92687c9f20bfac044a189" }) {
      id
      name
      service
    }
  }`);
  console.log(JSON.stringify(chResult, null, 2));
})();
