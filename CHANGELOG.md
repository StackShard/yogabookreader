# Changelog

All notable changes to Yoga Book Reader are documented here.

## [1.1.2] — 2026-06-29

### Overlay Refinements
- **Progress bar removed** — cleaner overlay; book title and page numbers merged into one header line (`Title · 54-55 / 66`)
- **Dial-pad page picker** — new `# Pg` button in the settings strip opens a 3x4 numpad dial pad for keyboard-free page entry; backdrop tap dismisses; overlay auto-hide pauses while open
- **Settings strip centered** — buttons are now centre-aligned for a more balanced look

### Library Improvements
- **Recent files capped at 8** (was 24) in both storage and display
- **Thin separator** between Recent and Library sections
- **Individual recent-file removal** — long-press a recent tile to see a context menu with the book title, Remove, and Cancel
- **Clear Recent with confirmation** — Clear button now requires a second tap ("Really clear?") that auto-reverts after 4 s to prevent accidental clears

### IPC & Internals
- New `r2m:remove-recent-file` IPC channel for single-entry recent-file removal

## [1.1.1] — 2026-06-29

### New Gestures & Shortcuts
- **Double-tap centre** of the screen to cycle through zoom presets (Fit Width → Fit Height → Full Bleed)
- **Long-press left edge** to jump to the **first page**
- **Long-press right edge** to jump to the **last page**
- **Home / End keys** — jump to first / last page

### UI Improvements
- **Active zoom highlight** — the current zoom-preset button is now visually highlighted in the settings strip
- **Book title** displayed above the progress bar when a document is open
- **Settings strip auto-collapses** after selecting a zoom preset or toggling reading direction — one less tap to get back to reading
- **Swipe down** on the settings strip dismisses the overlay entirely (previous behaviour collapsed the strip; a harder swipe now closes it)
- **Control bar reordered** — Quit · Help · Settings · Library · brightness · Auto, with brightness and Auto-brightness always visible

## [1.1] — 2026-06-29

### UI Polish — Modernised Reader Overlay

#### Controls
- Removed redundant Prev / Next buttons from the control bar (swipe and tap-zone navigation unchanged)
- Merged the ⚙ More / Less toggle and ⌄ Hide button into a single **⚙ Settings / ⌄ Hide** button
- Removed the Exit Full-Screen button (Esc key still toggles full-screen)
- Moved **Quit** to the primary control bar so it is always reachable without opening settings
- Added an inline **quit confirmation row** (Really quit? / Cancel / Quit Now) that auto-dismisses after 5 seconds if untouched

#### Progress & Navigation
- Go-to-page input and **Go** button now live on the same row as the progress bar — no keyboard required
- Progress bar is now **tappable**: tap anywhere on it to jump directly to that position in the book
- Page label shortened to `N / T` format for compactness

#### Settings Strip
- Collapsed the four labelled setting sections (View / Reading / Display / App) into a single **horizontal-scroll row**: Fit Width · Fit Height · Full Bleed · ↔ LTR/RTL · ☀ Auto · brightness slider
- Auto-brightness button label shortened to `☀ Auto: On / Off`

### Architecture & Maintainability
- Refactored `ReaderController` into dedicated `BrightnessController` and `DocumentOpener` modules — cleaner separation, easier to test and extend
- Streamlined IPC layer: consolidated handler registration patterns, ~120 lines of boilerplate removed

### Reading Engine
- Improved page aspect ratio classification for more accurate spread detection on mixed-orientation documents

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
