import { app, BrowserWindow, desktopCapturer, ipcMain, session, shell, systemPreferences } from 'electron';
import { join } from 'node:path';

let selectedSourceId: string | null = null;

function registerScreenShare(): void {
  ipcMain.handle('screen:status', () =>
    process.platform === 'darwin' ? systemPreferences.getMediaAccessStatus('screen') : 'granted',
  );

  ipcMain.handle('screen:sources', async () => {
    const sources = await desktopCapturer.getSources({
      types: ['screen', 'window'],
      thumbnailSize: { width: 320, height: 200 },
      fetchWindowIcons: false,
    });
    return sources.map((s) => ({
      id: s.id,
      name: s.name,
      kind: s.id.startsWith('screen:') ? 'screen' : 'window',
      thumbnail: s.thumbnail.toDataURL(),
    }));
  });

  ipcMain.handle('screen:select', (_e, id: string | null) => {
    selectedSourceId = id;
  });

  ipcMain.handle('screen:open-settings', () =>
    shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture'),
  );

  // The renderer's getDisplayMedia() resolves to whatever source the user picked in our own UI.
  session.defaultSession.setDisplayMediaRequestHandler(async (_request, callback) => {
    const id = selectedSourceId;
    selectedSourceId = null; // one-shot, so a stale pick never leaks into a later request
    if (!id) return callback({});
    const sources = await desktopCapturer.getSources({ types: ['screen', 'window'] });
    const source = sources.find((s) => s.id === id);
    if (!source) return callback({});
    // System audio is only capturable on Windows (loopback); macOS shares video only.
    callback(process.platform === 'win32' ? { video: source, audio: 'loopback' } : { video: source });
  });
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    title: 'theGraveinter',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  if (process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(async () => {
  // Only the app's own window may use camera/mic; deny everything else by default.
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === 'media');
  });

  if (process.platform === 'darwin') {
    for (const kind of ['camera', 'microphone'] as const) {
      const status = systemPreferences.getMediaAccessStatus(kind);
      console.log(`[permissions] ${kind}: ${status}`);
      if (status === 'not-determined') {
        await systemPreferences.askForMediaAccess(kind);
      } else if (status === 'denied' || status === 'restricted') {
        // macOS never re-prompts after a denial; send the user to the right settings pane.
        const pane = kind === 'camera' ? 'Privacy_Camera' : 'Privacy_Microphone';
        void shell.openExternal(`x-apple.systempreferences:com.apple.preference.security?${pane}`);
      }
    }
  }

  registerScreenShare();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
