import { logger } from '../../utils/logger.js';

/**
 * Combat System (placeholder for extensibility).
 * Handles attack actions, damage calculation, and death.
 */
export class CombatSystem {
  constructor(gameServer) {
    this.gameServer = gameServer;
  }

  /**
   * Handle an attack action from a player.
   * Client sends: {type:"a"}
   */
  handleAction(player) {
    // Determine target based on facing direction
    const targetX = player.x + [0, 1, 0, -1][player.dir];
    const targetY = player.y + [-1, 0, 1, 0][player.dir];

    // Find entity at target tile
    const target = this.findEntityAt(targetX, targetY, player.mapId);
    if (!target) return;

    // Calculate damage (basic formula)
    const damage = Math.max(1, player.attack - target.defense);
    target.hp -= damage;

    // Send HP update
    this.gameServer.network.broadcastToNearby(
      target.x, target.y, target.mapId,
      {
        type: 'hpp',
        id: target.id,
        n: target.hp,
        o: target.maxHp,
      },
      null
    );

    if (target.hp <= 0) {
      this.handleDeath(target, player);
    }
  }

  findEntityAt(x, y, mapId) {
    // Check mobs
    for (const mob of this.gameServer.mobs.values()) {
      if (mob.mapId === mapId && mob.x === x && mob.y === y && !mob.isDead) {
        return mob;
      }
    }
    return null;
  }

  handleDeath(entity, killer) {
    entity.isDead = true;
    entity.hp = 0;
    logger.info(`Entity ${entity.name} (${entity.id}) killed by ${killer.name}`);
  }

  update(deltaTime, tickCount) {
    // Process respawns, combat timers, etc.
  }
}
