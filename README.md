# Gecko Sprint

Gecko Sprint is a real-time mini game where ten neon geckos dash to the finish line while the crowd (your players) slam a boost button to influence the race. The project ships with branding, sound design, gameplay loop, tests, and documentation so it can be launched locally right away.

## Stack

- **Backend:** Node.js, Express, Socket.IO, TypeScript state machine (pnpm workspace package `@gecko/server`)
- **Frontend:** Vite + vanilla TypeScript + Socket.IO client with CSS transform-driven animation
- **Styling:** Custom Gecko Sprint brand system (glassy panels, countdown overlay, palette)
- **Audio:** Web Audio API pops/fanfare generated at runtime (no external assets required)
- **Tooling:** pnpm workspace, ESLint (flat config) + Prettier, Vitest suites for server & client

## Getting Started

1. Ensure pnpm is available (the helper installs it if missing):
   ```bash
   npm run setup
   # or
   node scripts/ensure-pnpm.mjs
   ```
2. Install workspace dependencies (server + client packages):
   ```bash
   pnpm install
   ```
3. Launch the full experience (Socket.IO server + Vite dev server):
   ```bash
   pnpm run dev
   ```
   - Backend lives on `http://localhost:4000`
   - Frontend runs on `http://localhost:5173` and connects automatically

### Environment

- The client auto-detects `http://localhost:4000` for Socket.IO. To point at a different host/port, create `client/.env` with `VITE_SOCKET_URL=<url>`.
- Production build compiles the TypeScript server into `server/dist` and bundles the client into `client/dist`. Serve everything via `pnpm run build` followed by `pnpm run start`.

## Gameplay Rules

- **Cycle:** Every round runs on a 120s cadence - LOBBY (88s) -> LOCKOUT (10s) -> CLICK_WINDOW (5s) -> RACING (12s, final 2s in slow motion) -> RESULTS (5s) -> repeat.
- **Participation:** Players choose one of the ten geckos during LOBBY. Once LOCKOUT starts, no new joins or swaps are accepted until the next lobby.
- **Click Aggregation:** Only clicks during the CLICK_WINDOW are counted. Each player is rate-limited to **50 clicks per second**, and the server broadcasts progress snapshots every 200 ms.
- **Race Resolution:** Track length L = 100. Each gecko receives speed v = 0.2 + 0.8 * (clicks / maxClicksInRound) (fraction of the track per second). The backend integrates distance to emit progress (0-1), clickTotals, and an isSlowMo flag for the final two seconds.
- **Bots:** 6-12 bot spectators are spawned per human racer in each lobby. Bots pick random geckos and click with a +/-15% bias, but only during the click window.
- **Rejoin:** Clients persist a playerId; reconnecting with the same id restores nickname, selections, and stats.
## Scripts

| Command | Description |
| --- | --- |
| `pnpm run dev` | Runs the TypeScript server (`pnpm --filter @gecko/server run dev`) and Vite dev server concurrently |
| `pnpm run dev:server` | Watches only the Express + Socket.IO backend |
| `pnpm run dev:client` | Starts only the Vite development server |
| `pnpm run lint` | ESLint (TypeScript-aware) on `server/src` and `server/tests` |
| `pnpm run format` | Formats server TypeScript with Prettier |
| `pnpm run build` | Compiles the server (`tsc`) and builds the client bundle |
| `pnpm run start` | Serves the production client through Express (`node server/dist/index.js`) |
| `pnpm run test` | Runs lint, backend Vitest suite, and client Vitest suite |
| `pnpm run test:server` | Runs Vitest on the backend game loop |
| `pnpm run test:client` | Runs Vitest assertions for client utilities |

## Code Tour

- `server/src/types.ts` - game configuration, lobby, and snapshot typing.
- `server/src/gameLoop.ts` - authoritative state machine (phase timing, click-to-speed math, slow-motion staging).
- `server/src/lobby.ts` - player registry with selection locks, reconnection tracking, and participation stats.
- `server/src/bots.ts` - AI boosters that rebalance each lobby and click with random biases.
- `server/src/index.ts` - Express + Socket.IO bootstrap that honours stored player IDs and streams state.
- `server/tests/gameManager.test.ts` - Vitest specs covering phase transitions, click-based speed, and rate limiting.
- `client/src/store.ts` - observable client state (snapshots, lobby, toasts).
- `client/src/api.ts` - Socket.IO bridge, reconnection handshake, and audio feedback.
- `client/src/ui.ts` - DOM renderer for lineup cards, command center, countdown overlay, and telemetry.
- `client/src/animation.ts` - requestAnimationFrame-driven transform animator for race progress.
- `client/src/assets/` - brand logo plus ten colour-coded gecko silhouettes.

## Testing

```bash
pnpm run test              # lint + backend + client suites
pnpm run test:server       # backend engine tests
pnpm run test:client       # client-side unit tests
```

Vitest uses the Node environment for server specs and JSDOM for client utilities. Backend tests use fake timers, deterministic speed ranges, and rate-limit assertions.

## Production Build & Deployment

1. Create the optimized bundles:
   ```bash
   pnpm run build
   ```
2. Launch the compiled server pointing at the built client:
   ```bash
   pnpm run start
   ```
   Express serves `client/dist` and hosts the Socket.IO endpoint on the same port.

Enjoy sprinting with the geckos!


## Socket Events

| Event | Direction | Payload | Description |
| --- | --- | --- | --- |
| welcome | server -> client | { id, nickname, selectionId? } | Sent on connect (or reconnect) with the server-assigned player id and any saved selection. |
| state | server -> client | GameStateMessage | Full snapshot used for lobby details, timers, and UI bootstrapping. |
| aceProgress | server -> client | { progress: number[]; isSlowMo: boolean } | Broadcast every 200 ms during racing to animate the 10-track progress meters. |
| oost:result | server -> client | { applied: boolean; reason? } | Result of a boost attempt (ate_limited, invalid_phase, invalid_lizard). |
| player:update | client -> server | { nickname } | Updates the player nickname (LOBBY only). |
| player:select | client -> server | { lizardId } | Submits a selection while in LOBBY; ignored after LOCKOUT. |
| oost | client -> server | { lizardId } | Attempts to register a click during the CLICK_WINDOW (subject to rate limit). |