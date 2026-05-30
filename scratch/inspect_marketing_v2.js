const requireDotenv = require('dotenv');
requireDotenv.config({ path: '.env.local' });
const { Redis } = require('@upstash/redis');

async function testBufferAPI() {
  const token = process.env.BUFFER_ACCESS_TOKEN;
  const orgId = process.env.BUFFER_ORGANIZATION_ID;

  if (!token || !orgId) {
    console.log('\n❌ Buffer API credentials not set fully');
    return;
  }

  console.log('\n--- Testing Live Buffer GraphQL API ---');
  try {
    const query = `{
      channels(input: { organizationId: "${orgId}" }) {
        id
        name
        service
      }
    }`;

    const res = await fetch('https://api.buffer.com', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ query }),
    });

    if (!res.ok) {
      console.log(`❌ Buffer API returned HTTP ${res.status}: ${await res.text()}`);
      return;
    }

    const json = await res.json();
    if (json.errors && json.errors.length > 0) {
      console.log('❌ GraphQL Error from Buffer:', json.errors[0].message);
      return;
    }

    const channels = json.data.channels;
    console.log(`✅ Success! Retrieved ${channels.length} channels from Buffer API:`);
    channels.forEach(ch => {
      console.log(`  - ID: ${ch.id} | Name: ${ch.name} | Service: ${ch.service}`);
    });
  } catch (err) {
    console.log('❌ Exception during Buffer API check:', err.message);
  }
}

async function inspect() {
  console.log('--- Marketing V2 Redis & Buffer Diagnostic ---');
  console.log('BUFFER_ACCESS_TOKEN length:', process.env.BUFFER_ACCESS_TOKEN ? process.env.BUFFER_ACCESS_TOKEN.length : 'NOT SET');
  console.log('BUFFER_ORGANIZATION_ID:', process.env.BUFFER_ORGANIZATION_ID || 'NOT SET');

  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

  if (!url || !token) {
    console.log('❌ Upstash REST credentials not found in env');
    return;
  }

  const upstash = new Redis({ url, token });
  console.log('✅ Connected to Upstash Redis');

  // Scan keys
  console.log('\n--- Scanning Upstash Redis keys matching mktv2:* ---');
  const mktKeys = await upstash.keys('mktv2:*');
  console.log(`Found ${mktKeys.length} mktv2:* keys`);

  // Separate keys
  const contentKeys = mktKeys.filter(k => !k.includes(':lock:') && !k.includes(':used:'));
  const lockKeys = mktKeys.filter(k => k.includes(':lock:'));
  const usedKeys = mktKeys.filter(k => k.includes(':used:'));

  console.log(`  - Content keys (mktv2:slot:date): ${contentKeys.length}`);
  console.log(`  - Lock keys (mktv2:lock:slot:platform:date): ${lockKeys.length}`);
  console.log(`  - Used keys (spotlight라운드로빈): ${usedKeys.length}`);

  // Let's print recent content keys
  console.log('\n--- Recent Content Keys (up to 15) ---');
  contentKeys.sort().reverse().slice(0, 15).forEach(k => console.log('  ', k));

  // Print latest content key contents
  if (contentKeys.length > 0) {
    const latestKey = contentKeys.sort().reverse()[0];
    console.log(`\n--- Latest Content Package: ${latestKey} ---`);
    const val = await upstash.get(latestKey);
    if (val) {
      const parsed = typeof val === 'string' ? JSON.parse(val) : val;
      // Truncate text block for clean printing
      if (parsed.text) {
        Object.keys(parsed.text).forEach(lang => {
          if (parsed.text[lang] && parsed.text[lang].insight) {
            parsed.text[lang].insight = parsed.text[lang].insight.substring(0, 60) + '...';
          }
          if (parsed.text[lang] && parsed.text[lang].full) {
            parsed.text[lang].full = parsed.text[lang].full.substring(0, 60) + '...';
          }
        });
      }
      console.log(JSON.stringify(parsed, null, 2));
    }
  }

  // Print recent lock keys (shows actual dispatch history)
  console.log('\n--- Recent Active Locks (up to 20, shows actual posts sent today/yesterday) ---');
  lockKeys.sort().reverse().slice(0, 20).forEach(k => console.log('  ', k));

  // Let's check some of the lock dates to see what dates are locked
  const lockDates = {};
  lockKeys.forEach(k => {
    // format is mktv2:lock:slot:platform_lang_live_ticker:date
    // let's grab the date (last part)
    const parts = k.split(':');
    const datePart = parts[parts.length - 1];
    lockDates[datePart] = (lockDates[datePart] || 0) + 1;
  });
  console.log('\n--- Locked Dispatches per Date ---');
  Object.keys(lockDates).sort().reverse().forEach(d => {
    console.log(`  - Date ${d}: ${lockDates[d]} channels dispatched/locked`);
  });

  // Check the Spotlight Round-Robin pool
  if (usedKeys.length > 0) {
    console.log('\n--- Spotlight Round-Robin Pool Used Today ---');
    usedKeys.sort().reverse().slice(0, 10).forEach(k => console.log('  ', k));
  }

  await testBufferAPI();
}

inspect().catch(console.error);
