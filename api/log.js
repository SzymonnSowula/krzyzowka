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

  // Zabezpieczenie kluczem API (proste, ale utrudnia botom życie)
  const apiKey = req.headers['x-api-key'];
  const expectedKey = process.env.API_SECRET_KEY;
  if (expectedKey && apiKey !== expectedKey) {
    return res.status(403).json({ error: 'Forbidden: Invalid API Key' });
  }

  try {
    const { userId, action, details } = req.body;

    if (!userId || !action) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Walidacja formatu userId aby zapobiec fałszywym kontom (np. 'user33 drop database xd')
    if (typeof userId !== 'string' || !/^(user\d+|unknown_\d+|user_err_\d+)$/.test(userId)) {
      return res.status(400).json({ error: 'Invalid userId format' });
    }

    // Walidacja akcji (zabezpieczenie długości)
    if (typeof action !== 'string' || action.length > 50) {
      return res.status(400).json({ error: 'Invalid action format' });
    }

    // Weryfikacja czy userId istnieje w systemie (czy nie jest z przyszłości)
    if (userId.startsWith('user')) {
        try {
            const currentCounter = await redis.get('user_counter');
            const userNum = parseInt(userId.replace('user', ''));
            if (currentCounter && userNum > parseInt(currentCounter) + 10) { // Margines 10 na opóźnienia
                return res.status(400).json({ error: 'User does not exist' });
            }
        } catch (e) {}
    }

    // Zabezpieczenie przed ogromnymi payloadami
    if (details) {
      const detailsStr = JSON.stringify(details);
      if (detailsStr.length > 5000) { // Limit ~5KB
        return res.status(400).json({ error: 'Payload too large' });
      }
    }

    // Prosty rate-limiting per użytkownik (zapobiega spamowaniu bazy przez boty)
    try {
      const rateLimitKey = `ratelimit:log:${userId}`;
      const requests = await redis.incr(rateLimitKey);
      if (requests === 1) {
        await redis.expire(rateLimitKey, 10); // okno 10 sekund
      }
      if (requests > 100) {
        return res.status(429).json({ error: 'Too many requests' });
      }
    } catch (err) {
      console.warn('Rate limit error, continuing...', err);
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
