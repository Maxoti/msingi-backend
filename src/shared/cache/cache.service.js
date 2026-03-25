const redis = require('./redis.client');

const TTL = {
  students:  5  * 60,
  classes:   10 * 60,
  terms:     30 * 60,
  staff:     10 * 60,
  dashboard: 2  * 60,
  exams:     5  * 60,
};

const get = async (key) => {
  try {
    const val = await redis.get(key);
    return val ? JSON.parse(val) : null;
  } catch { return null; }
};

const set = async (key, data, ttlSeconds) => {
  try {
    await redis.setex(key, ttlSeconds, JSON.stringify(data));
  } catch {}
};

const del = async (...keys) => {
  try { await redis.del(...keys); } catch {}
};

const delPattern = async (pattern) => {
  try {
    const stream = redis.scanStream({ match: pattern, count: 100 });
    const keys   = [];
    stream.on('data', batch => keys.push(...batch));
    await new Promise((resolve, reject) => {
      stream.on('end',   resolve);
      stream.on('error', reject);
    });
    if (keys.length) await redis.del(...keys);
  } catch {}
};

module.exports = { get, set, del, delPattern, TTL };
