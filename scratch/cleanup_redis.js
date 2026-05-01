const { Redis } = require('@upstash/redis');
const fs = require('fs');
const path = require('path');

// Manually parse .env.local
const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const [key, value] = line.split('=');
    if (key && value) {
      process.env[key.trim()] = value.trim().replace(/"/g, '');
    }
  });
}

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

async function cleanup() {
  console.log('Starting Redis cleanup...');
  
  try {
    // 1. Find all backup keys
    const keys = await redis.keys('backup:state_before_*');
    console.log(`Found ${keys.length} backup snapshot keys.`);
    
    if (keys.length > 0) {
      // Delete keys in batches
      const batchSize = 100;
      for (let i = 0; i < keys.length; i += batchSize) {
        const batch = keys.slice(i, i + batchSize);
        await redis.del(...batch);
        console.log(`Deleted batch ${i / batchSize + 1} (${batch.length} keys)`);
      }
    }
    
    // 2. Trim global logs to last 5000 entries (if too many)
    const logCount = await redis.llen('logs:global');
    console.log(`Current logs:global count: ${logCount}`);
    if (logCount > 5000) {
      console.log('Trimming logs:global to last 5000 entries...');
      await redis.ltrim('logs:global', -5000, -1);
    }
    
    console.log('Cleanup finished successfully.');
  } catch (err) {
    console.error('Cleanup failed:', err);
  }
}

cleanup();
