import React, { useState, useEffect } from 'react';
import { api } from './services/api';
import { MenuItem, Order, Settings, TrialInfo, CartItem, Variant, Employee } from './types';
import { AppUpdater } from './components/AppUpdater';
import { formatCompactNumber, formatCompactMoney, formatPakistaniCurrency, formatPakistaniNumber } from './utils/formatters';

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

function esc(s: any) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c));
}

function todayKey(d: any) {
  const dt = new Date(d);
  return `${dt.getFullYear()}-${dt.getMonth()}-${dt.getDate()}`;
}

function isSameDay(a: any, b: any) {
  return todayKey(a) === todayKey(b);
}

function startOfWeek(d: any) {
  const dt = new Date(d);
  const day = dt.getDay();
  dt.setHours(0, 0, 0, 0);
  dt.setDate(dt.getDate() - day);
  return dt;
}

function startOfMonth(d: any) {
  const dt = new Date(d);
  return new Date(dt.getFullYear(), dt.getMonth(), 1);
}

function fmtMoney(n: number, currency: string) {
  const val = Number.isFinite(n) ? n : 0;
  return `${currency} ${val.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function downloadFile(filename: string, text: string, type: string) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function toCSV(rows: any[]) {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const q = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return [headers.join(','), ...rows.map((r) => headers.map((h) => q(r[h])).join(','))].join('\n');
}

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: '🏠', adminOnly: false },
  { id: 'new-order', label: 'New Order', icon: '🛒', adminOnly: false },
  { id: 'orders', label: 'Orders', icon: '📋', adminOnly: false },
  { id: 'menu', label: 'Menu', icon: '🍽️', adminOnly: true },
  { id: 'reports', label: 'Reports', icon: '📊', adminOnly: true },
  { id: 'customers', label: 'Customers', icon: '👥', adminOnly: false },
  { id: 'employees', label: 'Employees', icon: '👔', adminOnly: false },
  { id: 'settings', label: 'Settings', icon: '⚙️', adminOnly: true },
];

export default function App() {
  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [role, setRole] = useState<'admin' | 'staff'>('admin');
  const [view, setView] = useState('dashboard');

  const [settings, setSettings] = useState<Settings>({
    restaurantName: 'Dastarkhwan Restaurant',
    logo: '🍽️',
    address: 'Blue Area, Islamabad',
    phone: '+92 300 1234567',
    currency: 'Rs',
    receiptFooter: 'Thank you for dining with us! Visit again.',
    receiptFormat: 'thermal',
    nextOrderNumber: 1,
    theme: 'dark',
  });

  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [trial, setTrial] = useState<TrialInfo | null>(null);
  const [showContactDev, setShowContactDev] = useState(false);

  const [toast, setToast] = useState<string | null>(null);
  const [printJob, setPrintJob] = useState<{ type: 'receipt' | 'kot' | 'report'; payload: any } | null>(null);

  // New Order view state
  const [noSearch, setNoSearch] = useState('');
  const [noVariantPicker, setNoVariantPicker] = useState<MenuItem | null>(null);
  const [noCustomerName, setNoCustomerName] = useState('');
  const [noTableNumber, setNoTableNumber] = useState('');
  const [noCart, setNoCart] = useState<CartItem[]>([]);
  const [noDiscountType, setNoDiscountType] = useState<'amount' | 'percent'>('amount');
  const [noDiscountValue, setNoDiscountValue] = useState<number | string>(0);
  const [noPaymentStatus, setNoPaymentStatus] = useState<'unpaid' | 'paid'>('unpaid');
  const [noLastPlaced, setNoLastPlaced] = useState<Order | null>(null);

  // Orders history view state
  const [ohSearch, setOhSearch] = useState('');
  const [ohPaymentFilter, setOhPaymentFilter] = useState<'all' | 'paid' | 'unpaid'>('all');
  const [ohDateFilter, setOhDateFilter] = useState<'all' | 'today' | 'week'>('all');
  const [ohExpanded, setOhExpanded] = useState<string | null>(null);
  const [ohExtraItemFor, setOhExtraItemFor] = useState<Order | null>(null);
  const [eiName, setEiName] = useState('');
  const [eiQty, setEiQty] = useState(1);
  const [eiPrice, setEiPrice] = useState<number | string>('');

  // Menu management view state
  const [mmEditing, setMmEditing] = useState<MenuItem | 'new' | null>(null);
  const [mmEditName, setMmEditName] = useState('');
  const [mmEditDesc, setMmEditDesc] = useState('');
  const [mmEditImage, setMmEditImage] = useState('🍽️');
  const [mmEditAvailable, setMmEditAvailable] = useState(true);
  const [mmEditFavorite, setMmEditFavorite] = useState(false);
  const [mmEditVariants, setMmEditVariants] = useState<Variant[]>([]);

  // Reports view state
  const [rpRange, setRpRange] = useState<'today' | 'yesterday' | 'week' | 'month' | 'custom'>('today');
  const [rpCustomFrom, setRpCustomFrom] = useState('');
  const [rpCustomTo, setRpCustomTo] = useState('');

  // Customers view state
  const [cuSearch, setCuSearch] = useState('');

  // Employees view state
  const [empSearch, setEmpSearch] = useState('');
  const [empEditing, setEmpEditing] = useState<Employee | 'new' | null>(null);
  const [empName, setEmpName] = useState('');
  const [empPhone, setEmpPhone] = useState('');
  const [empSalary, setEmpSalary] = useState<number | string>('');

  // Load bootstrap data from SQLite on startup
  useEffect(() => {
    let isMounted = true;
    async function loadData(attempt = 1) {
      try {
        const data = await api.getBootstrap();
        if (!isMounted) return;
        setSettings(data.settings);
        setMenuItems(data.menuItems);
        setOrders(data.orders);
        setEmployees(data.employees || []);
        setTrial(data.trial);
        setTheme(data.settings.theme || 'dark');
      } catch (err: any) {
        if (attempt <= 3) {
          setTimeout(() => {
            if (isMounted) loadData(attempt + 1);
          }, 1000 * attempt);
        } else {
          console.warn('Notice loading bootstrap data:', err?.message || err);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    loadData();
    return () => {
      isMounted = false;
    };
  }, []);

  // Update theme data-theme attribute on root
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Periodic trial status check every minute
  useEffect(() => {
    let isMounted = true;
    const interval = setInterval(async () => {
      try {
        const trialInfo = await api.getTrial();
        if (isMounted && trialInfo) {
          setTrial(trialInfo);
        }
      } catch (err: any) {
        // Silently handle transient connection interruptions during server boot/restarts
        if (err?.name !== 'TypeError' && !String(err).includes('Failed to fetch')) {
          console.warn('Periodic trial check notice:', err?.message || err);
        }
      }
    }, 60000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  // Toast notification helper
  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  };

  // Electron desktop menu integration
  useEffect(() => {
    if (window.electronAPI?.onTriggerCheckUpdates) {
      const unsub = window.electronAPI.onTriggerCheckUpdates(() => {
        setRole('admin');
        setView('settings');
        showToast('Navigating to Application Updates...');
        setTimeout(() => {
          const el = document.getElementById('app-updater-section');
          if (el) el.scrollIntoView({ behavior: 'smooth' });
        }, 150);
      });
      return unsub;
    }
  }, []);

  // Print helper
  const doPrint = (type: 'receipt' | 'kot' | 'report', payload: any) => {
    setPrintJob({ type, payload });
    setTimeout(() => {
      window.print();
    }, 150);
  };

  useEffect(() => {
    const handleAfterPrint = () => {
      setPrintJob(null);
    };
    window.addEventListener('afterprint', handleAfterPrint);
    return () => window.removeEventListener('afterprint', handleAfterPrint);
  }, []);

  const toggleTheme = async () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    try {
      const updated = await api.updateSettings({ theme: nextTheme });
      setSettings(updated);
    } catch (e) {
      console.error(e);
    }
  };

  // Cart operations
  const handleMenuItemClick = (item: MenuItem) => {
    if (!item.available) return;
    if (item.variants.length === 1) {
      addToCart(item, item.variants[0]);
    } else {
      setNoVariantPicker(item);
    }
  };

  const addToCart = (item: MenuItem, variant: Variant) => {
    setNoCart((prev) => [
      ...prev,
      {
        id: uid(),
        menuItemId: item.id,
        name: item.name,
        variantLabel: variant.label,
        price: variant.price,
        qty: 1,
        notes: '',
      },
    ]);
  };

  const changeCartQty = (id: string, delta: number) => {
    setNoCart((prev) =>
      prev.map((it) => (it.id === id ? { ...it, qty: Math.max(1, it.qty + delta) } : it))
    );
  };

  const removeCartItem = (id: string) => {
    setNoCart((prev) => prev.filter((it) => it.id !== id));
  };

  const setCartNotes = (id: string, notes: string) => {
    setNoCart((prev) => prev.map((it) => (it.id === id ? { ...it, notes } : it)));
  };

  const toggleFavorite = async (item: MenuItem) => {
    const updated = { ...item, favorite: !item.favorite };
    setMenuItems((prev) => prev.map((m) => (m.id === item.id ? updated : m)));
    try {
      await api.saveMenuItem(updated);
    } catch (err) {
      console.error('Failed to toggle favorite in SQLite:', err);
    }
  };

  const toggleAvailable = async (item: MenuItem) => {
    const updated = { ...item, available: !item.available };
    setMenuItems((prev) => prev.map((m) => (m.id === item.id ? updated : m)));
    try {
      await api.saveMenuItem(updated);
    } catch (err) {
      console.error('Failed to toggle available in SQLite:', err);
    }
  };

  const deleteMenuItem = async (id: string) => {
    if (!confirm('Are you sure you want to delete this menu item?')) return;
    setMenuItems((prev) => prev.filter((m) => m.id !== id));
    try {
      await api.deleteMenuItem(id);
      showToast('Menu item deleted');
    } catch (err) {
      console.error('Failed to delete item from SQLite:', err);
    }
  };

  const openItemEditor = (item: MenuItem | null) => {
    if (item) {
      setMmEditing(item);
      setMmEditName(item.name);
      setMmEditDesc(item.description);
      setMmEditImage(item.image || '🍽️');
      setMmEditAvailable(item.available);
      setMmEditFavorite(item.favorite);
      setMmEditVariants(item.variants.map((v) => ({ ...v })));
    } else {
      setMmEditing('new');
      setMmEditName('');
      setMmEditDesc('');
      setMmEditImage('🍽️');
      setMmEditAvailable(true);
      setMmEditFavorite(false);
      setMmEditVariants([{ id: uid(), label: 'Regular', price: 0 }]);
    }
  };

  const saveMenuItem = async () => {
    if (!mmEditName.trim()) return;
    const variants = mmEditVariants
      .filter((v) => v.label.trim())
      .map((v) => ({ ...v, price: Number(v.price) || 0 }));
    const id = mmEditing === 'new' || !mmEditing ? uid() : mmEditing.id;
    const itemData: MenuItem = {
      id,
      name: mmEditName.trim(),
      description: mmEditDesc,
      image: mmEditImage,
      available: mmEditAvailable,
      favorite: mmEditFavorite,
      variants,
    };

    setMenuItems((prev) => {
      const idx = prev.findIndex((m) => m.id === id);
      if (idx > -1) {
        const next = [...prev];
        next[idx] = itemData;
        return next;
      }
      return [...prev, itemData];
    });

    setMmEditing(null);
    try {
      await api.saveMenuItem(itemData);
      showToast('Menu item saved');
    } catch (err) {
      console.error('Failed to save menu item to SQLite:', err);
    }
  };

  // Employee actions
  const openEmployeeEditor = (emp: Employee | null) => {
    if (emp) {
      setEmpEditing(emp);
      setEmpName(emp.name);
      setEmpPhone(emp.phone);
      setEmpSalary(emp.salary);
    } else {
      setEmpEditing('new');
      setEmpName('');
      setEmpPhone('');
      setEmpSalary('');
    }
  };

  const saveEmployee = async () => {
    if (!empName.trim()) {
      showToast('Please enter employee name');
      return;
    }
    const id = empEditing === 'new' || !empEditing ? uid() : empEditing.id;
    const createdAt = empEditing && empEditing !== 'new' ? empEditing.createdAt : new Date().toISOString();
    const empData: Employee = {
      id,
      name: empName.trim(),
      phone: empPhone.trim(),
      salary: Number(empSalary) || 0,
      createdAt,
    };

    setEmployees((prev) => {
      const idx = prev.findIndex((e) => e.id === id);
      if (idx > -1) {
        const next = [...prev];
        next[idx] = empData;
        return next;
      }
      return [empData, ...prev];
    });

    setEmpEditing(null);
    try {
      await api.saveEmployee(empData);
      showToast('Employee saved successfully');
    } catch (err) {
      console.error('Failed to save employee to SQLite:', err);
      showToast('Failed to save employee');
    }
  };

  const deleteEmployeeConfirm = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete employee "${name}"?`)) return;
    setEmployees((prev) => prev.filter((e) => e.id !== id));
    try {
      await api.deleteEmployee(id);
      showToast('Employee deleted');
    } catch (err) {
      console.error('Failed to delete employee from SQLite:', err);
      showToast('Failed to delete employee');
    }
  };

  // Place order
  const placeNewOrder = async (thenPrint: 'receipt' | 'kot' | null) => {
    if (trial?.isExpired) {
      alert('Your 20-day trial has expired. Please contact the developer to continue using this application.');
      return;
    }
    if (noCart.length === 0) return;

    const subtotal = noCart.reduce((s, it) => s + it.price * it.qty, 0);
    const discountAmount =
      noDiscountType === 'percent'
        ? Math.round((subtotal * (Number(noDiscountValue) || 0)) / 100)
        : Number(noDiscountValue) || 0;
    const total = Math.max(0, subtotal - discountAmount);

    const newOrderData: Omit<Order, 'orderNumber'> = {
      id: uid(),
      customerName: noCustomerName.trim(),
      tableNumber: noTableNumber.trim(),
      createdAt: new Date().toISOString(),
      items: noCart,
      subtotal,
      discount: discountAmount,
      total,
      paymentStatus: noPaymentStatus,
      paymentDate: noPaymentStatus === 'paid' ? new Date().toISOString() : null,
      stage: 'active',
    };

    try {
      const created = await api.createOrder(newOrderData);
      setOrders((prev) => [created, ...prev]);
      setSettings((prev) => ({ ...prev, nextOrderNumber: prev.nextOrderNumber + 1 }));
      setNoLastPlaced(created);
      setNoCart([]);
      setNoCustomerName('');
      setNoTableNumber('');
      setNoDiscountValue(0);
      setNoPaymentStatus('unpaid');
      showToast(`Order #${created.orderNumber} placed`);
      if (thenPrint) doPrint(thenPrint, created);
    } catch (err) {
      console.error('Failed to place order in SQLite:', err);
      showToast('Failed to save order');
    }
  };

  // Order actions
  const updateOrderStatus = async (id: string, patch: Partial<Order>) => {
    setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, ...patch } : o)));
    try {
      await api.updateOrder(id, patch);
    } catch (err) {
      console.error('Failed to update order in SQLite:', err);
    }
  };

  const deleteOrderConfirm = async (id: string) => {
    if (!confirm('Delete this order? This cannot be undone.')) return;
    setOrders((prev) => prev.filter((o) => o.id !== id));
    try {
      await api.deleteOrder(id);
      showToast('Order deleted');
    } catch (err) {
      console.error('Failed to delete order in SQLite:', err);
    }
  };

  const clearAllOrdersConfirm = async () => {
    if (orders.length === 0) {
      showToast('There are no orders to clear');
      return;
    }
    if (!confirm('Are you sure you want to delete all orders? This action cannot be undone.')) return;
    setOrders([]);
    setOhExpanded(null);
    setOhExtraItemFor(null);
    try {
      await api.clearAllOrders();
      showToast('All orders have been deleted from SQLite');
    } catch (err) {
      console.error('Failed to clear orders in SQLite:', err);
    }
  };

  const saveExtraItem = async () => {
    const name = eiName.trim();
    const qty = Number(eiQty);
    const price = Number(eiPrice);
    if (!name || !(qty > 0) || eiPrice === '' || !(price >= 0) || !ohExtraItemFor) return;

    const newItem: CartItem = {
      id: uid(),
      menuItemId: null,
      name,
      variantLabel: 'Extra',
      price,
      qty,
      notes: '',
      isExtra: true,
    };
    const items = [...ohExtraItemFor.items, newItem];
    const subtotal = items.reduce((s, it) => s + it.price * it.qty, 0);
    const total = Math.max(0, subtotal - (ohExtraItemFor.discount || 0));

    await updateOrderStatus(ohExtraItemFor.id, { items, subtotal, total });
    setOhExtraItemFor(null);
    showToast('Extra item added');
  };

  const duplicateOrder = (o: Order) => {
    setNoCustomerName(o.customerName || '');
    setNoTableNumber(o.tableNumber || '');
    setNoCart(o.items.map((it) => ({ ...it, id: uid() })));
    setView('new-order');
  };

  // Settings actions
  const handleSettingChange = async (key: keyof Settings, val: any) => {
    const updated = { ...settings, [key]: val };
    setSettings(updated);
    try {
      await api.updateSettings({ [key]: val });
    } catch (err) {
      console.error('Failed to update setting in SQLite:', err);
    }
  };

  const exportBackup = () => {
    const data = {
      settings,
      menuItems,
      orders,
      employees,
      exportedAt: new Date().toISOString(),
    };
    downloadFile(
      `pos-backup-${Date.now()}.json`,
      JSON.stringify(data, null, 2),
      'application/json'
    );
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const data = JSON.parse(reader.result as string);
        await api.importBackup(data);
        const refreshed = await api.getBootstrap();
        setSettings(refreshed.settings);
        setMenuItems(refreshed.menuItems);
        setOrders(refreshed.orders);
        setEmployees(refreshed.employees || []);
        showToast('Data imported successfully into SQLite');
      } catch (err) {
        alert('Invalid backup file or failed to import.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const resetAllData = async () => {
    if (!confirm('Reset all data to defaults? This cannot be undone.')) return;
    try {
      await api.resetToDefaults();
      const refreshed = await api.getBootstrap();
      setSettings(refreshed.settings);
      setMenuItems(refreshed.menuItems);
      setOrders(refreshed.orders);
      setEmployees(refreshed.employees || []);
      showToast('Data reset to defaults');
    } catch (err) {
      console.error('Failed to reset defaults:', err);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--text-muted)', fontFamily: 'sans-serif', fontSize: '14px' }}>
        Loading SQLite Database…
      </div>
    );
  }

  // Trial Expired Blocking Overlay / Screen
  if (trial?.isExpired) {
    return (
      <div className="pos-shell" style={{ alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--bg)', padding: '24px' }}>
        <div className="pos-card" style={{ maxWidth: '500px', width: '100%', textAlign: 'center', padding: '32px 24px' }}>
          <div style={{ fontSize: '48px', marginBottom: '12px' }}>🔒</div>
          <h1 className="pos-h1" style={{ color: 'var(--chili)', marginBottom: '8px' }}>
            30-Day Trial Expired
          </h1>
          <p style={{ color: 'var(--text)', fontSize: '15px', fontWeight: 600, lineHeight: '1.6', marginBottom: '20px' }}>
            Please contact Swati Software Solution to activate the software.
          </p>

          <div style={{ background: 'var(--surface-2)', padding: '14px', borderRadius: '10px', fontSize: '13px', marginBottom: '24px', textAlign: 'left', color: 'var(--text-muted)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
              <span>Trial Started:</span>
              <strong style={{ color: 'var(--text)' }}>{fmtDate(trial.trialStartDate)} {fmtTime(trial.trialStartDate)}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
              <span>Trial Duration:</span>
              <strong style={{ color: 'var(--text)' }}>30 Full Days (720 Hours)</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Trial Expired:</span>
              <strong style={{ color: 'var(--chili)' }}>{fmtDate(trial.trialExpirationDate)} {fmtTime(trial.trialExpirationDate)}</strong>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
            <button className="pos-btn lg" onClick={() => setShowContactDev(true)}>
              📞 Contact Developer
            </button>
          </div>
        </div>

        {showContactDev && (
          <div className="pos-modal-overlay pos-no-print" onClick={() => setShowContactDev(false)}>
            <div className="pos-modal" style={{ width: '400px' }} onClick={(e) => e.stopPropagation()}>
              <div className="pos-row-between" style={{ marginBottom: '14px' }}>
                <div className="pos-h2">Developer Contact</div>
                <button className="pos-iconbtn" onClick={() => setShowContactDev(false)}>✕</button>
              </div>
              <div className="pos-flex-col" style={{ gap: '12px', fontSize: '14px' }}>
                <div style={{ background: 'var(--surface-2)', padding: '12px', borderRadius: '10px' }}>
                  <div className="pos-bold">Swati Software Solution</div>
                  <div className="pos-muted" style={{ fontSize: '12px', marginTop: '4px' }}>
                    Please contact Swati Software Solution to activate the software.
                  </div>
                </div>
                <div style={{ background: 'var(--surface-2)', padding: '12px', borderRadius: '10px' }}>
                  <div className="pos-bold">Developer Email</div>
                  <div className="pos-mono" style={{ color: 'var(--accent)', marginTop: '4px' }}>
                    daudaziz998@gmail.com
                  </div>
                </div>
                <div style={{ background: 'var(--surface-2)', padding: '12px', borderRadius: '10px' }}>
                  <div className="pos-bold">WhatsApp Contact</div>
                  <div className="pos-mono" style={{ color: 'var(--accent)', marginTop: '4px' }}>
                    03159508371
                  </div>
                </div>
                <a
                  href="mailto:daudaziz998@gmail.com?subject=Dastarkhwan%20Restaurant%20POS%20License%20Activation"
                  className="pos-btn lg"
                  style={{ textDecoration: 'none', textAlign: 'center', marginTop: '8px' }}
                >
                  ✉️ Send Email to Developer
                </a>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Filter menu items for new order
  const filteredMenuItems = menuItems.filter((m) => {
    if (noSearch && !m.name.toLowerCase().includes(noSearch.toLowerCase())) return false;
    return true;
  });
  const favoriteItems = menuItems.filter((m) => m.favorite).slice(0, 6);
  const cartSubtotal = noCart.reduce((s, it) => s + it.price * it.qty, 0);
  const cartDiscountAmount =
    noDiscountType === 'percent'
      ? Math.round((cartSubtotal * (Number(noDiscountValue) || 0)) / 100)
      : Number(noDiscountValue) || 0;
  const cartTotal = Math.max(0, cartSubtotal - cartDiscountAmount);

  // Filter orders history
  const filteredOrders = orders.filter((o) => {
    if (ohSearch) {
      const q = ohSearch.toLowerCase();
      const matches = String(o.orderNumber).includes(q) || (o.customerName || '').toLowerCase().includes(q);
      if (!matches) return false;
    }
    if (ohPaymentFilter !== 'all' && o.paymentStatus !== ohPaymentFilter) return false;
    if (ohDateFilter === 'today' && !isSameDay(o.createdAt, new Date())) return false;
    if (ohDateFilter === 'week' && new Date(o.createdAt) < startOfWeek(new Date())) return false;
    return true;
  });

  // Calculate report figures
  const inRange = (iso: string, range: string, customFrom: string, customTo: string) => {
    const d = new Date(iso);
    const now = new Date();
    if (range === 'today') return isSameDay(iso, now);
    if (range === 'yesterday') {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      return isSameDay(iso, y);
    }
    if (range === 'week') return d >= startOfWeek(now);
    if (range === 'month') return d >= startOfMonth(now);
    if (range === 'custom') {
      if (!customFrom || !customTo) return true;
      const from = new Date(customFrom);
      const to = new Date(customTo);
      to.setHours(23, 59, 59, 999);
      return d >= from && d <= to;
    }
    return true;
  };

  const reportOrders = orders.filter((o) => inRange(o.createdAt, rpRange, rpCustomFrom, rpCustomTo));
  const reportRevenue = reportOrders.reduce((s, o) => s + o.total, 0);
  const reportPaid = reportOrders.filter((o) => o.paymentStatus === 'paid');
  const reportUnpaid = reportOrders.filter((o) => o.paymentStatus === 'unpaid');
  const reportAvg = reportOrders.length ? reportRevenue / reportOrders.length : 0;

  const tally = new Map<string, number>();
  for (const o of reportOrders) {
    for (const it of o.items) {
      tally.set(it.name, (tally.get(it.name) || 0) + it.qty);
    }
  }
  const bestSellers = [...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);

  const trendMap = new Map<string, number>();
  for (const o of reportOrders) {
    const key = fmtDate(o.createdAt);
    trendMap.set(key, (trendMap.get(key) || 0) + o.total);
  }
  const trend = [...trendMap.entries()].map(([date, rev]) => ({ label: date, value: rev })).slice(-14);

  // Compute customers list
  const customerMap = new Map<string, { name: string; totalOrders: number; totalSpending: number; lastVisit: string }>();
  for (const o of orders) {
    const key = (o.customerName || 'Walk-in').trim().toLowerCase();
    const cur = customerMap.get(key) || {
      name: o.customerName || 'Walk-in',
      totalOrders: 0,
      totalSpending: 0,
      lastVisit: o.createdAt,
    };
    cur.totalOrders += 1;
    cur.totalSpending += o.total;
    if (new Date(o.createdAt) > new Date(cur.lastVisit)) cur.lastVisit = o.createdAt;
    customerMap.set(key, cur);
  }
  const customers = [...customerMap.values()]
    .sort((a, b) => b.totalSpending - a.totalSpending)
    .filter((c) => c.name.toLowerCase().includes(cuSearch.toLowerCase()));

  // Compute employees stats & search filter
  const filteredEmployees = employees.filter((e) => {
    if (!empSearch.trim()) return true;
    const q = empSearch.toLowerCase();
    return e.name.toLowerCase().includes(q) || (e.phone && e.phone.toLowerCase().includes(q));
  });
  const totalPayroll = employees.reduce((s, e) => s + (Number(e.salary) || 0), 0);
  const avgSalary = employees.length ? totalPayroll / employees.length : 0;

  // Dashboard calculations
  const today = new Date();
  const todayOrders = orders.filter((o) => isSameDay(o.createdAt, today));
  const dashboardRevenue = todayOrders.reduce((s, o) => s + o.total, 0);
  const dashboardPaid = todayOrders.filter((o) => o.paymentStatus === 'paid');
  const dashboardUnpaid = todayOrders.filter((o) => o.paymentStatus === 'unpaid');
  const dashboardAvg = todayOrders.length ? dashboardRevenue / todayOrders.length : 0;
  const activeOrders = orders.filter((o) => o.stage === 'active');

  // Overall / Lifetime statistics for dashboard stat cards
  const totalLifetimeOrdersCount = orders.length;
  const totalLifetimeRevenue = orders.reduce((s, o) => s + (Number(o.total) || 0), 0);
  const totalPaidOrdersCount = orders.filter((o) => o.paymentStatus === 'paid').length;
  const totalUnpaidOrdersCount = orders.filter((o) => o.paymentStatus === 'unpaid').length;

  const todayTally = new Map<string, number>();
  for (const o of todayOrders) {
    for (const it of o.items) {
      todayTally.set(it.name, (todayTally.get(it.name) || 0) + it.qty);
    }
  }
  let todayBestSeller: { name: string; qty: number } | null = null;
  for (const [name, qty] of todayTally) {
    if (!todayBestSeller || qty > todayBestSeller.qty) todayBestSeller = { name, qty };
  }

  const last7Days: { label: string; value: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dayOrders = orders.filter((o) => isSameDay(o.createdAt, d));
    last7Days.push({
      label: d.toLocaleDateString(undefined, { weekday: 'short' }),
      value: dayOrders.reduce((s, o) => s + o.total, 0),
    });
  }

  const navItems = NAV_ITEMS.filter((n) => !n.adminOnly || role === 'admin');

  return (
    <div className="pos-shell">
      {/* Sidebar */}
      <div className="pos-sidebar pos-no-print">
        <div className="pos-brand">
          <div className="pos-brand-logo">{settings.logo}</div>
          <div>
            <div className="pos-brand-name">{settings.restaurantName}</div>
            <div className="pos-brand-sub">POS TERMINAL</div>
          </div>
        </div>
        <div className="pos-nav">
          {navItems.map((n) => (
            <button
              key={n.id}
              className={`pos-navbtn ${view === n.id ? 'active' : ''}`}
              onClick={() => setView(n.id)}
            >
              <span className="pos-navicon">{n.icon}</span>
              {n.label}
            </button>
          ))}
        </div>
        <div className="pos-sidebar-footer">
          <div>v1.0 · SQLite Database</div>
          {trial && !trial.isExpired && (
            <div id="trial-sidebar-badge" style={{ marginTop: '4px', color: 'var(--herb)', fontSize: '10px' }}>
              {trial.formattedRemaining || `30-Day Trial: ${trial.remainingDays}d ${trial.remainingHours}h remaining`}
            </div>
          )}
        </div>
      </div>

      {/* Main Container */}
      <div className="pos-main">
        {/* Topbar */}
        <div className="pos-topbar pos-no-print">
          <div className="pos-date">
            {new Date().toLocaleDateString(undefined, {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </div>
          <div className="pos-topbar-right">
            <div className="pos-roletoggle">
              {(['admin', 'staff'] as const).map((r) => (
                <button
                  key={r}
                  className={role === r ? 'active' : ''}
                  onClick={() => setRole(r)}
                >
                  {r}
                </button>
              ))}
            </div>
            <button className="pos-btn outline sm" onClick={toggleTheme}>
              {theme === 'dark' ? '☀️ Light' : '🌙 Dark'}
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="pos-content pos-scroll">
          {/* VIEW: DASHBOARD */}
          {view === 'dashboard' && (
            <div className="pos-anim">
              <div className="pos-row-between" style={{ marginBottom: '18px' }}>
                <h1 className="pos-h1" style={{ margin: 0 }}>
                  Today's overview
                </h1>
                <button className="pos-btn" onClick={() => setView('new-order')}>
                  ➕ New order
                </button>
              </div>

              <div className="pos-stats-grid">
                <div className="pos-card pos-statcard">
                  <div className="pos-row-between" style={{ alignItems: 'flex-start' }}>
                    <div>
                      <div className="pos-stat-label">Orders Today</div>
                      <div className="pos-stat-value">{formatCompactNumber(todayOrders.length)}</div>
                    </div>
                    <div className="pos-stat-icon">📋</div>
                  </div>
                </div>

                <div className="pos-card pos-statcard">
                  <div className="pos-row-between" style={{ alignItems: 'flex-start' }}>
                    <div>
                      <div className="pos-stat-label">Revenue Today</div>
                      <div className="pos-stat-value">{formatCompactMoney(dashboardRevenue, settings.currency)}</div>
                    </div>
                    <div className="pos-stat-icon">💵</div>
                  </div>
                </div>

                <div className="pos-card pos-statcard">
                  <div className="pos-row-between" style={{ alignItems: 'flex-start' }}>
                    <div>
                      <div className="pos-stat-label">Total Orders</div>
                      <div className="pos-stat-value">{formatCompactNumber(totalLifetimeOrdersCount)}</div>
                      <div className="pos-stat-sub herb">{formatCompactNumber(totalPaidOrdersCount)} paid</div>
                    </div>
                    <div className="pos-stat-icon">📦</div>
                  </div>
                </div>

                <div className="pos-card pos-statcard">
                  <div className="pos-row-between" style={{ alignItems: 'flex-start' }}>
                    <div>
                      <div className="pos-stat-label">Total Revenue</div>
                      <div className="pos-stat-value">{formatCompactMoney(totalLifetimeRevenue, settings.currency)}</div>
                      <div className="pos-stat-sub herb">Lifetime total</div>
                    </div>
                    <div className="pos-stat-icon">💰</div>
                  </div>
                </div>

                <div className="pos-card pos-statcard">
                  <div className="pos-row-between" style={{ alignItems: 'flex-start' }}>
                    <div>
                      <div className="pos-stat-label">Paid Orders</div>
                      <div className="pos-stat-value">{formatCompactNumber(dashboardPaid.length)}</div>
                      <div className="pos-stat-sub herb">{formatCompactNumber(dashboardUnpaid.length)} unpaid today</div>
                    </div>
                    <div className="pos-stat-icon">✅</div>
                  </div>
                </div>

                <div className="pos-card pos-statcard">
                  <div className="pos-row-between" style={{ alignItems: 'flex-start' }}>
                    <div>
                      <div className="pos-stat-label">Avg Order Value</div>
                      <div className="pos-stat-value">{formatCompactMoney(Math.round(dashboardAvg), settings.currency)}</div>
                    </div>
                    <div className="pos-stat-icon">📈</div>
                  </div>
                </div>

                <div className="pos-card pos-statcard">
                  <div className="pos-row-between" style={{ alignItems: 'flex-start' }}>
                    <div>
                      <div className="pos-stat-label">Best Seller</div>
                      <div className="pos-stat-value">{todayBestSeller ? todayBestSeller.name : '—'}</div>
                      {todayBestSeller && <div className="pos-stat-sub herb">{formatCompactNumber(todayBestSeller.qty)} sold</div>}
                    </div>
                    <div className="pos-stat-icon">✨</div>
                  </div>
                </div>

                <div className="pos-card pos-statcard">
                  <div className="pos-row-between" style={{ alignItems: 'flex-start' }}>
                    <div>
                      <div className="pos-stat-label">Active Orders</div>
                      <div className="pos-stat-value">{formatCompactNumber(activeOrders.length)}</div>
                    </div>
                    <div className="pos-stat-icon">👨‍🍳</div>
                  </div>
                </div>
              </div>

              <div className="pos-grid-2">
                <div className="pos-card">
                  <div className="pos-card-title">Last 7 days revenue</div>
                  <BarChart data={last7Days} />
                </div>
                <div className="pos-card">
                  <div className="pos-card-title">Active orders</div>
                  {activeOrders.length === 0 && (
                    <div className="pos-muted">No active orders in the kitchen right now.</div>
                  )}
                  <div className="pos-flex-col">
                    {activeOrders.slice(0, 6).map((o) => (
                      <div key={o.id} className="pos-activeorder-row">
                        <span className="pos-mono pos-bold">#{o.orderNumber}</span>
                        <span className="pos-muted">
                          {o.customerName || 'Walk-in'}
                          {o.tableNumber ? ` · T${o.tableNumber}` : ''}
                        </span>
                        <span>{fmtMoney(o.total, settings.currency)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="pos-card" style={{ marginTop: '14px' }}>
                <div className="pos-card-title">Recent orders</div>
                <OrdersTable orders={orders.slice(0, 6)} currency={settings.currency} compact={true} />
              </div>
            </div>
          )}

          {/* VIEW: NEW ORDER */}
          {view === 'new-order' && (
            <div className="pos-anim pos-neworder-grid">
              <div>
                <div className="pos-searchbar">
                  <input
                    id="no-search"
                    className="pos-input"
                    placeholder="🔍 Search menu items"
                    value={noSearch}
                    onChange={(e) => setNoSearch(e.target.value)}
                  />
                </div>

                {favoriteItems.length > 0 && (
                  <div style={{ marginBottom: '12px' }}>
                    <div className="pos-label-caps">FAVORITES</div>
                    <div className="pos-chipwrap">
                      {favoriteItems.map((m) => (
                        <button
                          key={m.id}
                          className="pos-chip"
                          onClick={() => handleMenuItemClick(m)}
                        >
                          {m.image} {m.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="pos-menugrid">
                  {filteredMenuItems.map((item) => (
                    <div
                      key={item.id}
                      className={`pos-menucard ${!item.available ? 'unavailable' : ''}`}
                      onClick={() => handleMenuItemClick(item)}
                    >
                      <button
                        className={`pos-favbtn ${item.favorite ? 'active' : ''}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFavorite(item);
                        }}
                      >
                        {item.favorite ? '⭐' : '☆'}
                      </button>
                      <div className="pos-menuicon">{item.image || '🍽️'}</div>
                      <div className="pos-bold" style={{ fontSize: '14px' }}>
                        {item.name}
                      </div>
                      <div className="pos-muted" style={{ fontSize: '12px', marginTop: '2px' }}>
                        {item.variants.length === 1
                          ? fmtMoney(item.variants[0].price, settings.currency)
                          : `From ${fmtMoney(Math.min(...item.variants.map((v) => v.price)), settings.currency)}`}
                      </div>
                      {!item.available && (
                        <div style={{ marginTop: '6px' }}>
                          <span className="pos-badge unpaid">Out of stock</span>
                        </div>
                      )}
                    </div>
                  ))}
                  {filteredMenuItems.length === 0 && (
                    <div className="pos-muted">No items match.</div>
                  )}
                </div>
              </div>

              {/* Cart Panel */}
              <div className="pos-card pos-cartpanel">
                <div className="pos-row-between" style={{ marginBottom: '12px' }}>
                  <div className="pos-h2">Order #{settings.nextOrderNumber}</div>
                  <span className="pos-mono pos-muted" style={{ fontSize: '12px' }}>
                    {new Date().toLocaleTimeString()}
                  </span>
                </div>

                <div className="pos-formgrid2">
                  <label className="pos-field">
                    <span>Customer name</span>
                    <input
                      id="no-customer"
                      className="pos-input"
                      placeholder="Walk-in"
                      value={noCustomerName}
                      onChange={(e) => setNoCustomerName(e.target.value)}
                    />
                  </label>
                  <label className="pos-field">
                    <span>Table (optional)</span>
                    <input
                      id="no-table"
                      className="pos-input"
                      placeholder="e.g. 4"
                      value={noTableNumber}
                      onChange={(e) => setNoTableNumber(e.target.value)}
                    />
                  </label>
                </div>

                <div className="pos-cartlist">
                  {noCart.length === 0 && (
                    <div className="pos-muted pos-center" style={{ padding: '20px 0' }}>
                      Tap a menu item to add it here.
                    </div>
                  )}
                  {noCart.map((it) => (
                    <div key={it.id} className="pos-cartitem">
                      <div className="pos-row-between" style={{ alignItems: 'flex-start' }}>
                        <div>
                          <div className="pos-bold" style={{ fontSize: '13px' }}>
                            {it.name}
                          </div>
                          <div className="pos-muted" style={{ fontSize: '12px' }}>
                            {it.variantLabel} · {fmtMoney(it.price, settings.currency)}
                          </div>
                        </div>
                        <button
                          className="pos-iconbtn danger"
                          onClick={() => removeCartItem(it.id)}
                        >
                          🗑️
                        </button>
                      </div>

                      <div className="pos-row-between" style={{ marginTop: '8px' }}>
                        <div className="pos-qtyctl">
                          <button onClick={() => changeCartQty(it.id, -1)}>−</button>
                          <span className="pos-mono pos-bold">{it.qty}</span>
                          <button onClick={() => changeCartQty(it.id, 1)}>+</button>
                        </div>
                        <div className="pos-bold" style={{ fontSize: '13px' }}>
                          {fmtMoney(it.price * it.qty, settings.currency)}
                        </div>
                      </div>

                      <input
                        id={`no-cartnote-${it.id}`}
                        className="pos-input"
                        style={{ marginTop: '8px', fontSize: '12px', padding: '6px 9px' }}
                        placeholder="Special instructions (e.g. less spicy)"
                        value={it.notes}
                        onChange={(e) => setCartNotes(it.id, e.target.value)}
                      />
                    </div>
                  ))}
                </div>

                <div className="pos-cartfooter">
                  <div className="pos-row-between pos-muted" style={{ fontSize: '13px' }}>
                    <span>Subtotal</span>
                    <span>{fmtMoney(cartSubtotal, settings.currency)}</span>
                  </div>

                  <div className="pos-row-between" style={{ alignItems: 'center' }}>
                    <span className="pos-muted" style={{ fontSize: '13px' }}>
                      Discount
                    </span>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <input
                        id="no-discount-value"
                        type="text"
                        inputMode="decimal"
                        pattern="[0-9]*"
                        className="pos-input"
                        style={{ width: '80px', padding: '6px 8px' }}
                        value={noDiscountValue}
                        onChange={(e) => setNoDiscountValue(e.target.value)}
                      />
                      <select
                        className="pos-input"
                        style={{ width: '74px', padding: '6px 8px' }}
                        value={noDiscountType}
                        onChange={(e) => setNoDiscountType(e.target.value as any)}
                      >
                        <option value="amount">{settings.currency}</option>
                        <option value="percent">%</option>
                      </select>
                    </div>
                  </div>

                  <div className="pos-row-between pos-totalrow">
                    <span>Total</span>
                    <span>{fmtMoney(cartTotal, settings.currency)}</span>
                  </div>

                  <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                    {(['unpaid', 'paid'] as const).map((p) => (
                      <button
                        key={p}
                        className={`pos-paybtn ${p} ${noPaymentStatus === p ? 'active' : ''}`}
                        onClick={() => setNoPaymentStatus(p)}
                      >
                        {p}
                      </button>
                    ))}
                  </div>

                  <button
                    className="pos-btn lg"
                    style={{ marginTop: '6px' }}
                    disabled={noCart.length === 0}
                    onClick={() => placeNewOrder(null)}
                  >
                    Place order
                  </button>

                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      className="pos-btn outline sm"
                      style={{ flex: 1 }}
                      disabled={noCart.length === 0}
                      onClick={() => placeNewOrder('receipt')}
                    >
                      🖨️ Place + receipt
                    </button>
                    <button
                      className="pos-btn outline sm"
                      style={{ flex: 1 }}
                      disabled={noCart.length === 0}
                      onClick={() => placeNewOrder('kot')}
                    >
                      👨‍🍳 Place + KOT
                    </button>
                  </div>

                  {noLastPlaced && (
                    <div className="pos-center herb" style={{ fontSize: '12px', marginTop: '2px' }}>
                      Order #{noLastPlaced.orderNumber} saved to SQLite.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* VIEW: ORDERS */}
          {view === 'orders' && (
            <div className="pos-anim">
              <div className="pos-row-between" style={{ marginBottom: 0 }}>
                <h1 className="pos-h1">Orders</h1>
                {role === 'admin' && (
                  <button
                    className="pos-btn danger sm"
                    style={{ marginBottom: '14px' }}
                    onClick={clearAllOrdersConfirm}
                  >
                    🗑️ Clear All Orders
                  </button>
                )}
              </div>

              <div className="pos-card" style={{ marginBottom: '14px' }}>
                <div className="pos-filterbar">
                  <input
                    id="oh-search"
                    className="pos-input"
                    style={{ flex: '1 1 220px' }}
                    placeholder="🔍 Search by name or order #"
                    value={ohSearch}
                    onChange={(e) => setOhSearch(e.target.value)}
                  />
                  <select
                    className="pos-input"
                    style={{ width: '150px' }}
                    value={ohPaymentFilter}
                    onChange={(e) => setOhPaymentFilter(e.target.value as any)}
                  >
                    <option value="all">All payments</option>
                    <option value="paid">Paid</option>
                    <option value="unpaid">Unpaid</option>
                  </select>
                  <select
                    className="pos-input"
                    style={{ width: '150px' }}
                    value={ohDateFilter}
                    onChange={(e) => setOhDateFilter(e.target.value as any)}
                  >
                    <option value="all">All dates</option>
                    <option value="today">Today</option>
                    <option value="week">This week</option>
                  </select>
                </div>
              </div>

              <div className="pos-flex-col">
                {filteredOrders.length === 0 && (
                  <div className="pos-card pos-muted">No orders match your filters.</div>
                )}
                {filteredOrders.map((o) => {
                  const expanded = ohExpanded === o.id;
                  return (
                    <div key={o.id} className="pos-card">
                      <div
                        className="pos-row-between pos-clickable"
                        onClick={() => setOhExpanded(expanded ? null : o.id)}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                          <div className="pos-mono pos-bold" style={{ fontSize: '16px' }}>
                            #{o.orderNumber}
                          </div>
                          <div>
                            <div className="pos-bold" style={{ fontSize: '14px' }}>
                              {o.customerName || 'Walk-in'}
                              {o.tableNumber ? ` · Table ${o.tableNumber}` : ''}
                            </div>
                            <div className="pos-muted" style={{ fontSize: '12px' }}>
                              {fmtDate(o.createdAt)} · {fmtTime(o.createdAt)}
                            </div>
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span className={`pos-badge ${o.paymentStatus}`}>{o.paymentStatus}</span>
                          <span className={`pos-badge ${o.stage === 'active' ? 'active' : 'muted'}`}>
                            {o.stage === 'active' ? 'Active' : 'Completed'}
                          </span>
                          <div className="pos-bold pos-display">
                            {fmtMoney(o.total, settings.currency)}
                          </div>
                          <span style={{ display: 'inline-block', transform: expanded ? 'rotate(180deg)' : 'none' }}>
                            ▾
                          </span>
                        </div>
                      </div>

                      {expanded && (
                        <div className="pos-orderdetail">
                          {o.items.map((it) => (
                            <div
                              key={it.id}
                              className="pos-row-between"
                              style={{ fontSize: '13px', padding: '4px 0' }}
                            >
                              <span>
                                {it.qty}× {it.name} ({it.variantLabel})
                                {it.notes ? ` — ${it.notes}` : ''}
                                {it.isExtra ? ' ✚' : ''}
                              </span>
                              <span>{fmtMoney(it.price * it.qty, settings.currency)}</span>
                            </div>
                          ))}
                          <div className="pos-actionrow">
                            <button
                              className="pos-btn outline sm"
                              onClick={() => doPrint('receipt', o)}
                            >
                              🖨️ Receipt
                            </button>
                            <button
                              className="pos-btn outline sm"
                              onClick={() => doPrint('kot', o)}
                            >
                              👨‍🍳 KOT
                            </button>
                            <button
                              className="pos-btn outline sm"
                              onClick={() => duplicateOrder(o)}
                            >
                              ⧉ Duplicate
                            </button>
                            <button
                              className="pos-btn outline sm"
                              onClick={() => {
                                setOhExtraItemFor(o);
                                setEiName('');
                                setEiQty(1);
                                setEiPrice('');
                              }}
                            >
                              ➕ Add extra item
                            </button>
                            {o.paymentStatus === 'unpaid' ? (
                              <button
                                className="pos-btn subtle sm"
                                onClick={() =>
                                  updateOrderStatus(o.id, {
                                    paymentStatus: 'paid',
                                    paymentDate: new Date().toISOString(),
                                  })
                                }
                              >
                                💰 Mark paid
                              </button>
                            ) : (
                              <button
                                className="pos-btn subtle sm"
                                onClick={() =>
                                  updateOrderStatus(o.id, {
                                    paymentStatus: 'unpaid',
                                    paymentDate: null,
                                  })
                                }
                              >
                                ❌ Mark unpaid
                              </button>
                            )}
                            {o.stage === 'active' ? (
                              <button
                                className="pos-btn subtle sm"
                                onClick={() => updateOrderStatus(o.id, { stage: 'completed' })}
                              >
                                ✅ Mark completed
                              </button>
                            ) : (
                              <button
                                className="pos-btn subtle sm"
                                onClick={() => updateOrderStatus(o.id, { stage: 'active' })}
                              >
                                ↺ Reopen
                              </button>
                            )}
                            {role === 'admin' && (
                              <button
                                className="pos-btn danger sm"
                                onClick={() => deleteOrderConfirm(o.id)}
                              >
                                🗑️ Delete
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* VIEW: MENU MANAGEMENT */}
          {view === 'menu' && role === 'admin' && (
            <div className="pos-anim">
              <div className="pos-row-between" style={{ marginBottom: '16px' }}>
                <h1 className="pos-h1" style={{ margin: 0 }}>
                  Menu management
                </h1>
                <button className="pos-btn" onClick={() => openItemEditor(null)}>
                  ➕ Add item
                </button>
              </div>

              <div className="pos-menuadmingrid">
                {menuItems.map((item) => (
                  <div key={item.id} className="pos-card" style={{ padding: '14px' }}>
                    <div className="pos-row-between">
                      <div style={{ fontSize: '28px' }}>{item.image || '🍽️'}</div>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button className="pos-smallbtn" onClick={() => openItemEditor(item)}>
                          ✎
                        </button>
                        <button
                          className="pos-smallbtn danger"
                          onClick={() => deleteMenuItem(item.id)}
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                    <div className="pos-bold" style={{ marginTop: '6px' }}>
                      {item.name}
                    </div>
                    <div className="pos-muted" style={{ fontSize: '12px', margin: '3px 0 8px' }}>
                      {item.description}
                    </div>
                    <div className="pos-chipwrap" style={{ marginBottom: '10px' }}>
                      {item.variants.map((v) => (
                        <span key={v.id} className="pos-variantchip">
                          {v.label} · {v.price}
                        </span>
                      ))}
                    </div>
                    <button
                      className={`pos-availbtn ${item.available ? 'yes' : 'no'}`}
                      onClick={() => toggleAvailable(item)}
                    >
                      {item.available ? 'Available' : 'Out of stock'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* VIEW: REPORTS */}
          {view === 'reports' && role === 'admin' && (
            <div className="pos-anim">
              {/* Standalone Top Section: TOTAL RESTAURANT REVENUE */}
              <div
                id="total-restaurant-revenue-card"
                className="pos-card"
                style={{
                  marginBottom: '20px',
                  padding: '24px 20px',
                  background: 'linear-gradient(135deg, rgba(217, 119, 6, 0.08) 0%, rgba(30, 41, 59, 0.6) 100%)',
                  border: '1px solid var(--border)',
                  textAlign: 'center',
                  borderRadius: '12px',
                }}
              >
                <div
                  style={{
                    fontSize: '13px',
                    fontWeight: 700,
                    letterSpacing: '1.5px',
                    textTransform: 'uppercase',
                    color: 'var(--accent)',
                    marginBottom: '8px',
                  }}
                >
                  TOTAL RESTAURANT REVENUE
                </div>
                <div
                  style={{
                    fontSize: '38px',
                    fontWeight: 800,
                    fontFamily: 'monospace, system-ui, sans-serif',
                    color: 'var(--text-primary)',
                    letterSpacing: '0.5px',
                  }}
                >
                  {formatPakistaniCurrency(totalLifetimeRevenue, settings.currency)}
                </div>
              </div>

              <h1 className="pos-h1">Sales reports</h1>
              <div className="pos-card" style={{ marginBottom: '14px' }}>
                <div className="pos-filterbar" style={{ alignItems: 'center' }}>
                  {[
                    ['today', 'Today'],
                    ['yesterday', 'Yesterday'],
                    ['week', 'This week'],
                    ['month', 'This month'],
                    ['custom', 'Custom'],
                  ].map(([k, label]) => (
                    <button
                      key={k}
                      className={`pos-catbtn ${rpRange === k ? 'active' : ''}`}
                      onClick={() => setRpRange(k as any)}
                    >
                      {label}
                    </button>
                  ))}

                  {rpRange === 'custom' && (
                    <>
                      <input
                        id="rp-custom-from"
                        type="date"
                        className="pos-input"
                        style={{ width: '150px' }}
                        value={rpCustomFrom}
                        onChange={(e) => setRpCustomFrom(e.target.value)}
                      />
                      <input
                        id="rp-custom-to"
                        type="date"
                        className="pos-input"
                        style={{ width: '150px' }}
                        value={rpCustomTo}
                        onChange={(e) => setRpCustomTo(e.target.value)}
                      />
                    </>
                  )}

                  <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
                    <button
                      className="pos-btn outline sm"
                      onClick={() => {
                        const rows = reportOrders.map((o) => ({
                          OrderNumber: o.orderNumber,
                          Customer: o.customerName || 'Walk-in',
                          Table: o.tableNumber || '',
                          Date: fmtDate(o.createdAt),
                          Time: fmtTime(o.createdAt),
                          Subtotal: o.subtotal,
                          Discount: o.discount,
                          Total: o.total,
                          Payment: o.paymentStatus,
                          Status: o.stage,
                        }));
                        downloadFile(`sales-report-${rpRange}.csv`, toCSV(rows), 'text/csv');
                      }}
                    >
                      ⬇️ Export Excel/CSV
                    </button>
                    <button
                      className="pos-btn outline sm"
                      onClick={() =>
                        doPrint('report', {
                          filtered: reportOrders,
                          revenue: reportRevenue,
                          avg: reportAvg,
                          paid: reportPaid,
                          unpaid: reportUnpaid,
                          bestSellers,
                          range: rpRange,
                        })
                      }
                    >
                      🖨️ Export PDF
                    </button>
                  </div>
                </div>
              </div>

              <div className="pos-stats-grid">
                <div className="pos-card pos-statcard">
                  <div className="pos-stat-label">Total orders</div>
                  <div className="pos-stat-value">{reportOrders.length}</div>
                </div>
                <div className="pos-card pos-statcard">
                  <div className="pos-stat-label">Total revenue</div>
                  <div className="pos-stat-value">{fmtMoney(reportRevenue, settings.currency)}</div>
                </div>
                <div className="pos-card pos-statcard">
                  <div className="pos-stat-label">Paid orders</div>
                  <div className="pos-stat-value">{reportPaid.length}</div>
                </div>
                <div className="pos-card pos-statcard">
                  <div className="pos-stat-label">Unpaid orders</div>
                  <div className="pos-stat-value">{reportUnpaid.length}</div>
                </div>
                <div className="pos-card pos-statcard">
                  <div className="pos-stat-label">Avg order value</div>
                  <div className="pos-stat-value">{fmtMoney(Math.round(reportAvg), settings.currency)}</div>
                </div>
              </div>

              <div className="pos-grid-2">
                <div className="pos-card">
                  <div className="pos-card-title">Revenue trend</div>
                  <LineChart data={trend} />
                </div>
                <div className="pos-card">
                  <div className="pos-card-title">Best selling items</div>
                  {bestSellers.length === 0 && <div className="pos-muted">No sales in this period.</div>}
                  <div className="pos-flex-col">
                    {bestSellers.map(([name, qty], i) => (
                      <div key={name} className="pos-row-between" style={{ fontSize: '13px' }}>
                        <span>
                          {i + 1}. {name}
                        </span>
                        <span className="pos-bold">{qty} sold</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="pos-card" style={{ marginTop: '14px' }}>
                <div className="pos-card-title">Orders in range</div>
                <OrdersTable orders={reportOrders} currency={settings.currency} compact={false} />
              </div>
            </div>
          )}

          {/* VIEW: CUSTOMERS */}
          {view === 'customers' && (
            <div className="pos-anim">
              <h1 className="pos-h1">Customers</h1>
              <div className="pos-card">
                <div className="pos-searchbar" style={{ maxWidth: '320px', marginBottom: '14px' }}>
                  <input
                    id="cu-search"
                    className="pos-input"
                    placeholder="🔍 Search customers"
                    value={cuSearch}
                    onChange={(e) => setCuSearch(e.target.value)}
                  />
                </div>
                {customers.length === 0 && <div className="pos-muted">No customers yet.</div>}
                <div style={{ overflowX: 'auto' }}>
                  <table className="pos-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Total orders</th>
                        <th>Total spending</th>
                        <th>Last visit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {customers.map((c) => (
                        <tr key={c.name}>
                          <td className="pos-bold">{c.name}</td>
                          <td>{c.totalOrders}</td>
                          <td>{fmtMoney(c.totalSpending, settings.currency)}</td>
                          <td className="pos-muted">{fmtDate(c.lastVisit)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* VIEW: EMPLOYEES */}
          {view === 'employees' && (
            <div className="pos-anim">
              <div className="pos-row-between" style={{ marginBottom: '18px' }}>
                <h1 className="pos-h1" style={{ margin: 0 }}>
                  Employees
                </h1>
                <button
                  id="add-employee-btn"
                  className="pos-btn"
                  onClick={() => openEmployeeEditor(null)}
                >
                  ➕ Add Employee
                </button>
              </div>

              <div className="pos-stats-grid" style={{ marginBottom: '16px' }}>
                <div className="pos-card pos-statcard">
                  <div className="pos-row-between" style={{ alignItems: 'flex-start' }}>
                    <div>
                      <div className="pos-stat-label">Total Employees</div>
                      <div className="pos-stat-value">{employees.length}</div>
                    </div>
                    <div className="pos-stat-icon">👔</div>
                  </div>
                </div>

                <div className="pos-card pos-statcard">
                  <div className="pos-row-between" style={{ alignItems: 'flex-start' }}>
                    <div>
                      <div className="pos-stat-label">Total Monthly Payroll</div>
                      <div className="pos-stat-value">{fmtMoney(totalPayroll, settings.currency)}</div>
                    </div>
                    <div className="pos-stat-icon">💵</div>
                  </div>
                </div>

                <div className="pos-card pos-statcard">
                  <div className="pos-row-between" style={{ alignItems: 'flex-start' }}>
                    <div>
                      <div className="pos-stat-label">Average Salary</div>
                      <div className="pos-stat-value">{fmtMoney(Math.round(avgSalary), settings.currency)}</div>
                    </div>
                    <div className="pos-stat-icon">📊</div>
                  </div>
                </div>
              </div>

              <div className="pos-card">
                <div className="pos-row-between" style={{ marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
                  <div className="pos-searchbar" style={{ maxWidth: '320px', width: '100%' }}>
                    <input
                      id="emp-search"
                      className="pos-input"
                      placeholder="🔍 Search by name or phone..."
                      value={empSearch}
                      onChange={(e) => setEmpSearch(e.target.value)}
                    />
                  </div>
                  <div className="pos-muted" style={{ fontSize: '13px' }}>
                    Showing {filteredEmployees.length} of {employees.length} employee{employees.length === 1 ? '' : 's'}
                  </div>
                </div>

                {employees.length === 0 ? (
                  <div className="pos-muted" style={{ padding: '32px 0', textAlign: 'center' }}>
                    No employees added yet. Click <strong>+ Add Employee</strong> to add your first staff record.
                  </div>
                ) : filteredEmployees.length === 0 ? (
                  <div className="pos-muted" style={{ padding: '24px 0', textAlign: 'center' }}>
                    No employees found matching "{empSearch}"
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table className="pos-table">
                      <thead>
                        <tr>
                          <th>Employee Name</th>
                          <th>Phone Number</th>
                          <th>Salary</th>
                          <th>Date Added</th>
                          <th style={{ textAlign: 'right' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredEmployees.map((emp) => (
                          <tr key={emp.id}>
                            <td className="pos-bold">{emp.name}</td>
                            <td className="pos-mono">{emp.phone || '—'}</td>
                            <td className="pos-bold" style={{ color: 'var(--accent)' }}>
                              {fmtMoney(emp.salary, settings.currency)}
                            </td>
                            <td className="pos-muted">{fmtDate(emp.createdAt)}</td>
                            <td style={{ textAlign: 'right' }}>
                              <div style={{ display: 'inline-flex', gap: '6px' }}>
                                <button
                                  id={`edit-emp-${emp.id}`}
                                  className="pos-btn outline sm"
                                  onClick={() => openEmployeeEditor(emp)}
                                >
                                  ✏️ Edit
                                </button>
                                <button
                                  id={`delete-emp-${emp.id}`}
                                  className="pos-btn danger sm"
                                  onClick={() => deleteEmployeeConfirm(emp.id, emp.name)}
                                >
                                  🗑️ Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* VIEW: SETTINGS */}
          {view === 'settings' && role === 'admin' && (
            <div className="pos-anim" style={{ maxWidth: '640px' }}>
              <h1 className="pos-h1">Settings</h1>
              <div className="pos-card" style={{ marginBottom: '14px' }}>
                <div className="pos-card-title">Restaurant details</div>
                <div className="pos-formgrid2">
                  <label className="pos-field">
                    <span>Restaurant name</span>
                    <input
                      id="settings-restaurant-name"
                      className="pos-input"
                      value={settings.restaurantName}
                      onChange={(e) => handleSettingChange('restaurantName', e.target.value)}
                    />
                  </label>
                  <label className="pos-field">
                    <span>Logo emoji</span>
                    <input
                      id="settings-logo"
                      className="pos-input"
                      value={settings.logo}
                      onChange={(e) => handleSettingChange('logo', e.target.value)}
                    />
                  </label>
                  <label className="pos-field">
                    <span>Address</span>
                    <input
                      id="settings-address"
                      className="pos-input"
                      value={settings.address}
                      onChange={(e) => handleSettingChange('address', e.target.value)}
                    />
                  </label>
                  <label className="pos-field">
                    <span>Phone</span>
                    <input
                      id="settings-phone"
                      className="pos-input"
                      value={settings.phone}
                      onChange={(e) => handleSettingChange('phone', e.target.value)}
                    />
                  </label>
                  <label className="pos-field">
                    <span>Currency symbol</span>
                    <input
                      id="settings-currency"
                      className="pos-input"
                      value={settings.currency}
                      onChange={(e) => handleSettingChange('currency', e.target.value)}
                    />
                  </label>
                  <label className="pos-field">
                    <span>Receipt format</span>
                    <select
                      className="pos-input"
                      value={settings.receiptFormat}
                      onChange={(e) => handleSettingChange('receiptFormat', e.target.value as any)}
                    >
                      <option value="thermal">Thermal (80mm)</option>
                      <option value="a4">A4</option>
                    </select>
                  </label>
                </div>
                <label className="pos-field">
                  <span>Receipt footer message</span>
                  <textarea
                    id="settings-receipt-footer"
                    className="pos-input"
                    rows={2}
                    value={settings.receiptFooter}
                    onChange={(e) => handleSettingChange('receiptFooter', e.target.value)}
                  />
                </label>
              </div>

              <div className="pos-card" style={{ marginBottom: '14px' }}>
                <div className="pos-card-title">Appearance</div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {(['light', 'dark'] as const).map((t) => (
                    <button
                      key={t}
                      className={`pos-themebtn ${theme === t ? 'active' : ''}`}
                      onClick={() => {
                        setTheme(t);
                        handleSettingChange('theme', t);
                      }}
                    >
                      {t} mode
                    </button>
                  ))}
                </div>
              </div>

              {/* Application Updates Section */}
              <AppUpdater trial={trial} onToast={showToast} />
            </div>
          )}
        </div>
      </div>

      {/* MODAL: Variant Picker */}
      {noVariantPicker && (
        <div className="pos-modal-overlay pos-no-print" onClick={() => setNoVariantPicker(null)}>
          <div className="pos-modal" onClick={(e) => e.stopPropagation()}>
            <div className="pos-row-between" style={{ marginBottom: '12px' }}>
              <div className="pos-h2">{noVariantPicker.name}</div>
              <button className="pos-iconbtn" onClick={() => setNoVariantPicker(null)}>
                ✕
              </button>
            </div>
            <div className="pos-flex-col">
              {noVariantPicker.variants.map((v) => (
                <button
                  key={v.id}
                  className="pos-variantbtn"
                  onClick={() => {
                    addToCart(noVariantPicker, v);
                    setNoVariantPicker(null);
                  }}
                >
                  <span>{v.label}</span>
                  <span>{fmtMoney(v.price, settings.currency)}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Extra Item Modal */}
      {ohExtraItemFor && (
        <div className="pos-modal-overlay pos-no-print" onClick={() => setOhExtraItemFor(null)}>
          <div className="pos-modal" onClick={(e) => e.stopPropagation()}>
            <div className="pos-row-between">
              <div className="pos-h2">Add extra item</div>
              <button className="pos-iconbtn" onClick={() => setOhExtraItemFor(null)}>
                ✕
              </button>
            </div>
            <div className="pos-muted" style={{ fontSize: '12px', marginBottom: '14px' }}>
              Order #{ohExtraItemFor.orderNumber}
            </div>
            <div className="pos-flex-col">
              <label className="pos-field">
                <span>Item name</span>
                <input
                  id="ei-name"
                  className="pos-input"
                  placeholder="e.g. Roti, Naan, Sting Energy Drink"
                  value={eiName}
                  onChange={(e) => setEiName(e.target.value)}
                />
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <label className="pos-field">
                  <span>Quantity</span>
                  <input
                    id="ei-qty"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    className="pos-input"
                    value={eiQty}
                    onChange={(e) => setEiQty(Number(e.target.value) || 1)}
                  />
                </label>
                <label className="pos-field">
                  <span>Price ({settings.currency}, per unit)</span>
                  <input
                    id="ei-price"
                    type="text"
                    inputMode="decimal"
                    pattern="[0-9]*"
                    className="pos-input"
                    placeholder="Enter price"
                    value={eiPrice}
                    onChange={(e) => setEiPrice(e.target.value)}
                  />
                </label>
              </div>
              <button
                className="pos-btn lg"
                style={{ marginTop: '6px' }}
                disabled={!eiName.trim() || !(Number(eiQty) > 0) || eiPrice === '' || !(Number(eiPrice) >= 0)}
                onClick={saveExtraItem}
              >
                Add to order
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Menu Item Editor */}
      {mmEditing !== null && (
        <div className="pos-modal-overlay pos-no-print" onClick={() => setMmEditing(null)}>
          <div
            className="pos-modal pos-scroll"
            style={{ width: '420px', maxHeight: '88vh', overflowY: 'auto' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="pos-row-between" style={{ marginBottom: '14px' }}>
              <div className="pos-h2">{mmEditing === 'new' ? 'Add menu item' : 'Edit item'}</div>
              <button className="pos-iconbtn" onClick={() => setMmEditing(null)}>
                ✕
              </button>
            </div>
            <div className="pos-flex-col">
              <div style={{ display: 'flex', gap: '8px' }}>
                <label className="pos-field" style={{ width: '70px' }}>
                  <span>Icon</span>
                  <select
                    className="pos-input"
                    value={mmEditImage}
                    onChange={(e) => setMmEditImage(e.target.value)}
                  >
                    {['🍽️', '🍛', '🍲', '🍗', '🍚', '🔥', '🍔', '🥤', '🍮', '🍕', '🥗', '🍰', '🍟', '🌯'].map(
                      (ic) => (
                        <option key={ic} value={ic}>
                          {ic}
                        </option>
                      )
                    )}
                  </select>
                </label>
                <label className="pos-field" style={{ flex: 1 }}>
                  <span>Food name</span>
                  <input
                    id="mm-edit-name"
                    className="pos-input"
                    value={mmEditName}
                    onChange={(e) => setMmEditName(e.target.value)}
                    placeholder="e.g. Chicken Biryani"
                  />
                </label>
              </div>

              <label className="pos-field">
                <span>Description</span>
                <textarea
                  id="mm-edit-desc"
                  className="pos-input"
                  rows={2}
                  value={mmEditDesc}
                  onChange={(e) => setMmEditDesc(e.target.value)}
                  placeholder="Short description"
                />
              </label>

              <label className="pos-field">
                <span>Availability</span>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    className={`pos-toggle2 ${mmEditAvailable ? 'active-yes' : ''}`}
                    onClick={() => setMmEditAvailable(true)}
                  >
                    Available
                  </button>
                  <button
                    type="button"
                    className={`pos-toggle2 ${!mmEditAvailable ? 'active-no' : ''}`}
                    onClick={() => setMmEditAvailable(false)}
                  >
                    Out of stock
                  </button>
                </div>
              </label>

              <div>
                <div className="pos-label-caps" style={{ textTransform: 'none' }}>
                  Sizes / variants
                </div>
                <div className="pos-flex-col" style={{ gap: '6px' }}>
                  {mmEditVariants.map((v) => (
                    <div key={v.id} style={{ display: 'flex', gap: '6px' }}>
                      <input
                        id={`mm-variant-label-${v.id}`}
                        className="pos-input"
                        placeholder="Label (e.g. Half)"
                        value={v.label}
                        onChange={(e) =>
                          setMmEditVariants((prev) =>
                            prev.map((item) => (item.id === v.id ? { ...item, label: e.target.value } : item))
                          )
                        }
                      />
                      <input
                        id={`mm-variant-price-${v.id}`}
                        type="text"
                        inputMode="decimal"
                        pattern="[0-9]*"
                        className="pos-input"
                        style={{ width: '100px' }}
                        placeholder="Price"
                        value={v.price}
                        onChange={(e) =>
                          setMmEditVariants((prev) =>
                            prev.map((item) => (item.id === v.id ? { ...item, price: Number(e.target.value) || 0 } : item))
                          )
                        }
                      />
                      {mmEditVariants.length > 1 && (
                        <button
                          className="pos-smallbtn danger"
                          style={{ width: '34px' }}
                          onClick={() =>
                            setMmEditVariants((prev) => prev.filter((item) => item.id !== v.id))
                          }
                        >
                          🗑️
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <button
                  className="pos-btn outline sm"
                  style={{ marginTop: '8px' }}
                  onClick={() =>
                    setMmEditVariants((prev) => [...prev, { id: uid(), label: '', price: 0 }])
                  }
                >
                  ➕ Add size
                </button>
              </div>

              <button className="pos-btn lg" style={{ marginTop: '8px' }} onClick={saveMenuItem}>
                Save item
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Employee Editor */}
      {empEditing !== null && (
        <div className="pos-modal-overlay pos-no-print" onClick={() => setEmpEditing(null)}>
          <div className="pos-modal" style={{ width: '420px' }} onClick={(e) => e.stopPropagation()}>
            <div className="pos-row-between" style={{ marginBottom: '14px' }}>
              <div className="pos-h2">{empEditing === 'new' ? 'Add Employee' : 'Edit Employee'}</div>
              <button id="close-emp-modal" className="pos-iconbtn" onClick={() => setEmpEditing(null)}>
                ✕
              </button>
            </div>
            <div className="pos-flex-col" style={{ gap: '14px' }}>
              <label className="pos-field">
                <span>Employee Name *</span>
                <input
                  id="emp-name-input"
                  className="pos-input"
                  placeholder="e.g. Tariq Mahmood"
                  value={empName}
                  onChange={(e) => setEmpName(e.target.value)}
                  autoFocus
                />
              </label>

              <label className="pos-field">
                <span>Phone Number</span>
                <input
                  id="emp-phone-input"
                  className="pos-input"
                  placeholder="e.g. +92 301 9876543"
                  value={empPhone}
                  onChange={(e) => setEmpPhone(e.target.value)}
                />
              </label>

              <label className="pos-field">
                <span>Salary ({settings.currency})</span>
                <input
                  id="emp-salary-input"
                  type="text"
                  inputMode="decimal"
                  pattern="[0-9]*"
                  className="pos-input"
                  placeholder="e.g. 35000"
                  value={empSalary}
                  onChange={(e) => setEmpSalary(e.target.value)}
                />
              </label>

              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '8px' }}>
                <button className="pos-btn outline" onClick={() => setEmpEditing(null)}>
                  Cancel
                </button>
                <button id="save-emp-btn" className="pos-btn" onClick={saveEmployee}>
                  💾 Save Employee
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && <div className="pos-toast pos-no-print pos-anim">{toast}</div>}

      {/* Print Area */}
      <PrintArea job={printJob} settings={settings} />
    </div>
  );
}

// Chart Components
function BarChart({ data }: { data: { label: string; value: number }[] }) {
  if (!data.length) return <div className="pos-muted">No data.</div>;
  const w = 560;
  const h = 220;
  const pad = 30;
  const max = Math.max(1, ...data.map((d) => d.value));
  const gap = (w - pad * 2) / data.length;
  const barW = gap * 0.6;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="pos-chart" preserveAspectRatio="none">
      {data.map((d, i) => {
        const bh = max ? (d.value / max) * (h - pad * 2) : 0;
        const x = pad + gap * i + (gap - barW) / 2;
        const y = h - pad - bh;
        return (
          <g key={i}>
            <rect
              x={x}
              y={y}
              width={barW}
              height={Math.max(0, bh)}
              rx={4}
              fill="var(--accent)"
            >
              <title>{`${d.label}: ${d.value}`}</title>
            </rect>
            <text
              x={x + barW / 2}
              y={h - pad + 16}
              fontSize="11"
              fill="var(--text-muted)"
              textAnchor="middle"
            >
              {d.label}
            </text>
          </g>
        );
      })}
      <line x1={pad} y1={h - pad} x2={w - pad} y2={h - pad} stroke="var(--border)" />
    </svg>
  );
}

function LineChart({ data }: { data: { label: string; value: number }[] }) {
  if (!data.length) return <div className="pos-muted">No sales in this period.</div>;
  const w = 560;
  const h = 220;
  const pad = 34;
  const max = Math.max(1, ...data.map((d) => d.value));
  const stepX = data.length > 1 ? (w - pad * 2) / (data.length - 1) : 0;

  const points = data
    .map((d, i) => {
      const x = pad + stepX * i;
      const y = h - pad - (d.value / max) * (h - pad * 2);
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="pos-chart" preserveAspectRatio="none">
      <polyline points={points} fill="none" stroke="var(--accent)" strokeWidth="2" />
      {data.map((d, i) => {
        const x = pad + stepX * i;
        const y = h - pad - (d.value / max) * (h - pad * 2);
        return (
          <g key={i}>
            <circle cx={x} cy={y} r={3} fill="var(--accent)">
              <title>{`${d.label}: ${d.value}`}</title>
            </circle>
            <text x={x} y={h - pad + 16} fontSize="10" fill="var(--text-muted)" textAnchor="middle">
              {d.label}
            </text>
          </g>
        );
      })}
      <line x1={pad} y1={h - pad} x2={w - pad} y2={h - pad} stroke="var(--border)" />
    </svg>
  );
}

function OrdersTable({ orders, currency, compact }: { orders: Order[]; currency: string; compact: boolean }) {
  if (orders.length === 0) return <div className="pos-muted">No orders yet.</div>;
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="pos-table">
        <thead>
          <tr>
            <th>Order</th>
            <th>Customer</th>
            <th>Time</th>
            <th>Total</th>
            <th>Status</th>
            {!compact && <th>Payment</th>}
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id}>
              <td className="pos-mono pos-bold">#{o.orderNumber}</td>
              <td>
                {o.customerName || 'Walk-in'}
                {o.tableNumber ? ` · T${o.tableNumber}` : ''}
              </td>
              <td className="pos-muted">
                {fmtDate(o.createdAt)} {fmtTime(o.createdAt)}
              </td>
              <td className="pos-bold">{fmtMoney(o.total, currency)}</td>
              <td>
                <span className={`pos-badge ${o.stage === 'active' ? 'active' : 'muted'}`}>
                  {o.stage === 'active' ? 'Active' : 'Completed'}
                </span>
              </td>
              {!compact && (
                <td>
                  <span className={`pos-badge ${o.paymentStatus}`}>{o.paymentStatus}</span>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Print Component
function PrintArea({ job, settings }: { job: { type: 'receipt' | 'kot' | 'report'; payload: any } | null; settings: Settings }) {
  if (!job) return <div id="pos-print-area"></div>;
  const { type, payload } = job;
  const isThermal = settings.receiptFormat === 'thermal';

  if (type === 'receipt') {
    const order: Order = payload;
    return (
      <div id="pos-print-area">
        <div
          style={{
            fontFamily: "'Consolas','Courier New',monospace",
            width: isThermal ? '80mm' : '210mm',
            margin: '0 auto',
            padding: isThermal ? '10px' : '24mm',
            color: '#000',
            background: '#fff',
            fontSize: isThermal ? '12px' : '14px',
          }}
        >
          <div style={{ textAlign: 'center', marginBottom: '10px' }}>
            <div style={{ fontSize: isThermal ? '16px' : '22px', fontWeight: 700 }}>
              {settings.restaurantName}
            </div>
            <div style={{ fontSize: isThermal ? '10px' : '12px' }}>{settings.address}</div>
            <div style={{ fontSize: isThermal ? '10px' : '12px' }}>{settings.phone}</div>
          </div>
          <div style={{ borderTop: '1px dashed #000', borderBottom: '1px dashed #000', padding: '6px 0', margin: '8px 0' }}>
            <div>Order #: {order.orderNumber}</div>
            <div>Customer: {order.customerName || 'Walk-in'}</div>
            {order.tableNumber && <div>Table: {order.tableNumber}</div>}
            <div>
              Date: {fmtDate(order.createdAt)} {fmtTime(order.createdAt)}
            </div>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <td>Item</td>
                <td style={{ textAlign: 'center' }}>Qty</td>
                <td style={{ textAlign: 'right' }}>Amt</td>
              </tr>
            </thead>
            <tbody>
              {order.items.map((it) => (
                <tr key={it.id}>
                  <td>
                    {it.name} ({it.variantLabel})
                  </td>
                  <td style={{ textAlign: 'center' }}>{it.qty}</td>
                  <td style={{ textAlign: 'right' }}>{it.price * it.qty}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ borderTop: '1px dashed #000', marginTop: '8px', paddingTop: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Subtotal</span>
              <span>{order.subtotal}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Discount</span>
              <span>{order.discount}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: isThermal ? '14px' : '16px' }}>
              <span>Total</span>
              <span>
                {settings.currency} {order.total}
              </span>
            </div>
            <div style={{ marginTop: '6px' }}>Payment: {order.paymentStatus.toUpperCase()}</div>
          </div>
          <div style={{ textAlign: 'center', marginTop: '14px', fontSize: isThermal ? '11px' : '13px' }}>
            {settings.receiptFooter}
          </div>
        </div>
      </div>
    );
  }

  if (type === 'kot') {
    const order: Order = payload;
    return (
      <div id="pos-print-area">
        <div
          style={{
            fontFamily: "'Consolas','Courier New',monospace",
            width: '80mm',
            margin: '0 auto',
            padding: '10px',
            color: '#000',
            background: '#fff',
            fontSize: '13px',
          }}
        >
          <div style={{ textAlign: 'center', fontWeight: 700, fontSize: '16px' }}>KITCHEN ORDER TICKET</div>
          <div style={{ textAlign: 'center', fontSize: '11px' }}>{settings.restaurantName}</div>
          <div style={{ borderTop: '1px dashed #000', margin: '8px 0', paddingTop: '6px' }}>
            <div>Order #: {order.orderNumber}</div>
            {order.tableNumber && <div>Table: {order.tableNumber}</div>}
            <div>Time: {fmtTime(order.createdAt)}</div>
          </div>
          <div style={{ borderTop: '1px dashed #000', marginTop: '6px', paddingTop: '6px' }}>
            {order.items.map((it) => (
              <div key={it.id} style={{ marginBottom: '8px' }}>
                <div style={{ fontWeight: 700 }}>
                  {it.qty}× {it.name} — {it.variantLabel}
                </div>
                {it.notes && <div style={{ fontStyle: 'italic' }}>Note: {it.notes}</div>}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (type === 'report') {
    const { filtered, revenue, avg, paid, unpaid, bestSellers: bSellers, range } = payload;
    return (
      <div id="pos-print-area">
        <div style={{ fontFamily: 'sans-serif', width: '210mm', margin: '0 auto', padding: '24mm', color: '#000', background: '#fff' }}>
          <h1 style={{ fontSize: '22px' }}>{settings.restaurantName} — Sales report</h1>
          <div style={{ marginBottom: '14px', fontSize: '13px' }}>
            Range: {range} · Generated {fmtDate(new Date().toISOString())} {fmtTime(new Date().toISOString())}
          </div>
          <div style={{ display: 'flex', gap: '20px', marginBottom: '16px', fontSize: '13px' }}>
            <div>
              Total orders: <b>{filtered.length}</b>
            </div>
            <div>
              Revenue: <b>{fmtMoney(revenue, settings.currency)}</b>
            </div>
            <div>
              Paid: <b>{paid.length}</b>
            </div>
            <div>
              Unpaid: <b>{unpaid.length}</b>
            </div>
            <div>
              Avg order: <b>{fmtMoney(Math.round(avg), settings.currency)}</b>
            </div>
          </div>
          <h3>Best selling items</h3>
          <ul>
            {bSellers.map(([name, qty]: [string, number]) => (
              <li key={name}>
                {name} — {qty} sold
              </li>
            ))}
          </ul>
          <h3>Orders</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #000', padding: '4px' }}>Order</th>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #000', padding: '4px' }}>Customer</th>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #000', padding: '4px' }}>Date</th>
                <th style={{ textAlign: 'right', borderBottom: '1px solid #000', padding: '4px' }}>Total</th>
                <th style={{ textAlign: 'left', borderBottom: '1px solid #000', padding: '4px' }}>Payment</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((o: Order) => (
                <tr key={o.id}>
                  <td style={{ padding: '4px' }}>#{o.orderNumber}</td>
                  <td style={{ padding: '4px' }}>{o.customerName || 'Walk-in'}</td>
                  <td style={{ padding: '4px' }}>{fmtDate(o.createdAt)}</td>
                  <td style={{ padding: '4px', textAlign: 'right' }}>{o.total}</td>
                  <td style={{ padding: '4px' }}>{o.paymentStatus}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return null;
}
