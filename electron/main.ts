import { app, BrowserWindow, Menu, shell, ipcMain, dialog } from 'electron';
import path from 'path';
import fs from 'fs';
import net from 'net';
import { autoUpdater } from 'electron-updater';
import { startServer } from '../server.ts';
import { resolveDataDir, getDatabasePath } from '../server/db.ts';
import { spawn } from 'child_process';
import { checkGitHubReleases, downloadFileWithProgress, DEFAULT_GITHUB_OWNER, DEFAULT_GITHUB_REPO } from '../server/updater.ts';

// 1. Configure Persistent Data Directory before anything else
process.env.IS_ELECTRON = 'true';
const userDataPath = app.getPath('userData');
process.env.APP_DATA_DIR = userDataPath;

const isPortable = Boolean(process.env.PORTABLE_EXECUTABLE_FILE);
let downloadedPortablePath: string | null = null;

let mainWindow: BrowserWindow | null = null;
let serverInstance: any = null;
let serverPort = 3000;

// Single Instance Lock (prevents duplicate instances)
const singleInstanceLock = app.requestSingleInstanceLock();
if (!singleInstanceLock) {
  app.quit();
  process.exit(0);
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

async function getAvailablePort(preferredPort = 3000): Promise<number> {
  return new Promise((resolve) => {
    const tester = net
      .createServer()
      .once('error', () => {
        // Preferred port in use, find any available free port
        const randomTester = net
          .createServer()
          .once('listening', () => {
            const address = randomTester.address();
            const freePort = typeof address === 'object' && address ? address.port : 3001;
            randomTester.close(() => resolve(freePort));
          })
          .listen(0, '127.0.0.1');
      })
      .once('listening', () => {
        tester.close(() => resolve(preferredPort));
      })
      .listen(preferredPort, '127.0.0.1');
  });
}

function createApplicationMenu() {
  const isMac = process.platform === 'darwin';
  const template: any[] = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'Print Receipt (Ctrl+P)',
          accelerator: 'CmdOrCtrl+P',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('trigger-print');
              mainWindow.webContents.print({ silent: false, printBackground: true });
            }
          },
        },
        {
          label: 'Open Database Folder',
          click: () => {
            const dbDir = resolveDataDir();
            shell.openPath(dbDir);
          },
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Check for Updates...',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('trigger-check-updates');
            }
          },
        },
        { type: 'separator' },
        {
          label: 'Contact Developer (daudaziz998@gmail.com)',
          click: () => {
            shell.openExternal('mailto:daudaziz998@gmail.com?subject=Dastarkhwan%20POS%20Inquiry');
          },
        },
        {
          label: 'About Dastarkhwan POS',
          click: () => {
            dialog.showMessageBox(mainWindow!, {
              type: 'info',
              title: 'About Dastarkhwan Restaurant POS',
              message: 'Dastarkhwan Restaurant Management & POS',
              detail: `Version: ${app.getVersion()}\nSQLite Database: ${getDatabasePath()}\nData Directory: ${resolveDataDir()}\n\nContact: daudaziz998@gmail.com`,
              buttons: ['OK'],
            });
          },
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

async function startAppServer(preferredPort = 3000): Promise<{ server: any; port: number }> {
  let targetPort = await getAvailablePort(preferredPort);
  process.env.PORT = String(targetPort);
  if (app.isPackaged) {
    process.env.ELECTRON_PROD = 'true';
    process.env.DIST_PATH = path.join(__dirname);
  }

  try {
    const { server, port } = await startServer(targetPort);
    return { server, port };
  } catch (err: any) {
    console.warn(`Could not bind to port ${targetPort} (${err?.message}). Attempting next available port...`);
    targetPort = await getAvailablePort(targetPort + 1);
    process.env.PORT = String(targetPort);
    const { server, port } = await startServer(targetPort);
    return { server, port };
  }
}

async function createWindow() {
  createApplicationMenu();

  // Find an available port and boot the ONE Express backend + SQLite database
  const { server, port } = await startAppServer(3000);
  serverPort = port;
  serverInstance = server;

  // Create BrowserWindow
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1024,
    minHeight: 680,
    title: 'Dastarkhwan Restaurant — POS',
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
    show: false,
  });

  // Open external web links in system default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:') || url.startsWith('mailto:')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  // Safe window display handlers - attached BEFORE loading URL
  let isWindowShown = false;
  const revealWindow = () => {
    if (mainWindow && !isWindowShown) {
      isWindowShown = true;
      mainWindow.show();
      mainWindow.focus();
    }
  };

  mainWindow.once('ready-to-show', revealWindow);

  mainWindow.webContents.on('did-finish-load', () => {
    revealWindow();
  });

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error(`Page load failed (${errorCode}): ${errorDescription} at ${validatedURL}`);
    revealWindow();
  });

  // Safety fallback: ensure window is revealed after at most 2.5 seconds
  setTimeout(revealWindow, 2500);

  const appUrl = `http://127.0.0.1:${serverPort}`;
  mainWindow.loadURL(appUrl).catch((err) => {
    console.error('Failed to load application URL in Electron:', err);
    revealWindow();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// IPC Handlers
ipcMain.handle('open-external', (_event, url: string) => {
  shell.openExternal(url);
});

ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

ipcMain.handle('get-db-location', () => {
  return {
    databasePath: getDatabasePath(),
    dataDir: resolveDataDir(),
  };
});

// Update System State & IPC
interface DesktopUpdateState {
  status: 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error';
  currentVersion: string;
  availableVersion?: string;
  releaseName?: string;
  releaseNotes?: string;
  publishedAt?: string;
  downloadUrl?: string;
  setupDownloadUrl?: string;
  portableDownloadUrl?: string;
  isPortable?: boolean;
  distributionType?: 'setup' | 'portable' | 'web';
  progress?: {
    percent: number;
    bytesPerSecond: number;
    transferred: number;
    total: number;
  };
  errorMessage?: string;
  errorType?: string;
}

let currentUpdateState: DesktopUpdateState = {
  status: 'idle',
  currentVersion: '1.0.0',
  isPortable,
  distributionType: isPortable ? 'portable' : (app.isPackaged ? 'setup' : 'web'),
};

function broadcastUpdateState() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-status-changed', currentUpdateState);
  }
}

