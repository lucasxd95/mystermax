/**
 * Validates incoming packet structure and types.
 * All packets must have a 'type' string field.
 * Specific field validation per packet type.
 */
export class PacketValidator {
  constructor() {
    this.validators = new Map();
    this.registerValidators();
  }

  registerValidators() {
    this.validators.set('client', (pkt) =>
      typeof pkt.ver === 'string' && typeof pkt.agent === 'string'
    );

    this.validators.set('login', (pkt) =>
      (typeof pkt.data === 'string') ||
      (typeof pkt.user === 'string' && typeof pkt.pass === 'string')
    );

    this.validators.set('guest', () => true);

    // Movement start: client sends from position + direction
    this.validators.set('h', (pkt) =>
      Number.isFinite(pkt.x) && Number.isFinite(pkt.y) &&
      (pkt.d === undefined || (Number.isInteger(pkt.d) && pkt.d >= 0 && pkt.d <= 3))
    );

    // Direction change: current position + direction
    this.validators.set('m', (pkt) =>
      Number.isFinite(pkt.x) && Number.isFinite(pkt.y) &&
      Number.isInteger(pkt.d) && pkt.d >= 0 && pkt.d <= 3
    );

    this.validators.set('a', () => true);

    this.validators.set('t', (pkt) =>
      pkt.t !== undefined
    );

    this.validators.set('g', () => true);

    this.validators.set('u', (pkt) =>
      Number.isInteger(pkt.slot) && pkt.slot >= 0
    );

    this.validators.set('d', (pkt) =>
      Number.isInteger(pkt.slot) && pkt.slot >= 0
    );

    this.validators.set('sw', (pkt) =>
      Number.isInteger(pkt.slot) && Number.isInteger(pkt.swap) &&
      pkt.slot >= 0 && pkt.swap >= 0
    );

    this.validators.set('chat', (pkt) =>
      typeof pkt.data === 'string' && pkt.data.length > 0 && pkt.data.length <= 500
    );

    this.validators.set('c', (pkt) =>
      typeof pkt.r === 'string'
    );

    this.validators.set('bld', (pkt) =>
      pkt.tpl !== undefined
    );

    this.validators.set('P', () => true);
    this.validators.set('A', () => true);
  }

  validate(packet) {
    if (!packet || typeof packet.type !== 'string') {
      return false;
    }

    const validator = this.validators.get(packet.type);
    if (!validator) {
      // Unknown packet type - allow but will be unhandled
      return true;
    }

    return validator(packet);
  }
}
