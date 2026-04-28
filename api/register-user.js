// Rejestracja nowego użytkownika z użyciem Upstash Redis
const { Redis } = require('@upstash/redis');

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    let count;
    try {
      count = await redis.incr('user_counter');
    } catch (err) {
      // Jeśli incr nie działa (bo np. w kluczu jest obiekt JSON zamiast liczby)
      console.warn('Incr failed, resetting counter');
      await redis.del('user_counter');
      count = await redis.incr('user_counter');
    }

    const userId = `user${count}`;

    // --- AUTOMATYCZNY BACKUP (SNAPSHOT) ---
    try {
      let logs = [];
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
        // Fallback dla starego formatu (string) jeśli lrange zawiedzie
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

      if (logs.length > 0) {
        // Zapisanie migawki całej bazy pod nowym, bezpiecznym kluczem
        const snapshotKey = `backup:state_before_${userId}`;
        await redis.set(snapshotKey, JSON.stringify(logs));
        console.log(`Utworzono snapshot bazy: ${snapshotKey}`);
      }
    } catch (backupError) {
      console.error('Błąd podczas tworzenia snapshotu bazy:', backupError);
      // Nie przerywamy procesu rejestracji w przypadku błędu backupu
    }
    // --------------------------------------

    res.json({ userId });
  } catch (error) {
    console.error('Error registering user:', error);
    // Zawsze zwracaj JSON, nawet przy błędzie, aby frontend nie dostał "unknown" bez powodu
    const fallbackId = `user_err_${Date.now()}`;
    res.status(200).json({ userId: fallbackId });
  }
};
