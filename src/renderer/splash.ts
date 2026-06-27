/**
 * Splash / library screen (PRD §File Management, US#17/#18). Shows recent files
 * with cover thumbnails and the scanned library, and lets the user open a file.
 * Opening a document hands off to the reader windows and returns to the spread
 * view.
 */

import {
  renderGallery,
  recentToGalleryItem,
  libraryToGalleryItem,
} from './library.js';

function openDocument(filePath: string): void {
  window.reader.openFile(filePath);
  location.href = 'index.html';
}

async function main(): Promise<void> {
  const reader = window.reader;

  document.getElementById('open-file')?.addEventListener('click', () => reader.pickFile());

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
