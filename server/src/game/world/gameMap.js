import { logger } from '../../utils/logger.js';
import { isTileWalkable } from './tileCollision.js';
import { getKey } from '../../utils/math.js';
import config from '../../core/config.js';

/**
 * Represents a game map/zone.
 *
 * From client analysis:
 *   - Maps are tile grids with default 100x100 dimensions
 *   - Each tile has a sprite ID (spr) determining walkability
 *   - Map transitions send {type:"mt"} with new dimensions
 *   - Objects occupy tiles and can block movement
 *   - The map stores tiles as a flat array indexed by position
 */
export class GameMap {
  constructor(id, name, width, height) {
    this.id = id;
    this.name = name || `Map ${id}`;
    this.width = width || config.game.defaultMapWidth;
    this.height = height || config.game.defaultMapHeight;
    this.tiles = new Array(this.width * this.height).fill(0); // tile sprite IDs
    this.wallTile = null;        // cur_wall equivalent
    this.floorTile = null;       // cave_floor equivalent
    this.tileSpeed = {};         // tile_speed map (tileId -> speed modifier)
    this.objects = new Map();     // key -> array of object template IDs
    this.blockingObjects = new Set(); // keys of tiles blocked by objects
    this.music = null;
    this.dungeonLevel = 0;
    this.isSafe = false;         // safe zone flag
  }

  /**
   * Get tile index from coordinates.
   */
  tileIndex(x, y) {
    return y * this.width + x;
  }

  /**
   * Check if coordinates are within map bounds.
   * Matches client: inbounds = !(e<-1 || e>MAP_WIDTH || t<-1 || t>MAP_HEIGHT)
   * But for server, we use strict 0-based bounds.
   */
  inBounds(x, y) {
    return x >= 0 && x < this.width && y >= 0 && y < this.height;
  }

  /**
   * Get tile sprite ID at position.
   */
  getTile(x, y) {
    if (!this.inBounds(x, y)) return undefined;
    return this.tiles[this.tileIndex(x, y)];
  }

  /**
   * Set tile sprite ID at position.
   */
  setTile(x, y, spriteId) {
    if (!this.inBounds(x, y)) return;
    this.tiles[this.tileIndex(x, y)] = spriteId;
  }

  /**
   * Check if a tile position is walkable (no wall, no blocking object).
   */
  isWalkable(x, y) {
    if (!this.inBounds(x, y)) return false;
    const tileId = this.getTile(x, y);
    if (!isTileWalkable(tileId, this.wallTile)) return false;

    // Check blocking objects
    const key = getKey(x, y);
    if (this.blockingObjects.has(key)) return false;

    return true;
  }

  /**
   * Add an object to the map.
   */
  addObject(x, y, templateId, isBlocking = false) {
    const key = getKey(x, y);
    if (!this.objects.has(key)) {
      this.objects.set(key, []);
    }
    this.objects.get(key).push(templateId);
    if (isBlocking) {
      this.blockingObjects.add(key);
    }
  }

  /**
   * Remove objects at a position.
   */
  removeObjects(x, y) {
    const key = getKey(x, y);
    this.objects.delete(key);
    this.blockingObjects.delete(key);
  }

  /**
   * Get visible tile data for a player at position.
   * Returns the tiles within the client's view range.
   */
  getVisibleTiles(centerX, centerY) {
    const halfW = Math.floor(config.game.viewWidth / 2) + 2;
    const halfH = Math.floor(config.game.viewHeight / 2) + 2;
    const tiles = [];

    for (let dy = -halfH; dy <= halfH; dy++) {
      for (let dx = -halfW; dx <= halfW; dx++) {
        const x = centerX + dx;
        const y = centerY + dy;
        if (this.inBounds(x, y)) {
          tiles.push({ x: dx, y: dy, spr: this.getTile(x, y) });
        }
      }
    }
    return tiles;
  }

  /**
   * Serialize map transition data for client {type:"mt"} packet.
   */
  toTransitionPacket() {
    return {
      type: 'mt',
      t: this.name,
      w: this.width,
      h: this.height,
      m: this.music,
      n: this.dungeonLevel,
      c: this.wallTile,
      f: this.floorTile,
      s: this.isSafe ? 1 : 0,
    };
  }
}
