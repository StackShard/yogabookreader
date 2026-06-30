/**
 * Page-action popup. Held (long-pressed) on the centre of either screen, it
 * offers Save / Print for the page shown in that window. Standalone (not part of
 * the control overlay) so it works on every window — including the left screen,
 * which has no overlay. Reuses the library tile context-menu styles.
 */

export interface PageMenuActions {
  onSave(): void;
  onPrint(): void;
}

/** Show the page-action menu for the given 1-based page number. */
export function showPageMenu(pageNumber: number, actions: PageMenuActions): void {
  document.querySelector('.tile-ctx-backdrop')?.remove();

  const backdrop = document.createElement('div');
  backdrop.className = 'tile-ctx-backdrop';

  const menu = document.createElement('div');
  menu.className = 'tile-context-menu';

  const label = document.createElement('div');
  label.className = 'tile-ctx-label';
  label.textContent = `Page ${pageNumber}`;

  const item = (text: string, onClick: () => void): HTMLButtonElement => {
    const b = document.createElement('button');
    b.className = 'tile-ctx-item';
    b.textContent = text;
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      backdrop.remove();
      onClick();
    });
    return b;
  };

  const cancel = document.createElement('button');
  cancel.className = 'tile-ctx-cancel';
  cancel.textContent = 'Cancel';
  cancel.addEventListener('click', (e) => {
    e.stopPropagation();
    backdrop.remove();
  });

  menu.append(
    label,
    item('Save page…', actions.onSave),
    item('Print page', actions.onPrint),
    cancel,
  );
  backdrop.appendChild(menu);
  backdrop.addEventListener('click', () => backdrop.remove());
  document.body.appendChild(backdrop);
}
