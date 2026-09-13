export interface Variant {
  id: string;
  label: string;
  price: number;
}

export interface MenuItem {
  id: string;
  name: string;
  description: string;
  image: string;
  available: boolean;
  favorite: boolean;
  variants: Variant[];
}

export interface CartItem {
  id: string;
  menuItemId: string | null;
  name: string;
  variantLabel: string;
  price: number;
  qty: number;
  notes: string;
  isExtra?: boolean;
}

export interface Order {
  id: string;
  orderNumber: number;
  customerName: string;
  tableNumber: string;
  createdAt: string;
  items: CartItem[];
  subtotal: number;
  discount: number;
  total: number;
  paymentStatus: 'paid' | 'unpaid';
  paymentDate: string | null;
  stage: 'active' | 'completed';
}

export interface Settings {
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

export interface Employee {
  id: string;
  name: string;
  phone: string;
  salary: number;
  createdAt: string;
}

export interface TrialInfo {
  isExpired: boolean;
  isActivated?: boolean;
  trialStartDate: string;
  trialExpirationDate: string;
  trialStatus: 'active' | 'expired' | 'activated';
  remainingMs: number;
  remainingDays: number;
  remainingHours: number;
  totalRemainingHours?: number;
  remainingMinutes: number;
  currentDay: number;
  totalDays: number;
  totalHours?: number;
  formattedRemaining?: string;
  lockMessage?: string;
  contact?: {
    company: string;
    email: string;
    whatsapp: string;
  };
}

export interface BootstrapData {
  settings: Settings;
  menuItems: MenuItem[];
  orders: Order[];
  trial: TrialInfo;
  employees: Employee[];
}

export interface SystemInfo {
  name: string;
  version: string;
  dbPath: string;
  dataDir: string;
  platform: string;
  isElectron: boolean;
}

export interface UpdateCheckResult {
  success: boolean;
  isUpdateAvailable: boolean;
  currentVersion: string;
  latestVersion: string;
  releaseName?: string;
  releaseNotes?: string;
  publishedAt?: string;
  downloadUrl?: string;
  setupDownloadUrl?: string;
  portableDownloadUrl?: string;
  assetName?: string;
  assetSize?: number;
  htmlUrl?: string;
  repositoryUrl?: string;
  error?: string;
  errorType?: 'offline' | 'github_unavailable' | 'rate_limited' | 'not_found' | 'auth_failed' | 'corrupted' | 'unknown';
}

export interface DesktopUpdateState {
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

declare global {
  interface Window {
    electronAPI?: {
      isDesktop: boolean;
      isPortable?: boolean;
      platform: string;
      print: () => void;
      openExternal: (url: string) => Promise<void>;
      getAppVersion: () => Promise<string>;
      getDatabaseLocation: () => Promise<{ databasePath: string; dataDir: string }>;
      checkForUpdates: () => Promise<any>;
      startUpdateDownload: (targetAsset?: 'setup' | 'portable') => Promise<any>;
      quitAndInstall: () => Promise<void>;
      getUpdateStatus: () => Promise<DesktopUpdateState>;
      onUpdateStatusChange: (callback: (status: DesktopUpdateState) => void) => () => void;
      onTriggerCheckUpdates?: (callback: () => void) => () => void;
    };
  }
}
