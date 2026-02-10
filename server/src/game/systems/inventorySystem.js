import { logger } from '../../utils/logger.js';

/**
 * Inventory System (placeholder for extensibility).
 * Handles item usage, dropping, swapping, and pickup.
 */
export class InventorySystem {
  constructor(gameServer) {
    this.gameServer = gameServer;
    this.playerInventories = new Map(); // playerId -> items[]
  }

  initPlayer(playerId) {
    this.playerInventories.set(playerId, new Array(15).fill(null));
  }

  handleUseItem(player, packet) {
    const { slot } = packet;
    const inventory = this.playerInventories.get(player.id);
    if (!inventory || slot < 0 || slot >= inventory.length) return;

    const item = inventory[slot];
    if (!item) return;

    logger.debug(`Player ${player.name} uses item in slot ${slot}`);
  }

  handleDropItem(player, packet) {
    const { slot, amt } = packet;
    const inventory = this.playerInventories.get(player.id);
    if (!inventory || slot < 0 || slot >= inventory.length) return;

    logger.debug(`Player ${player.name} drops item from slot ${slot}`);
  }

  handleSwapItems(player, packet) {
    const { slot, swap } = packet;
    const inventory = this.playerInventories.get(player.id);
    if (!inventory) return;
    if (slot < 0 || slot >= inventory.length) return;
    if (swap < 0 || swap >= inventory.length) return;

    const temp = inventory[slot];
    inventory[slot] = inventory[swap];
    inventory[swap] = temp;

    // Send updated inventory to client
    this.sendInventory(player);
  }

  handlePickup(player) {
    logger.debug(`Player ${player.name} picks up item at (${player.x}, ${player.y})`);
  }

  sendInventory(player) {
    const inventory = this.playerInventories.get(player.id);
    if (!inventory) return;

    this.gameServer.network.sendToPlayer(player.id, {
      type: 'inv',
      data: inventory,
    });
  }

  removePlayer(playerId) {
    this.playerInventories.delete(playerId);
  }
}
