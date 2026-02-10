import { MongoClient } from 'mongodb';
import config from '../../core/config.js';
import { logger } from '../../utils/logger.js';
import { createIndexes } from './schemas.js';

/**
 * MongoDB repository - handles all database operations.
 */
export class MongoRepository {
  constructor() {
    this.client = null;
    this.db = null;
  }

  async connect() {
    try {
      this.client = new MongoClient(config.mongodb.uri, {
        serverSelectionTimeoutMS: 3000,
        connectTimeoutMS: 3000,
      });
      await this.client.connect();
      this.db = this.client.db();
      await createIndexes(this.db);
      logger.info('MongoDB connected');
    } catch (err) {
      logger.warn(`MongoDB connection failed (non-critical): ${err.message}`);
      this.db = null;
    }
  }

  async disconnect() {
    if (this.client) {
      await this.client.close();
      logger.info('MongoDB disconnected');
    }
  }

  // Account operations
  async findAccount(username) {
    if (!this.db) return null;
    return this.db.collection('accounts').findOne({ username });
  }

  async createAccount(accountData) {
    if (!this.db) return null;
    const result = await this.db.collection('accounts').insertOne({
      ...accountData,
      createdAt: new Date(),
      lastLogin: new Date(),
    });
    return result.insertedId;
  }

  // Character operations
  async findCharacter(name) {
    if (!this.db) return null;
    return this.db.collection('characters').findOne({ name });
  }

  async findCharactersByAccount(accountId) {
    if (!this.db) return [];
    return this.db.collection('characters').find({ accountId }).toArray();
  }

  async createCharacter(charData) {
    if (!this.db) return null;
    const result = await this.db.collection('characters').insertOne({
      ...charData,
      createdAt: new Date(),
      lastSaved: new Date(),
    });
    return result.insertedId;
  }

  async saveCharacter(characterId, updates) {
    if (!this.db) return;
    await this.db.collection('characters').updateOne(
      { _id: characterId },
      { $set: { ...updates, lastSaved: new Date() } }
    );
  }

  // Inventory operations
  async getInventory(characterId) {
    if (!this.db) return [];
    return this.db.collection('inventory')
      .find({ characterId })
      .sort({ slot: 1 })
      .toArray();
  }

  async saveInventorySlot(characterId, slot, item) {
    if (!this.db) return;
    await this.db.collection('inventory').updateOne(
      { characterId, slot },
      { $set: item },
      { upsert: true }
    );
  }

  // World data operations
  async getWorldData(mapId) {
    if (!this.db) return [];
    return this.db.collection('worldData').find({ mapId }).toArray();
  }

  async saveWorldObject(mapId, x, y, objects, placedBy) {
    if (!this.db) return;
    await this.db.collection('worldData').updateOne(
      { mapId, x, y },
      { $set: { objects, placedBy, placedAt: new Date() } },
      { upsert: true }
    );
  }
}
