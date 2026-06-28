# Yoga Book Reader

## 📖 For Readers

### What is Yoga Book Reader?

Yoga Book Reader turns your **Lenovo Yoga Book Gen 10** into a two-screen book. It
displays PDFs, manga (CBZ), and comics (CBR) across both 1800×2880 portrait screens
as a seamless two-page spread — like reading an open magazine or book. One screen
shows the left page, the other shows the right page.

The app is free and open source. No ads, no tracking, no data collection.

### Download & Run

1. Go to the **[Releases page](https://github.com/StackShard/yogabookreader/releases)**
2. Download the latest `YogaBookReader-1.0.0-portable.exe`
3. Double-click to run — no installation needed

You can also download the **installer** version (`YogaBookReader-1.0.0-setup-x64.exe`)
if you prefer a traditional Start menu entry and desktop shortcut.

### ⚠️ Windows SmartScreen Warning

When you first run the app, Windows may show a blue dialog:

> **Windows protected your PC**
>
> Microsoft Defender SmartScreen prevented an unrecognized app from starting.
> Running this app might put your PC at risk.

**This is normal.** Here's what to do:

1. Click **More info** (the small link below the warning text)
2. Click **Run anyway**

Why does this happen? The app is **not code-signed** — code signing certificates
cost hundreds of dollars per year, which isn't practical for an independent open
source project. Over time, as more people use the app safely, Microsoft's
reputation system learns to trust it and the warning stops appearing.

**To verify the file is genuine:** You can check the SHA-256 hash matches the
value posted in the release notes:

```powershell
Get-FileHash .\YogaBookReader-1.0.0-portable.exe -Algorithm SHA256
```

### How to Use It

1. **Set up your Yoga Book** — Open it in book posture (both screens in portrait
   orientation, side by side). In Windows Settings → Display, make sure both screens
   are set to Portrait orientation.
2. **Launch the app** — Double-click the .exe. You'll see the library/splash screen.
3. **Open a file** — Tap **"Open file…"** to pick a PDF or comic, or tap
   **"Choose folder"** to build a library from everything in that folder.
4. **Navigate pages**:
   - **Tap the left edge** of either screen → previous page
   - **Tap the right edge** of either screen → next page
   - **Swipe** left or right to turn pages
   - **Tap the center** of the screen → show/hide controls
5. **Use the controls** — The overlay bar has prev/next, library, help, and a
   settings drawer with zoom, reading direction, and brightness.

**Keyboard shortcuts** (when connected):
- **Left/Right arrow keys** — previous/next page
- **F** or **F11** — toggle fullscreen
- **Escape** — close overlay or exit fullscreen

### FAQ

<details>
<summary><strong>Nothing happens when I double-click the .exe</strong></summary>

Your antivirus may be blocking it. Temporarily disable real-time protection and try
again. If that works, add the .exe to your antivirus exclusion list. You can also
run it from PowerShell to see any error output:

```powershell
.\YogaBookReader-1.0.0-portable.exe
```
</details>

<details>
<summary><strong>Only one screen shows the app — the other is black</strong></summary>

Both screens need to be in **portrait orientation** (not landscape). Go to
Windows Settings → Display, select each screen, and set Display orientation to
**Portrait**. The app detects portrait screens automatically. If only one screen
is connected, the app falls back to single-page mode.
</details>

<details>
<summary><strong>The file won't open / shows an error</strong></summary>

Supported formats: **PDF**, **CBZ** (ZIP-based comic), and **CBR** (RAR-based comic,
RAR5 format only). Password-protected PDFs are not supported. If a file is corrupt
or incomplete, you'll see an error message explaining the problem.
</details>

<details>
<summary><strong>Where are my settings and reading progress stored?</strong></summary>

Everything is stored locally on your device in the app's user data folder. Nothing
is sent over the internet. Your recent files list, reading position for each file,
and preferences are saved automatically.
</details>

<details>
<summary><strong>How do I update to a new version?</strong></summary>

Check the [Releases page](https://github.com/StackShard/yogabookreader/releases)
for new versions. Download the latest .exe and replace the old one. Your settings
and reading progress are preserved across updates.
</details>

<details>
<summary><strong>The app is already running — I can't open a second one</strong></summary>

Only one instance of the app can run at a time. If you try to start a second one,
it will silently close. Check your taskbar or system tray — the app may already be
running.
</details>

---

## 🛠️ For Developers

A dual-screen magazine & manga reader for the **Lenovo Yoga Book Gen 10**. Its two
1800×2880 portrait displays are treated as a single open-book reading surface,
rendering left/right pages as one cohesive two-page spread. Supports PDF and
CBZ/CBR.

Built with **Electron + TypeScript**. See the PRD for full product goals.

## Features

- **Dual-screen spreads** — two 1800×2880 portrait displays treated as a single open-book reading surface, with proper centerfold handling, LTR/RTL support, and single-display fallback.
- **Touch navigation** — tap left/right edges for prev/next, tap center for controls, swipe gestures, and keyboard shortcuts.
- **Splash / library screen** — recent files and a folder-based library with collapsible sections (all collapsed by default), cached cover thumbnails, and folder picker.
- **Reader overlay** — minimal control bar (prev/next, library, help, settings) with an expandable drawer for zoom presets, direction toggle, brightness control, and app settings. Auto-hides after inactivity.
- **Format support** — PDF, CBZ, and CBR (including RAR5).
- **System backlight integration** — hardware brightness control and adaptive brightness toggle on Yoga Book hardware.
- **Cover generation** — automatic PDF and comic cover thumbnails, cached to disk for instant loading.

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
npm run package      # build a portable Windows .exe + NSIS installer (electron-builder)
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

3. Either run the app directly, or build the distributable executables:

   ```powershell
   npm run dev        # launch the app in development

   # ...or produce portable .exe + NSIS installer:
   npm run package
   ```

The portable `.exe` under `dist\` needs no installation — copy it anywhere and run
it. Plug in both Yoga Book screens (portrait) before launching for the two-page
spread; with one screen it falls back to single-page mode.

## Run it like a normal app (no dev server)

`npm run dev` is only for development. For everyday use, build the distributable
once and launch that — no terminal, no dev server:

```powershell
npm run package
```

This produces:
- `dist\YogaBookReader-1.0.0-portable.exe` — no-install portable
- `dist\YogaBookReader-1.0.0-setup-x64.exe` — traditional installer

Then either double-click the .exe, or make it easy to launch:

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
