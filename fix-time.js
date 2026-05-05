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

async function fixUserTime(targetUser, newTotalMinutes) {
    console.log(`Pobieram dane dla użytkownika ${targetUser}...`);
    
    try {
        // 1. Pobierz logi globalne (z paginacją, aby obejść limit 1MB Upstash REST API)
        let allLogs = [];
        let startIndex = 0;
        const chunkSize = 500;
        
        while (true) {
            const chunk = await redis.lrange('logs:global', startIndex, startIndex + chunkSize - 1);
            if (!chunk || chunk.length === 0) break;
            allLogs = allLogs.concat(chunk);
            if (chunk.length < chunkSize) break;
            startIndex += chunkSize;
        }        
        // 2. Znajdź logi tego użytkownika
        const userLogsIndices = [];
        const parsedLogs = allLogs.map((logStr, index) => {
            const log = typeof logStr === 'string' ? JSON.parse(logStr) : logStr;
            if (log.userId === targetUser) {
                userLogsIndices.push(index);
            }
            return log;
        });

        if (userLogsIndices.length < 2) {
            console.log(`Nie znaleziono wystarczającej liczby logów dla ${targetUser}.`);
            return;
        }

        const firstLogIndex = userLogsIndices[0];
        const lastLogIndex = userLogsIndices[userLogsIndices.length - 1];
        
        const firstLog = parsedLogs[firstLogIndex];
        const lastLog = parsedLogs[lastLogIndex];

        const oldStart = new Date(firstLog.timestamp);
        const end = new Date(lastLog.timestamp);
        const oldDiffMinutes = (end - oldStart) / 60000;

        console.log(`Stary czas dla ${targetUser}: ${oldDiffMinutes.toFixed(1)} minut.`);

        // Oblicz nowy czas startu (od tyłu, na podstawie ostatniego logu)
        const newStartMs = end.getTime() - (newTotalMinutes * 60000);
        const newStart = new Date(newStartMs);

        console.log(`Zmieniam czas pierwszego zdarzenia z ${oldStart.toISOString()} na ${newStart.toISOString()}...`);

        // Podmień timestamp w pierwszym logu
        parsedLogs[firstLogIndex].timestamp = newStart.toISOString();

        // 3. Zaktualizuj JEDEN konkretny element w logs:global używając LSET (w 100% bezpieczne)
        console.log(`Aktualizuję log w logs:global na indeksie ${firstLogIndex}...`);
        await redis.lset('logs:global', firstLogIndex, JSON.stringify(parsedLogs[firstLogIndex]));

        // 4. Zaktualizuj pierwszy log w prywatnej liście logs:targetUser (też używając LSET)
        console.log(`Aktualizuję log w prywatnej liście logs:${targetUser}...`);
        const [userFirstLogStr] = await redis.lrange(`logs:${targetUser}`, 0, 0);
        if (userFirstLogStr) {
            const userFirstLog = typeof userFirstLogStr === 'string' ? JSON.parse(userFirstLogStr) : userFirstLogStr;
            userFirstLog.timestamp = newStart.toISOString();
            await redis.lset(`logs:${targetUser}`, 0, JSON.stringify(userFirstLog));
        }

        console.log(`✨ GOTOWE! Czas użytkownika ${targetUser} został pomyślnie zmieniony na ~${newTotalMinutes} minut.`);

    } catch (err) {
        console.error("❌ Błąd podczas zmiany czasu:", err);
    }
}

// URUCHOMIENIE
// Przykładowe użycie: zmieniamy czas user69 na 7.8 minuty
const userToFix = process.argv[2] || 'user69';
const targetMinutes = parseFloat(process.argv[3]) || 7.8;

fixUserTime(userToFix, targetMinutes);
