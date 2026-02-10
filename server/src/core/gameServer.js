import config from './config.js';
import { TickLoop } from './tickLoop.js';
import { NetworkServer } from '../network/wsServer.js';
import { InputQueue } from '../network/inputQueue.js';
import { MapLoader } from '../game/world/mapLoader.js';
import { MovementSystem } from '../game/systems/movementSystem.js';
import { CombatSystem } from '../game/systems/combatSystem.js';
import { InventorySystem } from '../game/systems/inventorySystem.js';
import { StateSnapshot } from '../game/sync/stateSnapshot.js';
import { DeltaCompression } from '../game/sync/deltaCompression.js';
import { AntiCheat } from '../security/antiCheat.js';
import { AuthService } from '../auth/authService.js';
import { MongoRepository } from '../database/mongodb/repository.js';
import { RedisStore } from '../database/redis/redisStore.js';
import { Player } from '../game/entities/player.js';
import { logger } from '../utils/logger.js';

/**
 * Main Game Server
 *
 * Orchestrates all subsystems and handles the main game loop.
 * This is the authoritative server - all game state lives here.
 */
export class GameServer {
  constructor() {
    // Core systems
    this.network = new NetworkServer(this);
    this.tickLoop = new TickLoop((dt, tick) => this.update(dt, tick));
    this.inputQueue = new InputQueue();

    // Game systems
    this.mapLoader = new MapLoader();
    this.movementSystem = new MovementSystem(this);
    this.combatSystem = new CombatSystem(this);
    this.inventorySystem = new InventorySystem(this);
    this.stateSnapshot = new StateSnapshot(this);
    this.deltaCompression = new DeltaCompression();

    // Security
    this.antiCheat = new AntiCheat();

    // Auth
    this.authService = new AuthService(this);

    // Database
    this.mongo = new MongoRepository();
    this.redis = new RedisStore();

    // Game state
    this.players = new Map();    // playerId -> Player
    this.mobs = new Map();       // mobId -> Mob
    this.npcs = new Map();       // npcId -> NPC

    // Ping tracking
    this.pingInterval = null;
    this.pingCount = 0;
  }

  async start() {
    logger.info('=== Mystermax Authoritative Server ===');
    logger.info(`Environment: ${config.server.env}`);

    // Connect databases (non-blocking, server works without them)
    await this.mongo.connect();
    await this.redis.connect();

    // Load initial maps
    this.mapLoader.getMap('overworld');

    // Start network
    this.network.start(config.server.port);

    // Start game loop
    this.tickLoop.start();

    // Start ping interval (every 6 seconds, matching client)
    this.pingInterval = setInterval(() => this.sendPings(), 6000);

    logger.info('Server started successfully');
  }

  /**
   * Main game loop update - called every tick.
   */
  update(deltaTime, tickCount) {
    // Process pending movement completions
    this.movementSystem.update(deltaTime, tickCount);

    // Process combat
    this.combatSystem.update(deltaTime, tickCount);

    // Send state snapshots
    this.stateSnapshot.update(deltaTime, tickCount);
  }

  // ===================
  // PACKET HANDLERS
  // ===================

  handleClientInfo(client, packet) {
    client.clientInfo = {
      version: packet.ver,
      mobile: packet.mobile,
      agent: packet.agent,
    };
    logger.info(`Client info: v${packet.ver} mobile=${packet.mobile}`);
  }

  async handleLogin(client, packet) {
    const result = await this.authService.handleLogin(client, packet);
    if (result) {
      this.spawnPlayer(client, result.playerId, result.name, false);
    }
  }

  async handleGuestLogin(client, packet) {
    const result = await this.authService.handleGuestLogin(client);
    if (result) {
      this.spawnPlayer(client, result.playerId, result.name, true);
    }
  }

  /**
   * Spawn a player into the game world.
   */
  spawnPlayer(client, playerId, name, isGuest) {
    const player = new Player(playerId, name);
    player.sessionId = client.sessionId;
    player.isGuest = isGuest;

    // Find a valid spawn position
    const map = this.mapLoader.getMap(player.mapId);
    this.findSpawnPosition(player, map);

    this.players.set(playerId, player);
    this.antiCheat.initPlayer(playerId);
    this.deltaCompression.initPlayer(playerId);
    this.inventorySystem.initPlayer(playerId);

    logger.info(`Player spawned: ${name} (${playerId}) at (${player.x}, ${player.y})`);

    // Send map transition
    this.network.sendToPlayer(playerId, map.toTransitionPacket());

    // Send player template
    this.network.sendToPlayer(playerId, player.toTemplatePacket());

    // Send map data
    this.sendMapData(player);

    // Send initial position
    this.network.sendToPlayer(playerId, player.toPositionPacket());

    // Send game state
    this.network.sendToPlayer(playerId, {
      type: 'game',
      lb: 0,
      lh: 0,
      lc: 0,
      pr: player.premium,
    });

    // Send accepted with map info
    this.network.sendToPlayer(playerId, {
      type: 'accepted',
      mw: map.width,
      mh: map.height,
      tile: map.tileSpeed,
      name: name,
    });

    // Broadcast new player to others
    this.broadcastPlayerUpdate(player);

    // Update Redis
    if (this.redis.connected) {
      this.redis.setSession(client.sessionId, { playerId, name });
      this.redis.setPlayerPosition(playerId, player.x, player.y, player.mapId);
    }
  }

