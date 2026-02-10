/**
 * MongoDB Schemas (using native MongoDB driver).
 * These define the document structure for each collection.
 */

/**
 * Account schema - stored in 'accounts' collection.
 */
export const AccountSchema = {
  username: '',        // string, unique, indexed
  passwordHash: '',    // string, bcrypt hash
  email: '',           // string, optional
  createdAt: null,     // Date
  lastLogin: null,     // Date
  isBanned: false,     // boolean
  banReason: '',       // string
  premium: 0,          // number, premium currency
};

/**
 * Character schema - stored in 'characters' collection.
 */
export const CharacterSchema = {
  accountId: '',       // ObjectId ref to accounts
  name: '',            // string, unique, indexed
  level: 1,            // number
  hp: 100,             // number
  maxHp: 100,          // number
  attack: 1,           // number
  defense: 0,          // number
  speed: 750,          // number (ms per tile)

  // Position
  x: 50,               // number
  y: 50,               // number
  mapId: 'overworld',  // string
  dir: 2,              // number (0-3)

  // Appearance
  sprite: 0,           // number
  body: 1,             // number
  hair: 1,             // number
  clothes: 1,          // number
  clothesColor: 16777215,
  hairColor: 16777215,
  eyeColor: 16777215,

  // Stats
  tribe: '',           // string
  exp: 0,              // number
  hunger: 100,         // number

  createdAt: null,     // Date
  lastSaved: null,     // Date
};

/**
 * Inventory item schema - embedded in character or separate collection.
 */
export const InventoryItemSchema = {
  characterId: '',     // ObjectId ref
  slot: 0,             // number (0-14)
  templateId: '',      // string
  quantity: 1,         // number
  durability: -1,      // number (-1 = infinite)
};

/**
 * World data schema - for persistent world objects.
 */
export const WorldDataSchema = {
  mapId: '',           // string
  x: 0,               // number
  y: 0,               // number
  objects: [],         // array of template IDs
  placedBy: '',        // character name
  placedAt: null,      // Date
};

/**
 * Create MongoDB indexes for optimal query performance.
 */
export async function createIndexes(db) {
  await db.collection('accounts').createIndex({ username: 1 }, { unique: true });
  await db.collection('characters').createIndex({ name: 1 }, { unique: true });
  await db.collection('characters').createIndex({ accountId: 1 });
  await db.collection('inventory').createIndex({ characterId: 1, slot: 1 });
  await db.collection('worldData').createIndex({ mapId: 1, x: 1, y: 1 });
}
