import config from '../../core/config.js';

/**
 * Server-side NPC entity.
 */
export class NPC {
  constructor(id, templateId, name) {
    this.id = id;
    this.templateId = templateId;
    this.name = name || 'NPC';

    this.x = 0;
    this.y = 0;
    this.dir = 2;
    this.mapId = 'overworld';

    this.speed = config.game.defaultSpeed;
    this.curSpeed = this.speed;
    this.isMoving = false;

    this.sprite = 0;
    this.dialogue = [];
  }

  toSpawnPacket() {
    return {
      type: 'p',
      id: this.id,
      x: this.x,
      y: this.y,
      dx: 0,
      dy: 0,
      s: this.curSpeed,
      d: this.dir,
      tpl: this.templateId,
    };
  }

  toMovePacket() {
    return {
      type: 'move',
      id: this.id,
      x: this.x,
      y: this.y,
    };
  }
}
