/**
 * Preload bridge: exposes a typed, minimal IPC surface on `window.reader`
 * (PRD §Multi-Window Architecture). Context isolation is on; renderers never
 * touch Node or ipcRenderer directly.
 */

import { contextBridge, ipcRenderer } from 'electron';
import {
  MainToRenderer,
  RendererToMain,
  type DocumentInfo,
  type InitPayload,
  type ReaderBridge,
  type ReaderError,
  type RecentFileView,
  type RenderInstruction,
} from '../shared/ipc.js';
import type { ZoomPreset } from '../core/types.js';

const bridge: ReaderBridge = {
  onInit: (cb: (payload: InitPayload) => void) =>
    ipcRenderer.on(MainToRenderer.init, (_e, payload: InitPayload) => cb(payload)),
  onDocumentLoaded: (cb: (info: DocumentInfo) => void) =>
    ipcRenderer.on(MainToRenderer.documentLoaded, (_e, info: DocumentInfo) => cb(info)),
  onRender: (cb: (instruction: RenderInstruction) => void) =>
    ipcRenderer.on(MainToRenderer.render, (_e, instruction: RenderInstruction) => cb(instruction)),
  onShowError: (cb: (error: ReaderError) => void) =>
    ipcRenderer.on(MainToRenderer.showError, (_e, error: ReaderError) => cb(error)),
  onShowOverlay: (cb: () => void) => ipcRenderer.on(MainToRenderer.showOverlay, () => cb()),
  onFullScreenChanged: (cb: (isFullScreen: boolean) => void) =>
    ipcRenderer.on(MainToRenderer.fullScreenChanged, (_e, value: boolean) => cb(value)),
  onSetDim: (cb: (level: number | null) => void) =>
    ipcRenderer.on(MainToRenderer.setDim, (_e, level: number | null) => cb(level)),

  ready: () => ipcRenderer.send(RendererToMain.ready),
  openFile: (filePath: string) => ipcRenderer.send(RendererToMain.openFile, filePath),
  pickFile: () => ipcRenderer.send(RendererToMain.pickFile),
  openLibrary: () => ipcRenderer.send(RendererToMain.openLibrary),
  resume: () => ipcRenderer.send(RendererToMain.resume),
  setBrightness: (level: number) => ipcRenderer.send(RendererToMain.setBrightness, level),
  next: () => ipcRenderer.send(RendererToMain.next),
  prev: () => ipcRenderer.send(RendererToMain.prev),
  jumpToPage: (pageIndex: number) => ipcRenderer.send(RendererToMain.jumpToPage, pageIndex),
  toggleDirection: () => ipcRenderer.send(RendererToMain.toggleDirection),
  setZoomPreset: (preset: ZoomPreset) => ipcRenderer.send(RendererToMain.setZoomPreset, preset),
  setSpreadEncoded: (value: boolean | undefined) =>
    ipcRenderer.send(RendererToMain.setSpreadEncoded, value),
  requestOverlay: () => ipcRenderer.send(RendererToMain.requestOverlay),
  toggleFullScreen: () => ipcRenderer.send(RendererToMain.toggleFullScreen),
  quit: () => ipcRenderer.send(RendererToMain.quit),

  getRecentFiles: (): Promise<RecentFileView[]> =>
    ipcRenderer.invoke(RendererToMain.getRecentFiles),
  getSettings: () => ipcRenderer.invoke(RendererToMain.getSettings),
  getLibrary: () => ipcRenderer.invoke(RendererToMain.getLibrary),
  getResumeInfo: () => ipcRenderer.invoke(RendererToMain.getResumeInfo),
};

contextBridge.exposeInMainWorld('reader', bridge);
