const requireDotenv = require('dotenv');
requireDotenv.config({ path: '.env.local' });

async function queryBuffer() {
  const token = process.env.BUFFER_ACCESS_TOKEN;
  const orgId = process.env.BUFFER_ORGANIZATION_ID;

  if (!token || !orgId) {
    console.log('❌ Buffer API credentials not set fully');
    return;
  }

  console.log('--- Inspecting Live Buffer Queue & Sent History ---');
  
  // 1. First, fetch all channels to get their IDs and service names
  let channels = [];
  try {
    const res = await fetch('https://api.buffer.com', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        query: `{
          channels(input: { organizationId: "${orgId}" }) {
            id
            name
            service
          }
        }`
      }),
    });
    const json = await res.json();
    channels = json.data.channels;
    console.log(`Retrieved ${channels.length} channels.`);
  } catch (err) {
    console.error('Failed to fetch channels:', err.message);
    return;
  }

  // 2. Query each channel for its pending queue and sent history
  for (const ch of channels) {
    console.log(`\n======================================================`);
    console.log(`Channel: ${ch.name} (${ch.service}) | ID: ${ch.id}`);
    console.log(`======================================================`);

    try {
      // Buffer GraphQL supports query for a channel's posts (queued vs sent)
      // Let's query queued posts
      const resQueue = await fetch('https://api.buffer.com', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          query: `{
            node(id: "${ch.id}") {
              ... on Channel {
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
            }
          }`
        }),
      });

      const json = await resQueue.json();
      
      if (json.errors) {
        console.log(`  ❌ GraphQL Error: ${json.errors[0].message}`);
        continue;
      }

      const node = json.data.node;
      if (!node) {
        console.log('  ⚠️ Channel node not found in GraphQL response');
        continue;
      }

      // Queued Posts
      const queued = node.queuedPosts;
      console.log(`  🕒 QUEUED POSTS: totalCount = ${queued.totalCount}`);
      if (queued.nodes.length === 0) {
        console.log('     [No pending posts in queue]');
      } else {
        queued.nodes.forEach(p => {
          console.log(`     - ID: ${p.id} | DueAt: ${p.dueAt} | State: ${p.state}`);
          console.log(`       Text: ${p.text.substring(0, 100)}...`);
        });
      }

      // Sent Posts
      const sent = node.sentPosts;
      console.log(`  ✅ SENT POSTS: totalCount = ${sent.totalCount}`);
      if (sent.nodes.length === 0) {
        console.log('     [No recently sent posts]');
      } else {
        sent.nodes.forEach(p => {
          console.log(`     - ID: ${p.id} | SentAt: ${p.sentAt} | State: ${p.state}`);
          console.log(`       Text: ${p.text.substring(0, 100)}...`);
        });
      }

    } catch (err) {
      console.log(`  ❌ Exception querying channel ${ch.id}:`, err.message);
    }
  }
}

queryBuffer().catch(console.error);
