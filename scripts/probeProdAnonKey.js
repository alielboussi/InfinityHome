const fs = require('fs');
const path = require('path');

const file = process.argv[2] || path.join(__dirname, '..', 'main.prod.js');
const text = fs.readFileSync(file, 'utf8');
const re = /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;
const seen = new Set();
let match;
while ((match = re.exec(text))) {
  const token = match[0];
  if (seen.has(token)) continue;
  seen.add(token);
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString('utf8'));
    if (payload.ref === 'ayuufehhzsrinvtlmyqm' || payload.iss === 'supabase') {
      console.log(JSON.stringify({ role: payload.role, iat: payload.iat, ref: payload.ref, sig: token.split('.')[2].slice(0, 12) }));
    }
  } catch {}
}
