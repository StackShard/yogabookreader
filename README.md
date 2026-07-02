# Yoga Book Reader

## 📖 For Readers

### What is Yoga Book Reader?

Yoga Book Reader turns a dual-screen Windows device into an open book. It displays
PDFs, manga (CBZ), and comics (CBR) across two portrait screens as a seamless
two-page spread — left page on one screen, right page on the other, just like reading
a magazine or paperback.

The app is free and open source. No ads, no tracking, no data collection.

> **Backstory** — This project was born out of the Lenovo Yoga Book Gen 10. It has
> two beautiful 1800×2880 portrait screens that are practically begging to be used as
> a book, but no reader app treated them as a two-page spread. So I built one. As it
> turns out, the approach is entirely device-agnostic: if your laptop or tablet has
> two portrait screens side by side, it'll work. That includes the Yoga Book Gen 9,
> the Surface Neo (RIP), and even a desktop with two rotated monitors.

If this makes you happy, consider buying me a coffee. Not a subscription, just a one-time thanks.

  <a href="https://ko-fi.com/X3X4228M3H"><img src="https://ko-fi.com/img/githubbutton_sm.svg" alt="Support on Ko-fi"></a>

### Will it work on my device?

If your device meets these two requirements, yes:

- **Windows** — the app is a native Windows executable
- **Two portrait screens side by side** — the app detects portrait orientation and
  side-by-side positioning automatically. Only one screen? It falls back to
  single-page mode. Landscape? Rotate to portrait in Display Settings.

That's it. No specific brand, model, or resolution required.

### Download & Run

Two downloads are offered on the Releases page. **They run the same app — the
only difference is launch speed:**

| Download | Install | Launch speed |
| --- | --- | --- |
| `YogaBookReader-*-setup-x64.exe` (**installer, recommended**) | Start-menu entry + shortcut | **Fast** — runs in place |
| `YogaBookReader-*-portable.exe` | None — single file | **Slower to start** — see below |

