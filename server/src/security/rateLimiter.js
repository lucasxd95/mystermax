import config from '../core/config.js';

/**
 * Simple token-bucket rate limiter per session.
 */
export class RateLimiter {
  constructor(maxPerSecond) {
    this.maxPerSecond = maxPerSecond;
    this.buckets = new Map(); // sessionId -> { count, resetTime }
  }

  check(sessionId) {
    const now = Date.now();
    let bucket = this.buckets.get(sessionId);

    if (!bucket || now >= bucket.resetTime) {
      bucket = { count: 0, resetTime: now + 1000 };
      this.buckets.set(sessionId, bucket);
    }

    bucket.count++;
    return bucket.count <= this.maxPerSecond;
  }

  remove(sessionId) {
    this.buckets.delete(sessionId);
  }
}