function setupAutoUpdater() {
  currentUpdateState.currentVersion = app.getVersion();
  currentUpdateState.isPortable = isPortable;
  currentUpdateState.distributionType = isPortable ? 'portable' : (app.isPackaged ? 'setup' : 'web');

  // Configure electron-updater for NSIS Setup distribution
  if (app.isPackaged && !isPortable) {
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.setFeedURL({
      provider: 'github',
      owner: DEFAULT_GITHUB_OWNER,
      repo: DEFAULT_GITHUB_REPO,
    });

    const githubToken = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
    if (githubToken && githubToken.trim()) {
      autoUpdater.requestHeaders = {
        Authorization: `token ${githubToken.trim()}`,
      };
    }

    autoUpdater.on('checking-for-update', () => {
      currentUpdateState = {
        ...currentUpdateState,
        status: 'checking',
        errorMessage: undefined,
        errorType: undefined,
      };
      broadcastUpdateState();
    });

    autoUpdater.on('update-available', (info) => {
      currentUpdateState = {
        ...currentUpdateState,
        status: 'available',
        availableVersion: info.version,
        releaseName: info.releaseName || `Release v${info.version}`,
        releaseNotes: typeof info.releaseNotes === 'string' ? info.releaseNotes : undefined,
        publishedAt: (info as any).releaseDate || undefined,
        setupDownloadUrl: `https://github.com/${DEFAULT_GITHUB_OWNER}/${DEFAULT_GITHUB_REPO}/releases/download/v${info.version}/Dastarkhwan.Restaurant.POS-Setup-${info.version}.exe`,
        portableDownloadUrl: `https://github.com/${DEFAULT_GITHUB_OWNER}/${DEFAULT_GITHUB_REPO}/releases/download/v${info.version}/Dastarkhwan.Restaurant.POS-${info.version}.exe`,
        downloadUrl: `https://github.com/${DEFAULT_GITHUB_OWNER}/${DEFAULT_GITHUB_REPO}/releases/download/v${info.version}/Dastarkhwan.Restaurant.POS-Setup-${info.version}.exe`,
      };
      broadcastUpdateState();
    });

    autoUpdater.on('update-not-available', () => {
      currentUpdateState = {
        ...currentUpdateState,
        status: 'not-available',
        availableVersion: undefined,
      };
      broadcastUpdateState();
    });

    autoUpdater.on('download-progress', (progressObj) => {
      currentUpdateState = {
        ...currentUpdateState,
        status: 'downloading',
        progress: {
          percent: Math.round(progressObj.percent * 10) / 10,
          bytesPerSecond: progressObj.bytesPerSecond,
          transferred: progressObj.transferred,
          total: progressObj.total,
        },
      };
      broadcastUpdateState();
    });

    autoUpdater.on('update-downloaded', (info) => {
      currentUpdateState = {
        ...currentUpdateState,
        status: 'downloaded',
        availableVersion: info.version,
      };
      broadcastUpdateState();
    });

    autoUpdater.on('error', (err) => {
      const msg = String(err?.message || err);
      let friendly = 'Unable to check for updates. Please try again.';
      let type = 'unknown';

      if (msg.includes('net::ERR_INTERNET_DISCONNECTED') || msg.includes('ENOTFOUND') || msg.includes('network') || msg.includes('fetch failed')) {
        friendly = 'No internet connection detected. Please check your internet connection and try again.';
        type = 'offline';
      } else if (msg.includes('403') || msg.includes('rate limit')) {
        friendly = 'Unable to check for updates at this moment. Please try again in a few minutes.';
        type = 'rate_limited';
      } else if (msg.includes('404') || msg.includes('Cannot find') || msg.includes('latest.yml')) {
        // When 404 / latest.yml not found, the application is on the latest version or no release exists
        currentUpdateState = {
          ...currentUpdateState,
          status: 'not-available',
          availableVersion: undefined,
          errorMessage: undefined,
          errorType: undefined,
        };
        broadcastUpdateState();
        return;
      } else if (msg.includes('sha512') || msg.includes('checksum') || msg.includes('corrupted')) {
        friendly = 'Update package verification failed. Download was aborted to safeguard your application.';
        type = 'corrupted';
      }

      currentUpdateState = {
        ...currentUpdateState,
        status: 'error',
        errorMessage: friendly,
        errorType: type,
      };
      broadcastUpdateState();
    });
  }
}