1. Go to the **[Releases page](https://github.com/StackShard/yogabookreader/releases)**
2. Download the **installer** (`YogaBookReader-*-setup-x64.exe`) for the fastest
   launch, or the **portable** (`YogaBookReader-*-portable.exe`) if you want a
   single no-install file (e.g. to run from a USB stick)
3. Double-click to run

> **⏳ Why the portable build starts slowly.** The portable `.exe` is a
> self-contained archive: every time you launch it, Windows first unpacks the
> app (a few hundred megabytes, including the browser engine it's built on) into
> a temporary folder, and Windows Defender scans those files, *before* the app
> itself can start. On a slower disk this first unpack can take **10–25 seconds**,
> during which you'll see a small **"Yoga Book Reader — Loading…"** splash while
> it extracts. Later launches of the *same* version are much faster because the
> unpacked copy is reused (until Windows clears the temp folder). **The installer
> avoids all of this** — it unpacks once at install time and every launch is
> fast — so if slow launches bother you, use the installer.

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
Get-FileHash .\YogaBookReader-*-portable.exe -Algorithm SHA256
```

### How to Use It

1. **Set up your screens** — Make sure both screens are in portrait orientation and
   positioned side by side. In Windows Settings → Display, set each to **Portrait**
   and arrange them next to each other.
2. **Launch the app** — Double-click the .exe. You'll see the library/splash screen.
3. **Open a file** — Tap **"Open file…"** to pick a PDF or comic, or tap
   **"Choose folder"** to build a library from everything in that folder.
4. **Navigate pages**:
   - **Tap the left edge** of either screen → previous page
   - **Tap the right edge** of either screen → next page
   - **Swipe** left or right to turn pages
   - **Tap the center** of the screen → show/hide controls
   - **Double-tap center** → cycle zoom preset (Fit Width → Fit Height → Full Bleed)
   - **Long-press left edge** → first page
   - **Long-press right edge** → last page
   - **RTL (manga) mode** swaps the directional controls — edge taps, held
     edges, swipes and arrow keys follow the right-to-left reading direction,
     so the left edge turns to the next page.
5. **Use the controls** — The overlay bar has quit, help, settings, library,
   brightness and auto-brightness controls. Tap **⚙ Settings** to open the
   settings strip (zoom presets, reading direction, **Jump Page**, and spread
   **Nudge** / **Reset align**); it auto-collapses after making a selection.
6. **Fix a misaligned scan** — If a skipped or mis-scanned page throws off the
   two-page pairing, tap **⇥ Nudge** to push the current page onto its own
   spread and re-align everything after it (your place is kept). **Reset align**
   clears it. The fix is remembered per document.
7. **Pick up where you left off** — Recent and Library tiles show reading
   progress (e.g. `42 / 180`). Long-press or right-click a tile to **open its
   containing folder**; **Clean missing** removes recents whose files are gone.

**Keyboard shortcuts** (when connected):
- **Left/Right arrow keys** — previous/next page (swapped in RTL mode)
- **PageUp / PageDown**, **Space / Shift+Space** — previous/next page (reading order)
- **Home / End** — first / last page
- **F** or **F11** — toggle fullscreen
- **Escape** — close the open menu/help/overlay, or toggle fullscreen
- **Ctrl+Q** — quit

### FAQ

<details>
<summary><strong>Nothing happens when I double-click the .exe</strong></summary>

Your antivirus may be blocking it. Temporarily disable real-time protection and try
again. If that works, add the .exe to your antivirus exclusion list. You can also
run it from PowerShell to see any error output:

```powershell
.\YogaBookReader-*-portable.exe
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
RAR5 format only). Password-protected PDFs are not supported.

**EPUB is not supported yet** — it's on the radar for a future release.
If a file is corrupt or incomplete, you'll see an error message explaining the problem.
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
<summary><strong>Can I use this on a regular single-screen laptop?</strong></summary>

Yes — the app falls back to single-page mode automatically. You'll see one page at a
time instead of a two-page spread. It works fine, but the dual-screen experience is
where it really shines.
</details>

<details>
<summary><strong>The app is already running — I can't open a second one</strong></summary>

Only one instance of the app can run at a time. Starting a second one brings the
already-running window to the front instead (and opens the file you launched it
with, if any).
</details>

---

## 🛠️ For Developers

A dual-screen document reader for Windows. Detects portrait displays and renders
left/right pages as a cohesive two-page spread. Supports PDF, CBZ, and CBR.

Built with **Electron + TypeScript**.

## Features

- **Dual-screen spreads** — two portrait displays treated as a single open-book
  reading surface, with proper centerfold handling, LTR/RTL support, and
  single-display fallback.
- **Spread alignment nudge** — fix a skipped/mis-scanned page that throws off
  pairing: force the current page onto its own spread to re-align everything
  after it, non-destructively and saved per document.
- **Reading progress** — Recent/Library tiles show page-of-total progress,
  persisted per file.
- **Touch navigation** — tap left/right edges for prev/next, tap center for
  controls, swipe gestures, and keyboard shortcuts.
- **Splash / library screen** — recent files and a folder-based library with
  collapsible sections, cached cover thumbnails, folder picker, per-tile
  open-containing-folder, "Clean missing", "Regenerate covers", and a
  single-screen diagnostic.
- **Reader overlay** — minimal control bar (prev/next, library, help, settings)
  with an expandable drawer for zoom presets, direction toggle, page jump, spread
  nudge, and brightness control. Auto-hides after inactivity.
- **Error recovery** — file-open failures offer Choose another file, Remove from
  Recent, and a Show-details toggle.
- **Format support** — PDF, CBZ, and CBR (including RAR5).
- **Hardware brightness** — uses Windows WMI brightness control when available;
  falls back to an in-app software dim overlay on devices without it.
- **Cover generation** — automatic PDF and comic cover thumbnails, cached to disk
  for instant loading, with on-demand regeneration.

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
- **`placement.ts`** — detects portrait displays and assigns them to left/right
  based on their x-position. Purely orientation-based — no hardcoded resolutions,
  EDID strings, or device IDs.
- **`state.ts`** — JSON state round-trip, the recent-files list, and persisted
  per-file reading progress and spread-alignment nudges.

## Scripts

```bash
npm install          # ELECTRON_SKIP_BINARY_DOWNLOAD=1 if the binary fetch is blocked
npm test             # run the core unit-test suite (vitest)
npm run typecheck    # tsc --noEmit
npm run build        # bundle main/preload/renderer (electron-vite) + typecheck
npm run dev          # run the app in development (requires the Electron binary)
npm run package      # build a portable Windows .exe + NSIS installer (electron-builder)
```

## Windows quick start (nothing installed)

Windows 11 ships with `winget`, so you can set up the toolchain from PowerShell
without downloading any installers by hand.

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
it. Position two portrait screens side by side before launching for the two-page
spread; with one screen or in landscape orientation it falls back to single-page mode.

## Run it like a normal app (no dev server)

`npm run dev` is only for development. For everyday use, build the distributable
once and launch that — no terminal, no dev server:

```powershell
npm run package
```

This produces:
- `dist\YogaBookReader-*-portable.exe` — no-install portable
- `dist\YogaBookReader-*-setup-x64.exe` — traditional installer

Then either double-click the .exe, or make it easy to launch:

- **Desktop shortcut:** in File Explorer, right-click the `.exe` →
  **Show more options** → **Send to** → **Desktop (create shortcut)**.
- **Pin to taskbar/Start:** right-click the `.exe` → **Pin to taskbar** (or
  **Pin to Start**).

You only need to re-run `npm run package` after pulling new changes.

## Status

The pure-logic core is complete and unit-tested (90 tests). The Electron
rendering/window layer is implemented and type-checks/builds, but is best verified
on actual dual-screen hardware (two portrait Windows displays), which the CI
environment cannot provide.

**Test coverage** (`npm test -- --coverage`) currently targets `src/core/` only.
The main process and renderer modules rely on real Electron APIs or the DOM and
are exercised manually on hardware rather than mocked in CI.
