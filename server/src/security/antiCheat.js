import { manhattanDistance } from '../utils/math.js';
import { logger } from '../utils/logger.js';
import config from '../core/config.js';

/**
 * Anti-cheat detection system.
 *
 * Detects:
 * - Speed hacks (moving faster than allowed)
 * - Teleport attempts (position jumps)
 * - Invalid input patterns
 * - Client position spoofing
 */
export class AntiCheat {
  constructor() {
    this.playerHistory = new Map(); // playerId -> { positions[], violations }
    this.maxViolations = 10;
    this.historySize = 20;
  }

  /**
   * Initialize tracking for a player.
   */
  initPlayer(playerId) {
    this.playerHistory.set(playerId, {
      positions: [],
      violations: 0,
      lastMoveTime: 0,
    });
  }

  /**
   * Record a validated move for a player.
   */
  recordMove(playerId, x, y) {
    const history = this.playerHistory.get(playerId);
    if (!history) return;

    history.positions.push({ x, y, time: Date.now() });
    if (history.positions.length > this.historySize) {
      history.positions.shift();
    }
    history.lastMoveTime = Date.now();
  }

  /**
   * Detect speed hack: check if the time between moves is too short.
   * Returns true if the move is suspicious.
   */
  detectSpeedHack(playerId, expectedSpeed) {
    const history = this.playerHistory.get(playerId);
    if (!history || history.positions.length < 2) return false;

    const last = history.positions[history.positions.length - 1];
    const prev = history.positions[history.positions.length - 2];
    const elapsed = last.time - prev.time;
    const minTime = expectedSpeed * (1 - config.security.speedHackTolerance);

    if (elapsed < minTime) {
      history.violations++;
      logger.warn(
        `Speed hack: player ${playerId} moved in ${elapsed}ms ` +
        `(min ${minTime}ms, violations: ${history.violations})`
      );
      return true;
    }

    return false;
  }

  /**
   * Detect teleport: client claims position far from server's known position.
   * Returns true if suspicious.
   */
  detectTeleport(playerId, claimedX, claimedY, serverX, serverY) {
    const dist = manhattanDistance(claimedX, claimedY, serverX, serverY);
    if (dist > config.security.maxTeleportDistance) {
      const history = this.playerHistory.get(playerId);
      if (history) {
        history.violations++;
        logger.warn(
          `Teleport detected: player ${playerId} claims (${claimedX},${claimedY}) ` +
          `but server has (${serverX},${serverY}), dist=${dist}`
        );
      }
      return true;
    }
    return false;
  }

  /**
   * Check if a player should be kicked for too many violations.
   */
  shouldKick(playerId) {
    const history = this.playerHistory.get(playerId);
    return history && history.violations >= this.maxViolations;
  }

  /**
   * Remove tracking for a player.
   */
  removePlayer(playerId) {
    this.playerHistory.delete(playerId);
  }
}
