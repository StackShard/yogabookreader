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
  /** Last-read page (0-based) and known page count, for progress display. */
  lastPage?: number;
  totalPages?: number;
}

/** "42 / 180" when the total is known, else "Page 42", else the raw subtitle. */
function progressSubtitle(item: GalleryItem): string | undefined {
  if (item.totalPages && item.totalPages > 0) {
    return `${(item.lastPage ?? 0) + 1} / ${item.totalPages}`;
  }
  if (item.lastPage !== undefined && item.lastPage > 0) {
    return `Page ${item.lastPage + 1}`;
  }
  return item.subtitle;
}

function showTileContextMenu(
  item: GalleryItem,
  onRemove?: (filePath: string) => void,
): void {
  document.querySelector('.tile-ctx-backdrop')?.remove();

  const backdrop = document.createElement('div');
  backdrop.className = 'tile-ctx-backdrop';

  const menu = document.createElement('div');
  menu.className = 'tile-context-menu';

  const label = document.createElement('div');
  label.className = 'tile-ctx-label';
  label.textContent = item.displayName;
  menu.appendChild(label);

  const revealBtn = document.createElement('button');
  revealBtn.className = 'tile-ctx-item';
  revealBtn.textContent = 'Open containing folder';
  revealBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    backdrop.remove();
    window.reader.openContainingFolder(item.filePath);
  });
  menu.appendChild(revealBtn);

  if (onRemove) {
    const removeBtn = document.createElement('button');
    removeBtn.className = 'tile-ctx-remove';
    removeBtn.textContent = 'Remove from Recent';
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      backdrop.remove();
      onRemove(item.filePath);
    });
    menu.appendChild(removeBtn);
  }

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'tile-ctx-cancel';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    backdrop.remove();
  });

  menu.appendChild(cancelBtn);
  backdrop.appendChild(menu);
  backdrop.addEventListener('click', () => backdrop.remove());
  document.body.appendChild(backdrop);
}

function tile(
  item: GalleryItem,
  onOpen: (filePath: string) => void,
  onRemoveRecent?: (filePath: string) => void,
): HTMLElement {
  const el = document.createElement('button');
  el.className = 'tile';

  let longPressConsumed = false;

  el.addEventListener('click', () => {
    if (longPressConsumed) { longPressConsumed = false; return; }
    onOpen(item.filePath);
  });

  // Long-press (or right-click) opens the per-tile menu: reveal in Explorer for
  // any tile, plus Remove from Recent on the recent shelf.
  let longPressTimer: ReturnType<typeof setTimeout> | null = null;
  let startX = 0;
  let startY = 0;

  el.addEventListener('pointerdown', (e) => {
    startX = e.clientX;
    startY = e.clientY;
    longPressConsumed = false;
    longPressTimer = setTimeout(() => {
      longPressTimer = null;
      longPressConsumed = true;
      showTileContextMenu(item, onRemoveRecent);
    }, 500);
  });

  el.addEventListener('pointermove', (e) => {
    if (!longPressTimer) return;
    if (Math.abs(e.clientX - startX) > 10 || Math.abs(e.clientY - startY) > 10) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  });

  const cancelLp = () => {
    if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
  };
  el.addEventListener('pointerup', cancelLp);
  el.addEventListener('pointercancel', cancelLp);

  el.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    showTileContextMenu(item, onRemoveRecent);
  });

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
  const subtitle = progressSubtitle(item);
  if (subtitle) {
    const sub = document.createElement('span');
    sub.className = 'tile-sub';
    sub.textContent = subtitle;
    el.appendChild(sub);
  }
  return el;
}

export function renderGallery(
  container: HTMLElement,
  items: GalleryItem[],
  onOpen: (filePath: string) => void,
  onRemoveRecent?: (filePath: string) => void,
): void {
  container.innerHTML = '';
  const displayItems = items.slice(0, 8);
  if (displayItems.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'gallery-empty';
    empty.textContent = 'Nothing here yet.';
    container.appendChild(empty);
    return;
  }
  for (const item of displayItems) container.appendChild(tile(item, onOpen, onRemoveRecent));
}

/** Render the library as one collapsible section per sub-folder. */
export function renderLibrary(
  container: HTMLElement,
  groups: LibraryGroup[],
  onOpen: (filePath: string) => void,
): void {
  container.innerHTML = '';
  if (groups.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'gallery-empty';
    empty.textContent = 'No folder selected yet — tap "Choose folder" to build your library.';
    container.appendChild(empty);
    return;
  }
  for (const group of groups) {
    const section = document.createElement('div');
    section.className = 'lib-section';

    const header = document.createElement('button');
    header.className = 'lib-section-header';
    const count = document.createElement('span');
    count.className = 'lib-section-count';
    count.textContent = String(group.items.length);
    const chevron = document.createElement('span');
    chevron.className = 'lib-section-chevron';
    chevron.textContent = '▸';
    header.append(group.folder, count, chevron);

    const body = document.createElement('div');
    body.className = 'lib-section-body collapsed';
    const grid = document.createElement('div');
    grid.className = 'gallery';
    for (const item of group.items) grid.appendChild(tile(libraryToGalleryItem(item), onOpen));
    body.appendChild(grid);

    header.addEventListener('click', () => {
      const collapsed = body.classList.toggle('collapsed');
      chevron.textContent = collapsed ? '▸' : '▾';
      header.classList.toggle('collapsed', collapsed);
    });
    header.classList.add('collapsed');

    section.append(header, body);
    container.appendChild(section);
  }
}

/** All file paths across every group, for batch-priming the cover cache before a render. */
export function libraryFilePaths(groups: LibraryGroup[]): string[] {
  return groups.flatMap((g) => g.items.map((i) => i.filePath));
}

export function recentToGalleryItem(f: RecentFileView): GalleryItem {
  return {
    filePath: f.filePath,
    displayName: f.displayName,
    lastPage: f.lastPage,
    totalPages: f.totalPages,
  };
}

export function libraryToGalleryItem(f: LibraryItemView): GalleryItem {
  return {
    filePath: f.filePath,
    displayName: f.displayName,
    // Show reading progress once started; otherwise the document type.
    subtitle: f.type.toUpperCase(),
    lastPage: f.lastPage,
    totalPages: f.totalPages,
  };
}
