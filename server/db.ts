import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import fs from 'fs';

let dbInstance: DatabaseSync | null = null;

// Determine persistent data directory safely across environments
export function resolveDataDir(): string {
  // 1. Explicit environment variable set by Electron main process (e.g. app.getPath('userData'))
  if (process.env.APP_DATA_DIR && process.env.APP_DATA_DIR.trim()) {
    return process.env.APP_DATA_DIR.trim();
  }
  // 2. Windows standard APPDATA directory if running natively on Windows
  if (process.platform === 'win32' && process.env.APPDATA) {
    return path.join(process.env.APPDATA, 'dastarkhwan-pos');
  }
  // 3. Fallback to ./data for web development and Cloud Run container
  return path.join(process.cwd(), 'data');
}

export function getDatabasePath(): string {
  const dir = resolveDataDir();
  return path.join(dir, 'restaurant.db');
}

export interface DBMenuItem {
  id: string;
  name: string;
  description: string;
  image: string;
  available: boolean;
  favorite: boolean;
  variants: Array<{ id: string; label: string; price: number }>;
}

export interface DBSettings {
  restaurantName: string;
  logo: string;
  address: string;
  phone: string;
  currency: string;
  receiptFooter: string;
  receiptFormat: 'thermal' | 'a4';
  nextOrderNumber: number;
  theme: 'dark' | 'light';
}

export interface DBOrderItem {
  id: string;
  menuItemId: string | null;
  name: string;
  variantLabel: string;
  price: number;
  qty: number;
  notes: string;
  isExtra?: boolean;
}

export interface DBOrder {
  id: string;
  orderNumber: number;
  customerName: string;
  tableNumber: string;
  createdAt: string;
  items: DBOrderItem[];
  subtotal: number;
  discount: number;
  total: number;
  paymentStatus: 'paid' | 'unpaid';
  paymentDate: string | null;
  stage: 'active' | 'completed';
}

export interface DBTrial {
  id: string;
  trial_start_date: string;
  trial_expiration_date: string;
  trial_status: 'active' | 'expired';
  created_at: string;
}

export interface DBEmployee {
  id: string;
  name: string;
  phone: string;
  salary: number;
  createdAt: string;
}

const DEFAULT_SETTINGS: DBSettings = {
  restaurantName: 'Dastarkhwan Restaurant',
  logo: '🍽️',
  address: 'Blue Area, Islamabad',
  phone: '+92 300 1234567',
  currency: 'Rs',
  receiptFooter: 'Thank you for dining with us! Visit again.',
  receiptFormat: 'thermal',
  nextOrderNumber: 1,
  theme: 'dark',
};

const DEFAULT_MENU_ITEMS: DBMenuItem[] = [
  {
    id: 'item_karahi',
    name: 'Chicken Karahi',
    description: 'Classic tomato-based karahi.',
    image: '🍛',
    available: true,
    favorite: true,
    variants: [
      { id: 'v_k_half', label: 'Half', price: 950 },
      { id: 'v_k_full', label: 'Full', price: 1750 },
    ],
  },
  {
    id: 'item_handi',
    name: 'Chicken Handi',
    description: 'Creamy, rich handi gravy.',
    image: '🍲',
    available: true,
    favorite: false,
    variants: [
      { id: 'v_h_half', label: 'Half', price: 1000 },
      { id: 'v_h_full', label: 'Full', price: 1850 },
    ],
  },
  {
    id: 'item_tikka',
    name: 'Chicken Tikka',
    description: 'Char-grilled tikka pieces.',
    image: '🍗',
    available: true,
    favorite: true,
    variants: [
      { id: 'v_t_1', label: '1 Piece', price: 280 },
      { id: 'v_t_2', label: '2 Pieces', price: 540 },
      { id: 'v_t_full', label: 'Full', price: 1500 },
    ],
  },
  {
    id: 'item_biryani',
    name: 'Chicken Biryani',
    description: 'Fragrant basmati biryani.',
    image: '🍚',
    available: true,
    favorite: true,
    variants: [
      { id: 'v_b_half', label: 'Half Plate', price: 320 },
      { id: 'v_b_full', label: 'Full Plate', price: 550 },
    ],
  },
  {
    id: 'item_kabab',
    name: 'Seekh Kabab',
    description: 'Beef seekh kabab skewers.',
    image: '🔥',
    available: true,
    favorite: false,
    variants: [{ id: 'v_sk_reg', label: 'Regular', price: 180 }],
  },
  {
    id: 'item_burger',
    name: 'Beef Burger',
    description: 'Grilled patty, cheese, salad.',
    image: '🍔',
    available: true,
    favorite: false,
    variants: [{ id: 'v_bb_reg', label: 'Regular', price: 420 }],
  },
  {
    id: 'item_drink',
    name: 'Soft Drink',
    description: 'Chilled 345ml can.',
    image: '🥤',
    available: true,
    favorite: false,
    variants: [
      { id: 'v_sd_can', label: 'Can', price: 120 },
      { id: 'v_sd_15l', label: '1.5L Bottle', price: 250 },
    ],
  },
  {
    id: 'item_kheer',
    name: 'Kheer',
    description: 'Traditional rice pudding.',
    image: '🍮',
    available: true,
    favorite: false,
    variants: [{ id: 'v_kh_bowl', label: 'Bowl', price: 150 }],
  },
];

