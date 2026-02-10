import { GameServer } from './gameServer.js';
import { logger } from '../utils/logger.js';

/**
 * Server entry point.
 * Bootstraps and starts the authoritative game server.
 */
const server = new GameServer();

// Graceful shutdown
process.on('SIGINT', async () => {
  await server.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await server.stop();
  process.exit(0);
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception:', err);
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection:', reason);
});

// Start the server
server.start().catch((err) => {
  logger.error('Failed to start server:', err);
  process.exit(1);
});
