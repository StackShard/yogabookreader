# Changelog

All notable changes to Yoga Book Reader are documented here.

## [1.2.0] — 2026-07-02

### Reading
- **Two-page spread on a single landscape screen.** A single wide (landscape)
  display now shows two pages side by side in one window — an open-book spread,
  just like the dual-screen experience — instead of one page at a time. It's on
  by default and uses the same pairing, cover, centerfold, and LTR/RTL rules as
  the dual-screen mode. Toggle it with **▦ Two-up** in the ⚙ Settings strip
  (shown only on a single landscape screen); rotating between portrait and
  landscape switches modes automatically. A single **portrait** screen still
  shows one page at a time (two-up would be too narrow to read).

## [1.1.9] — 2026-07-02

### Launch
- **Portable build now shows a "Loading…" splash while it extracts.** The
  portable `.exe` unpacks itself (and Windows Defender scans it) before the app
  can start — previously a blank, frozen-looking gap of up to ~20s on slow
  disks. It now displays a branded splash during that unpack so it's clearly
  launching. (The app's own optimizations can't help here — the gap is before
  any app code runs.)
- **README now explains the portable-vs-installer launch-speed difference.**
  The installer runs in place and launches fast; the portable build trades a
  slower first launch for being a single no-install file. The installer is
  recommended for anyone bothered by launch time.

## [1.1.8] — 2026-07-02

### Launch
- **Window now appears before any disk I/O** — the splash screen is visible in
  1–3s instead of blocking on the synchronous `state.json` read (previously
  20+s with a large library).
- **pdf.js imported lazily** on the splash page — the 650KB module no longer
  blocks the first paint; cover generation loads it on demand.
- **Spinner stays on screen until real content is ready** — no more blank
  library section during a fresh folder scan.

### Memory
- **Protocol handler supports HTTP Range requests** (`206 Partial Content`) so
  pdf.js can stream just the parts of a PDF it needs instead of downloading
  the entire file into every renderer process.
- **pdf.js streaming enabled** — both reader windows now load the PDF
  incrementally via range requests. For a 200MB PDF this reduces per-renderer
  memory from ~200MB to ~50–80MB.
- **Main-process PDF metadata no longer buffers the full file** — uses a
  `file://` URL instead of `Uint8Array`, eliminating a 200+MB allocation.

### Progress
- **Determinate progress bar** for library scans, comic extraction, and PDF
  page classification — replaces the old text-only status pill with a thin
  progress bar showing percentage complete.
- Progress callbacks threaded through every main-process long operation, with
  automatic throttle to avoid IPC flood on large inputs.

## [1.1.7] — 2026-07-02

### Performance
- **Launch no longer blocks on temp cleanup** — a large leftover comic-
  extraction temp directory (which only accumulates after a crash or
  force-quit) could previously delay the very first window paint by many
  seconds with zero visual feedback. Cleanup now runs without blocking window
  creation, and is race-safe against a concurrent file open.
- **Splash screen shows a loading spinner** during the initial data load
  instead of appearing frozen.
- **Library rendering no longer floods the app with cache-check calls** —
  large libraries (hundreds/thousands of items) now check which covers are
  already cached in one batched call instead of one call per item.
- **State reads no longer re-read the whole settings file from disk** on
  every call; the app keeps an in-memory copy in sync instead, which matters
  most for large libraries with lots of tracked reading progress.

## [1.1.6] — 2026-07-02

> First stable release since v1.1.3 — supersedes the v1.1.4-beta and
> v1.1.5-beta pre-releases (page save/print, print scaling) with no
> functional changes to that work, plus the quality-of-life pass below.

### Reading
- **RTL (manga) mode now swaps the directional controls** — edge taps, held
  edges, swipes and arrow keys follow the right-to-left reading direction, so
  the left edge turns to the next page. The help diagram updates to match.
- **Double-tap zoom cycling works on the left screen too** (it previously only
  worked on the screen with the control bar).
