# Changelog

All notable changes to Yoga Book Reader are documented here.

## [1.0.0] — 2026-06-28

### Initial Release

First public release of the Yoga Book Reader.

#### Reading Engine
- Dual-screen spread rendering — two portrait displays treated as a single open-book surface
- Cover-first spread ordering with proper centerfold handling (wide pages span both screens via half-crop)
- LTR and RTL reading direction support
- Single-display fallback when only one screen is connected or in landscape
- Per-file reading position resume on reopen

#### Supported Formats
- **PDF** — page rendering via pdf.js, per-page dimension extraction for aspect classification
- **CBZ** — ZIP-based comic archives (via adm-zip)
- **CBR** — RAR5 comic archives (via node-unrar-js)

#### Controls & Interaction
- Touch navigation — tap left/right edges for prev/next, center for controls, swipe gestures
- Keyboard navigation — arrow keys, F/fullscreen toggle, Escape
- Control overlay with auto-hide — prev/next, library, help, settings drawer
- Settings drawer — zoom presets (fit-height, fit-width, full-bleed), direction toggle, brightness

#### Library & Launcher
- Splash screen with recent files list (up to 24)
- Folder-based library with collapsible sections, cached cover thumbnails
- Folder picker for building your library
- Clear recent files option

#### Hardware Integration
- System backlight control via WMI (Yoga Book hardware)
- Adaptive brightness auto-disable while reading

#### Architecture
- Pure logic core (`src/core/`) — fully unit-tested (57 tests), zero Electron/I/O imports
- Strict three-process Electron architecture — main, preload, renderer
- Typed IPC contract shared across all layers
- Custom `yreader://` protocol for secure local file serving
- Portable .exe packaging (no installer needed) + NSIS installer option

#### Technical
- Electron 31, TypeScript 5.5, Vite 5.4
- electron-vite for bundling, electron-builder for packaging
- CI: typecheck + unit tests on push/PR (windows-latest, Node 20)
