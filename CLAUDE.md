# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start dev server (camera requires HTTPS in production, but localhost works)
npm run build    # TypeScript type check + Vite build
npm run preview  # Preview the production build
```

No test framework is set up.

## Architecture

Frontend-only SPA (Vite + React 19 + TypeScript). No server required.

### Two-tier gesture recognition

1. **Rule-based** (`gesture.ts`): Classifies Rock/Scissors/Paper from MediaPipe's 21-point landmarks by checking finger extension states. A stabilizer (majority vote over last 5 frames) smooths the output.
2. **MLP model** (`classifier.ts`): TensorFlow.js 3-class classifier trained in-browser, persisted to `indexeddb://rps-gesture-model`. When loaded, MLP takes priority over rule-based. Use `isModelReady()` to check which is active.

### Battle mode capture flow

`BattleView.tsx` runs an async loop that voices "jan → ken → pon" via Web Speech API.

- **Raw frame reference**: `App.tsx` keeps `currentRawGestureRef` updated every frame with `{ gesture, frameTime, landmarks }`, bypassing the stabilizer. `BattleView` accesses it via a prop callback.
- **Landmark collection**: A `setInterval(50ms)` starts at the "ken" phase and stops when "pon" finishes speaking, collecting `motionLandmarks` saved into `BattleRecord`.
- **Capture timing**: After "pon" finishes, wait 300ms then poll for the first frame where `frameTime >= ponEndTime`. Chrome has a bug where calling `speak()` immediately after `speechSynthesis.cancel()` produces silence — a 50ms delay after `cancel()` is required before the next `speak()`.

### Data flow

```
Camera → MediaPipe → classifier/gesture → currentRawGestureRef
                                               ↓
                                         BattleView (battle loop + capture)
                                               ↓
                                         BattleRecord → IndexedDB (battles store)
                                               ↓
                                         handleBattleEnd → convert to GestureRecord
                                               ↓
                                         Analysis dashboard (BiasAnalysis, etc.)
```

### Analysis dashboard

`App.tsx` passes both `records: GestureRecord[]` and `battleRecords: BattleRecord[]` to the dashboard. Only `TimingAnalysis` uses `battleRecords`: it calls `calcReadableMs` on each record's `motionLandmarks` to determine how many ms after "ken" the hand shape becomes classifiable, displayed as a box plot ("when your hand can be read").

### IndexedDB schema (`db.ts`)

- `gestures` store (keyPath: `timestamp`): `GestureRecord`
- `battles` store (keyPath: `id`): `BattleRecord` (includes `motionLandmarks?: number[][][]`)
- DB version: 2

When changing the schema, increment `DB_VERSION` and update `onupgradeneeded`.

### MediaPipe note

WASM files are loaded from CDN (`cdn.jsdelivr.net`) via the `locateFile` setting in `camera.ts`. They are not bundled locally.
