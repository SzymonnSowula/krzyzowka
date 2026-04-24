// Pobieranie wszystkich logów (dla dashboarda)
const { Redis } = require('@upstash/redis');

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    let logs = [];
    
    // Próbujemy pobrać jako listę (nowy format)
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
      console.warn('logs:global is not a list, trying string fallback');
    }

    // Jeśli lista jest pusta, sprawdźmy czy nie ma tam starego formatu (string)
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

    res.json(logs);
  } catch (error) {
    console.error('Error reading logs:', error);
    // Zawsze zwracaj JSON, nawet przy błędzie, aby uniknąć błędów parsowania w dashboardzie
    res.status(200).json([]); 
  }
};
