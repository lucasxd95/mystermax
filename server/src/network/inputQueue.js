import config from '../core/config.js';
import { logger } from '../utils/logger.js';

/**
 * Manages an input queue for each player, buffering movement inputs
 * and processing them in order during the game tick.
 */
export class InputQueue {
  constructor() {
    this.queues = new Map(); // playerId -> Array<input>
    this.maxBufferSize = config.security.maxInputBuffer;
  }

  /**
   * Add an input to a player's queue.
   * Returns false if the buffer is full (anti-flood).
   */
  enqueue(playerId, input) {
    if (!this.queues.has(playerId)) {
      this.queues.set(playerId, []);
    }

    const queue = this.queues.get(playerId);
    if (queue.length >= this.maxBufferSize) {
      logger.warn(`Input buffer full for player ${playerId}`);
      return false;
    }

    input.serverTime = Date.now();
    queue.push(input);
    return true;
  }

  /**
   * Retrieve and clear all pending inputs for a player.
   */
  drain(playerId) {
    const queue = this.queues.get(playerId);
    if (!queue || queue.length === 0) return [];
    const inputs = [...queue];
    queue.length = 0;
    return inputs;
  }

  /**
   * Remove a player's queue entirely.
   */
  remove(playerId) {
    this.queues.delete(playerId);
  }

  /**
   * Get the number of pending inputs for a player.
   */
  size(playerId) {
    const queue = this.queues.get(playerId);
    return queue ? queue.length : 0;
  }
}
