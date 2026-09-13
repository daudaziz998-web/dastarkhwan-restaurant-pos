import { contextBridge, ipcRenderer } from 'electron';

// Expose safe desktop capabilities to window.electronAPI
contextBridge.exposeInMainWorld('electronAPI', {
  isDesktop: true,
  isPortable: Boolean(process.env.PORTABLE_EXECUTABLE_FILE),
  platform: process.platform,
  print: () => window.print(),
  openExternal: (url: string) => ipcRenderer.invoke('open-external', url),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getDatabaseLocation: () => ipcRenderer.invoke('get-db-location'),
  // Auto-updater desktop methods
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  startUpdateDownload: (targetAsset?: 'setup' | 'portable') => ipcRenderer.invoke('start-update-download', targetAsset),
  quitAndInstall: () => ipcRenderer.invoke('quit-and-install'),
  getUpdateStatus: () => ipcRenderer.invoke('get-update-status'),
  onUpdateStatusChange: (callback: (status: any) => void) => {
    const handler = (_event: any, data: any) => callback(data);
    ipcRenderer.on('update-status-changed', handler);
    return () => {
      ipcRenderer.removeListener('update-status-changed', handler);
    };
  },
  onTriggerCheckUpdates: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('trigger-check-updates', handler);
    return () => {
      ipcRenderer.removeListener('trigger-check-updates', handler);
    };
  },
});
