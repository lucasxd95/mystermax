# Mystermax Authoritative MMORPG 2D Server

A fully authoritative, production-ready MMORPG 2D server built in Node.js, designed to be compatible with the Mystera Legacy client protocol.

## Architecture

### Design Principles
- **Server Authority**: The server is the single source of truth for all game state
- **Input-Based Movement**: Client sends movement inputs (direction + position), never absolute positions
- **Tick-Based Loop**: Fixed timestep game loop at 20 Hz (configurable)
- **Clean Architecture**: Modular, domain-driven design with clear separation of concerns
- **WebSocket**: Uses native `ws` library for minimal overhead (no Socket.IO bloat)

### Why WebSocket (`ws`) over Socket.IO?
- **Performance**: No auto-reconnection overhead, no polling fallback, no event parsing layer
- **Binary Support**: Can easily switch to binary protocols for bandwidth optimization
- **Control**: Full control over connection lifecycle, message framing, and backpressure
- **Compatibility**: The Mystera Legacy client uses native WebSocket (`new WebSocket(...)`)

## Folder Structure

```
server/
├── src/
│   ├── core/
│   │   ├── server.js           # Entry point / bootstrap
│   │   ├── gameServer.js       # Main game server orchestrator
│   │   ├── config.js           # Configuration loader
│   │   └── tickLoop.js         # Fixed-timestep game loop
│   ├── network/
│   │   ├── wsServer.js         # WebSocket server & connection manager
│   │   ├── packetRouter.js     # Routes packets to handlers
│   │   ├── packetValidator.js  # Validates packet structure
│   │   └── inputQueue.js       # Per-player input buffering
│   ├── game/
│   │   ├── world/
│   │   │   ├── gameMap.js      # Map data structure & operations
│   │   │   ├── mapLoader.js    # Map loading & management
│   │   │   └── tileCollision.js # Tile walkability & collision rules
│   │   ├── entities/
│   │   │   ├── player.js       # Player entity
│   │   │   ├── npc.js          # NPC entity
│   │   │   └── mob.js          # Monster entity
│   │   ├── systems/
│   │   │   ├── movementSystem.js    # Authoritative movement
│   │   │   ├── combatSystem.js      # Combat & damage
│   │   │   └── inventorySystem.js   # Item management
│   │   └── sync/
│   │       ├── stateSnapshot.js     # Periodic state broadcasts
│   │       └── deltaCompression.js  # Delta updates & batching
│   ├── database/
│   │   ├── mongodb/
│   │   │   ├── schemas.js      # Collection schemas & indexes
│   │   │   └── repository.js   # CRUD operations
│   │   └── redis/
│   │       └── redisStore.js   # Sessions, cache, pub/sub
│   ├── security/
│   │   ├── antiCheat.js        # Speed hack & teleport detection
│   │   └── rateLimiter.js      # Packet rate limiting
│   ├── auth/
│   │   └── authService.js      # Login & session management
│   └── utils/
│       ├── logger.js           # Winston logger
│       └── math.js             # Direction vectors, distance, etc.
├── package.json
├── .env.example
└── .gitignore
```

## Movement & Prediction Model

### How Movement Works

The Mystera Legacy client uses **tile-based grid movement**:

1. **Grid System**: Players occupy integer (x,y) tile positions
2. **Movement Speed**: Each tile takes `speed` ms to traverse (default: 750ms)
3. **Directions**: 0=UP, 1=RIGHT, 2=DOWN, 3=LEFT
4. **Interpolation**: Client visually interpolates between `fromX/fromY` and `x/y` over `curSpeed` ms

### Client → Server Movement Protocol

The client sends two types of movement messages:

#### `{type: "h", x, y, d}` — Movement Start
Sent when the player begins moving to a new tile:
- `x, y`: The player's **current** (from) position
- `d`: Direction of movement (0-3)
- The **target** position is calculated: `targetX = x + dx[d]`, `targetY = y + dy[d]`

#### `{type: "m", x, y, d}` — Direction Change
Sent when the player changes facing direction without moving:
- `x, y`: Current position
- `d`: New facing direction
- Used when: holding Ctrl, facing a wall, turning in place

### Server Authority Flow

```
Client                          Server
  |                               |
  |  {type:"h", x:5, y:5, d:1}   |  Player wants to move RIGHT from (5,5)
  |------------------------------>|
  |                               |  1. Validate direction (0-3)
  |                               |  2. Check position matches server state
  |                               |  3. Calculate target (6,5)
  |                               |  4. Check tile walkability
  |                               |  5. Check entity collision
  |                               |  6. Validate movement speed (anti-cheat)
  |                               |  7. Apply move: player.x=6, player.y=5
  |                               |
  |  {type:"move", id, x:6, y:5} |  Broadcast to nearby players
  |<------------------------------|
  |                               |
  |  (If position mismatch):      |
  |  {type:"pos", x:5, y:5}      |  Correction sent to client
  |<------------------------------|
```

