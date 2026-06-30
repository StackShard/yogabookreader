/**
 * In-app error page (PRD §Error Handling, US#24). Replaces content with a clear
 * explanation of why a file could not be opened; the app never crashes to the
 * desktop on a file error.
 */

import type { ReaderError } from '../shared/ipc.js';

const REASON_TITLES: Record<ReaderError['reason'], string> = {
  corrupt: 'This file appears to be corrupt',
  encrypted: 'This file is password-protected',
  unsupported: 'This file type is not supported',
  'not-found': 'File not found',
  unknown: 'Something went wrong',
};

export interface ErrorActions {
  onPickFile(): void;
  onOpenLibrary(): void;
  onRemoveRecent(filePath: string): void;
}

function actionButton(label: string, action: () => void, className = 'ghost-btn'): HTMLButtonElement {
  const button = document.createElement('button');
  button.className = className;
  button.textContent = label;
  button.addEventListener('click', action);
  return button;
}

export function showError(container: HTMLElement, error: ReaderError, actions: ErrorActions): void {
  container.innerHTML = '';
  const panel = document.createElement('div');
  panel.className = 'error-panel';

  const title = document.createElement('h1');
  title.textContent = REASON_TITLES[error.reason];

  const detail = document.createElement('p');
  detail.textContent = error.message;

  const file = document.createElement('p');
  file.className = 'error-file';
  file.textContent = error.filePath;

  const buttons = document.createElement('div');
  buttons.className = 'error-actions';
  buttons.append(
    actionButton('Choose another file', actions.onPickFile, 'primary-btn'),
    actionButton('Open library', actions.onOpenLibrary),
    actionButton('Remove from Recent', () => actions.onRemoveRecent(error.filePath)),
  );

  panel.append(title, detail, file, buttons);
  container.appendChild(panel);
}