  /**
   * Find a valid spawn position on the map.
   */
  findSpawnPosition(player, map) {
    // Try center first, then search outward
    const centerX = Math.floor(map.width / 2);
    const centerY = Math.floor(map.height / 2);

    for (let radius = 0; radius < 20; radius++) {
      for (let dx = -radius; dx <= radius; dx++) {
        for (let dy = -radius; dy <= radius; dy++) {
          const x = centerX + dx;
          const y = centerY + dy;
          if (map.isWalkable(x, y) &&
              !this.movementSystem.isTileOccupiedByEntity(x, y, player.mapId, player.id)) {
            player.x = x;
            player.y = y;
            player.fromX = x;
            player.fromY = y;
            return;
          }
        }
      }
    }
  }

  /**
   * Send map data to a player.
   */
  sendMapData(player) {
    const map = this.mapLoader.getMap(player.mapId);
    if (!map) return;

    this.network.sendToPlayer(player.id, {
      type: 'map',
      x: player.x,
      y: player.y,
    });
  }

  // ===================
  // MOVEMENT HANDLERS
  // ===================

  handleMoveStart(client, packet) {
    const player = this.getPlayer(client.playerId);
    if (!player) return;
    this.movementSystem.handleMoveStart(player, packet);
  }

  handleDirectionChange(client, packet) {
    const player = this.getPlayer(client.playerId);
    if (!player) return;
    this.movementSystem.handleDirectionChange(player, packet);
  }

  // ===================
  // ACTION HANDLERS
  // ===================

  handleAction(client, packet) {
    const player = this.getPlayer(client.playerId);
    if (!player) return;
    this.combatSystem.handleAction(player);
  }

  handleTarget(client, packet) {
    // Target selection (for UI, not gameplay-critical)
    logger.debug(`Player ${client.playerId} targets ${packet.t}`);
  }

  handlePickup(client, packet) {
    const player = this.getPlayer(client.playerId);
    if (!player) return;
    this.inventorySystem.handlePickup(player);
  }

  handleUseItem(client, packet) {
    const player = this.getPlayer(client.playerId);
    if (!player) return;
    this.inventorySystem.handleUseItem(player, packet);
  }

  handleDropItem(client, packet) {
    const player = this.getPlayer(client.playerId);
    if (!player) return;
    this.inventorySystem.handleDropItem(player, packet);
  }

  handleSwapItems(client, packet) {
    const player = this.getPlayer(client.playerId);
    if (!player) return;
    this.inventorySystem.handleSwapItems(player, packet);
  }

  handleChat(client, packet) {
    const player = this.getPlayer(client.playerId);
    if (!player) return;

    const message = packet.data;
    if (!message || typeof message !== 'string') return;

    // Broadcast chat to nearby players
    this.network.broadcastToNearby(
      player.x, player.y, player.mapId,
      {
        type: 'message',
        id: player.id,
        text: player.name + ': ' + message.substring(0, 200),
      },
      null
    );
  }

  handleCharacterOp(client, packet) {
    const player = this.getPlayer(client.playerId);
    if (!player) return;

    // Character sub-operations (appearance, skills, etc.)
    logger.debug(`Character operation: ${packet.r} from ${player.name}`);
  }

  handleBuild(client, packet) {
    const player = this.getPlayer(client.playerId);
    if (!player) return;

    logger.debug(`Build request: ${packet.tpl} from ${player.name}`);
  }

  handlePong(client, packet) {
    // Client responding to ping
  }

  // ===================
  // UTILITIES
  // ===================

  getPlayer(playerId) {
    return this.players.get(playerId) || null;
  }

  broadcastPlayerUpdate(player) {
    this.network.broadcastToNearby(
      player.x, player.y, player.mapId,
      player.toUpdatePacket(),
      null
    );
  }

  sendPings() {
    this.pingCount++;
    for (const player of this.players.values()) {
      this.network.sendToPlayer(player.id, {
        type: 'ping',
        c: this.pingCount,
      });
    }
  }

  handlePlayerDisconnect(playerId) {
    const player = this.players.get(playerId);
    if (!player) return;

    logger.info(`Player disconnected: ${player.name} (${playerId})`);

    // Cleanup
    this.players.delete(playerId);
    this.movementSystem.removePlayer(playerId);
    this.antiCheat.removePlayer(playerId);
    this.deltaCompression.removePlayer(playerId);
    this.inventorySystem.removePlayer(playerId);
    this.inputQueue.remove(playerId);

    // Notify nearby players (entity removal via empty pl batch)
    // In the full implementation, send cleanup packets
  }

  async stop() {
    logger.info('Shutting down server...');

    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }

    this.tickLoop.stop();
    await this.network.stop();
    await this.mongo.disconnect();
    await this.redis.disconnect();

    logger.info('Server stopped');
  }
}
