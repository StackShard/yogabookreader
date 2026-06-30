/**
 * Splash / library screen (PRD File Management, US#17/#18).
 *
 * Shows recent files, a continue card, the scanned library, and display
 * diagnostics. Role-aware: in dual mode only the primary screen shows the
 * gallery.
 */

import type { LayoutInfo, LibraryGroup, LibraryItemView, RecentFileView, WindowRole } from '../shared/ipc.js';
import {
  renderContinueCard,
  renderGallery,
  renderLibrary,
  recentToGalleryItem,
} from './library.js';
import { onCoverProgress } from './cover.js';
import { setStatus } from './toast.js';

const EXPANDED_FOLDERS_KEY = 'ybr:expanded-folders';

type LibrarySort = 'title' | 'type' | 'progress';

function readRole(): WindowRole {
  const role = new URLSearchParams(location.search).get('role');
  return role === 'left' || role === 'right' || role === 'single' ? role : 'single';
}

function readExpandedFolders(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(EXPANDED_FOLDERS_KEY) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}

function saveExpandedFolders(folders: Set<string>): void {
  localStorage.setItem(EXPANDED_FOLDERS_KEY, JSON.stringify([...folders]));
}

function progressOf(item: Pick<LibraryItemView, 'lastPage' | 'totalPages'>): number {
  if (!item.totalPages || item.totalPages <= 0) return -1;
  return ((item.lastPage ?? 0) + 1) / item.totalPages;
}

function cloneGroup(group: LibraryGroup): LibraryGroup {
  return { folder: group.folder, items: group.items.map((item) => ({ ...item })) };
}

function prepareGroups(groups: LibraryGroup[], query: string, sort: LibrarySort): LibraryGroup[] {
  const normalized = query.trim().toLowerCase();
  const prepared = groups
    .map(cloneGroup)
    .map((group) => {
      if (!normalized) return group;
      return {
        folder: group.folder,
        items: group.items.filter((item) => {
          const haystack = `${group.folder} ${item.displayName} ${item.type}`.toLowerCase();
          return haystack.includes(normalized);
        }),
      };
    })
    .filter((group) => group.items.length > 0);

  for (const group of prepared) {
    group.items.sort((a, b) => {
      if (sort === 'type') {
        return a.type.localeCompare(b.type) || a.displayName.localeCompare(b.displayName, undefined, { numeric: true });
      }
      if (sort === 'progress') {
        return progressOf(b) - progressOf(a) || a.displayName.localeCompare(b.displayName, undefined, { numeric: true });
      }
      return a.displayName.localeCompare(b.displayName, undefined, { numeric: true });
    });
  }

  return prepared.sort((a, b) => a.folder.localeCompare(b.folder, undefined, { numeric: true }));
}

function openDocument(filePath: string): void {
  window.reader.openFile(filePath);
}

function renderLayoutInfo(container: HTMLElement, info: LayoutInfo): void {
  container.innerHTML = '';
  const summary = document.createElement('p');
  summary.textContent =
    info.mode === 'dual'
      ? `Dual-screen mode (${info.displayCount} displays, ${info.portraitCount} portrait).`
      : `Single-screen mode (${info.displayCount} displays, ${info.portraitCount} portrait).`;
  container.appendChild(summary);

  const list = document.createElement('div');
  list.className = 'layout-display-list';
  for (const d of info.displays) {
    const row = document.createElement('span');
    row.textContent = `#${d.id}: ${d.width}x${d.height} at ${d.x},${d.y} ${d.portrait ? 'portrait' : 'landscape'}`;
    list.appendChild(row);
  }
  container.appendChild(list);
}

