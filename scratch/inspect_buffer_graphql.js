const requireDotenv = require('dotenv');
requireDotenv.config({ path: '.env.local' });

const token = process.env.BUFFER_ACCESS_TOKEN;
const orgId = process.env.BUFFER_ORGANIZATION_ID;

if (!token || !orgId) {
  console.log('❌ Buffer credentials not fully set');
  process.exit(1);
}

async function run() {
  console.log('--- Querying Buffer GraphQL API (All Channels) ---');
  const query = `{
    channels(input: { organizationId: "${orgId}" }) {
      id
      name
      service
      queuedPosts(input: { limit: 5 }) {
        totalCount
        nodes {
          id
          text
          dueAt
          state
        }
      }
      sentPosts(input: { limit: 5 }) {
        totalCount
        nodes {
          id
          text
          sentAt
          state
        }
      }
    }
  }`;

  try {
    const res = await fetch('https://api.buffer.com', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ query }),
    });

    if (!res.ok) {
      console.log(`❌ HTTP Error: ${res.status} - ${await res.text()}`);
      return;
    }

    const json = await res.json();
    if (json.errors) {
      console.log('❌ GraphQL Errors:', json.errors);
      return;
    }

    const channels = json.data.channels;
    console.log(`✅ Success! Retrieved ${channels.length} channels.`);

    for (const ch of channels) {
      console.log(`\n======================================================`);
      console.log(`Channel: ${ch.name} (${ch.service}) | ID: ${ch.id}`);
      console.log(`======================================================`);

      const q = ch.queuedPosts;
      console.log(`  🕒 QUEUED POSTS: totalCount = ${q ? q.totalCount : 'N/A'}`);
      if (q && q.nodes) {
        if (q.nodes.length === 0) {
          console.log('     [No pending posts in queue]');
        } else {
          q.nodes.forEach(p => {
            console.log(`     - ID: ${p.id} | DueAt: ${p.dueAt} | State: ${p.state}`);
            console.log(`       Text: ${p.text.substring(0, 100).replace(/\n/g, ' ')}...`);
          });
        }
      }

      const s = ch.sentPosts;
      console.log(`  ✅ SENT POSTS: totalCount = ${s ? s.totalCount : 'N/A'}`);
      if (s && s.nodes) {
        if (s.nodes.length === 0) {
          console.log('     [No recently sent posts]');
        } else {
          s.nodes.forEach(p => {
            console.log(`     - ID: ${p.id} | SentAt: ${p.sentAt} | State: ${p.state}`);
            console.log(`       Text: ${p.text.substring(0, 100).replace(/\n/g, ' ')}...`);
          });
        }
      }
    }

  } catch (err) {
    console.error('❌ Exception:', err.message);
  }
}

run();
