// Zapisywanie logów do Upstash Redis
const { Redis } = require('@upstash/redis');

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { userId, action, details } = req.body;

    if (!userId || !action) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const logEntry = {
      timestamp: new Date().toISOString(),
      userId,
      action,
      details
    };

    const logStr = JSON.stringify(logEntry);

    // Bezpieczne dodawanie do list (obsługa błędu WRONGTYPE jeśli klucze są starego typu)
    const pushToRedis = async (key, val) => {
      try {
        await redis.rpush(key, val);
      } catch (err) {
        if (err.message && err.message.includes('WRONGTYPE')) {
          console.warn(`Key ${key} has wrong type, resetting to list...`);
          await redis.del(key);
          await redis.rpush(key, val);
        } else {
          throw err;
        }
      }
    };

    await Promise.all([
      pushToRedis(`logs:${userId}`, logStr),
      pushToRedis('logs:global', logStr)
    ]);

    res.json({ success: true });
  } catch (error) {
    console.error('Error writing log:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};
