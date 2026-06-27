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

export function showError(container: HTMLElement, error: ReaderError): void {
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

  panel.append(title, detail, file);
  container.appendChild(panel);
}
