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
  lastPage?: number;
  totalPages?: number;
}

export interface LibraryRenderOptions {
  expandedFolders?: Set<string>;
  onSectionToggle?: (folder: string, expanded: boolean) => void;
  /** Force every section open regardless of saved state (e.g. while searching),
   *  without persisting the change. */
  forceExpanded?: boolean;
}

function pageSubtitle(item: GalleryItem): string | undefined {
  if (item.totalPages && item.totalPages > 0) {
    return `Page ${(item.lastPage ?? 0) + 1} / ${item.totalPages}`;
  }
  if (item.lastPage !== undefined && item.lastPage > 0) {
    return `Page ${item.lastPage + 1}`;
  }
  return item.subtitle;
}

function progressPercent(item: GalleryItem): number | null {
  if (!item.totalPages || item.totalPages <= 0) return null;
  return Math.max(0, Math.min(100, Math.round((((item.lastPage ?? 0) + 1) / item.totalPages) * 100)));
}

function showTileContextMenu(
  item: GalleryItem,
  onRemove: (filePath: string) => void,
): void {
  document.querySelector('.tile-ctx-backdrop')?.remove();

  const backdrop = document.createElement('div');
  backdrop.className = 'tile-ctx-backdrop';

  const menu = document.createElement('div');
  menu.className = 'tile-context-menu';

  const label = document.createElement('div');
  label.className = 'tile-ctx-label';
  label.textContent = item.displayName;

  const removeBtn = document.createElement('button');
  removeBtn.className = 'tile-ctx-remove';
  removeBtn.textContent = 'Remove from Recent';
  removeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    backdrop.remove();
    onRemove(item.filePath);
  });

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'tile-ctx-cancel';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    backdrop.remove();
  });

  menu.append(label, removeBtn, cancelBtn);
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

  if (onRemoveRecent) {
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
        showTileContextMenu(item, onRemoveRecent!);
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
  }

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
  const subtitle = pageSubtitle(item);
  if (subtitle) {
    const sub = document.createElement('span');
    sub.className = 'tile-sub';
    sub.textContent = subtitle;
    el.appendChild(sub);
  }
  const progress = progressPercent(item);
  if (progress !== null) {
    const bar = document.createElement('div');
    bar.className = 'tile-progress';
    const fill = document.createElement('div');
    fill.className = 'tile-progress-fill';
    fill.style.width = `${progress}%`;
    bar.appendChild(fill);
    el.appendChild(bar);
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
  options: LibraryRenderOptions = {},
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
    const expanded =
      options.forceExpanded || (options.expandedFolders?.has(group.folder) ?? false);
    chevron.textContent = expanded ? 'v' : '>';
    header.append(group.folder, count, chevron);

    const body = document.createElement('div');
    body.className = expanded ? 'lib-section-body' : 'lib-section-body collapsed';
    const grid = document.createElement('div');
    grid.className = 'gallery';
    for (const item of group.items) grid.appendChild(tile(libraryToGalleryItem(item), onOpen));
    body.appendChild(grid);

    header.addEventListener('click', () => {
      const collapsed = body.classList.toggle('collapsed');
      chevron.textContent = collapsed ? '>' : 'v';
      header.classList.toggle('collapsed', collapsed);
      options.onSectionToggle?.(group.folder, !collapsed);
    });
    header.classList.toggle('collapsed', !expanded);

    section.append(header, body);
    container.appendChild(section);
  }
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
    subtitle: f.type.toUpperCase(),
    lastPage: f.lastPage,
    totalPages: f.totalPages,
  };
}

export function renderContinueCard(
  container: HTMLElement,
  item: GalleryItem,
  onOpen: (filePath: string) => void,
): void {
  container.innerHTML = '';
  const card = document.createElement('button');
  card.className = 'continue-card';
  card.addEventListener('click', () => onOpen(item.filePath));

  const cover = document.createElement('div');
  cover.className = 'continue-cover tile-cover tile-cover-placeholder';
  cover.textContent = item.displayName.slice(0, 1).toUpperCase();
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

  const meta = document.createElement('div');
  meta.className = 'continue-meta';
  const title = document.createElement('strong');
  title.textContent = item.displayName;
  const sub = document.createElement('span');
  sub.textContent = pageSubtitle(item) ?? 'Resume reading';
  meta.append(title, sub);

  const progress = progressPercent(item);
  if (progress !== null) {
    const bar = document.createElement('div');
    bar.className = 'tile-progress continue-progress';
    const fill = document.createElement('div');
    fill.className = 'tile-progress-fill';
    fill.style.width = `${progress}%`;
    bar.appendChild(fill);
    meta.appendChild(bar);
  }

  card.append(cover, meta);
  container.appendChild(card);
}