ipcMain.handle('check-for-updates', async () => {
  currentUpdateState = {
    ...currentUpdateState,
    status: 'checking',
    errorMessage: undefined,
    errorType: undefined,
  };
  broadcastUpdateState();

  // If running Windows Portable executable or development mode, use direct GitHub release queries
  if (isPortable || !app.isPackaged) {
    try {
      const releaseInfo = await checkGitHubReleases(app.getVersion());
      if (releaseInfo.success && releaseInfo.isUpdateAvailable) {
        currentUpdateState = {
          status: 'available',
          currentVersion: app.getVersion(),
          availableVersion: releaseInfo.latestVersion,
          releaseName: releaseInfo.releaseName,
          releaseNotes: releaseInfo.releaseNotes,
          publishedAt: releaseInfo.publishedAt,
          downloadUrl: isPortable ? (releaseInfo.portableDownloadUrl || releaseInfo.downloadUrl) : releaseInfo.downloadUrl,
          setupDownloadUrl: releaseInfo.setupDownloadUrl,
          portableDownloadUrl: releaseInfo.portableDownloadUrl,
          isPortable,
          distributionType: isPortable ? 'portable' : 'web',
        };
      } else if (releaseInfo.success && !releaseInfo.isUpdateAvailable) {
        currentUpdateState = {
          status: 'not-available',
          currentVersion: app.getVersion(),
          isPortable,
          distributionType: isPortable ? 'portable' : 'web',
        };
      } else {
        currentUpdateState = {
          status: 'error',
          currentVersion: app.getVersion(),
          errorMessage: releaseInfo.error || 'Failed to query GitHub Releases',
          errorType: releaseInfo.errorType,
          isPortable,
          distributionType: isPortable ? 'portable' : 'web',
        };
      }
      broadcastUpdateState();
      return releaseInfo;
    } catch (err: any) {
      currentUpdateState = {
        status: 'error',
        currentVersion: app.getVersion(),
        errorMessage: err.message,
        isPortable,
        distributionType: isPortable ? 'portable' : 'web',
      };
      broadcastUpdateState();
      return { success: false, error: err.message };
    }
  }

  // Packaged NSIS Setup distribution: use electron-updater
  try {
    const result = await autoUpdater.checkForUpdates();
    return { success: true, result };
  } catch (err: any) {
    // If autoUpdater throws (e.g. latest.yml not yet uploaded to release), fallback to checking GitHub releases API
    try {
      const releaseInfo = await checkGitHubReleases(app.getVersion());
      if (releaseInfo.success && releaseInfo.isUpdateAvailable) {
        currentUpdateState = {
          status: 'available',
          currentVersion: app.getVersion(),
          availableVersion: releaseInfo.latestVersion,
          releaseName: releaseInfo.releaseName,
          releaseNotes: releaseInfo.releaseNotes,
          publishedAt: releaseInfo.publishedAt,
          downloadUrl: releaseInfo.setupDownloadUrl || releaseInfo.downloadUrl,
          setupDownloadUrl: releaseInfo.setupDownloadUrl,
          portableDownloadUrl: releaseInfo.portableDownloadUrl,
          isPortable: false,
          distributionType: 'setup',
        };
        broadcastUpdateState();
        return releaseInfo;
      }
    } catch (_) {}

    return { success: false, error: currentUpdateState.errorMessage || err.message };
  }
});

