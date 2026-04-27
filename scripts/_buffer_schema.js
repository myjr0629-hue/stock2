async function main() {
  const token = 'afILPK3AZJt0aOMG03pXv-L7cALR_tQgYZlMXln3ORX';
  
  // Get createPost mutation schema
  const q = `{
    __type(name: "Mutation") {
      fields {
        name
        args {
          name
          type {
            name
            kind
            ofType { name kind }
          }
        }
      }
    }
  }`;
  
  const r = await fetch('https://api.buffer.com', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ query: q }),
  });
  
  const d = await r.json();
  const createPost = d.data.__type.fields.find(f => f.name === 'createPost');
  console.log('createPost mutation args:');
  createPost.args.forEach(a => {
    const typeName = a.type.name || a.type.ofType?.name || JSON.stringify(a.type);
    console.log(`  - ${a.name}: ${typeName} (${a.type.kind})`);
  });

  // Get input type details
  for (const a of createPost.args) {
    const inputTypeName = a.type.name || a.type.ofType?.name;
    if (!inputTypeName) continue;
    
    const q2 = `{ __type(name: "${inputTypeName}") { name kind inputFields { name type { name kind ofType { name kind ofType { name } } } } } }`;
    const r2 = await fetch('https://api.buffer.com', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ query: q2 }),
    });
    const d2 = await r2.json();
    if (d2.data?.__type?.inputFields) {
      console.log(`\n${inputTypeName} fields:`);
      d2.data.__type.inputFields.forEach(f => {
        const t = f.type.name || f.type.ofType?.name || f.type.ofType?.ofType?.name || JSON.stringify(f.type);
        console.log(`  - ${f.name}: ${t} (${f.type.kind})`);
      });
    }
  }
  
  // Also get return type
  const retQ = `{ __type(name: "Mutation") { fields(includeDeprecated: true) { name type { name kind ofType { name } } } } }`;
  const retR = await fetch('https://api.buffer.com', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ query: retQ }),
  });
  const retD = await retR.json();
  const cp = retD.data.__type.fields.find(f => f.name === 'createPost');
  console.log('\ncreatePost returns:', cp.type.name || cp.type.ofType?.name);
}

main();
