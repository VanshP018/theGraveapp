import { contextBridge, ipcRenderer } from 'electron';

export interface ScreenSource {
  id: string;
  name: string;
  kind: 'screen' | 'window';
  thumbnail: string;
}

contextBridge.exposeInMainWorld('tgi', {
  platform: process.platform,
  screen: {
    status: (): Promise<string> => ipcRenderer.invoke('screen:status'),
    sources: (): Promise<ScreenSource[]> => ipcRenderer.invoke('screen:sources'),
    select: (id: string | null): Promise<void> => ipcRenderer.invoke('screen:select', id),
    openSettings: (): Promise<void> => ipcRenderer.invoke('screen:open-settings'),
  },
});
