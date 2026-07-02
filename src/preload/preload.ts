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
  onShowHelp: (cb: () => void) => ipcRenderer.on(MainToRenderer.showHelp, () => cb()),
  onHideHelp: (cb: () => void) => ipcRenderer.on(MainToRenderer.hideHelp, () => cb()),
  onFullScreenChanged: (cb: (isFullScreen: boolean) => void) =>
    ipcRenderer.on(MainToRenderer.fullScreenChanged, (_e, value: boolean) => cb(value)),
  onSetDim: (cb: (level: number | null) => void) =>
    ipcRenderer.on(MainToRenderer.setDim, (_e, level: number | null) => cb(level)),
  onStatus: (cb: (message: string | null) => void) =>
    ipcRenderer.on(MainToRenderer.status, (_e, message: string | null) => cb(message)),

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
  nudgeSpread: () => ipcRenderer.send(RendererToMain.nudgeSpread),
  resetSpread: () => ipcRenderer.send(RendererToMain.resetSpread),
  savePage: (pageIndex: number, dataUrl: string | null) =>
    ipcRenderer.invoke(RendererToMain.savePage, pageIndex, dataUrl),
  printPage: (pageIndex: number, dataUrl: string | null) =>
    ipcRenderer.send(RendererToMain.printPage, pageIndex, dataUrl),
  requestOverlay: () => ipcRenderer.send(RendererToMain.requestOverlay),
  toggleFullScreen: () => ipcRenderer.send(RendererToMain.toggleFullScreen),
  setAdaptiveBrightnessDisabled: (disabled: boolean) =>
    ipcRenderer.send(RendererToMain.setAdaptiveBrightnessDisabled, disabled),
  requestHelp: () => ipcRenderer.send(RendererToMain.requestHelp),
  dismissHelp: () => ipcRenderer.send(RendererToMain.dismissHelp),
  quit: () => ipcRenderer.send(RendererToMain.quit),
  openExternal: (url: string) => ipcRenderer.send(RendererToMain.openExternal, url),
  openContainingFolder: (filePath: string) =>
    ipcRenderer.send(RendererToMain.openContainingFolder, filePath),

  getRecentFiles: (): Promise<RecentFileView[]> =>
    ipcRenderer.invoke(RendererToMain.getRecentFiles),
  clearRecentFiles: () => ipcRenderer.send(RendererToMain.clearRecentFiles),
  removeRecentFile: (filePath: string) => ipcRenderer.send(RendererToMain.removeRecentFile, filePath),
  pruneMissingRecentFiles: () => ipcRenderer.invoke(RendererToMain.pruneMissingRecentFiles),
  clearCoverCache: () => ipcRenderer.invoke(RendererToMain.clearCoverCache),
  getSettings: () => ipcRenderer.invoke(RendererToMain.getSettings),
  getLayoutInfo: () => ipcRenderer.invoke(RendererToMain.getLayoutInfo),
  getAppInfo: () => ipcRenderer.invoke(RendererToMain.getAppInfo),
  getLibrary: () => ipcRenderer.invoke(RendererToMain.getLibrary),
  getLibraryCached: () => ipcRenderer.invoke(RendererToMain.getLibraryCached),
  pickFolder: () => ipcRenderer.invoke(RendererToMain.pickFolder),
  getResumeInfo: () => ipcRenderer.invoke(RendererToMain.getResumeInfo),
  getCachedCover: (filePath: string) => ipcRenderer.invoke(RendererToMain.getCachedCover, filePath),
  getCachedCovers: (filePaths: string[]) => ipcRenderer.invoke(RendererToMain.getCachedCovers, filePaths),
  getCoverSource: (filePath: string) => ipcRenderer.invoke(RendererToMain.getCoverSource, filePath),
  saveCover: (filePath: string, dataUrl: string) =>
    ipcRenderer.invoke(RendererToMain.saveCover, filePath, dataUrl),
};

contextBridge.exposeInMainWorld('reader', bridge);
