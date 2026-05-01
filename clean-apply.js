const fs = require('fs');
const path = require('path');
const { Redis } = require('@upstash/redis');

// --- ZABEZPIECZENIE ---
const I_KNOW_WHAT_I_AM_DOING = true; // ZMIEŃ NA true, ABY URUCHOMIĆ CZYSZCZENIE
// ----------------------

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

async function applyCleaning() {
    if (!I_KNOW_WHAT_I_AM_DOING) {
        console.log("🛑 Skrypt jest zablokowany. Otwórz clean-apply.js i zmień I_KNOW_WHAT_I_AM_DOING na true.");
        return;
    }

    console.log("⚠️ ROZPOCZYNAM FAKTYCZNE CZYSZCZENIE BAZY...");
    
    try {
        const allLogs = await redis.lrange('logs:global', 0, -1);
        const validIdRegex = /^(user\d+|unknown_\d+|user_err_\d+)$/;
        const validAgeGroups = ['18-30', '31-45', '46-60', '60+'];
        
        const cleanData = allLogs.filter(logStr => {
            const log = typeof logStr === 'string' ? JSON.parse(logStr) : logStr;
            const logContent = JSON.stringify(log).toLowerCase();
            
            const isGoodId = typeof log.userId === 'string' && validIdRegex.test(log.userId);
            const hasMalicious = logContent.includes("drop database") || logContent.includes("object object") || logContent.includes("hacked");
            
            let isBadDemo = false;
            if (log.action === 'demographics_collected' && log.details && log.details.ageGroup) {
                if (!validAgeGroups.includes(log.details.ageGroup)) isBadDemo = true;
            }

            return isGoodId && !hasMalicious && !isBadDemo;
        });

        console.log(`Wczytano: ${allLogs.length}, Po czyszczeniu: ${cleanData.length}`);
        
        console.log("Usuwam starą listę...");
        await redis.del('logs:global');
        
        console.log("Wgrywam czyste dane...");
        const stringified = cleanData.map(l => JSON.stringify(l));
        
        for (let i = 0; i < stringified.length; i += 100) {
            const chunk = stringified.slice(i, i + 100);
            await redis.rpush('logs:global', ...chunk);
        }

        console.log("✨ GOTOWE! Baza została oczyszczona ze złośliwych wpisów.");

    } catch (err) {
        console.error("❌ Błąd podczas czyszczenia:", err);
    }
}

applyCleaning();
