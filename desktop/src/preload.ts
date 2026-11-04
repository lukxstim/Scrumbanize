// Runs in the sandboxed page before the app loads and offers it the few desktop functions it may use.
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import { IPC, type DesktopSettingsPatch } from './bridge.js';

contextBridge.exposeInMainWorld('scrumbanizeDesktop', {
  getSettings: () => ipcRenderer.invoke(IPC.getSettings),
  updateSettings: (patch: DesktopSettingsPatch) => ipcRenderer.invoke(IPC.updateSettings, patch),
  checkReminders: () => ipcRenderer.invoke(IPC.checkReminders),
  openSticky: (noteId: number) => ipcRenderer.invoke(IPC.openSticky, noteId),
  onNavigate: (handler: (path: string) => void) => {
    const listener = (_event: IpcRendererEvent, path: string) => handler(path);
    ipcRenderer.on(IPC.navigate, listener);
    return () => {
      ipcRenderer.removeListener(IPC.navigate, listener);
    };
  },
});
