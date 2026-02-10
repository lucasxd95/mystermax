import crypto from 'crypto';
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
    this.localAccounts = new Map();
  }

  /**
   * Handle login with credentials.
   * In production, validate against MongoDB.
   */
  async handleLogin(client, packet) {
    // Extract credentials
    let username, password;
    let email;

    if (packet.user && packet.pass) {
      username = this.decodeBase64(packet.user);
      password = this.decodeBase64(packet.pass);
      if (packet.email !== undefined) {
        email = this.decodeBase64(packet.email);
      }
    } else if (packet.data) {
      // /me auto-login or other formats
      username = packet.data;
    }

    const isRegistration = email !== undefined;
    if (!username) {
      this.sendAuthMessage(client, isRegistration, 'Invalid login credentials.');
      return null;
    }

    const normalizedUsername = username.trim();
    const normalizedPassword = password ? password.trim() : '';
    const normalizedEmail = email ? email.trim() : '';
    if (!normalizedUsername) {
      this.sendAuthMessage(client, isRegistration, 'Invalid login credentials.');
      return null;
    }

    if (isRegistration && !normalizedPassword) {
      this.sendAuthMessage(client, true, 'Password is required.');
      return null;
    }

    const account = await this.findAccount(normalizedUsername);
    if (isRegistration) {
      if (account) {
        this.sendAuthMessage(client, true, 'Account already exists.');
        return null;
      }

      await this.createAccount({
        username: normalizedUsername,
        passwordHash: this.createPasswordHash(normalizedPassword),
        email: normalizedEmail,
      });
      this.gameServer.network.sendTo(client.sessionId, {
        type: 'accepted',
        created: true,
      });
      logger.info(`Account created: ${normalizedUsername}`);
      return { created: true };
    }

    if (!account && normalizedPassword) {
      this.sendAuthMessage(client, false, 'Account not found. Please register.');
      return null;
    }

    if (account && account.passwordHash && !normalizedPassword) {
      this.sendAuthMessage(client, false, 'Password is required.');
      return null;
    }

    if (account && account.passwordHash &&
        !this.verifyPassword(normalizedPassword, account.passwordHash)) {
      this.sendAuthMessage(client, false, 'Invalid login credentials.');
      return null;
    }

    logger.info(`Login attempt: ${normalizedUsername}`);

    const playerId = uuidv4();
    client.authenticated = true;
    client.playerId = playerId;

    return { playerId, name: normalizedUsername };
  }

  /**
   * Handle guest login.
   */
  async handleGuestLogin(client) {
    this.guestCounter++;
    const guestName = `guest-${this.guestCounter}`;
    const playerId = uuidv4();
    const guestPass = uuidv4().substring(0, 8);

    client.authenticated = true;
    client.playerId = playerId;

    return {
      playerId,
      name: guestName,
      isGuest: true,
      guestPass,
    };
  }

  decodeBase64(value) {
    if (typeof value !== 'string') return '';
    return Buffer.from(value, 'base64').toString();
  }

  createPasswordHash(password) {
    const salt = crypto.randomBytes(16);
    const hash = crypto.scryptSync(password, salt, 64);
    return `${salt.toString('hex')}:${hash.toString('hex')}`;
  }

  verifyPassword(password, storedHash) {
    const [saltHex, hashHex] = storedHash.split(':');
    if (!saltHex || !hashHex) return false;
    try {
      const salt = Buffer.from(saltHex, 'hex');
      const storedBuffer = Buffer.from(hashHex, 'hex');
      const verifyBuffer = crypto.scryptSync(password, salt, storedBuffer.length);
      return crypto.timingSafeEqual(storedBuffer, verifyBuffer);
    } catch {
      return false;
    }
  }

  async findAccount(username) {
    if (this.gameServer.mongo.db) {
      return this.gameServer.mongo.findAccount(username);
    }
    return this.localAccounts.get(username) || null;
  }

  async createAccount(accountData) {
    if (this.gameServer.mongo.db) {
      return this.gameServer.mongo.createAccount(accountData);
    }
    this.localAccounts.set(accountData.username, {
      ...accountData,
      createdAt: new Date(),
      lastLogin: new Date(),
    });
    return accountData.username;
  }

  sendAuthMessage(client, isRegistration, text) {
    this.gameServer.network.sendTo(client.sessionId, {
      type: isRegistration ? 'crtmsg' : 'logmsg',
      text,
    });
  }
}
