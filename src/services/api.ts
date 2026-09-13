import { BootstrapData, MenuItem, Order, Settings, TrialInfo, Employee } from '../types';

export const api = {
  async getBootstrap(): Promise<BootstrapData> {
    const res = await fetch('/api/bootstrap');
    if (!res.ok) throw new Error('Failed to load application data from SQLite database');
    return res.json();
  },

  async getTrial(): Promise<TrialInfo> {
    const res = await fetch('/api/trial');
    if (!res.ok) throw new Error('Failed to fetch trial status');
    return res.json();
  },

  async updateSettings(settings: Partial<Settings>): Promise<Settings> {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
    if (!res.ok) throw new Error('Failed to update settings');
    return res.json();
  },

  async saveMenuItem(item: MenuItem): Promise<MenuItem> {
    const res = await fetch('/api/menu', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item),
    });
    if (!res.ok) throw new Error('Failed to save menu item');
    return res.json();
  },

  async deleteMenuItem(id: string): Promise<void> {
    const res = await fetch(`/api/menu/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to delete menu item');
  },

  async createOrder(order: Omit<Order, 'orderNumber'>): Promise<Order> {
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(order),
    });
    if (!res.ok) throw new Error('Failed to create order');
    return res.json();
  },

  async updateOrder(id: string, patch: Partial<Order>): Promise<Order> {
    const res = await fetch(`/api/orders/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (!res.ok) throw new Error('Failed to update order');
    return res.json();
  },

  async deleteOrder(id: string): Promise<void> {
    const res = await fetch(`/api/orders/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to delete order');
  },

  async clearAllOrders(): Promise<void> {
    const res = await fetch('/api/orders/clear-all', { method: 'POST' });
    if (!res.ok) throw new Error('Failed to clear orders');
  },

  async getEmployees(): Promise<Employee[]> {
    const res = await fetch('/api/employees');
    if (!res.ok) throw new Error('Failed to fetch employees');
    return res.json();
  },

  async saveEmployee(emp: Employee): Promise<Employee> {
    const res = await fetch('/api/employees', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(emp),
    });
    if (!res.ok) throw new Error('Failed to save employee');
    return res.json();
  },

  async deleteEmployee(id: string): Promise<void> {
    const res = await fetch(`/api/employees/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to delete employee');
  },

  async importBackup(data: { settings?: Partial<Settings>; menuItems?: MenuItem[]; orders?: Order[]; employees?: Employee[] }): Promise<void> {
    const res = await fetch('/api/backup/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Failed to import backup into SQLite database');
  },

  async resetToDefaults(): Promise<void> {
    const res = await fetch('/api/reset-defaults', { method: 'POST' });
    if (!res.ok) throw new Error('Failed to reset data to defaults');
  },

  async activateLicense(key: string): Promise<{ success: boolean; message: string; trial?: TrialInfo }> {
    const res = await fetch('/api/trial/activate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.message || 'Activation failed');
    }
    return data;
  },

  async getSystemInfo(): Promise<{ name: string; version: string; dbPath: string; dataDir: string; platform: string; isElectron: boolean }> {
    const res = await fetch('/api/system/info');
    if (!res.ok) throw new Error('Failed to load system info');
    return res.json();
  },

  async checkUpdates(currentVersion = '1.0.0'): Promise<any> {
    const res = await fetch(`/api/system/updates/check?currentVersion=${encodeURIComponent(currentVersion)}`);
    return res.json();
  },

  async getUpdaterConfig(): Promise<{ owner: string; repo: string; hasToken: boolean }> {
    const res = await fetch('/api/system/updates/config');
    if (!res.ok) throw new Error('Failed to load updater config');
    return res.json();
  },

  async saveUpdaterConfig(config: { owner?: string; repo?: string; token?: string }): Promise<{ success: boolean; error?: string }> {
    const res = await fetch('/api/system/updates/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    return res.json();
  },
};

