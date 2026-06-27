/**
 * Splash / library screen (PRD §File Management, US#17/#18).
 *
 * Shows recent files and the scanned library and lets the user open a document,
 * resume the currently-open one, or exit the app. It is role-aware: in dual mode
 * only the primary screen shows the gallery; the secondary shows a short hint so
 * the library isn't jarringly mirrored across both panels.
 */

import {
  renderGallery,
  recentToGalleryItem,
  libraryToGalleryItem,
} from './library.js';
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

  document.getElementById('open-file')?.addEventListener('click', () => reader.pickFile());
  document.getElementById('exit')?.addEventListener('click', () => reader.quit());

  // Offer "Resume reading" when a document is already open (e.g. library opened
  // by accident).
  const resumeBtn = document.getElementById('resume') as HTMLButtonElement | null;
  const resumeInfo = await reader.getResumeInfo().catch(() => null);
  if (resumeBtn && resumeInfo) {
    resumeBtn.textContent = `Resume: ${resumeInfo.displayName}`;
    resumeBtn.hidden = false;
    resumeBtn.addEventListener('click', () => reader.resume());
  }

  const [recent, library] = await Promise.all([
    reader.getRecentFiles().catch(() => []),
    reader.getLibrary().catch(() => []),
  ]);

  renderGallery(
    document.getElementById('recent') as HTMLElement,
    recent.map(recentToGalleryItem),
    openDocument,
  );
  renderGallery(
    document.getElementById('library') as HTMLElement,
    library.map(libraryToGalleryItem),
    openDocument,
  );
}

void main();
