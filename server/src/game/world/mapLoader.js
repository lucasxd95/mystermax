import { GameMap } from './gameMap.js';
import { logger } from '../../utils/logger.js';

/**
 * Manages all loaded game maps.
 * In a production environment, maps would be loaded from database/files.
 */
export class MapLoader {
  constructor() {
    this.maps = new Map(); // mapId -> GameMap
  }

  /**
   * Load a map by ID. Creates a default map if not found.
   */
  getMap(mapId) {
    if (!this.maps.has(mapId)) {
      this.loadMap(mapId);
    }
    return this.maps.get(mapId);
  }

  /**
   * Load or create a map.
   */
  loadMap(mapId) {
    // Default spawn map - all grass tiles (sprite 0)
    const map = new GameMap(mapId, 'Overworld', 100, 100);

    // Set all tiles to grass (walkable sprite 0)
    for (let i = 0; i < map.tiles.length; i++) {
      map.tiles[i] = 0;
    }

    // Add border walls (sprite 325 = blocked)
    for (let x = 0; x < map.width; x++) {
      map.setTile(x, 0, 325);                  // top wall
      map.setTile(x, map.height - 1, 325);     // bottom wall
    }
    for (let y = 0; y < map.height; y++) {
      map.setTile(0, y, 325);                  // left wall
      map.setTile(map.width - 1, y, 325);      // right wall
    }

    // Set tile speed modifiers (example: water tiles slow movement)
    map.tileSpeed = {};

    this.maps.set(mapId, map);
    logger.info(`Map loaded: ${mapId} (${map.width}x${map.height})`);
    return map;
  }

  /**
   * Get all loaded map IDs.
   */
  getLoadedMaps() {
    return [...this.maps.keys()];
  }
}
