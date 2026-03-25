const Redis = require('ioredis');

const redis = new Redis({
  host:          process.env.REDIS_HOST     || '127.0.0.1',
  port:          parseInt(process.env.REDIS_PORT) || 6379,
  password:      process.env.REDIS_PASSWORD || undefined,
  retryStrategy: (times) => Math.min(times * 50, 2000),
  lazyConnect:   true,
});

redis.on('connect',      ()    => console.log('✅ Redis connected'));
redis.on('error',        (err) => console.warn('⚠️  Redis error:', err.message));
redis.on('reconnecting', ()    => console.log('🔄 Redis reconnecting...'));

module.exports = redis;
