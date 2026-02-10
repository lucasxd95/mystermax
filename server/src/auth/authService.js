import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger.js';

/**
 * Authentication handler.
 * Manages login, guest accounts, and session validation.
 */
export class AuthService {
  constructor(gameServer) {
    this.gameServer = gameServer;
    this.guestCounter = 0;
  }

  /**
   * Handle login with credentials.
   * In production, validate against MongoDB.
   */
  async handleLogin(client, packet) {
    // Extract credentials
    let username, password;

    if (packet.user && packet.pass) {
      username = Buffer.from(packet.user, 'base64').toString();
      password = Buffer.from(packet.pass, 'base64').toString();
    } else if (packet.data) {
      // /me auto-login or other formats
      username = packet.data;
    }

    if (!username) {
      this.gameServer.network.sendTo(client.sessionId, {
        type: 'logmsg',
        text: 'Invalid login credentials.',
      });
      return null;
    }

    // TODO: Validate against database
    // For now, accept any login
    logger.info(`Login attempt: ${username}`);

    const playerId = uuidv4();
    client.authenticated = true;
    client.playerId = playerId;

    // Send accepted response (matches client protocol)
    this.gameServer.network.sendTo(client.sessionId, {
      type: 'accepted',
    });

    return { playerId, name: username };
  }

  /**
   * Handle guest login.
   */
  async handleGuestLogin(client) {
    this.guestCounter++;
    const guestName = `guest-${this.guestCounter}`;
    const playerId = uuidv4();

    client.authenticated = true;
    client.playerId = playerId;

    this.gameServer.network.sendTo(client.sessionId, {
      type: 'accepted',
      guest: true,
      name: guestName,
      pass: uuidv4().substring(0, 8),
    });

    return { playerId, name: guestName, isGuest: true };
  }
}
