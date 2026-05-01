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

async function runDryRun() {
    console.log("🚀 [TRYB TESTOWY V2] Rozpoczynam głęboką analizę bazy...");
    
    try {
        const allLogs = await redis.lrange('logs:global', 0, -1);
        const validIdRegex = /^(user\d+|unknown_\d+|user_err_\d+)$/;
        const validAgeGroups = ['18-30', '31-45', '46-60', '60+'];
        
        const keep = [];
        const discard = [];

        for (const logStr of allLogs) {
            const log = typeof logStr === 'string' ? JSON.parse(logStr) : logStr;
            const logContent = JSON.stringify(log).toLowerCase();
            
            // 1. Sprawdzamy ID
            const isGoodId = typeof log.userId === 'string' && validIdRegex.test(log.userId);
            
            // 2. Szukamy złośliwych fraz w całej treści
            const hasMaliciousStrings = 
                logContent.includes("drop database") || 
                logContent.includes("object object") || 
                logContent.includes("<script") ||
                logContent.includes("hacked");

            // 3. Sprawdzamy czy wiek jest poprawny (jeśli to log z demografią)
            let isBadDemographics = false;
            if (log.action === 'demographics_collected' && log.details && log.details.ageGroup) {
                if (!validAgeGroups.includes(log.details.ageGroup)) {
                    isBadDemographics = true;
                }
            }

            if (isGoodId && !hasMaliciousStrings && !isBadDemographics) {
                keep.push(log);
            } else {
                discard.push(log);
            }
        }

        console.log("\n-------------------------------------------");
        console.log(`✅ ZOSTANIE:     ${keep.length} wpisów`);
        console.log(`❌ DO USUNIĘCIA: ${discard.length} wpisów`);
        console.log("-------------------------------------------");

        if (discard.length > 0) {
            fs.writeFileSync('do_wyrzucenia.json', JSON.stringify(discard, null, 2));
            console.log(`📝 Zapisano listę ${discard.length} śmieci do: do_wyrzucenia.json`);
            console.log("\nPrzykłady usuniętych (ostatnie 5):");
            discard.slice(-5).forEach(d => console.log(` - [${d.userId}] ${JSON.stringify(d.details || d.action)}`));
        }

    } catch (err) {
        console.error("❌ Błąd:", err);
    }
}

runDryRun();
