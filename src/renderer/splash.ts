/**
 * Splash / library screen (PRD §File Management, US#17/#18).
 *
 * Shows recent files and the scanned library (grouped by sub-folder), and lets
 * the user open a document, choose the library folder, resume the open one, or
 * exit. Role-aware: in dual mode only the primary screen shows the gallery.
 */

import type { LayoutInfo, LibraryGroup, RecentFileView, WindowRole } from '../shared/ipc.js';
import {
  renderGallery,
  renderLibrary,
  recentToGalleryItem,
} from './library.js';
import { onCoverProgress } from './cover.js';
import { setStatus } from './toast.js';

function readRole(): WindowRole {
  const role = new URLSearchParams(location.search).get('role');
  return role === 'left' || role === 'right' || role === 'single' ? role : 'single';
}

/** Populate the single-screen diagnostic chip + adaptive "why?" panel. Hidden
 *  entirely in dual mode so the common case stays uncluttered. */
function renderLayoutDiag(info: LayoutInfo): void {
  const diag = document.getElementById('layout-diag') as HTMLElement | null;
  const label = document.getElementById('layout-chip-label');
  const why = document.getElementById('layout-why');
  if (!diag || !label || !why) return;

  if (info.mode === 'dual') {
    diag.hidden = true;
    return;
  }
  diag.hidden = false;
  label.textContent = 'Single-screen mode';

  // Explain the actual situation: only one display, vs. several that don't form
  // a side-by-side portrait spread.
  why.textContent =
    info.displayCount <= 1
      ? 'Only one display was detected, so pages show one at a time. Connect a second portrait display beside this one for a two-page spread.'
      : `${info.displayCount} displays were found, but they aren't both portrait and side by side, so pages show one at a time. Set both to Portrait and place them side by side in Windows Display settings.`;
}

function openDocument(filePath: string): void {
  // The main process navigates every window from splash to the reader once the
  // document loads, so we don't navigate here.
  window.reader.openFile(filePath);
}

async function main(): Promise<void> {
  const reader = window.reader;
  const role = readRole();

  // Secondary screen in dual mode: show only a hint, no mirrored gallery.
  if (role === 'left') {
    document.getElementById('primary-view')?.setAttribute('hidden', '');
    document.getElementById('secondary-view')?.removeAttribute('hidden');
    return;
  }

  const libraryEl = document.getElementById('library') as HTMLElement;
  const folderEl = document.getElementById('library-folder') as HTMLElement;
  const recentEl = document.getElementById('recent') as HTMLElement;

  let recent: RecentFileView[] = [];
  let libraryGroups: LibraryGroup[] = [];

  // Show cover-generation progress, clearing when everything has rendered.
  onCoverProgress((done, total) => {
    setStatus(done < total ? `Generating covers… ${done}/${total}` : null);
  });

  async function setFolderLabel(): Promise<void> {
    const settings = await reader.getSettings().catch(() => null);
    folderEl.textContent = settings?.rootFolder ? settings.rootFolder : 'No folder selected.';
  }

  function refreshRecent(): void {
    renderGallery(recentEl, recent.map(recentToGalleryItem), openDocument, (fp) => {
      reader.removeRecentFile(fp);
      recent = recent.filter((r) => r.filePath !== fp);
      refreshRecent();
    });
  }

  function refreshLibrary(): void {
    renderLibrary(libraryEl, libraryGroups, openDocument);
  }

  // Layout diagnostic: fetch once on load.
  void reader.getLayoutInfo().then(renderLayoutDiag).catch(() => {});
  document.getElementById('layout-chip')?.addEventListener('click', () => {
    document.getElementById('layout-why')?.classList.toggle('hidden');
  });

  document.getElementById('open-file')?.addEventListener('click', () => reader.pickFile());
  document.getElementById('exit')?.addEventListener('click', () => reader.quit());
  document.getElementById('choose-folder')?.addEventListener('click', () => {
    setStatus('Scanning folder…');
    void reader
      .pickFolder()
      .then((groups) => {
        libraryGroups = groups;
        refreshLibrary();
        return setFolderLabel();
      })
      .finally(() => setStatus(null));
  });

  // Library hygiene: drop recent entries whose files were moved or deleted.
  document.getElementById('clean-missing')?.addEventListener('click', () => {
    setStatus('Checking recent files…');
    void reader
      .pruneMissingRecentFiles()
      .then((removed) => {
        if (removed.length > 0) {
          const gone = new Set(removed);
          recent = recent.filter((r) => !gone.has(r.filePath));
          refreshRecent();
        }
        setStatus(removed.length > 0 ? `Removed ${removed.length} missing file(s).` : 'No missing recent files.');
        setTimeout(() => setStatus(null), 1800);
      })
      .catch(() => setStatus(null));
  });

  // Cover management: clear the thumbnail cache and rebuild visible covers.
  document.getElementById('regen-covers')?.addEventListener('click', () => {
    setStatus('Regenerating covers…');
    void reader.clearCoverCache().finally(() => {
      refreshRecent();
      refreshLibrary();
    });
  });

  // Offer "Resume reading" when a document is already open.
  const resumeBtn = document.getElementById('resume') as HTMLButtonElement | null;
  const resumeInfo = await reader.getResumeInfo().catch(() => null);
  if (resumeBtn && resumeInfo) {
    resumeBtn.textContent = `Resume: ${resumeInfo.displayName}`;
    resumeBtn.hidden = false;
    resumeBtn.addEventListener('click', () => reader.resume());
  }

  recent = await reader.getRecentFiles().catch(() => []);
  refreshRecent();

  const clearBtn = document.getElementById('clear-recent') as HTMLButtonElement | null;
  if (clearBtn) {
    let clearConfirmPending = false;
    let clearConfirmTimer: ReturnType<typeof setTimeout> | null = null;
    clearBtn.addEventListener('click', () => {
      if (!clearConfirmPending) {
        clearConfirmPending = true;
        clearBtn.textContent = 'Really clear?';
        clearConfirmTimer = setTimeout(() => {
          clearConfirmPending = false;
          clearBtn.textContent = 'Clear';
        }, 4000);
      } else {
        if (clearConfirmTimer) clearTimeout(clearConfirmTimer);
        clearConfirmPending = false;
        clearBtn.textContent = 'Clear';
        reader.clearRecentFiles();
        recent = [];
        refreshRecent();
      }
    });
  }

  await setFolderLabel();
  // Show the cached library instantly, then refresh from a fresh scan.
  // Only re-render if the fresh data actually differs (avoids a jarring DOM
  // replacement while the user is browsing the library).
  const cached = await reader.getLibraryCached().catch(() => []);
  libraryGroups = cached;
  if (cached.length > 0) refreshLibrary();
  else setStatus('Scanning folder…');
  const fresh = await reader.getLibrary().catch(() => []);
  if (JSON.stringify(fresh) !== JSON.stringify(libraryGroups)) {
    libraryGroups = fresh;
    refreshLibrary();
  }
  if (cached.length === 0) setStatus(null);
}

void main();
