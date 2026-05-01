const fs = require('fs');
const path = require('path');
const { Redis } = require('@upstash/redis');

// Funkcja do ładowania zmiennych środowiskowych z pliku .env.local
function loadEnv() {
  try {
    const envPath = path.join(__dirname, '.env.local');
    if (!fs.existsSync(envPath)) {
        console.error('BŁĄD: Brak pliku .env.local!');
        process.exit(1);
    }
    const envContent = fs.readFileSync(envPath, 'utf-8');
    envContent.split('\n').forEach(line => {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        let key = match[1];
        let value = (match[2] || '').trim().replace(/^['"](.*)['"]$/, '$1');
        process.env[key] = value;
      }
    });
  } catch (error) {
    console.error('Błąd podczas ładowania .env.local:', error);
  }
}

loadEnv();

const redisUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

if (!redisUrl || !redisToken) {
  console.error('BŁĄD: Brak kluczy dostępu do bazy Redis!');
  process.exit(1);
}

const redis = new Redis({
  url: redisUrl,
  token: redisToken,
});

async function runRestore() {
  const backupFile = path.join(__dirname, 'backups', 'backup.json');
  
  if (!fs.existsSync(backupFile)) {
    console.error(`BŁĄD: Nie znaleziono pliku ${backupFile}`);
    return;
  }

  console.log(`Wczytuję dane z ${backupFile}...`);
  const rawData = fs.readFileSync(backupFile, 'utf-8');
  let logs = [];
  
  try {
    logs = JSON.parse(rawData);
  } catch (e) {
    console.error('BŁĄD: Niepoprawny format JSON w pliku backupu!', e);
    return;
  }

  if (!Array.isArray(logs)) {
    console.error('BŁĄD: Backup nie jest tablicą!');
    return;
  }

  console.log(`Pobrano ${logs.length} rekordów z pliku.`);
  
  console.log('Czyścisz obecną listę logs:global w Redis...');
  await redis.del('logs:global');

  console.log('Wgrywam dane do Redis (w paczkach po 100)...');
  const stringified = logs.map(l => JSON.stringify(l));
  
  for (let i = 0; i < stringified.length; i += 100) {
    const chunk = stringified.slice(i, i + 100);
    await redis.rpush('logs:global', ...chunk);
    if (i % 1000 === 0) {
      console.log(`Przesłano ${i} / ${stringified.length}...`);
    }
  }

  console.log('=============================================');
  console.log('SUKCES! Dane z backup.json zostały przywrócone.');
  console.log(`Wgrano łącznie: ${logs.length} rekordów.`);
  console.log('=============================================');
}

runRestore();
