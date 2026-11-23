'use strict';

const { contextBridge, ipcRenderer } = require('electron');

function invoke(channel, ...args) {
  return ipcRenderer.invoke(channel, ...args);
}

contextBridge.exposeInMainWorld('afterglowDesktop', {
  getContext: () => invoke('afterglow:context'),
  listLevels: () => invoke('afterglow:list-levels'),
  readLevel: (name) => invoke('afterglow:read-level', name),
  saveLevel: (name, bytes) => invoke('afterglow:save-level', name, bytes),
  saveVersion: (version) => invoke('afterglow:save-version', version),
  publishLevel: (payload) => invoke('afterglow:publish-level', payload),
  listCloudLevels: () => invoke('afterglow:list-cloud-levels'),
  downloadLevel: (packageId) => invoke('afterglow:download-level', packageId),
  deleteLevel: (packageId, key) => invoke('afterglow:delete-level', packageId, key),
  setDeveloperKey: (key) => invoke('afterglow:set-developer-key', key),
  clearDeveloperKey: () => invoke('afterglow:clear-developer-key'),
  checkAppUpdate: () => invoke('afterglow:check-app-update'),
  downloadAppUpdate: (payload) => invoke('afterglow:download-app-update', payload || {}),
  publishAppUpdate: (payload) => invoke('afterglow:publish-app-update', payload),
  getAppVersion: () => invoke('afterglow:get-app-version'),
  onLevelsChanged: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const handler = () => {
      try { callback(); } catch (_) { /* ignore renderer errors */ }
    };
    ipcRenderer.on('afterglow:levels-changed', handler);
    return () => ipcRenderer.removeListener('afterglow:levels-changed', handler);
  },
  onCloudChanged: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const handler = () => {
      try { callback(); } catch (_) { /* ignore renderer errors */ }
    };
    ipcRenderer.on('afterglow:cloud-changed', handler);
    return () => ipcRenderer.removeListener('afterglow:cloud-changed', handler);
  },
});
