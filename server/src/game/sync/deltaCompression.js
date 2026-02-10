import { logger } from '../../utils/logger.js';

/**
 * Delta Compression System.
 * Only sends changes since the last update to minimize bandwidth.
 *
 * From client analysis:
 *   - {type:"zip", data} — compressed batch of messages
 *   - {type:"pkg", data} — uncompressed batch of messages
 *
 * The server can batch multiple small updates into a single packet.
 */
export class DeltaCompression {
  constructor() {
    this.previousStates = new Map(); // playerId -> { entities: Map }
  }

  /**
   * Initialize tracking for a player.
   */
  initPlayer(playerId) {
    this.previousStates.set(playerId, { entities: new Map() });
  }

  /**
   * Compute delta between current and previous state for an entity.
   * Returns only changed fields, or null if no changes.
   */
  computeDelta(playerId, entityId, currentState) {
    const prev = this.previousStates.get(playerId);
    if (!prev) return currentState;

    const previousEntity = prev.entities.get(entityId);
    if (!previousEntity) {
      prev.entities.set(entityId, { ...currentState });
      return currentState; // First time seeing this entity, send full state
    }

    const delta = {};
    let hasChanges = false;

    for (const [key, value] of Object.entries(currentState)) {
      if (previousEntity[key] !== value) {
        delta[key] = value;
        hasChanges = true;
      }
    }

    if (hasChanges) {
      prev.entities.set(entityId, { ...currentState });
      delta.id = entityId; // Always include ID
      delta.type = currentState.type;
      return delta;
    }

    return null;
  }

  /**
   * Batch multiple packets into a single pkg message.
   */
  batchPackets(packets) {
    if (packets.length === 0) return null;
    if (packets.length === 1) return packets[0];
    return {
      type: 'pkg',
      data: packets.map(p => JSON.stringify(p)),
    };
  }

  /**
   * Remove tracking for a player.
   */
  removePlayer(playerId) {
    this.previousStates.delete(playerId);
  }
}
