// preload.js — Minimal contextBridge surface. The renderer is sandboxed and
// cannot touch fs/process; everything goes through these typed handles.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cn', {
  readConfig:    ()           => ipcRenderer.invoke('config:read'),
  writeConfig:   (cfg)        => ipcRenderer.invoke('config:write', cfg),
  mergeConfig:   (partial)    => ipcRenderer.invoke('config:merge', partial),
  revealConfig:  ()           => ipcRenderer.invoke('config:reveal'),
  tailLog:       (lines)      => ipcRenderer.invoke('log:tail', lines),
  testChannel:   (id, opts)   => ipcRenderer.invoke('test:channel', id, opts),
  schemaChannels:()           => ipcRenderer.invoke('schema:channels'),
  schemaEvents:  ()           => ipcRenderer.invoke('schema:events'),
  appInfo:       ()           => ipcRenderer.invoke('app:info'),
});
