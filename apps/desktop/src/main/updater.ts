import { app, dialog } from 'electron';
import { autoUpdater } from 'electron-updater';

/** Checks GitHub Releases for a newer build; no-op in dev. Never interrupts a call: installs on quit. */
export function initAutoUpdate(): void {
  if (!app.isPackaged) return;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('error', (err) => console.error('[updater]', err));
  autoUpdater.on('update-downloaded', async (info) => {
    const { response } = await dialog.showMessageBox({
      type: 'info',
      buttons: ['Restart later', 'Restart now'],
      defaultId: 0,
      message: `Version ${info.version} is ready`,
      detail: 'It will be installed the next time you quit. Avoid restarting during an interview.',
    });
    if (response === 1) autoUpdater.quitAndInstall();
  });

  void autoUpdater.checkForUpdates();
  setInterval(() => void autoUpdater.checkForUpdates(), 4 * 60 * 60 * 1000);
}
