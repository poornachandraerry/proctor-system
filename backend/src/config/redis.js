const logger = require('../utils/logger');

// Redis is optional — app works fully without it
// To enable: install Redis and set REDIS_HOST in .env
let redisClient = null;
let redisAvailable = false;

async function connectRedis() {
  // Skip Redis entirely if not configured
  const host = process.env.REDIS_HOST || 'localhost';
  const enableRedis = process.env.REDIS_ENABLED === 'true';

  if (!enableRedis) {
    logger.info('Redis disabled (set REDIS_ENABLED=true in .env to enable caching)');
    return;
  }

  try {
    const { createClient } = require('redis');
    redisClient = createClient({
      socket: {
        host,
        port: parseInt(process.env.REDIS_PORT) || 6379,
        reconnectStrategy: (retries) => {
          if (retries > 3) {
            logger.warn('Redis unavailable after 3 attempts — running without cache');
            redisAvailable = false;
            return false; // stop retrying
          }
          return Math.min(retries * 500, 2000);
        }
      },
      password: process.env.REDIS_PASSWORD || undefined
    });

    redisClient.on('error', () => {
      // Silently ignore — already handled by reconnectStrategy
    });

    redisClient.on('ready', () => {
      redisAvailable = true;
      logger.info('Redis connected successfully');
    });

    await redisClient.connect();
  } catch (error) {
    logger.info('Redis not available — running without cache (this is fine)');
    redisClient = null;
    redisAvailable = false;
  }
}

async function getCache(key) {
  if (!redisAvailable || !redisClient) return null;
  try { const d = await redisClient.get(key); return d ? JSON.parse(d) : null; } catch { return null; }
}

async function setCache(key, value, ttl = 300) {
  if (!redisAvailable || !redisClient) return;
  try { await redisClient.setEx(key, ttl, JSON.stringify(value)); } catch {}
}

async function deleteCache(key) {
  if (!redisAvailable || !redisClient) return;
  try { await redisClient.del(key); } catch {}
}

async function setSession(key, value, ttl = 3600) {
  if (!redisAvailable || !redisClient) return;
  try { await redisClient.setEx(`session:${key}`, ttl, JSON.stringify(value)); } catch {}
}

async function getSession(key) {
  if (!redisAvailable || !redisClient) return null;
  try { const d = await redisClient.get(`session:${key}`); return d ? JSON.parse(d) : null; } catch { return null; }
}

async function deleteSession(key) {
  if (!redisAvailable || !redisClient) return;
  try { await redisClient.del(`session:${key}`); } catch {}
}

module.exports = { connectRedis, getCache, setCache, deleteCache, setSession, getSession, deleteSession };
