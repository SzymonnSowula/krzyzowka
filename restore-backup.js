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

async function restoreBackup() {
    const backupPath = path.join(__dirname, 'backups', 'backup.json');
    if (!fs.existsSync(backupPath)) {
        console.error("❌ Nie znaleziono pliku backup.json w folderze backups!");
        return;
    }

    console.log("📂 Wczytywanie pliku backupu...");
    const data = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
    console.log(`✅ Wczytano ${data.length} logów z backup.json.`);

    // Pogrupuj logi po userId
    const userLogs = {};
    const globalLogs = [];

    for (const log of data) {
        const strLog = JSON.stringify(log);
        globalLogs.push(strLog);
        
        if (log.userId) {
            if (!userLogs[log.userId]) {
                userLogs[log.userId] = [];
            }
            userLogs[log.userId].push(strLog);
        }
    }

    console.log("🗑️ Czyszczenie starej listy logs:global...");
    await redis.del('logs:global');
    
    console.log("⬆️ Wgrywanie logs:global (partiami)...");
    const CHUNK_SIZE = 100; // Małe paczki, żeby nie przekroczyć limitu Upstash REST API
    for (let i = 0; i < globalLogs.length; i += CHUNK_SIZE) {
        const chunk = globalLogs.slice(i, i + CHUNK_SIZE);
        await redis.rpush('logs:global', ...chunk);
        if (i % 2000 === 0 && i > 0) {
            console.log(`   Wgrano ${i} / ${globalLogs.length} logów globalnych...`);
        }
    }
    console.log(`✅ Wgrano wszystkie ${globalLogs.length} logów do logs:global.`);

    console.log("⬆️ Wgrywanie list dla poszczególnych użytkowników...");
    const userIds = Object.keys(userLogs);
    let usersProcessed = 0;
    
    for (const userId of userIds) {
        const key = `logs:${userId}`;
        await redis.del(key);
        const logs = userLogs[userId];
        
        for (let i = 0; i < logs.length; i += CHUNK_SIZE) {
            const chunk = logs.slice(i, i + CHUNK_SIZE);
            await redis.rpush(key, ...chunk);
        }
        usersProcessed++;
        if (usersProcessed % 10 === 0) {
            console.log(`   Zaktualizowano dane dla ${usersProcessed} / ${userIds.length} użytkowników...`);
        }
    }

    console.log("✨ PRZYWRACANIE BACKUPU ZAKOŃCZONE SUKCESEM!");
}

restoreBackup().catch(console.error);
