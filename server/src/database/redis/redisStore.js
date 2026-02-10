import Redis from 'ioredis';
import config from '../../core/config.js';
import { logger } from '../../utils/logger.js';

/**
 * Redis store for real-time state management.
 *
 * Used for:
 * - Player sessions (fast lookup)
 * - Real-time movement state cache
 * - Input sequence tracking
 * - Pub/Sub for multi-instance scaling
 */
export class RedisStore {
  constructor() {
    this.client = null;
    this.subscriber = null;
    this.connected = false;
  }

  async connect() {
    try {
      const options = {
        host: config.redis.host,
        port: config.redis.port,
        retryStrategy: () => null, // Don't retry if Redis unavailable
      };
      if (config.redis.password) {
        options.password = config.redis.password;
      }

      this.client = new Redis(options);
      this.client.on('error', (err) => {
        if (this.connected) {
          logger.warn(`Redis error: ${err.message}`);
        }
        this.connected = false;
      });
      this.client.on('connect', () => {
        this.connected = true;
        logger.info('Redis connected');
      });

      // Wait briefly for connection
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } catch (err) {
      logger.warn(`Redis connection failed (non-critical): ${err.message}`);
      this.connected = false;
    }
  }

  async disconnect() {
    if (this.client) {
      this.client.disconnect();
      logger.info('Redis disconnected');
    }
    if (this.subscriber) {
      this.subscriber.disconnect();
    }
  }

  // Session management
  async setSession(sessionId, playerData, ttl = 3600) {
    if (!this.connected) return;
    await this.client.setex(
      `session:${sessionId}`,
      ttl,
      JSON.stringify(playerData)
    );
  }

  async getSession(sessionId) {
    if (!this.connected) return null;
    const data = await this.client.get(`session:${sessionId}`);
    return data ? JSON.parse(data) : null;
  }

  async removeSession(sessionId) {
    if (!this.connected) return;
    await this.client.del(`session:${sessionId}`);
  }

  // Player position cache (for fast lookups)
  async setPlayerPosition(playerId, x, y, mapId) {
    if (!this.connected) return;
    await this.client.hset(`player:${playerId}:pos`, {
      x: x.toString(),
      y: y.toString(),
      mapId,
      updated: Date.now().toString(),
    });
  }

  async getPlayerPosition(playerId) {
    if (!this.connected) return null;
    return this.client.hgetall(`player:${playerId}:pos`);
  }

  // Input sequence tracking
  async setInputSequence(playerId, sequence) {
    if (!this.connected) return;
    await this.client.set(`player:${playerId}:seq`, sequence.toString());
  }

  async getInputSequence(playerId) {
    if (!this.connected) return 0;
    const seq = await this.client.get(`player:${playerId}:seq`);
    return seq ? parseInt(seq, 10) : 0;
  }

  // Pub/Sub for multi-instance
  async publish(channel, data) {
    if (!this.connected) return;
    await this.client.publish(channel, JSON.stringify(data));
  }

  async subscribe(channel, callback) {
    if (!this.connected) return;
    if (!this.subscriber) {
      this.subscriber = this.client.duplicate();
    }
    await this.subscriber.subscribe(channel);
    this.subscriber.on('message', (ch, message) => {
      if (ch === channel) {
        callback(JSON.parse(message));
      }
    });
  }
}