### Server Reconciliation

When the server detects a discrepancy:
1. Server sends `{type: "pos", x, y}` to the client
2. Client receives this and immediately snaps to the authoritative position:
   - Sets `mob.x = json.x`, `mob.y = json.y`
   - Resets `fromx, fromy, tweenx, tweeny, traveled`
   - This effectively teleports the client to the correct position

### Speed Hack Detection

The server tracks `lastMoveTime` for each player. If a new move arrives before `curSpeed * (1 - tolerance)` ms have elapsed, it's flagged as a speed hack and the move is rejected with a position correction.

## Packet Protocol

### Client → Server

| Type | Fields | Description |
|------|--------|-------------|
| `client` | `ver, mobile, agent` | Client identification |
| `login` | `user, pass` or `data` | Login with credentials |
| `guest` | — | Guest login |
| `h` | `x, y, d` | Start movement from position in direction |
| `m` | `x, y, d` | Change facing direction |
| `a` | — | Attack/interact action |
| `t` | `t` | Target entity by ID |
| `g` | — | Pickup item at feet |
| `u` | `slot` | Use inventory item |
| `d` | `slot, amt` | Drop item |
| `sw` | `slot, swap` | Swap inventory slots |
| `chat` | `data` | Send chat message |
| `c` | `r, ...` | Character operation (sub-request) |
| `bld` | `tpl` | Build object |
| `P` | — | Pong (response to ping) |

### Server → Client

| Type | Fields | Description |
|------|--------|-------------|
| `accepted` | `mw, mh, tile, name, guest?, pass?, created?` | Login accepted |
| `logmsg` | `text` | Login error message |
| `pos` | `x, y, t?` | Authoritative position correction |
| `move` | `id, x, y` | Entity movement |
| `p` | `id, s, d, x, y, dx, dy, tpl, ch` | Player state update |
| `pl` | `data[]` | Batch player list |
| `plr_tpl` | `id, n, t, l, pr` | Player template (appearance) |
| `map` | `x, y` | Map data update |
| `mt` | `t, w, h, m, n, c, f, s` | Map transition |
| `o` | `x, y, d` | Object update at tile |
| `obj` | `data[]` | Batch object list |
| `ping` | `c` | Ping (expects pong) |
| `P` | — | Pong response |
| `message` | `id, text` | Chat message |
| `hpp` | `id, n, o` | HP bar update |
| `s` | `h, k, t, f, e, p` | Status bar update |
| `inv` | `data` | Inventory update |
| `game` | `lb, lh, lc, pr` | Game state |
| `effect` | `...` | Visual effect |
| `zip` | `data` | Compressed batch |
| `pkg` | `data[]` | Uncompressed batch |

## Database

### MongoDB Collections

- **accounts**: User accounts (username, password hash, email, premium)
- **characters**: Player characters (stats, position, appearance)
- **inventory**: Item slots per character
- **worldData**: Persistent placed objects in the world

### Redis Keys

- `session:{sessionId}` — Player session data (TTL 1h)
- `player:{playerId}:pos` — Real-time position cache (hash)
- `player:{playerId}:seq` — Last processed input sequence

### Redis Pub/Sub Channels

- `player:move` — Cross-instance movement broadcasts
- `player:chat` — Cross-instance chat broadcasts
- `world:update` — World state changes

## Security

### Anti-Cheat Measures

1. **Position Authority**: Server never trusts client-reported positions as truth
2. **Speed Hack Detection**: Validates time between moves against expected speed
3. **Teleport Detection**: Rejects position claims far from server state
4. **Rate Limiting**: Token-bucket limiter per session (60 packets/second default)
5. **Input Buffer Limit**: Max 32 queued inputs to prevent flooding
6. **Packet Validation**: All packets validated for structure and types
7. **Collision Server-Side**: Only server resolves collisions

### Violation Tracking

Players accumulate violations. After 10 violations, the server may kick the player.

## Running the Server

```bash
cd server
cp .env.example .env   # Configure environment
npm install
npm start              # Production
npm run dev            # Development (auto-reload)
```

## Configuration

See `.env.example` for all configuration options. Key settings:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 8080 | WebSocket server port |
| `TICK_RATE` | 20 | Game loop updates per second |
| `MONGODB_URI` | `mongodb://localhost:27017/mystermax` | MongoDB connection |
| `REDIS_HOST` | `127.0.0.1` | Redis host |
| `MAX_INPUT_BUFFER` | 32 | Max queued inputs per player |
| `SPEED_HACK_TOLERANCE` | 0.15 | 15% speed tolerance |
| `PACKET_RATE_LIMIT` | 60 | Max packets per second |
