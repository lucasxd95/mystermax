import { logger } from '../utils/logger.js';

/**
 * Routes incoming packets to appropriate handlers based on packet type.
 * Matches the Mystera Legacy client protocol.
 *
 * Client → Server packet types:
 *   "client" - Client info (version, mobile, user-agent)
 *   "login"  - Login with credentials
 *   "guest"  - Guest login
 *   "h"      - Movement start (from position x,y in direction d)
 *   "m"      - Direction change / facing (position x,y, direction d)
 *   "a"      - Action (attack/interact)
 *   "t"      - Target entity
 *   "g"      - Pickup item
 *   "u"      - Use item (slot)
 *   "d"      - Drop item (slot, amount)
 *   "sw"     - Swap inventory slots
 *   "chat"   - Chat message
 *   "c"      - Character operations (sub-request 'r')
 *   "bld"    - Build request
 *   "nfo"    - Template info request
 *   "script" - Script operations
 *   "A"      - Ability shortcut
 *   "P"      - Pong response
 */
export class PacketRouter {
  constructor(gameServer) {
    this.gameServer = gameServer;
    this.handlers = new Map();
    this.registerHandlers();
  }

  registerHandlers() {
    // Auth
    this.handlers.set('client', (client, pkt) => this.gameServer.handleClientInfo(client, pkt));
    this.handlers.set('login', (client, pkt) => this.gameServer.handleLogin(client, pkt));
    this.handlers.set('guest', (client, pkt) => this.gameServer.handleGuestLogin(client, pkt));

    // Movement (core authoritative handlers)
    this.handlers.set('h', (client, pkt) => this.gameServer.handleMoveStart(client, pkt));
    this.handlers.set('m', (client, pkt) => this.gameServer.handleDirectionChange(client, pkt));

    // Actions
    this.handlers.set('a', (client, pkt) => this.gameServer.handleAction(client, pkt));
    this.handlers.set('t', (client, pkt) => this.gameServer.handleTarget(client, pkt));

    // Inventory
    this.handlers.set('g', (client, pkt) => this.gameServer.handlePickup(client, pkt));
    this.handlers.set('u', (client, pkt) => this.gameServer.handleUseItem(client, pkt));
    this.handlers.set('d', (client, pkt) => this.gameServer.handleDropItem(client, pkt));
    this.handlers.set('sw', (client, pkt) => this.gameServer.handleSwapItems(client, pkt));

    // Chat
    this.handlers.set('chat', (client, pkt) => this.gameServer.handleChat(client, pkt));

    // Character
    this.handlers.set('c', (client, pkt) => this.gameServer.handleCharacterOp(client, pkt));

    // Building
    this.handlers.set('bld', (client, pkt) => this.gameServer.handleBuild(client, pkt));

    // Ping/Pong
    this.handlers.set('P', (client, pkt) => this.gameServer.handlePong(client, pkt));
  }

  route(client, packet) {
    const handler = this.handlers.get(packet.type);
    if (handler) {
      try {
        handler(client, packet);
      } catch (err) {
        logger.error(`Error handling packet type '${packet.type}':`, err);
      }
    } else {
      logger.debug(`Unhandled packet type: ${packet.type}`);
    }
  }
}
