const fs = require('fs');
const path = require('path');
const { Redis } = require('@upstash/redis');

function loadEnv() {
  try {
    const envPath = path.join(__dirname, '.env.local');
    if (!fs.existsSync(envPath)) return;
    const envContent = fs.readFileSync(envPath, 'utf-8');
    envContent.split('\n').forEach(line => {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        let key = match[1];
        let value = (match[2] || '').trim().replace(/^['"](.*)['"]$/, '$1');
        process.env[key] = value;
      }
    });
  } catch (e) {}
}

loadEnv();

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN,
});

async function updateCounter() {
    console.log('Ustawiam licznik użytkowników w Redis na 199 (następny użytkownik to user200)...');
    await redis.set('user_counter', 199);
    console.log('✅ Gotowe w Redis.');
}

updateCounter();
