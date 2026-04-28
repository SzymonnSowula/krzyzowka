const fs = require('fs');
const path = require('path');
const { Redis } = require('@upstash/redis');

// Prosta funkcja do ładowania zmiennych środowiskowych z pliku .env.local
function loadEnv() {
  try {
    const envPath = path.join(__dirname, '.env.local');
    const envContent = fs.readFileSync(envPath, 'utf-8');
    envContent.split('\n').forEach(line => {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        let key = match[1];
        let value = match[2] || '';
        // Usuń cudzysłowy jeśli są
        value = value.replace(/^['"](.*)['"]$/, '$1');
        process.env[key] = value;
      }
    });
  } catch (error) {
    console.log('Nie udało się załadować .env.local (plik może nie istnieć). Próbuję pobrać ze zmiennych systemowych.');
  }
}

// Uruchom ładowanie zmiennych
loadEnv();

// Ustalenie URL i Tokenu bazy (wsparcie dla Vercel KV i klasycznego Upstash)
const redisUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

if (!redisUrl || !redisToken) {
  console.error('BŁĄD: Brak kluczy dostępu do bazy Redis w pliku .env.local!');
  console.error('Upewnij się, że masz KV_REST_API_URL oraz KV_REST_API_TOKEN w swoim .env.local');
  process.exit(1);
}

// Inicjalizacja klienta Redis
const redis = new Redis({
  url: redisUrl,
  token: redisToken,
});

async function runBackup() {
  console.log('Rozpoczynam pobieranie danych z produkcyjnej bazy Redis...');
  
  try {
    let logs = [];
    
    // Pobranie danych tak samo jak robi to API
    try {
      const listLogs = await redis.lrange('logs:global', 0, -1);
      if (listLogs && listLogs.length > 0) {
        logs = listLogs.map(log => {
          try {
            return typeof log === 'string' ? JSON.parse(log) : log;
          } catch (e) {
            return log;
          }
        });
      }
    } catch (e) {
      console.log('Ostrzeżenie: logs:global nie jest listą. Próbuję starego formatu...');
    }

    if (logs.length === 0) {
      const oldLogs = await redis.get('logs:global');
      if (oldLogs) {
        if (Array.isArray(oldLogs)) {
          logs = oldLogs;
        } else if (typeof oldLogs === 'string') {
          try {
            const parsed = JSON.parse(oldLogs);
            if (Array.isArray(parsed)) logs = parsed;
          } catch (e) {}
        }
      }
    }

    if (logs.length === 0) {
      console.log('Brak danych do skopiowania. Baza jest pusta.');
      return;
    }

    console.log(`Pobrano ${logs.length} rekordów.`);

    // Stworzenie folderu backups jeśli nie istnieje
    const backupDir = path.join(__dirname, 'backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir);
    }

    // Wygenerowanie nazwy pliku z obecną datą i czasem
    const date = new Date();
    const timestamp = date.toISOString().replace(/T/, '_').replace(/:/g, '-').split('.')[0];
    const filename = `backup_${timestamp}.json`;
    const filePath = path.join(backupDir, filename);

    // Zapisanie do pliku
    fs.writeFileSync(filePath, JSON.stringify(logs, null, 2), 'utf-8');
    
    console.log('=============================================');
    console.log(`SUKCES! Zapisano kopię zapasową w:`);
    console.log(filePath);
    console.log('=============================================');

  } catch (error) {
    console.error('Wystąpił błąd podczas robienia backupu:', error);
  }
}

runBackup();
