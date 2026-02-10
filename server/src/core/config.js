import { config as dotenvConfig } from 'dotenv';
dotenvConfig();

const sslEnabled = ['true', '1'].includes((process.env.SSL_ENABLED || '').toLowerCase());

const config = {
  server: {
    port: parseInt(process.env.PORT, 10) || 8080,
    tickRate: parseInt(process.env.TICK_RATE, 10) || 20,
    env: process.env.NODE_ENV || 'development',
    ssl: {
      enabled: sslEnabled,
      certPath: process.env.SSL_CERT_PATH || '',
      keyPath: process.env.SSL_KEY_PATH || '',
    },
  },
  mongodb: {
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/mystermax',
  },
  redis: {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT, 10) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
  },
  game: {
    defaultSpeed: 750,        // ms per tile (matches client default e.speed=750)
    defaultMapWidth: 100,     // MAP_WIDTH default
    defaultMapHeight: 100,    // MAP_HEIGHT default
    viewWidth: 17,            // client view_width
    viewHeight: 13,           // client view_height
    directions: { UP: 0, RIGHT: 1, DOWN: 2, LEFT: 3 },
    maxDirection: 3,
  },
  security: {
    maxInputBuffer: parseInt(process.env.MAX_INPUT_BUFFER, 10) || 32,
    speedHackTolerance: parseFloat(process.env.SPEED_HACK_TOLERANCE) || 0.15,
    packetRateLimit: parseInt(process.env.PACKET_RATE_LIMIT, 10) || 60,
    maxTeleportDistance: 2,   // max tiles per single move
    connectionTimeout: 30000, // 30 seconds
  },
};

export default config;
