/**
 * Cover gallery rendering (PRD §File Management, US#17/#18). Builds the thumbnail
 * tiles for the splash screen's Recent and Library sections. Real cover
 * thumbnails are generated/cached on demand (see cover.ts); until one is ready a
 * typed letter placeholder is shown.
 */

import type { LibraryGroup, LibraryItemView, RecentFileView } from '../shared/ipc.js';
import { getCover } from './cover.js';

export interface GalleryItem {
  filePath: string;
  displayName: string;
  subtitle?: string;
}

function tile(item: GalleryItem, onOpen: (filePath: string) => void): HTMLElement {
  const el = document.createElement('button');
  el.className = 'tile';
  el.addEventListener('click', () => onOpen(item.filePath));

  const cover = document.createElement('div');
  cover.className = 'tile-cover tile-cover-placeholder';
  cover.textContent = item.displayName.slice(0, 1).toUpperCase();

  // Swap the placeholder for the real cover once it's generated/cached.
  void getCover(item.filePath).then((url) => {
    if (!url) return;
    const img = document.createElement('img');
    img.src = url;
    img.alt = item.displayName;
    img.addEventListener('load', () => {
      cover.classList.remove('tile-cover-placeholder');
      cover.textContent = '';
      cover.appendChild(img);
    });
  });

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

/** Render the library as one section (heading + grid) per sub-folder. */
export function renderLibrary(
  container: HTMLElement,
  groups: LibraryGroup[],
  onOpen: (filePath: string) => void,
): void {
  container.innerHTML = '';
  if (groups.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'gallery-empty';
    empty.textContent = 'No folder selected yet — tap “Choose folder” to build your library.';
    container.appendChild(empty);
    return;
  }
  for (const group of groups) {
    const heading = document.createElement('h3');
    heading.className = 'group-heading';
    heading.textContent = group.folder;

    const grid = document.createElement('div');
    grid.className = 'gallery';
    for (const item of group.items) grid.appendChild(tile(libraryToGalleryItem(item), onOpen));

    container.append(heading, grid);
  }
}

export function recentToGalleryItem(f: RecentFileView): GalleryItem {
  return {
    filePath: f.filePath,
    displayName: f.displayName,
    subtitle: `Page ${f.lastPage + 1}`,
  };
}

export function libraryToGalleryItem(f: LibraryItemView): GalleryItem {
  return {
    filePath: f.filePath,
    displayName: f.displayName,
    subtitle: f.type.toUpperCase(),
  };
}
