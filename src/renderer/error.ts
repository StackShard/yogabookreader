/**
 * In-app error page (PRD §Error Handling, US#24). Replaces content with a clear
 * explanation of why a file could not be opened; the app never crashes to the
 * desktop on a file error. Offers recovery actions so the user isn't stuck.
 */

import type { ReaderError } from '../shared/ipc.js';

const REASON_TITLES: Record<ReaderError['reason'], string> = {
  corrupt: 'This file appears to be corrupt',
  encrypted: 'This file is password-protected',
  unsupported: 'This file type is not supported',
  'not-found': 'File not found',
  unknown: 'Something went wrong',
};

/** Recovery handlers wired up by the reader shell. */
export interface ErrorActions {
  onPickFile(): void;
  onRemoveRecent(filePath: string): void;
}

function actionButton(
  label: string,
  onClick: () => void,
  className = 'ghost-btn',
): HTMLButtonElement {
  const button = document.createElement('button');
  button.className = className;
  button.textContent = label;
  button.addEventListener('click', onClick);
  return button;
}

export function showError(
  container: HTMLElement,
  error: ReaderError,
  actions: ErrorActions,
): void {
  container.innerHTML = '';
  const panel = document.createElement('div');
  panel.className = 'error-panel';

  const title = document.createElement('h1');
  title.textContent = REASON_TITLES[error.reason];

  const lead = document.createElement('p');
  lead.textContent = "The file couldn't be opened. You can pick another file, remove it from Recent, or view the technical details.";

  // Technical details, hidden until "Show details" is tapped.
  const details = document.createElement('div');
  details.className = 'error-details hidden';
  const message = document.createElement('p');
  message.textContent = error.message;
  const file = document.createElement('p');
  file.className = 'error-file';
  file.textContent = error.filePath;
  details.append(message, file);

  const buttons = document.createElement('div');
  buttons.className = 'error-actions';
  const detailsBtn = actionButton('Show details', () => {
    const hidden = details.classList.toggle('hidden');
    detailsBtn.textContent = hidden ? 'Show details' : 'Hide details';
  });
  buttons.append(
    actionButton('Choose another file', () => actions.onPickFile(), 'primary-btn'),
    actionButton('Remove from Recent', () => actions.onRemoveRecent(error.filePath)),
    detailsBtn,
  );

  panel.append(title, lead, buttons, details);
  container.appendChild(panel);
}
