import { WebSocketServer } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import config from '../core/config.js';
import { logger } from '../utils/logger.js';
import { PacketRouter } from './packetRouter.js';
import { PacketValidator } from './packetValidator.js';
import { RateLimiter } from '../security/rateLimiter.js';

/**
 * WebSocket server that manages client connections.
 * Uses native 'ws' library for performance (no Socket.IO overhead).
 */
export class NetworkServer {
  constructor(gameServer) {
    this.gameServer = gameServer;
    this.wss = null;
    this.clients = new Map(); // sessionId -> { ws, sessionId, playerId, lastActivity }
    this.packetRouter = new PacketRouter(gameServer);
    this.packetValidator = new PacketValidator();
    this.rateLimiter = new RateLimiter(config.security.packetRateLimit);
  }

  start(port) {
    this.wss = new WebSocketServer({ port });

    this.wss.on('connection', (ws) => {
      this.handleConnection(ws);
    });

    this.wss.on('error', (err) => {
      logger.error('WebSocket server error:', err);
    });

    logger.info(`WebSocket server listening on port ${port}`);
  }

  handleConnection(ws) {
    const sessionId = uuidv4();
    const client = {
      ws,
      sessionId,
      playerId: null,
      authenticated: false,
      lastActivity: Date.now(),
      clientInfo: null,
    };

    this.clients.set(sessionId, client);
    logger.info(`Client connected: ${sessionId}`);

    ws.on('message', (data) => {
      this.handleMessage(sessionId, data);
    });

    ws.on('close', () => {
      this.handleDisconnect(sessionId);
    });

    ws.on('error', (err) => {
      logger.warn(`Client ${sessionId} WebSocket error: ${err.message}`);
    });
  }

  handleMessage(sessionId, rawData) {
    const client = this.clients.get(sessionId);
    if (!client) return;

    // Rate limiting
    if (!this.rateLimiter.check(sessionId)) {
      logger.warn(`Rate limit exceeded for ${sessionId}`);
      return;
    }

    client.lastActivity = Date.now();

    let packet;
    try {
      packet = JSON.parse(rawData.toString());
    } catch {
      logger.warn(`Invalid JSON from ${sessionId}`);
      return;
    }

    // Validate packet structure
    if (!this.packetValidator.validate(packet)) {
      logger.warn(`Invalid packet from ${sessionId}: ${JSON.stringify(packet)}`);
      return;
    }

    // Route to handler
    this.packetRouter.route(client, packet);
  }

  handleDisconnect(sessionId) {
    const client = this.clients.get(sessionId);
    if (client) {
      if (client.playerId) {
        this.gameServer.handlePlayerDisconnect(client.playerId);
      }
      this.clients.delete(sessionId);
      this.rateLimiter.remove(sessionId);
      logger.info(`Client disconnected: ${sessionId}`);
    }
  }

  /**
   * Send a packet to a specific client by session ID.
   */
  sendTo(sessionId, packet) {
    const client = this.clients.get(sessionId);
    if (client && client.ws.readyState === 1) {
      client.ws.send(JSON.stringify(packet));
    }
  }

  /**
   * Send a packet to a specific player by player ID.
   */
  sendToPlayer(playerId, packet) {
    for (const client of this.clients.values()) {
      if (client.playerId === playerId && client.ws.readyState === 1) {
        client.ws.send(JSON.stringify(packet));
        return;
      }
    }
  }

  /**
   * Broadcast a packet to all authenticated clients.
   */
  broadcast(packet, excludeSessionId) {
    const data = JSON.stringify(packet);
    for (const [sid, client] of this.clients) {
      if (sid !== excludeSessionId && client.authenticated && client.ws.readyState === 1) {
        client.ws.send(data);
      }
    }
  }

  /**
   * Send to all clients in a specific region/area.
   */
  broadcastToNearby(x, y, mapId, packet, excludePlayerId) {
    const data = JSON.stringify(packet);
    for (const client of this.clients.values()) {
      if (client.playerId === excludePlayerId) continue;
      if (!client.authenticated || client.ws.readyState !== 1) continue;

      const player = this.gameServer.getPlayer(client.playerId);
      if (player && player.mapId === mapId) {
        const dx = Math.abs(player.x - x);
        const dy = Math.abs(player.y - y);
        if (dx <= config.game.viewWidth && dy <= config.game.viewHeight) {
          client.ws.send(data);
        }
      }
    }
  }

  /**
   * Get a client by player ID.
   */
  getClientByPlayerId(playerId) {
    for (const client of this.clients.values()) {
      if (client.playerId === playerId) return client;
    }
    return null;
  }

  stop() {
    if (this.wss) {
      this.wss.close();
      logger.info('WebSocket server stopped');
    }
  }
}
