/**
 * Splash / library screen (PRD §File Management, US#17/#18).
 *
 * Shows recent files and the scanned library (grouped by sub-folder), and lets
 * the user open a document, choose the library folder, resume the open one, or
 * exit. Role-aware: in dual mode only the primary screen shows the gallery.
 */

import {
  renderGallery,
  renderLibrary,
  recentToGalleryItem,
} from './library.js';
import { onCoverProgress } from './cover.js';
import { setStatus } from './toast.js';
import type { WindowRole } from '../shared/ipc.js';

function readRole(): WindowRole {
  const role = new URLSearchParams(location.search).get('role');
  return role === 'left' || role === 'right' || role === 'single' ? role : 'single';
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

  // Show cover-generation progress, clearing when everything has rendered.
  onCoverProgress((done, total) => {
    setStatus(done < total ? `Generating covers… ${done}/${total}` : null);
  });

  async function setFolderLabel(): Promise<void> {
    const settings = await reader.getSettings().catch(() => null);
    folderEl.textContent = settings?.rootFolder ? settings.rootFolder : 'No folder selected.';
  }

  document.getElementById('open-file')?.addEventListener('click', () => reader.pickFile());
  document.getElementById('exit')?.addEventListener('click', () => reader.quit());
  document.getElementById('choose-folder')?.addEventListener('click', () => {
    setStatus('Scanning folder…');
    void reader
      .pickFolder()
      .then((groups) => {
        renderLibrary(libraryEl, groups, openDocument);
        return setFolderLabel();
      })
      .finally(() => setStatus(null));
  });

  // Offer "Resume reading" when a document is already open.
  const resumeBtn = document.getElementById('resume') as HTMLButtonElement | null;
  const resumeInfo = await reader.getResumeInfo().catch(() => null);
  if (resumeBtn && resumeInfo) {
    resumeBtn.textContent = `Resume: ${resumeInfo.displayName}`;
    resumeBtn.hidden = false;
    resumeBtn.addEventListener('click', () => reader.resume());
  }

  const recent = await reader.getRecentFiles().catch(() => []);
  renderGallery(
    document.getElementById('recent') as HTMLElement,
    recent.map(recentToGalleryItem),
    openDocument,
  );

  await setFolderLabel();
  // Show the cached library instantly, then refresh from a fresh scan.
  const cached = await reader.getLibraryCached().catch(() => []);
  if (cached.length > 0) renderLibrary(libraryEl, cached, openDocument);
  else setStatus('Scanning folder…');
  const fresh = await reader.getLibrary().catch(() => []);
  renderLibrary(libraryEl, fresh, openDocument);
  if (cached.length === 0) setStatus(null);
}

void main();
