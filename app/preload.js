// preload.js — Minimal contextBridge surface. The renderer is sandboxed and
// cannot touch fs/process; everything goes through these typed handles.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cn', {
  readConfig:    ()                  => ipcRenderer.invoke('config:read'),
  writeConfig:   (cfg)               => ipcRenderer.invoke('config:write', cfg),
  mergeConfig:   (partial)           => ipcRenderer.invoke('config:merge', partial),
  revealConfig:  ()                  => ipcRenderer.invoke('config:reveal'),
  tailLog:       (lines)             => ipcRenderer.invoke('log:tail', lines),
  testChannel:   (id, opts)          => ipcRenderer.invoke('test:channel', id, opts),
  schemaChannels:()                  => ipcRenderer.invoke('schema:channels'),
  schemaEvents:  ()                  => ipcRenderer.invoke('schema:events'),
  listVoices:    ()                  => ipcRenderer.invoke('voices:list'),
  openVoiceSettings: ()              => ipcRenderer.invoke('voices:open-settings'),
  previewVoice:  (name, text)        => ipcRenderer.invoke('voices:preview', name, text),
  appInfo:       ()                  => ipcRenderer.invoke('app:info'),

  updater: {
    state:           ()  => ipcRenderer.invoke('updater:state'),
    check:           ()  => ipcRenderer.invoke('updater:check'),
    download:        ()  => ipcRenderer.invoke('updater:download'),
    install:         ()  => ipcRenderer.invoke('updater:install'),
    openReleases:    ()  => ipcRenderer.invoke('updater:open-releases'),
    onState: (cb) => {
      const handler = (_e, state) => cb(state);
      ipcRenderer.on('updater:state', handler);
      return () => ipcRenderer.removeListener('updater:state', handler);
    },
  },
});
