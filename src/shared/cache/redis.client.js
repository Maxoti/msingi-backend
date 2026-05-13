const Redis = require('ioredis');

const redis = new Redis({
  host:                 process.env.REDIS_HOST || '127.0.0.1',
  port:                 parseInt(process.env.REDIS_PORT) || 6379,
  password:             process.env.REDIS_PASSWORD || undefined,
  lazyConnect:          true,
  enableOfflineQueue:   false,      // ← don't queue commands when Redis is down
  maxRetriesPerRequest: 1,          // ← fail fast instead of retrying forever
  retryStrategy: (times) => {
    if (times > 3) return 10000;     // ← give up after 3 attempts, stop reconnecting
    return Math.min(times * 200, 1000);
  },
});

redis.on('connect',      ()    => console.log(' Redis connected'));
redis.on('error',        (err) => console.warn('  Redis error:', err.message));
redis.on('reconnecting', ()    => console.log(' Redis reconnecting...'));

module.exports = redis;