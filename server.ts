import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import fs from 'fs';
import {
  getDB,
  getTrialInfo,
  activateTrialLicense,
  getSettings,
  updateSettings,
  getMenuItems,
  saveMenuItem,
  deleteMenuItem,
  getOrders,
  createOrder,
  updateOrder,
  deleteOrder,
  clearAllOrders,
  getEmployees,
  saveEmployee,
  deleteEmployee,
  resetAllDataToDefaults,
  importBackupData,
  getDatabasePath,
  resolveDataDir,
} from './server/db.ts';
import { checkGitHubReleases, getUpdaterConfig, saveUpdaterConfig, getPackageVersion } from './server/updater.ts';

function getDistPath(): string {
  if (process.env.DIST_PATH && fs.existsSync(path.join(process.env.DIST_PATH, 'index.html'))) {
    return process.env.DIST_PATH;
  }
  // If running from inside dist/
  if (fs.existsSync(path.join(__dirname, 'index.html'))) {
    return __dirname;
  }
  // If running from root directory where dist is a child
  if (fs.existsSync(path.join(__dirname, 'dist', 'index.html'))) {
    return path.join(__dirname, 'dist');
  }
  // Fallback to process.cwd()/dist
  const cwdDist = path.join(process.cwd(), 'dist');
  if (fs.existsSync(path.join(cwdDist, 'index.html'))) {
    return cwdDist;
  }
  return cwdDist;
}

export async function startServer(customPort?: number): Promise<{ app: express.Express; server: any; port: number }> {
  const app = express();
  const PORT = customPort || Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '10mb' }));

  // Ensure DB initializes automatically on startup
  getDB();

  // Middleware to enforce trial expiration on mutating endpoints
  const checkTrialStatus = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    try {
      const trial = getTrialInfo();
      if (trial.isExpired && !trial.isActivated) {
        return res.status(403).json({
          error: "Please contact Swati Software Solution to activate the software.",
          isExpired: true,
          contact: trial.contact,
        });
      }
      next();
    } catch (err) {
      next();
    }
  };

  // API Routes
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', dbPath: getDatabasePath() });
  });

  // Trial status endpoint
  app.get('/api/trial', (req, res) => {
    try {
      const trial = getTrialInfo();
      res.json(trial);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Trial license activation endpoint
  app.post('/api/trial/activate', (req, res) => {
    try {
      const { key } = req.body || {};
      if (!key) {
        return res.status(400).json({ success: false, message: 'License key is required' });
      }
      const result = activateTrialLicense(key);
      if (!result.success) {
        return res.status(400).json(result);
      }
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // System information and database location
  app.get('/api/system/info', (req, res) => {
    const version = getPackageVersion();
    res.json({
      name: 'Dastarkhwan Restaurant POS',
      version,
      dbPath: getDatabasePath(),
      dataDir: resolveDataDir(),
      platform: process.platform,
      isElectron: process.env.IS_ELECTRON === 'true',
    });
  });

  // Check for updates via GitHub Releases
  app.get('/api/system/updates/check', async (req, res) => {
    const currentVersion = (req.query.currentVersion as string) || (req.query.version as string) || getPackageVersion();
    try {
      const result = await checkGitHubReleases(currentVersion);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({
        success: false,
        isUpdateAvailable: false,
        currentVersion,
        latestVersion: currentVersion,
        error: err.message,
      });
    }
  });

  // Get updater configuration (sanitized)
  app.get('/api/system/updates/config', (req, res) => {
    const config = getUpdaterConfig();
    res.json({
      owner: config.owner,
      repo: config.repo,
    });
  });

  // Update configuration
  app.post('/api/system/updates/config', (req, res) => {
    const { owner, repo } = req.body || {};
    const result = saveUpdaterConfig({ owner, repo });
    res.json(result);
  });

  // Bootstrap endpoint (loads all persistent SQLite state in one request)
  app.get('/api/bootstrap', (req, res) => {
    try {
      const settings = getSettings();
      const menuItems = getMenuItems();
      const orders = getOrders();
      const trial = getTrialInfo();
      const employees = getEmployees();
      res.json({ settings, menuItems, orders, trial, employees });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Settings endpoints
  app.get('/api/settings', (req, res) => {
    try {
      const settings = getSettings();
      res.json(settings);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/settings', checkTrialStatus, (req, res) => {
    try {
      const updated = updateSettings(req.body);
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Menu endpoints
  app.get('/api/menu', (req, res) => {
    try {
      const items = getMenuItems();
      res.json(items);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/menu', checkTrialStatus, (req, res) => {
    try {
      const item = saveMenuItem(req.body);
      res.json(item);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/menu/:id', checkTrialStatus, (req, res) => {
    try {
      deleteMenuItem(req.params.id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Orders endpoints
  app.get('/api/orders', (req, res) => {
    try {
      const orders = getOrders();
      res.json(orders);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/orders', checkTrialStatus, (req, res) => {
    try {
      const order = createOrder(req.body);
      res.json(order);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.patch('/api/orders/:id', checkTrialStatus, (req, res) => {
    try {
      const updated = updateOrder(req.params.id, req.body);
      if (!updated) {
        return res.status(404).json({ error: 'Order not found' });
      }
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/orders/:id', checkTrialStatus, (req, res) => {
    try {
      deleteOrder(req.params.id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/orders/clear-all', checkTrialStatus, (req, res) => {
    try {
      clearAllOrders();
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Employee endpoints
  app.get('/api/employees', (req, res) => {
    try {
      const employees = getEmployees();
      res.json(employees);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/employees', checkTrialStatus, (req, res) => {
    try {
      const emp = saveEmployee(req.body);
      res.json(emp);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/employees/:id', checkTrialStatus, (req, res) => {
    try {
      deleteEmployee(req.params.id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Backup and Reset endpoints
  app.post('/api/backup/import', checkTrialStatus, (req, res) => {
    try {
      importBackupData(req.body);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/reset-defaults', checkTrialStatus, (req, res) => {
    try {
      resetAllDataToDefaults();
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Vite middleware for development vs static build in production
  if (process.env.NODE_ENV !== 'production' && !process.env.ELECTRON_PROD) {
    const isHmrDisabled = process.env.DISABLE_HMR === 'true';
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: isHmrDisabled ? false : undefined,
        watch: isHmrDisabled ? null : {},
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = getDistPath();
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  return new Promise((resolve, reject) => {
    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on http://0.0.0.0:${PORT}`);
      resolve({ app, server, port: PORT });
    });
    server.on('error', (err) => {
      console.error(`Server listen error on port ${PORT}:`, err);
      reject(err);
    });
  });
}
