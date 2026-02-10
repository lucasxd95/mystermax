import { DIRECTION_VECTORS, isValidDirection, manhattanDistance } from '../../utils/math.js';
import { getTileSpeedModifier } from '../world/tileCollision.js';
import { logger } from '../../utils/logger.js';
import config from '../../core/config.js';

/**
 * Authoritative Movement System
 *
 * This system is the single source of truth for all entity movement.
 * It mirrors the client's movement logic but with full authority.
 *
 * Client Movement Protocol (from ml.min.js analysis):
 * =====================================================
 *
 * 1. Player presses a movement key (WASD/arrows)
 * 2. Client calls entity.move(newX, newY):
 *    - Sets direction based on delta (x>newX → dir=3/LEFT, etc.)
 *    - If the player is the local player (id === me):
 *      a. If Ctrl is held: only send direction change {type:"m", x, y, d}
 *      b. If destination is occupied: send facing {type:"m", x, y, d}
 *      c. Otherwise: move locally and send {type:"h", x:fromX, y:fromY, d:dir}
 *    - For other entities: directly set position (server-driven)
 *
 * 3. Movement timing:
 *    - Each tile move takes `cur_speed` ms (default 750ms)
 *    - `traveled` accumulates elapsed time each frame
 *    - When traveled >= cur_speed, move completes
 *    - Interpolation: tweenx = (x-fromx) * (traveled/cur_speed) * 32
 *
 * 4. Server responses:
 *    - {type:"pos", x, y} — Authoritative correction (teleport to position)
 *    - {type:"move", id, x, y} — Entity movement broadcast
 *    - {type:"p", id, s, d, x, y, ...} — Full player state update
 *
 * Server Authority Model:
 * =======================
 * - Client sends {type:"h"} with FROM position and direction
 * - Server validates: position matches, direction valid, destination walkable
 * - Server applies move after speed timer expires
 * - Server broadcasts {type:"move"} to nearby players
 * - If client desyncs, server sends {type:"pos"} correction
 */
export class MovementSystem {
  constructor(gameServer) {
    this.gameServer = gameServer;
    this.pendingMoves = new Map(); // playerId -> { targetX, targetY, dir, startTime }
  }

  /**
   * Handle a movement start packet from client.
   * Client sends: {type:"h", x:fromX, y:fromY, d:direction}
   *
   * The client is saying: "I am at (x,y) and want to move in direction d"
   */
  handleMoveStart(player, packet) {
    const { x: clientX, y: clientY, d: dir } = packet;

    // Validate direction
    if (!isValidDirection(dir)) {
      logger.warn(`Invalid direction ${dir} from player ${player.id}`);
      this.sendCorrection(player);
      return;
    }

    // Validate client position matches server state (anti-cheat)
    if (player.isMoving) {
      // Player is still moving, queue this input
      return;
    }

    const positionMismatch = (clientX !== player.x || clientY !== player.y);
    if (positionMismatch) {
      const dist = manhattanDistance(clientX, clientY, player.x, player.y);
      if (dist > config.security.maxTeleportDistance) {
        logger.warn(
          `Position mismatch for player ${player.id}: ` +
          `client(${clientX},${clientY}) server(${player.x},${player.y}) dist=${dist}`
        );
        this.sendCorrection(player);
        return;
      }
      // Minor desync - correct client silently
      this.sendCorrection(player);
    }

    // Calculate target position
    const vec = DIRECTION_VECTORS[dir];
    const targetX = player.x + vec.dx;
    const targetY = player.y + vec.dy;

    // Get the map
    const map = this.gameServer.mapLoader.getMap(player.mapId);
    if (!map) {
      this.sendCorrection(player);
      return;
    }

    // Check tile walkability
    if (!map.isWalkable(targetX, targetY)) {
      // Update facing direction but don't move
      player.dir = dir;
      this.gameServer.broadcastPlayerUpdate(player);
      return;
    }

    // Check entity collision (another player/mob on that tile)
    if (this.isTileOccupiedByEntity(targetX, targetY, player.mapId, player.id)) {
      player.dir = dir;
      this.gameServer.broadcastPlayerUpdate(player);
      return;
    }

    // Speed validation (anti-speedhack)
    const now = Date.now();
    if (player.lastMoveTime > 0) {
      const elapsed = now - player.lastMoveTime;
      const minTime = player.curSpeed * (1 - config.security.speedHackTolerance);
      if (elapsed < minTime) {
        logger.warn(
          `Speed hack detected for player ${player.id}: ` +
          `${elapsed}ms < ${minTime}ms minimum`
        );
        this.sendCorrection(player);
        return;
      }
    }

    // Start the move
    player.dir = dir;
    player.fromX = player.x;
    player.fromY = player.y;
    player.isMoving = true;
    player.moveStartTime = now;

    // Apply movement immediately (tile-based: occupy target tile now)
    player.x = targetX;
    player.y = targetY;
    player.lastMoveTime = now;

    // Update speed based on new tile
    const tileSpeedMod = getTileSpeedModifier(
      map.getTile(targetX, targetY),
      map.tileSpeed
    );
    player.updateCurSpeed(tileSpeedMod);

    // Broadcast to nearby players
    this.gameServer.network.broadcastToNearby(
      player.x, player.y, player.mapId,
      player.toMovePacket(),
      player.id
    );

    // Mark move as completing after curSpeed duration
    this.pendingMoves.set(player.id, {
      completeTime: now + player.curSpeed,
    });

    player.inputSequence++;
  }

  /**
   * Handle a direction change / facing packet.
   * Client sends: {type:"m", x, y, d}
   *
   * The client is saying: "I am at (x,y) facing direction d (not moving)"
   */
  handleDirectionChange(player, packet) {
    const { d: dir } = packet;

    if (!isValidDirection(dir)) return;

    player.dir = dir;

    // Broadcast direction change to nearby players
    this.gameServer.network.broadcastToNearby(
      player.x, player.y, player.mapId,
      player.toUpdatePacket(),
      player.id
    );
  }

  /**
   * Process pending moves each tick.
   * Completes moves that have finished their travel time.
   */
  update(deltaTime, tickCount) {
    const now = Date.now();

    for (const [playerId, move] of this.pendingMoves) {
      if (now >= move.completeTime) {
        const player = this.gameServer.getPlayer(playerId);
        if (player) {
          player.isMoving = false;
          player.fromX = player.x;
          player.fromY = player.y;
        }
        this.pendingMoves.delete(playerId);
      }
    }
  }

  /**
   * Check if a tile is occupied by any entity other than excludeId.
   */
  isTileOccupiedByEntity(x, y, mapId, excludeId) {
    // Check players
    for (const player of this.gameServer.players.values()) {
      if (player.id !== excludeId && player.mapId === mapId &&
          player.x === x && player.y === y) {
        return true;
      }
    }

    // Check mobs
    for (const mob of this.gameServer.mobs.values()) {
      if (mob.id !== excludeId && mob.mapId === mapId &&
          mob.x === x && mob.y === y) {
        return true;
      }
    }

    return false;
  }

  /**
   * Send authoritative position correction to client.
   * Matches client: {type:"pos", x, y}
   */
  sendCorrection(player) {
    this.gameServer.network.sendToPlayer(player.id, player.toPositionPacket());
  }

  /**
   * Remove a player from pending moves.
   */
  removePlayer(playerId) {
    this.pendingMoves.delete(playerId);
  }
}
