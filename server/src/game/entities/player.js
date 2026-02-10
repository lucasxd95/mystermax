import { v4 as uuidv4 } from 'uuid';
import config from '../../core/config.js';

/**
 * Server-side player entity.
 *
 * From client analysis:
 *   - Players have integer tile positions (x, y)
 *   - speed = base movement time in ms per tile (default 750)
 *   - cur_speed = effective speed (speed + tile modifiers)
 *   - dir = facing direction (0=up, 1=right, 2=down, 3=left)
 *   - fromx/fromy = position before current move
 *   - traveled = accumulated movement time
 *   - Entities occupy exactly one tile at a time
 */
export class Player {
  constructor(id, name) {
    this.id = id;
    this.name = name || 'Unknown';
    this.sessionId = null;

    // Position (authoritative)
    this.x = 50;
    this.y = 50;
    this.fromX = this.x;
    this.fromY = this.y;
    this.dir = 2; // facing down

    // Map
    this.mapId = 'overworld';

    // Movement state
    this.speed = config.game.defaultSpeed;       // base ms per tile
    this.tileSpeedMod = 0;                       // current tile speed modifier
    this.curSpeed = this.speed;                   // effective speed
    this.isMoving = false;
    this.moveStartTime = 0;                      // when current move started
    this.lastMoveTime = 0;                       // when last move completed
    this.inputSequence = 0;                      // last processed input sequence

    // Stats
    this.level = 1;
    this.hp = 100;
    this.maxHp = 100;
    this.attack = 1;
    this.defense = 0;

    // Template ID for plr_tpl (visual appearance)
    this.templateId = null;
    this.sprite = 0;
    this.body = 1;
    this.hair = 1;
    this.clothes = 1;
    this.clothesColor = 16777215;
    this.hairColor = 16777215;
    this.eyeColor = 16777215;

    // State
    this.isGuest = false;
    this.tribe = '';
    this.premium = 0;
    this.isChatting = false;
    this.prefix = '';
  }

  /**
   * Serialize player data for 'p' packet (player update).
   * Matches client: {type:"p", id, s, d, x, y, ch, ...}
   */
  toUpdatePacket() {
    return {
      type: 'p',
      id: this.id,
      s: this.curSpeed,
      d: this.dir,
      x: this.x,
      y: this.y,
      ch: this.isChatting ? 1 : 0,
    };
  }

  /**
   * Serialize for 'pos' correction packet.
   * Sent only to the owning client.
   * Matches client: {type:"pos", x, y, t?}
   */
  toPositionPacket(isTransition = false) {
    const pkt = { type: 'pos', x: this.x, y: this.y };
    if (isTransition) pkt.t = 1;
    return pkt;
  }

  /**
   * Serialize for 'move' packet (entity movement broadcast).
   * Matches client: {type:"move", id, x, y}
   */
  toMovePacket() {
    return {
      type: 'move',
      id: this.id,
      x: this.x,
      y: this.y,
    };
  }

  /**
   * Serialize player template for plr_tpl packet.
   */
  toTemplatePacket() {
    return {
      type: 'plr_tpl',
      id: this.id,
      n: this.name,
      t: this.tribe,
      l: this.level,
      s: this.sprite,
      b: this.body,
      h: this.hair,
      c: this.clothes,
      cc: this.clothesColor,
      hc: this.hairColor,
      ec: this.eyeColor,
      pr: this.premium,
    };
  }

  /**
   * Serialize initial spawn data.
   * When a mob/player first appears, the client expects:
   * {type:"p", id, x, y, dx, dy, s, d, tpl, ...}
   */
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
      tpl: this.id,       // template references player's own template
      ch: this.isChatting ? 1 : 0,
    };
  }

  /**
   * Calculate effective speed on current tile.
   */
  updateCurSpeed(tileSpeedMod = 0) {
    this.tileSpeedMod = tileSpeedMod;
    this.curSpeed = this.speed + tileSpeedMod;
    if (this.curSpeed < 100) this.curSpeed = 100; // minimum speed cap
  }
}