- **Comics with duplicate page names across sub-folders** (e.g. `ch1/01.jpg`,
  `ch2/01.jpg`) no longer lose pages — every page extracts, in reading order.
- A page that repeatedly fails to decode now shows a "Page N failed to load"
  notice instead of retrying forever, and transient failures are retried
  properly instead of being remembered as permanently broken.
- Gestures interrupted by Windows (edge swipes, palm rejection) no longer
  trigger a stray jump to the first/last page.

### App & Library
- **Launching the app while it's already running now focuses the running
  window** (and opens the file passed on the command line, if any) instead of
  closing silently. The installer registers the app as an "Open with" handler
  for PDF/CBZ/CBR.
- **Opening feedback** — the library shows "Opening…" immediately while a
  large comic extracts.
- "Regenerating covers…" no longer gets stuck when there is nothing to
  regenerate, and covers are no longer generated twice for files shown in both
  Recent and Library.

### Controls & Polish
- **Escape closes the topmost layer first** (page menu → help → dial pad /
  control bar) and only toggles full-screen when nothing is open. **F / F11**
  toggle full-screen as documented; **Shift+Space** pages backwards.
- **Tapping the centre now toggles the control bar** instead of only showing it.
- The Jump Page dial pad shows the page range ("of N pages") and visibly clamps
  input beyond the last page.
- Failed page saves show "Could not save page" instead of failing silently.
- File-open errors gained a **Back to library** button.

### Performance
- Page turns write reading progress to disk once instead of twice, with a
  single state load instead of four.
- Dragging the brightness slider no longer spawns a PowerShell process per
  tick — hardware brightness applies are coalesced so the final level wins.

## [1.1.5-beta] — 2026-06-30

> Beta / pre-release.

### Fixes
- **Print scaling** — a printed page now fills the sheet (aspect preserved,
  small margin) instead of printing as a small graphic in the middle, and wide
  pages print in landscape. (Print preview is still unavailable — an Electron
  limitation of the system print path.)

## [1.1.4-beta] — 2026-06-30

> Beta / pre-release.

### Page Actions
- **Save or print a page** — hold (long-press) the centre "Tap for menu" area of
  either screen to open a **Save page** / **Print page** menu for the page shown
  there (works on both screens). Save uses an intelligent, collision-free name
  (`<Title> - p<N>.<ext>` in Pictures); comics save the original image, PDF pages
  save as a high-res PNG. Print goes to the system print dialog.

### Reader Polish
- **Jump Page dial pad** sits lower on screen, closer to the button, and its
  number display no longer jumps taller when you type the first digit.
- **Splash**: the Quit button is now the leftmost action, matching the reader bar.

## [1.1.3] — 2026-06-30

### Spread Alignment
- **Spread nudge** — fix a skipped or mis-scanned page that throws off every
  two-page pair from that point on. **⇥ Nudge** (in the settings strip) forces
  the current page to start a spread alone, re-aligning everything after it
  without moving your place; **Reset align** clears it. Saved per document, and
  it supports more than one nudge for books with several bad pages.

### Reading Progress
- Recent and Library tiles show **page-of-total** progress (e.g. `42 / 180`),
  falling back to `Page 42`, then the document type.

### Library Tools
- **Open containing folder** — long-press or right-click any tile to reveal the
  file in Explorer.
- **Clean missing** — drop recent entries whose files were moved or deleted.
- **Regenerate covers** — clear the thumbnail cache and rebuild covers.

### Reader & Help
- **Better error recovery** — file-open errors offer *Choose another file*,
  *Remove from Recent*, and a *Show details* toggle.
- **Single-screen diagnostic** — the splash screen shows a *Single-screen mode*
  chip with a *why?* explanation when a two-page spread isn't possible.
- **Version line** on the help screen.
- Renamed the page-picker button to **Jump Page**.

### Fixes
- **Application icon** now shows correctly in the Windows *small icons* view
  (dedicated bold artwork for small sizes).

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
