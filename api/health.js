// Keep-alive endpoint dla crona
const { Redis } = require('@upstash/redis');

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

module.exports = async function handler(req, res) {
  try {
    // Sprawdź połączenie z Redis
    await redis.set('health:last_check', new Date().toISOString());

    const count = await redis.get('user_counter') || 0;
    const totalLogs = await redis.llen('logs:global');

    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      users: count,
      totalLogs: totalLogs
    });
  } catch (error) {
    res.status(500).json({ status: 'error', error: error.message });
  }
};
