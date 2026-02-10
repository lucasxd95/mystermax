import config from '../../core/config.js';
import { logger } from '../../utils/logger.js';

/**
 * Tile collision rules matching the Mystera Legacy client.
 *
 * From client analysis:
 *   - Tile sprite 325 is always blocked (wall)
 *   - cur_wall sprite is blocked (cave walls, dynamic)
 *   - Tiles with undefined spr are blocked
 *   - Entities block tiles (one entity per tile)
 *
 * Tile speed modifiers:
 *   - tile_speed is a dictionary mapping tile types to speed values
 *   - Default entity speed is 750ms per tile
 *   - cur_speed = speed + tile_speed modifier
 */

// Well-known blocked tile IDs from client
export const BLOCKED_TILES = new Set([325]);

/**
 * Check if a tile is walkable.
 * @param {number} tileId - The tile sprite ID
 * @param {number|null} wallTile - Current wall tile ID for this map
 * @returns {boolean}
 */
export function isTileWalkable(tileId, wallTile = null) {
  if (tileId === undefined || tileId === null) return false;
  if (BLOCKED_TILES.has(tileId)) return false;
  if (wallTile !== null && tileId === wallTile) return false;
  return true;
}

/**
 * Get speed modifier for a tile.
 * @param {number} tileId
 * @param {object} tileSpeedMap - mapping of tile IDs to speed modifiers
 * @returns {number} speed modifier in ms (added to base speed)
 */
export function getTileSpeedModifier(tileId, tileSpeedMap) {
  if (tileSpeedMap && tileSpeedMap[tileId] !== undefined) {
    return tileSpeedMap[tileId];
  }
  return 0;
}
