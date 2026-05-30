const requireDotenv = require('dotenv');
requireDotenv.config({ path: '.env.local' });

async function queryBufferREST() {
  const token = process.env.BUFFER_ACCESS_TOKEN;
  const orgId = process.env.BUFFER_ORGANIZATION_ID;

  if (!token) {
    console.log('❌ Buffer API token not found');
    return;
  }

  console.log('--- Inspecting Live Buffer REST API ---');

  // Let's first get the profiles (channels)
  let profiles = [];
  try {
    const res = await fetch(`https://api.bufferapp.com/1/profiles.json?access_token=${token}`);
    if (!res.ok) {
      console.log(`❌ Failed to fetch profiles: HTTP ${res.status}`);
      return;
    }
    profiles = await res.json();
    console.log(`Successfully fetched ${profiles.length} profiles from REST API.`);
  } catch (err) {
    console.error('Exception fetching profiles:', err.message);
    return;
  }

  // Query details for each profile
  for (const prof of profiles) {
    console.log(`\n======================================================`);
    console.log(`Profile: ${prof.formatted_username} | Service: ${prof.service} | ID: ${prof.id}`);
    console.log(`Status: ${prof.disabled ? '⚠️ DISABLED' : '✅ ACTIVE'}`);
    console.log(`======================================================`);

    try {
      // 1. Fetch pending updates (queue)
      const resPending = await fetch(`https://api.bufferapp.com/1/profiles/${prof.id}/updates/pending.json?access_token=${token}&limit=5`);
      if (resPending.ok) {
        const data = await resPending.json();
        console.log(`  🕒 PENDING QUEUE (Count: ${data.total}):`);
        if (data.updates.length === 0) {
          console.log('     [No pending updates]');
        } else {
          data.updates.forEach(up => {
            console.log(`     - ID: ${up.id} | DueAt: ${new Date(up.due_at * 1000).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })} | Status: ${up.status}`);
            console.log(`       Text: ${up.text ? up.text.substring(0, 100).replace(/\n/g, ' ') : '[No Text]'}...`);
          });
        }
      } else {
        console.log(`  ❌ Failed to fetch pending updates: HTTP ${resPending.status}`);
      }

      // 2. Fetch sent updates
      const resSent = await fetch(`https://api.bufferapp.com/1/profiles/${prof.id}/updates/sent.json?access_token=${token}&limit=5`);
      if (resSent.ok) {
        const data = await resSent.json();
        console.log(`  ✅ SENT HISTORY (Count: ${data.total}):`);
        if (data.updates.length === 0) {
          console.log('     [No sent updates]');
        } else {
          data.updates.forEach(up => {
            console.log(`     - ID: ${up.id} | SentAt: ${new Date(up.sent_at * 1000).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })} | Status: ${up.status}`);
            console.log(`       Text: ${up.text ? up.text.substring(0, 100).replace(/\n/g, ' ') : '[No Text]'}...`);
          });
        }
      } else {
        console.log(`  ❌ Failed to fetch sent updates: HTTP ${resSent.status}`);
      }

    } catch (err) {
      console.log(`  ❌ Exception fetching details for profile ${prof.id}:`, err.message);
    }
  }
}

queryBufferREST().catch(console.error);
