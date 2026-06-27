/**
 * Cover gallery rendering (PRD §File Management, US#17/#18). Builds the
 * thumbnail tiles for the splash screen's Recent and Library sections. Cover
 * thumbnails are shown when available; otherwise a typed placeholder is drawn.
 */

import type { LibraryItemView, RecentFileView } from '../shared/ipc.js';

export interface GalleryItem {
  filePath: string;
  displayName: string;
  subtitle?: string;
  coverThumbnailPath?: string;
}

function fileUrl(p: string): string {
  return 'file://' + encodeURI(p.replace(/\\/g, '/'));
}

function tile(item: GalleryItem, onOpen: (filePath: string) => void): HTMLElement {
  const el = document.createElement('button');
  el.className = 'tile';
  el.addEventListener('click', () => onOpen(item.filePath));

  const cover = document.createElement('div');
  cover.className = 'tile-cover';
  if (item.coverThumbnailPath) {
    const img = document.createElement('img');
    img.src = fileUrl(item.coverThumbnailPath);
    img.alt = item.displayName;
    cover.appendChild(img);
  } else {
    cover.classList.add('tile-cover-placeholder');
    cover.textContent = item.displayName.slice(0, 1).toUpperCase();
  }

  const name = document.createElement('span');
  name.className = 'tile-name';
  name.textContent = item.displayName;

  el.append(cover, name);
  if (item.subtitle) {
    const sub = document.createElement('span');
    sub.className = 'tile-sub';
    sub.textContent = item.subtitle;
    el.appendChild(sub);
  }
  return el;
}

export function renderGallery(
  container: HTMLElement,
  items: GalleryItem[],
  onOpen: (filePath: string) => void,
): void {
  container.innerHTML = '';
  if (items.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'gallery-empty';
    empty.textContent = 'Nothing here yet.';
    container.appendChild(empty);
    return;
  }
  for (const item of items) container.appendChild(tile(item, onOpen));
}

export function recentToGalleryItem(f: RecentFileView): GalleryItem {
  return {
    filePath: f.filePath,
    displayName: f.displayName,
    subtitle: `Page ${f.lastPage + 1}`,
    coverThumbnailPath: f.coverThumbnailPath,
  };
}

export function libraryToGalleryItem(f: LibraryItemView): GalleryItem {
  return {
    filePath: f.filePath,
    displayName: f.displayName,
    subtitle: f.type.toUpperCase(),
  };
}