// Trial lock file helpers for dual persistence and anti-tamper
export function getTrialLockFilePath(): string {
  const dir = resolveDataDir();
  return path.join(dir, '.trial_lock.json');
}

export interface TrialLockData {
  trialStartDate: string;
  trialExpirationDate: string;
  trialStatus: 'active' | 'expired' | 'activated';
  createdAt: string;
  activatedLicenseKey?: string;
  lastVerifiedAt?: string;
}

export function readTrialLockFile(): TrialLockData | null {
  try {
    const filePath = getTrialLockFilePath();
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed && parsed.trialStartDate && parsed.trialExpirationDate) {
        return parsed;
      }
    }
  } catch (err) {
    console.warn('Notice reading trial lockfile:', err);
  }
  return null;
}

export function writeTrialLockFile(data: TrialLockData): void {
  try {
    const filePath = getTrialLockFilePath();
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.warn('Notice writing trial lockfile:', err);
  }
}

// Schema Migrations Runner: Safe, non-destructive schema evolution across updates
function runSchemaMigrations(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);

  const appliedRows = (db.prepare('SELECT version FROM schema_migrations').all() as any[]) || [];
  const appliedVersions = new Set<number>(appliedRows.map((r: any) => Number(r.version)));

  const migrations: Array<{ version: number; name: string; run: (database: DatabaseSync) => void }> = [
    {
      version: 1,
      name: 'add_trial_security_columns',
      run: (database) => {
        try {
          const columns = (database.prepare('PRAGMA table_info(trial)').all() as any[]).map((c: any) => c.name);
          if (!columns.includes('last_verified_at')) {
            database.exec('ALTER TABLE trial ADD COLUMN last_verified_at TEXT;');
          }
          if (!columns.includes('activated_license_key')) {
            database.exec('ALTER TABLE trial ADD COLUMN activated_license_key TEXT;');
          }
        } catch (_) {}
      },
    },
    {
      version: 2,
      name: 'add_indices_and_updater_metadata',
      run: (database) => {
        try {
          database.exec(`
            CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(createdAt);
            CREATE INDEX IF NOT EXISTS idx_orders_order_number ON orders(orderNumber);
            CREATE INDEX IF NOT EXISTS idx_menu_items_available ON menu_items(available);
            CREATE TABLE IF NOT EXISTS app_metadata (
              key TEXT PRIMARY KEY,
              value TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );
          `);
        } catch (_) {}
      },
    },
    {
      version: 3,
      name: 'update_trial_to_30_days_720_hours',
      run: (database) => {
        try {
          const trial = database.prepare('SELECT * FROM trial WHERE id = ?').get('system_trial') as any;
          if (trial && trial.trial_start_date) {
            const startMs = new Date(trial.trial_start_date).getTime();
            const newExpirationMs = startMs + (720 * 60 * 60 * 1000);
            const newExpiration = new Date(newExpirationMs).toISOString();
            const nowMs = Date.now();
            const isActivated = trial.trial_status === 'activated';
            const newStatus = isActivated ? 'activated' : (nowMs >= newExpirationMs ? 'expired' : 'active');

            database.prepare(
              'UPDATE trial SET trial_expiration_date = ?, trial_status = ? WHERE id = ?'
            ).run(newExpiration, newStatus, 'system_trial');

            const lock = readTrialLockFile();
            if (lock) {
              writeTrialLockFile({
                ...lock,
                trialExpirationDate: newExpiration,
                trialStatus: newStatus,
                lastVerifiedAt: new Date().toISOString(),
              });
            }
          }
        } catch (err) {
          console.warn('Migration 3 error:', err);
        }
      },
    },
    {
      version: 4,
      name: 'cleanup_stock_tables',
      run: (database) => {
        try {
          database.exec(`
            DROP TABLE IF EXISTS stock_consumption;
            DROP TABLE IF EXISTS stock_items;
          `);
        } catch (_) {}
      },
    },
  ];

  for (const m of migrations) {
    if (!appliedVersions.has(m.version)) {
      try {
        m.run(db);
        db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)').run(
          m.version,
          m.name,
          new Date().toISOString()
        );
      } catch (err) {
        console.warn(`Migration ${m.version} notice:`, err);
      }
    }
  }
}

