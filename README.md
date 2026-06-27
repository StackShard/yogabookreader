# Yoga Book Reader

A dual-screen magazine & manga reader for the **Lenovo Yoga Book Gen 10**. Its two
1800×2880 portrait displays are treated as a single open-book reading surface,
rendering left/right pages as one cohesive two-page spread. Supports PDF and
CBZ/CBR.

Built with **Electron + TypeScript**. See the PRD for full product goals.

## Architecture

The hardware-independent decision logic lives in a pure, fully unit-tested core
(`src/core/`) with **no** Electron or I/O imports. The Electron shell consumes it.

| Area | Path |
| --- | --- |
| Pure logic core (tested) | `src/core/` — `spread`, `navigation`, `aspect`, `placement`, `state` |
| Main process | `src/main/` — windows, IPC controller, session, file/PDF/comic loading, state store |
| Preload bridge | `src/preload/preload.ts` |
| Renderer (per window) | `src/renderer/` — render engine, touch, overlay, splash/library, error |
| Shared IPC contract | `src/shared/ipc.ts` |
| Unit tests | `test/core/` |

### Core logic highlights

- **`spread.ts`** — `buildSpreads()` decides what each screen shows: cover-first
  (right for LTR / left for RTL), two-page pairing, wide centerfold pages spanning
  both screens (half-crop), spread-encoded scans, and single-display fallback.
- **`navigation.ts`** — next/prev/jump with boundary clamping and resume-on-reopen.
- **`aspect.ts`** — classifies pages as single / double-spread / spread-encoded
  from their dimensions, with a manual override.
- **`placement.ts`** — assigns the two 1800×2880 monitors to left/right, detecting
  single (folded) and ambiguous layouts.
- **`state.ts`** — JSON state round-trip and the recent-files list.

## Scripts

```bash
npm install          # ELECTRON_SKIP_BINARY_DOWNLOAD=1 if the binary fetch is blocked
npm test             # run the core unit-test suite (vitest)
npm run typecheck    # tsc --noEmit
npm run build        # bundle main/preload/renderer (electron-vite) + typecheck
npm run dev          # run the app in development (requires the Electron binary)
npm run package      # build a portable Windows .exe (electron-builder)
```

## Status

The pure-logic core is complete and unit-tested (54 tests). The Electron
rendering/window layer is implemented and type-checks/builds, but is best verified
on the actual Yoga Book hardware (two 1800×2880 Windows monitors), which the CI
environment cannot provide.