ipcMain.handle('start-update-download', async (_event, targetAsset?: 'setup' | 'portable') => {
  // Portable version handling: download the portable executable directly
  if (isPortable) {
    const targetUrl = targetAsset === 'setup'
      ? currentUpdateState.setupDownloadUrl
      : (currentUpdateState.portableDownloadUrl || currentUpdateState.downloadUrl);

    if (!targetUrl) {
      currentUpdateState = {
        ...currentUpdateState,
        status: 'error',
        errorMessage: 'Download URL for the new version is not available.',
      };
      broadcastUpdateState();
      return { success: false, error: 'Download URL not available' };
    }

    try {
      currentUpdateState = {
        ...currentUpdateState,
        status: 'downloading',
        progress: { percent: 0, bytesPerSecond: 0, transferred: 0, total: 0 },
      };
      broadcastUpdateState();

      // Portable executable destination directory
      const execDir = process.env.PORTABLE_EXECUTABLE_DIR || path.dirname(process.env.PORTABLE_EXECUTABLE_FILE || process.cwd());
      const newVersion = currentUpdateState.availableVersion || 'latest';
      const targetFileName = `Dastarkhwan.Restaurant.POS-${newVersion}.exe`;
      const targetPath = path.join(execDir, targetFileName);

      await downloadFileWithProgress(targetUrl, targetPath, (progress) => {
        currentUpdateState = {
          ...currentUpdateState,
          status: 'downloading',
          progress,
        };
        broadcastUpdateState();
      });

      downloadedPortablePath = targetPath;
      currentUpdateState = {
        ...currentUpdateState,
        status: 'downloaded',
        progress: { percent: 100, bytesPerSecond: 0, transferred: 1, total: 1 },
      };
      broadcastUpdateState();
      return { success: true, path: targetPath };
    } catch (err: any) {
      currentUpdateState = {
        ...currentUpdateState,
        status: 'error',
        errorMessage: `Failed to download portable update: ${err.message}`,
      };
      broadcastUpdateState();
      return { success: false, error: err.message };
    }
  }

  // Packaged NSIS setup installation
  if (app.isPackaged) {
    try {
      currentUpdateState = {
        ...currentUpdateState,
        status: 'downloading',
        progress: { percent: 0, bytesPerSecond: 0, transferred: 0, total: 100 },
      };
      broadcastUpdateState();
      await autoUpdater.downloadUpdate();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  // In dev / unpackaged mode: simulate download steps for testing UI feedback
  currentUpdateState = {
    ...currentUpdateState,
    status: 'downloading',
    progress: { percent: 25, bytesPerSecond: 1024 * 1024 * 2, transferred: 12 * 1024 * 1024, total: 48 * 1024 * 1024 },
  };
  broadcastUpdateState();

  setTimeout(() => {
    currentUpdateState = {
      ...currentUpdateState,
      status: 'downloading',
      progress: { percent: 75, bytesPerSecond: 1024 * 1024 * 3, transferred: 36 * 1024 * 1024, total: 48 * 1024 * 1024 },
    };
    broadcastUpdateState();
  }, 400);

  setTimeout(() => {
    currentUpdateState = {
      ...currentUpdateState,
      status: 'downloaded',
      progress: { percent: 100, bytesPerSecond: 0, transferred: 48 * 1024 * 1024, total: 48 * 1024 * 1024 },
    };
    broadcastUpdateState();
  }, 800);

  return { success: true, message: 'Download completed' };
});

ipcMain.handle('quit-and-install', () => {
  // Portable version restart & run
  if (isPortable && downloadedPortablePath && fs.existsSync(downloadedPortablePath)) {
    try {
      const child = spawn(downloadedPortablePath, [], {
        detached: true,
        stdio: 'ignore',
      });
      child.unref();
      app.quit();
      return;
    } catch (err: any) {
      dialog.showErrorBox('Failed to launch new version', `Could not launch ${downloadedPortablePath}: ${err.message}`);
      return;
    }
  }

  // Packaged NSIS setup installation: cleanly restart and run installer silently
  if (app.isPackaged) {
    autoUpdater.quitAndInstall(false, true);
    return;
  }

  // Unpackaged development mode
  dialog.showMessageBox(mainWindow!, {
    type: 'info',
    title: 'Update Ready (Preview Mode)',
    message: 'In packaged production build, this will seamlessly quit the app, apply the update, and relaunch.',
    detail: `Your SQLite database at:\n${getDatabasePath()}\nwill remain 100% preserved.`,
    buttons: ['OK'],
  });
});

ipcMain.handle('get-update-status', () => {
  return currentUpdateState;
});

app.whenReady().then(async () => {
  setupAutoUpdater();
  await createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    if (serverInstance) {
      serverInstance.close();
    }
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('before-quit', () => {
  if (serverInstance) {
    try {
      serverInstance.close();
    } catch {
      // Ignored
    }
  }
});
