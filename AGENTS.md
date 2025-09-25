# Gecko Sprint Agents

- **Race Orchestrator (server/src/gameLoop.ts)**
  - Maintains the 120s lobby countdown before the sprint (LOBBY -> CLICK_WINDOW -> RACING -> RESULTS).
  - Aggregates click totals (50 CPS per-player limit) and maps them to deterministic speeds over the 100-unit track.
  - Streams both full `state` snapshots and 200 ms `raceProgress` broadcasts, flagging slow-motion windows.

- **Lobby Director (server/src/lobby.ts)**
  - Tracks human and bot racers, nickname updates, reconnections, and selection locks.
  - Exposes aggregated selections and connection status for telemetry.

- **Bot Manager (server/src/bots.ts)**
  - Rebalances 6012 biased bot boosters per human racer each lobby.
  - Fires click bursts only during the click window with ±15% timing variance.

- **Socket Liaison (client/src/api.ts)**
  - Handles persistent `playerId` auth, consumes `raceProgress` updates, and plays Web Audio cues.
  - Pushes toast feedback for boost outcomes and synchronises store snapshots.

- **UI Conductor (client/src/ui.ts)**
  - Renders lineup cards, supporter counts, command centre, countdown overlay, and slow-motion badges.
  - Drives the DOM via the animator for smooth progress transforms.

- **Animator (client/src/animation.ts)**
  - Interpolates CSS transforms for each racer and applies a 40% slow factor when `isSlowMo` is on.

- **State Keeper (client/src/store.ts)**
  - Manages observable client state (snapshot, lobby, toasts) and reconciles incremental progress updates.