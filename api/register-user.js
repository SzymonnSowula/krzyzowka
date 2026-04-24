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
    res.json({ userId });
  } catch (error) {
    console.error('Error registering user:', error);
    // Zawsze zwracaj JSON, nawet przy błędzie, aby frontend nie dostał "unknown" bez powodu
    const fallbackId = `user_err_${Date.now()}`;
    res.status(200).json({ userId: fallbackId });
  }
};