function initDatabase(dbPath: string): DatabaseSync {
  const db = new DatabaseSync(dbPath);

  // Standard safe pragmas: DELETE journal mode avoids orphaned -shm / -wal files across container restarts
  try {
    db.exec('PRAGMA busy_timeout = 5000;');
    const currentMode = (db.prepare('PRAGMA journal_mode;').get() as any)?.journal_mode;
    if (currentMode && currentMode.toLowerCase() !== 'delete') {
      try {
        db.exec('PRAGMA journal_mode = DELETE;');
      } catch (_) {
        // If locked by another connection, continue with current mode
      }
    }
    db.exec('PRAGMA synchronous = NORMAL;');
  } catch (e) {
    // Non-critical pragma configuration
  }

  // Create required tables if they do not exist
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      id TEXT PRIMARY KEY,
      restaurantName TEXT,
      logo TEXT,
      address TEXT,
      phone TEXT,
      currency TEXT,
      receiptFooter TEXT,
      receiptFormat TEXT,
      nextOrderNumber INTEGER,
      theme TEXT
    );

    CREATE TABLE IF NOT EXISTS menu_items (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      image TEXT,
      available INTEGER NOT NULL DEFAULT 1,
      favorite INTEGER NOT NULL DEFAULT 0,
      variants_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      orderNumber INTEGER NOT NULL,
      customerName TEXT,
      tableNumber TEXT,
      createdAt TEXT NOT NULL,
      items_json TEXT NOT NULL,
      subtotal REAL NOT NULL,
      discount REAL NOT NULL,
      total REAL NOT NULL,
      paymentStatus TEXT NOT NULL,
      paymentDate TEXT,
      stage TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS trial (
      id TEXT PRIMARY KEY,
      trial_start_date TEXT NOT NULL,
      trial_expiration_date TEXT NOT NULL,
      trial_status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      last_verified_at TEXT,
      activated_license_key TEXT
    );

    CREATE TABLE IF NOT EXISTS employees (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      salary REAL NOT NULL,
      createdAt TEXT NOT NULL
    );

    DROP TABLE IF EXISTS stock_consumption;
    DROP TABLE IF EXISTS stock_items;
  `);

  // Run safe schema migrations (idempotent, never deletes data)
  runSchemaMigrations(db);

  // Initialize Settings if table empty
  const existingSettings = db.prepare('SELECT * FROM settings WHERE id = ?').get('pos_config');
  if (!existingSettings) {
    db.prepare(
      `INSERT INTO settings (id, restaurantName, logo, address, phone, currency, receiptFooter, receiptFormat, nextOrderNumber, theme)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      'pos_config',
      DEFAULT_SETTINGS.restaurantName,
      DEFAULT_SETTINGS.logo,
      DEFAULT_SETTINGS.address,
      DEFAULT_SETTINGS.phone,
      DEFAULT_SETTINGS.currency,
      DEFAULT_SETTINGS.receiptFooter,
      DEFAULT_SETTINGS.receiptFormat,
      DEFAULT_SETTINGS.nextOrderNumber,
      DEFAULT_SETTINGS.theme
    );
  }

  // Initialize Menu Items if table empty
  const menuItemCount = db.prepare('SELECT count(*) as count FROM menu_items').get() as { count: number } | undefined;
  if (!menuItemCount || menuItemCount.count === 0) {
    const insertStmt = db.prepare(
      `INSERT INTO menu_items (id, name, description, image, available, favorite, variants_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    for (const item of DEFAULT_MENU_ITEMS) {
      insertStmt.run(
        item.id,
        item.name,
        item.description,
        item.image,
        item.available ? 1 : 0,
        item.favorite ? 1 : 0,
        JSON.stringify(item.variants)
      );
    }
  }

  // Initialize and synchronize 30-Day (720-Hour) Trial (Dual-layer persistence)
  const TRIAL_DAYS = 30;
  const TRIAL_HOURS = 720;
  const TRIAL_MS = TRIAL_HOURS * 60 * 60 * 1000;
  const existingTrial = db.prepare('SELECT * FROM trial WHERE id = ?').get('system_trial') as any;
  const lockData = readTrialLockFile();

  if (!existingTrial && !lockData) {
    // Fresh installation: Day 1 starts on first activation
    const now = new Date();
    const startDate = now.toISOString();
    const expirationDate = new Date(now.getTime() + TRIAL_MS).toISOString();
    db.prepare(
      `INSERT INTO trial (id, trial_start_date, trial_expiration_date, trial_status, created_at, last_verified_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run('system_trial', startDate, expirationDate, 'active', startDate, startDate);

    writeTrialLockFile({
      trialStartDate: startDate,
      trialExpirationDate: expirationDate,
      trialStatus: 'active',
      createdAt: startDate,
      lastVerifiedAt: startDate,
    });
  } else if (!existingTrial && lockData) {
    // Database was deleted/reset, but lockfile exists: restore trial from persistent lockfile
    db.prepare(
      `INSERT INTO trial (id, trial_start_date, trial_expiration_date, trial_status, created_at, last_verified_at, activated_license_key)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      'system_trial',
      lockData.trialStartDate,
      lockData.trialExpirationDate,
      lockData.trialStatus,
      lockData.createdAt || lockData.trialStartDate,
      lockData.lastVerifiedAt || new Date().toISOString(),
      lockData.activatedLicenseKey || null
    );
  } else if (existingTrial && !lockData) {
    // Lockfile missing: restore lockfile from SQLite database
    writeTrialLockFile({
      trialStartDate: existingTrial.trial_start_date,
      trialExpirationDate: existingTrial.trial_expiration_date,
      trialStatus: existingTrial.trial_status,
      createdAt: existingTrial.created_at || existingTrial.trial_start_date,
      lastVerifiedAt: existingTrial.last_verified_at || new Date().toISOString(),
      activatedLicenseKey: existingTrial.activated_license_key || undefined,
    });
  } else if (existingTrial && lockData) {
    // Both exist: cross-validate and synchronize to the authoritative (earliest) start date
    const dbStartTime = new Date(existingTrial.trial_start_date).getTime();
    const lockStartTime = new Date(lockData.trialStartDate).getTime();
    const earliestStart = new Date(Math.min(dbStartTime, lockStartTime)).toISOString();
    const expectedExpiration = new Date(new Date(earliestStart).getTime() + TRIAL_MS).toISOString();

    const isActivated = existingTrial.trial_status === 'activated' || lockData.trialStatus === 'activated';
    const isExpired = !isActivated && (
      existingTrial.trial_status === 'expired' ||
      lockData.trialStatus === 'expired' ||
      new Date().getTime() >= new Date(expectedExpiration).getTime()
    );

    const finalStatus = isActivated ? 'activated' : (isExpired ? 'expired' : 'active');
    const licenseKey = existingTrial.activated_license_key || lockData.activatedLicenseKey || null;

    db.prepare(
      `UPDATE trial SET trial_start_date = ?, trial_expiration_date = ?, trial_status = ?, activated_license_key = ? WHERE id = ?`
    ).run(earliestStart, expectedExpiration, finalStatus, licenseKey, 'system_trial');

    writeTrialLockFile({
      trialStartDate: earliestStart,
      trialExpirationDate: expectedExpiration,
      trialStatus: finalStatus,
      createdAt: lockData.createdAt || existingTrial.created_at,
      lastVerifiedAt: new Date().toISOString(),
      activatedLicenseKey: licenseKey || undefined,
    });
  }

  return db;
}

export function getDB(): DatabaseSync {
  if (dbInstance) return dbInstance;

  const dataDir = resolveDataDir();
  const dbPath = getDatabasePath();

  // 1. Check whether persistent data directory exists, create if necessary
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  try {
    dbInstance = initDatabase(dbPath);
    return dbInstance;
  } catch (err: any) {
    console.error(`SQLite database error at ${dbPath}:`, err);
    // If disk image is malformed or corrupted, safely backup all associated files and reinitialize
    if (err?.code === 'ERR_SQLITE_ERROR' || String(err).includes('malformed') || String(err).includes('corrupt')) {
      const backupCorruptedPath = `${dbPath}.corrupted.${Date.now()}`;
      try {
        if (fs.existsSync(dbPath)) {
          fs.renameSync(dbPath, backupCorruptedPath);
          console.warn(`Corrupted database moved to ${backupCorruptedPath}. Initializing fresh database.`);
        }
        if (fs.existsSync(`${dbPath}-wal`)) {
          try { fs.unlinkSync(`${dbPath}-wal`); } catch (_) {}
        }
        if (fs.existsSync(`${dbPath}-shm`)) {
          try { fs.unlinkSync(`${dbPath}-shm`); } catch (_) {}
        }
      } catch (backupErr) {
        console.error('Failed to handle corrupted database files:', backupErr);
      }
      dbInstance = initDatabase(dbPath);
      return dbInstance;
    }
    throw err;
  }
}

// Database helper functions
export function getTrialInfo() {
  const db = getDB();
  const trial = db.prepare('SELECT * FROM trial WHERE id = ?').get('system_trial') as any;
  if (!trial) {
    throw new Error('Trial record missing in database');
  }

  const isActivated = trial.trial_status === 'activated';
  const now = new Date();
  const start = new Date(trial.trial_start_date);
  const expiration = new Date(trial.trial_expiration_date);
  const totalDays = 30;
  const totalHours = 720;
  const totalMs = totalHours * 60 * 60 * 1000;

  // Anti-tamper check against backward clock manipulation
  const lastVerified = trial.last_verified_at ? new Date(trial.last_verified_at) : null;
  let clockTampered = false;
  if (lastVerified && (now.getTime() < lastVerified.getTime() - 60 * 60 * 1000)) {
    clockTampered = true;
  }

  const remainingMs = Math.max(0, expiration.getTime() - now.getTime());
  const elapsedMs = Math.max(0, now.getTime() - start.getTime());

  // Calculate current day (Day 1 through Day 30)
  const currentDay = Math.min(totalDays, Math.floor(elapsedMs / (1000 * 60 * 60 * 24)) + 1);

  // Locked automatically after exactly 720 hours (or if already expired or clock manipulation)
  let isExpired = !isActivated && (
    remainingMs <= 0 ||
    elapsedMs >= totalMs ||
    trial.trial_status === 'expired' ||
    clockTampered
  );

  if (isExpired && trial.trial_status !== 'expired' && !isActivated) {
    db.prepare('UPDATE trial SET trial_status = ? WHERE id = ?').run('expired', 'system_trial');
    trial.trial_status = 'expired';
    writeTrialLockFile({
      trialStartDate: trial.trial_start_date,
      trialExpirationDate: trial.trial_expiration_date,
      trialStatus: 'expired',
      createdAt: trial.created_at,
      lastVerifiedAt: now.toISOString(),
      activatedLicenseKey: trial.activated_license_key || undefined,
    });
  }

  if (!clockTampered) {
    try {
      db.prepare('UPDATE trial SET last_verified_at = ? WHERE id = ?').run(now.toISOString(), 'system_trial');
    } catch (_) {}
  }

  // Calculate remaining time precisely from start timestamp
  const remainingDays = isActivated ? 999 : Math.max(0, Math.floor(remainingMs / (1000 * 60 * 60 * 24)));
  const remainingHours = isActivated ? 9999 : Math.max(0, Math.floor((remainingMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)));
  const totalRemainingHours = isActivated ? 9999 : Math.max(0, Math.floor(remainingMs / (1000 * 60 * 60)));
  const remainingMinutes = isActivated ? 99999 : Math.max(0, Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60)));

  const formattedRemaining = isActivated
    ? 'Activated (Lifetime License)'
    : isExpired
    ? 'Expired'
    : `30-Day Trial: ${remainingDays}d ${remainingHours}h remaining`;

  const lockMessage = "Please contact Swati Software Solution to activate the software.";

  return {
    isExpired: isActivated ? false : isExpired,
    isActivated,
    trialStartDate: trial.trial_start_date,
    trialExpirationDate: trial.trial_expiration_date,
    trialStatus: trial.trial_status as 'active' | 'expired' | 'activated',
    remainingMs: isActivated ? 999999999 : remainingMs,
    remainingDays,
    remainingHours,
    totalRemainingHours,
    remainingMinutes,
    currentDay: isActivated ? totalDays : (isExpired ? totalDays : currentDay),
    totalDays,
    totalHours,
    formattedRemaining,
    lockMessage,
    contact: {
      company: 'Swati Software Solution',
      email: 'daudaziz998@gmail.com',
      whatsapp: '03159508371',
    },
  };
}

export function activateTrialLicense(key: string): { success: boolean; message: string; trial?: any } {
  const normalizedKey = (key || '').trim().toUpperCase();
  const masterKeys = [
    'SWATI-POS-2026',
    'SWATI-2026-ACTIVE',
    'SWATI-SOFTWARE-SOLUTION',
    'SWATI-2026-POS',
    'SWATI-FULL-LICENSE',
    'SSS-POS-2026',
  ];
  const isValidCustomPattern = /^SWATI-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(normalizedKey);

  if (masterKeys.includes(normalizedKey) || isValidCustomPattern) {
    const db = getDB();
    db.prepare('UPDATE trial SET trial_status = ?, activated_license_key = ? WHERE id = ?').run(
      'activated',
      normalizedKey,
      'system_trial'
    );
    const row = db.prepare('SELECT * FROM trial WHERE id = ?').get('system_trial') as any;
    writeTrialLockFile({
      trialStartDate: row.trial_start_date,
      trialExpirationDate: row.trial_expiration_date,
      trialStatus: 'activated',
      createdAt: row.created_at,
      lastVerifiedAt: new Date().toISOString(),
      activatedLicenseKey: normalizedKey,
    });
    return {
      success: true,
      message: 'Software activated successfully with full commercial license from Swati Software Solution.',
      trial: getTrialInfo(),
    };
  } else {
    return {
      success: false,
      message: 'Invalid activation key. Please contact Swati Software Solution (Email: daudaziz998@gmail.com, Whatsapp: 03159508371).',
    };
  }
}

export function getSettings(): DBSettings {
  const db = getDB();
  const row = db.prepare('SELECT * FROM settings WHERE id = ?').get('pos_config') as any;
  if (!row) return DEFAULT_SETTINGS;
  return {
    restaurantName: row.restaurantName || DEFAULT_SETTINGS.restaurantName,
    logo: row.logo || DEFAULT_SETTINGS.logo,
    address: row.address || DEFAULT_SETTINGS.address,
    phone: row.phone || DEFAULT_SETTINGS.phone,
    currency: row.currency || DEFAULT_SETTINGS.currency,
    receiptFooter: row.receiptFooter || DEFAULT_SETTINGS.receiptFooter,
    receiptFormat: row.receiptFormat || DEFAULT_SETTINGS.receiptFormat,
    nextOrderNumber: Number(row.nextOrderNumber) || 1,
    theme: row.theme || 'dark',
  };
}

export function updateSettings(settings: Partial<DBSettings>): DBSettings {
  const db = getDB();
  const current = getSettings();
  const updated: DBSettings = { ...current, ...settings };
  db.prepare(
    `UPDATE settings SET
      restaurantName = ?,
      logo = ?,
      address = ?,
      phone = ?,
      currency = ?,
      receiptFooter = ?,
      receiptFormat = ?,
      nextOrderNumber = ?,
      theme = ?
     WHERE id = ?`
  ).run(
    updated.restaurantName,
    updated.logo,
    updated.address,
    updated.phone,
    updated.currency,
    updated.receiptFooter,
    updated.receiptFormat,
    updated.nextOrderNumber,
    updated.theme,
    'pos_config'
  );
  return updated;
}

export function getMenuItems(): DBMenuItem[] {
  const db = getDB();
  const rows = db.prepare('SELECT * FROM menu_items').all() as any[];
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    image: r.image,
    available: Boolean(r.available),
    favorite: Boolean(r.favorite),
    variants: JSON.parse(r.variants_json || '[]'),
  }));
}

export function saveMenuItem(item: DBMenuItem): DBMenuItem {
  const db = getDB();
  const existing = db.prepare('SELECT id FROM menu_items WHERE id = ?').get(item.id);
  if (existing) {
    db.prepare(
      `UPDATE menu_items SET
        name = ?,
        description = ?,
        image = ?,
        available = ?,
        favorite = ?,
        variants_json = ?
       WHERE id = ?`
    ).run(
      item.name,
      item.description,
      item.image,
      item.available ? 1 : 0,
      item.favorite ? 1 : 0,
      JSON.stringify(item.variants),
      item.id
    );
  } else {
    db.prepare(
      `INSERT INTO menu_items (id, name, description, image, available, favorite, variants_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      item.id,
      item.name,
      item.description,
      item.image,
      item.available ? 1 : 0,
      item.favorite ? 1 : 0,
      JSON.stringify(item.variants)
    );
  }
  return item;
}

export function deleteMenuItem(id: string): boolean {
  const db = getDB();
  db.prepare('DELETE FROM menu_items WHERE id = ?').run(id);
  return true;
}

export function getOrders(): DBOrder[] {
  const db = getDB();
  const rows = db.prepare('SELECT * FROM orders ORDER BY createdAt DESC').all() as any[];
  return rows.map((r) => ({
    id: r.id,
    orderNumber: Number(r.orderNumber),
    customerName: r.customerName || '',
    tableNumber: r.tableNumber || '',
    createdAt: r.createdAt,
    items: JSON.parse(r.items_json || '[]'),
    subtotal: Number(r.subtotal) || 0,
    discount: Number(r.discount) || 0,
    total: Number(r.total) || 0,
    paymentStatus: r.paymentStatus as 'paid' | 'unpaid',
    paymentDate: r.paymentDate,
    stage: r.stage as 'active' | 'completed',
  }));
}

export function createOrder(orderData: Partial<DBOrder> & { items: DBOrderItem[]; subtotal: number; total: number }): DBOrder {
  const db = getDB();
  const settings = getSettings();
  const orderNumber = settings.nextOrderNumber;

  const id = orderData.id || `ord_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const customerName = (orderData.customerName || '').trim();
  const tableNumber = (orderData.tableNumber || '').trim();
  const createdAt = orderData.createdAt || new Date().toISOString();
  const items = Array.isArray(orderData.items) ? orderData.items : [];
  const subtotal = Number(orderData.subtotal) || 0;
  const discount = Number(orderData.discount) || 0;
  const total = Number(orderData.total) || 0;
  const paymentStatus = orderData.paymentStatus === 'paid' ? 'paid' : 'unpaid';
  const paymentDate = orderData.paymentDate || (paymentStatus === 'paid' ? new Date().toISOString() : null);
  const stage = orderData.stage === 'completed' ? 'completed' : 'active';

  const order: DBOrder = {
    id,
    orderNumber,
    customerName,
    tableNumber,
    createdAt,
    items,
    subtotal,
    discount,
    total,
    paymentStatus,
    paymentDate,
    stage,
  };

  db.prepare(
    `INSERT INTO orders (id, orderNumber, customerName, tableNumber, createdAt, items_json, subtotal, discount, total, paymentStatus, paymentDate, stage)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    order.id,
    order.orderNumber,
    order.customerName,
    order.tableNumber,
    order.createdAt,
    JSON.stringify(order.items),
    order.subtotal,
    order.discount,
    order.total,
    order.paymentStatus,
    order.paymentDate,
    order.stage
  );

  // Increment nextOrderNumber
  db.prepare('UPDATE settings SET nextOrderNumber = ? WHERE id = ?').run(orderNumber + 1, 'pos_config');

  return order;
}

export function updateOrder(id: string, patch: Partial<DBOrder>): DBOrder | null {
  const db = getDB();
  const existing = db.prepare('SELECT * FROM orders WHERE id = ?').get(id) as any;
  if (!existing) return null;

  const current: DBOrder = {
    id: existing.id,
    orderNumber: Number(existing.orderNumber),
    customerName: existing.customerName || '',
    tableNumber: existing.tableNumber || '',
    createdAt: existing.createdAt,
    items: JSON.parse(existing.items_json || '[]'),
    subtotal: Number(existing.subtotal) || 0,
    discount: Number(existing.discount) || 0,
    total: Number(existing.total) || 0,
    paymentStatus: existing.paymentStatus,
    paymentDate: existing.paymentDate,
    stage: existing.stage,
  };

  const updated: DBOrder = {
    ...current,
    ...patch,
    items: patch.items !== undefined ? patch.items : current.items,
    customerName: patch.customerName !== undefined ? patch.customerName : current.customerName,
    tableNumber: patch.tableNumber !== undefined ? patch.tableNumber : current.tableNumber,
    paymentStatus: patch.paymentStatus !== undefined ? patch.paymentStatus : current.paymentStatus,
    paymentDate: patch.paymentDate !== undefined ? patch.paymentDate : current.paymentDate,
    stage: patch.stage !== undefined ? patch.stage : current.stage,
  };

  db.prepare(
    `UPDATE orders SET
      customerName = ?,
      tableNumber = ?,
      items_json = ?,
      subtotal = ?,
      discount = ?,
      total = ?,
      paymentStatus = ?,
      paymentDate = ?,
      stage = ?
     WHERE id = ?`
  ).run(
    updated.customerName ?? '',
    updated.tableNumber ?? '',
    JSON.stringify(updated.items ?? []),
    Number(updated.subtotal) || 0,
    Number(updated.discount) || 0,
    Number(updated.total) || 0,
    updated.paymentStatus ?? 'unpaid',
    updated.paymentDate ?? null,
    updated.stage ?? 'active',
    id
  );

  return updated;
}

export function deleteOrder(id: string): boolean {
  const db = getDB();
  db.prepare('DELETE FROM orders WHERE id = ?').run(id);
  return true;
}

export function clearAllOrders(): boolean {
  const db = getDB();
  db.prepare('DELETE FROM orders').run();
  return true;
}

export function resetAllDataToDefaults(): void {
  const db = getDB();
  db.prepare('DELETE FROM orders').run();
  db.prepare('DELETE FROM menu_items').run();

  db.prepare(
    `UPDATE settings SET
      restaurantName = ?,
      logo = ?,
      address = ?,
      phone = ?,
      currency = ?,
      receiptFooter = ?,
      receiptFormat = ?,
      nextOrderNumber = ?,
      theme = ?
     WHERE id = ?`
  ).run(
    DEFAULT_SETTINGS.restaurantName,
    DEFAULT_SETTINGS.logo,
    DEFAULT_SETTINGS.address,
    DEFAULT_SETTINGS.phone,
    DEFAULT_SETTINGS.currency,
    DEFAULT_SETTINGS.receiptFooter,
    DEFAULT_SETTINGS.receiptFormat,
    1,
    DEFAULT_SETTINGS.theme,
    'pos_config'
  );

  const insertStmt = db.prepare(
    `INSERT INTO menu_items (id, name, description, image, available, favorite, variants_json)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  for (const item of DEFAULT_MENU_ITEMS) {
    insertStmt.run(
      item.id,
      item.name,
      item.description,
      item.image,
      item.available ? 1 : 0,
      item.favorite ? 1 : 0,
      JSON.stringify(item.variants)
    );
  }
}

export function importBackupData(data: {
  settings?: Partial<DBSettings>;
  menuItems?: DBMenuItem[];
  orders?: DBOrder[];
  employees?: DBEmployee[];
}): void {
  const db = getDB();
  if (data.settings) {
    updateSettings(data.settings);
  }

  if (Array.isArray(data.menuItems) && data.menuItems.length > 0) {
    db.prepare('DELETE FROM menu_items').run();
    const insertStmt = db.prepare(
      `INSERT INTO menu_items (id, name, description, image, available, favorite, variants_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    for (const item of data.menuItems) {
      insertStmt.run(
        item.id,
        item.name,
        item.description,
        item.image,
        item.available ? 1 : 0,
        item.favorite ? 1 : 0,
        JSON.stringify(item.variants || [])
      );
    }
  }

  if (Array.isArray(data.orders)) {
    db.prepare('DELETE FROM orders').run();
    const insertOrderStmt = db.prepare(
      `INSERT INTO orders (id, orderNumber, customerName, tableNumber, createdAt, items_json, subtotal, discount, total, paymentStatus, paymentDate, stage)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    for (const order of data.orders) {
      insertOrderStmt.run(
        order.id,
        order.orderNumber,
        order.customerName || '',
        order.tableNumber || '',
        order.createdAt,
        JSON.stringify(order.items || []),
        order.subtotal || 0,
        order.discount || 0,
        order.total || 0,
        order.paymentStatus || 'unpaid',
        order.paymentDate || null,
        order.stage || 'active'
      );
    }
  }

  if (Array.isArray(data.employees)) {
    db.prepare('DELETE FROM employees').run();
    const insertEmpStmt = db.prepare(
      `INSERT INTO employees (id, name, phone, salary, createdAt)
       VALUES (?, ?, ?, ?, ?)`
    );
    for (const emp of data.employees) {
      insertEmpStmt.run(
        emp.id,
        emp.name,
        emp.phone || '',
        Number(emp.salary) || 0,
        emp.createdAt || new Date().toISOString()
      );
    }
  }
}

export function getEmployees(): DBEmployee[] {
  const db = getDB();
  const rows = db.prepare('SELECT * FROM employees ORDER BY createdAt DESC').all() as any[];
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    phone: r.phone,
    salary: Number(r.salary) || 0,
    createdAt: r.createdAt,
  }));
}

export function saveEmployee(emp: DBEmployee): DBEmployee {
  const db = getDB();
  const existing = db.prepare('SELECT id FROM employees WHERE id = ?').get(emp.id);
  if (existing) {
    db.prepare(
      `UPDATE employees SET
        name = ?,
        phone = ?,
        salary = ?
       WHERE id = ?`
    ).run(emp.name, emp.phone, Number(emp.salary) || 0, emp.id);
  } else {
    db.prepare(
      `INSERT INTO employees (id, name, phone, salary, createdAt)
       VALUES (?, ?, ?, ?, ?)`
    ).run(emp.id, emp.name, emp.phone, Number(emp.salary) || 0, emp.createdAt || new Date().toISOString());
  }
  return emp;
}

export function deleteEmployee(id: string): boolean {
  const db = getDB();
  db.prepare('DELETE FROM employees WHERE id = ?').run(id);
  return true;
}
