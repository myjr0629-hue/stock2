const requireDotenv = require('dotenv');
requireDotenv.config({ path: '.env.local' });

const token = process.env.BUFFER_ACCESS_TOKEN;

if (!token) {
  console.log('❌ Buffer credentials not fully set');
  process.exit(1);
}

const query = `
  query {
    __type(name: "CreatePostInput") {
      name
      inputFields {
        name
        type {
          name
          kind
          ofType {
            name
            kind
          }
        }
      }
    }
  }
`;

async function run() {
  console.log('--- Inspecting AssetInput Type in Buffer GraphQL Schema ---');
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
      console.log(`❌ HTTP Error: ${res.status}`);
      return;
    }

    const json = await res.json();
    console.log('Introspection Result:', JSON.stringify(json, null, 2));

  } catch (err) {
    console.error('❌ Exception:', err.message);
  }
}

run();
