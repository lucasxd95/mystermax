/**
 * Direction vectors for tile-based movement.
 * Direction encoding: 0=UP, 1=RIGHT, 2=DOWN, 3=LEFT (matches client)
 */
export const DIRECTION_VECTORS = {
  0: { dx: 0, dy: -1 },  // UP
  1: { dx: 1, dy: 0 },   // RIGHT
  2: { dx: 0, dy: 1 },   // DOWN
  3: { dx: -1, dy: 0 },  // LEFT
};

/**
 * Check if a direction value is valid (0-3).
 */
export function isValidDirection(dir) {
  return Number.isInteger(dir) && dir >= 0 && dir <= 3;
}

/**
 * Calculate Manhattan distance between two tile positions.
 */
export function manhattanDistance(x1, y1, x2, y2) {
  return Math.abs(x1 - x2) + Math.abs(y1 - y2);
}

/**
 * Generate a map key from x,y coordinates (matches client getkey function).
 */
export function getKey(x, y) {
  return 10000 * x + y;
}

/**
 * Clamp a number between min and max.
 */
export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
