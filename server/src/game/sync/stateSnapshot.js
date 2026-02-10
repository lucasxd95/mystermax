import { logger } from '../../utils/logger.js';
import config from '../../core/config.js';

/**
 * State Snapshot System.
 * Periodically sends full or delta state updates to clients.
 *
 * From client analysis:
 *   - Server sends {type:"pl", data:[...]} with batch player data
 *   - Server sends {type:"obj", data:[...]} with batch object data
 *   - Individual updates sent as {type:"p"}, {type:"move"}, {type:"o"}
 */
export class StateSnapshot {
  constructor(gameServer) {
    this.gameServer = gameServer;
    this.snapshotInterval = 5; // send full snapshot every N ticks
    this.lastSnapshot = new Map(); // playerId -> last sent state hash
  }

  /**
   * Called each tick to send state updates.
   */
  update(deltaTime, tickCount) {
    // Send periodic full player list to each client
    if (tickCount % this.snapshotInterval === 0) {
      this.sendPlayerSnapshots();
    }
  }

  /**
   * Send player list snapshot to all connected players.
   * Uses the batch format {type:"pl", data:[...]}
   */
  sendPlayerSnapshots() {
    for (const player of this.gameServer.players.values()) {
      const nearbyPlayers = this.getNearbyPlayers(player);
      if (nearbyPlayers.length === 0) continue;

      const batchData = nearbyPlayers.map(p => JSON.stringify(p.toSpawnPacket()));

      this.gameServer.network.sendToPlayer(player.id, {
        type: 'pl',
        data: batchData,
      });
    }
  }

  /**
   * Get players near a given player (within view distance).
   */
  getNearbyPlayers(player) {
    const nearby = [];
    const vw = config.game.viewWidth;
    const vh = config.game.viewHeight;

    for (const other of this.gameServer.players.values()) {
      if (other.id === player.id) continue;
      if (other.mapId !== player.mapId) continue;

      const dx = Math.abs(other.x - player.x);
      const dy = Math.abs(other.y - player.y);
      if (dx <= vw && dy <= vh) {
        nearby.push(other);
      }
    }
    return nearby;
  }
}
