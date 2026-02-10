import config from './config.js';
import { logger } from '../utils/logger.js';

/**
 * Fixed-timestep game loop.
 * Runs the update callback at a fixed interval determined by tickRate.
 */
export class TickLoop {
  constructor(updateFn) {
    this.updateFn = updateFn;
    this.tickRate = config.server.tickRate;
    this.tickInterval = 1000 / this.tickRate;
    this.running = false;
    this.tickCount = 0;
    this.timer = null;
    this.lastTickTime = 0;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.lastTickTime = Date.now();
    logger.info(`Tick loop started at ${this.tickRate} Hz (${this.tickInterval}ms per tick)`);
    this.timer = setInterval(() => this.tick(), this.tickInterval);
  }

  tick() {
    const now = Date.now();
    const deltaTime = now - this.lastTickTime;
    this.lastTickTime = now;
    this.tickCount++;

    try {
      this.updateFn(deltaTime, this.tickCount);
    } catch (err) {
      logger.error('Tick loop error:', err);
    }
  }

  stop() {
    if (!this.running) return;
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    logger.info('Tick loop stopped');
  }
}
