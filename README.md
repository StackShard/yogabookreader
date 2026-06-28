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

## Windows quick start (Yoga Book, nothing installed)

The Yoga Book Gen 10 runs Windows 11, which ships with `winget`, so you can set up
the toolchain from PowerShell without downloading any installers by hand.

1. Install Node.js (includes `npm`) and Git:

   ```powershell
   winget install OpenJS.NodeJS.LTS Git.Git --accept-source-agreements --accept-package-agreements
   ```

2. **Close and reopen PowerShell** so the updated `PATH` takes effect, then get the
   code and install dependencies:

   ```powershell
   git clone https://github.com/StackShard/yogabookreader.git
   cd yogabookreader
   npm install
   ```

   > The first `npm install` downloads Electron's runtime (~100 MB). That's normal
   > on a regular network connection.

3. Either run the app directly, or build a double-clickable portable executable:

   ```powershell
   npm run dev        # launch the app in development

   # ...or produce a standalone portable .exe (no installer):
   npm run package
   .\dist\YogaBookReader-1.0.0-portable.exe
   ```

The portable `.exe` under `dist\` needs no installation — copy it anywhere and run
it. Plug in both Yoga Book screens (portrait) before launching for the two-page
spread; with one screen it falls back to single-page mode.

## Run it like a normal app (no dev server)

`npm run dev` is only for development. For everyday use, build the portable
executable once and launch that — no terminal, no dev server:

```powershell
npm run package
```

This produces `dist\YogaBookReader-1.0.0-portable.exe`. Then either double-click it,
or make it easy to launch:

- **Desktop shortcut:** in File Explorer, right-click the `.exe` →
  **Show more options** → **Send to** → **Desktop (create shortcut)**.
- **Pin to taskbar/Start:** right-click the `.exe` → **Pin to taskbar** (or
  **Pin to Start**).

You only need to re-run `npm run package` after pulling new changes. Hold the device
in book posture (two side-by-side portrait screens) before launching for the
two-page spread.

## Status

The pure-logic core is complete and unit-tested (57 tests). The Electron
rendering/window layer is implemented and type-checks/builds, but is best verified
on the actual Yoga Book hardware (two 1800×2880 Windows monitors), which the CI
environment cannot provide.

**Test coverage** (`npm test -- --coverage`) currently targets `src/core/` only.
The main process and renderer modules rely on real Electron APIs or the DOM and
are exercised manually on hardware rather than mocked in CI.