async function main(): Promise<void> {
  const reader = window.reader;
  const role = readRole();

  if (role === 'left') {
    document.getElementById('primary-view')?.setAttribute('hidden', '');
    document.getElementById('secondary-view')?.removeAttribute('hidden');
    return;
  }

  const continueSection = document.getElementById('continue-section') as HTMLElement;
  const continueCard = document.getElementById('continue-card') as HTMLElement;
  const libraryEl = document.getElementById('library') as HTMLElement;
  const folderEl = document.getElementById('library-folder') as HTMLElement;
  const recentEl = document.getElementById('recent') as HTMLElement;
  const searchEl = document.getElementById('library-search') as HTMLInputElement;
  const sortEl = document.getElementById('library-sort') as HTMLSelectElement;
  const layoutEl = document.getElementById('layout-info') as HTMLElement;
  const expandedFolders = readExpandedFolders();

  let recent: RecentFileView[] = [];
  let libraryGroups: LibraryGroup[] = [];

  onCoverProgress((done, total) => {
    setStatus(done < total ? `Generating covers... ${done}/${total}` : null);
  });

  async function setFolderLabel(): Promise<void> {
    const settings = await reader.getSettings().catch(() => null);
    folderEl.textContent = settings?.rootFolder ? settings.rootFolder : 'No folder selected.';
  }

  function refreshContinue(): void {
    const first = recent[0];
    if (!first) {
      continueSection.hidden = true;
      continueCard.innerHTML = '';
      return;
    }
    continueSection.hidden = false;
    renderContinueCard(continueCard, recentToGalleryItem(first), openDocument);
  }

  function refreshRecent(): void {
    renderGallery(recentEl, recent.map(recentToGalleryItem), openDocument, (fp) => {
      reader.removeRecentFile(fp);
      recent = recent.filter((r) => r.filePath !== fp);
      refreshRecent();
      refreshContinue();
    });
  }

  function refreshLibrary(): void {
    const prepared = prepareGroups(libraryGroups, searchEl.value, sortEl.value as LibrarySort);
    renderLibrary(libraryEl, prepared, openDocument, {
      expandedFolders,
      // While searching, open every matching section so results are visible.
      forceExpanded: searchEl.value.trim().length > 0,
      onSectionToggle: (folder, expanded) => {
        if (expanded) expandedFolders.add(folder);
        else expandedFolders.delete(folder);
        saveExpandedFolders(expandedFolders);
      },
    });
  }

  async function refreshLayout(): Promise<void> {
    const info = await reader.getLayoutInfo().catch(() => null);
    if (info) renderLayoutInfo(layoutEl, info);
  }

  document.getElementById('open-file')?.addEventListener('click', () => reader.pickFile());
  document.getElementById('exit')?.addEventListener('click', () => reader.quit());
  document.getElementById('layout-refresh')?.addEventListener('click', () => void refreshLayout());
  searchEl.addEventListener('input', refreshLibrary);
  sortEl.addEventListener('change', refreshLibrary);

  document.getElementById('collapse-library')?.addEventListener('click', () => {
    expandedFolders.clear();
    saveExpandedFolders(expandedFolders);
    refreshLibrary();
  });

  document.getElementById('clear-covers')?.addEventListener('click', () => {
    setStatus('Clearing cover cache...');
    void reader.clearCoverCache().finally(() => {
      setStatus(null);
      refreshContinue();
      refreshRecent();
      refreshLibrary();
    });
  });

  document.getElementById('clean-missing')?.addEventListener('click', () => {
    setStatus('Checking recent files...');
    void reader
      .pruneMissingRecentFiles()
      .then((removed) => {
        if (removed.length > 0) {
          const removedSet = new Set(removed);
          recent = recent.filter((r) => !removedSet.has(r.filePath));
          refreshRecent();
          refreshContinue();
        }
        setStatus(removed.length > 0 ? `Removed ${removed.length} missing file(s).` : 'No missing recent files.');
        setTimeout(() => setStatus(null), 1800);
      })
      .catch(() => setStatus(null));
  });

  document.getElementById('choose-folder')?.addEventListener('click', () => {
    setStatus('Scanning folder...');
    void reader
      .pickFolder()
      .then((groups) => {
        libraryGroups = groups;
        refreshLibrary();
        return setFolderLabel();
      })
      .finally(() => setStatus(null));
  });

  const resumeBtn = document.getElementById('resume') as HTMLButtonElement | null;
  const resumeInfo = await reader.getResumeInfo().catch(() => null);
  if (resumeBtn && resumeInfo) {
    resumeBtn.textContent = `Resume: ${resumeInfo.displayName}`;
    resumeBtn.hidden = false;
    resumeBtn.addEventListener('click', () => reader.resume());
  }

  recent = await reader.getRecentFiles().catch(() => []);
  refreshContinue();
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
        refreshContinue();
      }
    });
  }

  await setFolderLabel();
  await refreshLayout();

  const cached = await reader.getLibraryCached().catch(() => []);
  libraryGroups = cached;
  if (cached.length > 0) refreshLibrary();
  else setStatus('Scanning folder...');

  const fresh = await reader.getLibrary().catch(() => []);
  if (JSON.stringify(fresh) !== JSON.stringify(libraryGroups)) {
    libraryGroups = fresh;
    refreshLibrary();
  }
  if (cached.length === 0) setStatus(null);
}

void main();
