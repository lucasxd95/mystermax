import config from '../../core/config.js';

/**
 * Server-side mob/monster entity.
 */
export class Mob {
  constructor(id, templateId, name) {
    this.id = id;
    this.templateId = templateId;
    this.name = name || 'Mob';

    this.x = 0;
    this.y = 0;
    this.dir = 2;
    this.mapId = 'overworld';

    this.speed = config.game.defaultSpeed;
    this.curSpeed = this.speed;
    this.isMoving = false;
    this.moveStartTime = 0;

    this.hp = 10;
    this.maxHp = 10;
    this.attack = 1;
    this.defense = 0;
    this.sprite = 0;

    this.aiState = 'idle';
    this.aggroTarget = null;
    this.aggroRange = 5;
    this.respawnTime = 30000;
    this.isDead = false;
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
