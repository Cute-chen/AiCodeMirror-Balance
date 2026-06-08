const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('panelApi', {
  getState: () => ipcRenderer.invoke('panel:get-state'),
  refresh: () => ipcRenderer.invoke('panel:refresh'),
  openDashboard: () => ipcRenderer.invoke('panel:open-dashboard'),
  copyInvite: () => ipcRenderer.invoke('panel:copy-invite'),
  login: () => ipcRenderer.invoke('panel:login'),
  logout: () => ipcRenderer.invoke('panel:logout'),
  hide: () => ipcRenderer.invoke('panel:hide'),
  onState: (callback) => {
    const handler = (_event, state) => callback(state);
    ipcRenderer.on('panel:state', handler);
    return () => {
      ipcRenderer.removeListener('panel:state', handler);
    };
  }
});
