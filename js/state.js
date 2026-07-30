import { uid, nowIso } from './utils.js';

export const storageKeys = {
  data: 'loyalty4all.data.v4',
  legacyData: 'loyalty4all.data.v3',
  branding: 'loyalty4all.branding.v4',
  legacyBranding: 'loyalty4all.branding.v3',
  demoBackup: 'loyalty4all.demo-backup.v1'
};

export const appState = {
  customers: [],
  activity: [],
  currentCustomerId: null,
  selectedCrmCustomerId: null,
  camera: { stream: null, scanning: false, detector: null, frameTimer: null },
  branding: {
    businessName: 'Loyalty for All',
    brandColour: '#176b43',
    brandLogo: '',
    pointsPerVisit: 5,
    rewardThreshold: 50,
    rewardName: 'Free reward'
  },
  demoMode: false
};

export function serialisableState() {
  return {
    schemaVersion: 4,
    exportedAt: nowIso(),
    customers: appState.customers,
    activity: appState.activity,
    branding: appState.branding
  };
}

export function saveData() {
  localStorage.setItem(storageKeys.data, JSON.stringify({
    schemaVersion: 4,
    customers: appState.customers,
    activity: appState.activity,
    demoMode: appState.demoMode
  }));
}

export function loadData() {
  try {
    const raw = localStorage.getItem(storageKeys.data) || localStorage.getItem(storageKeys.legacyData) || '{}';
    const parsed = JSON.parse(raw);
    appState.customers = Array.isArray(parsed.customers) ? parsed.customers : [];
    appState.activity = Array.isArray(parsed.activity) ? parsed.activity : [];
    appState.demoMode = Boolean(parsed.demoMode);
    if (!localStorage.getItem(storageKeys.data) && (appState.customers.length || appState.activity.length)) saveData();
  } catch {
    appState.customers = [];
    appState.activity = [];
  }
}

export function addActivity(type, customerId, details = '') {
  appState.activity.unshift({ id: uid('act'), type, customerId, details, at: nowIso() });
  appState.activity = appState.activity.slice(0, 500);
  saveData();
}

export function getCustomerById(id) {
  return appState.customers.find(customer => customer.id === id) || null;
}

export function findCustomerByToken(token) {
  const normalised = String(token || '').trim().toLowerCase();
  return appState.customers.find(customer => String(customer.token || '').toLowerCase() === normalised) || null;
}

export function customerTierForPoints(points) {
  if (points >= appState.branding.rewardThreshold * 2) return 'VIP';
  if (points >= appState.branding.rewardThreshold) return 'Regular';
  return 'Standard';
}

export function rewardReady(customer) {
  return Number(customer?.points || 0) >= Number(appState.branding.rewardThreshold || 50);
}

export function loadDemoData() {
  if (!appState.demoMode) {
    localStorage.setItem(storageKeys.demoBackup, JSON.stringify(serialisableState()));
  }
  const now = nowIso();
  appState.customers = [
    { id: uid('demo'), token: 'CUST-DEMO01', name: 'Alex Morgan', email: '', phone: '', contactConsent: false, tier: 'Regular', points: 45, visits: 9, notes: [], redemptions: [], createdAt: now, lastInteractionAt: now, isDemo: true },
    { id: uid('demo'), token: 'CUST-DEMO02', name: 'Jordan Lee', email: '', phone: '', contactConsent: false, tier: 'VIP', points: 85, visits: 17, notes: [], redemptions: [{ at: now, description: 'Free reward' }], createdAt: now, lastInteractionAt: now, isDemo: true }
  ];
  appState.activity = [
    { id: uid('act'), type: 'visit', customerId: appState.customers[0].id, details: 'Demo visit', at: now },
    { id: uid('act'), type: 'reward_redeemed', customerId: appState.customers[1].id, details: 'Demo reward', at: now }
  ];
  appState.demoMode = true;
  saveData();
}

export function clearDemoData() {
  try {
    const backup = JSON.parse(localStorage.getItem(storageKeys.demoBackup) || 'null');
    if (backup) {
      appState.customers = Array.isArray(backup.customers) ? backup.customers : [];
      appState.activity = Array.isArray(backup.activity) ? backup.activity : [];
      if (backup.branding) appState.branding = { ...appState.branding, ...backup.branding };
    } else {
      appState.customers = appState.customers.filter(customer => !customer.isDemo);
      const remainingIds = new Set(appState.customers.map(customer => customer.id));
      appState.activity = appState.activity.filter(activity => remainingIds.has(activity.customerId));
    }
  } catch {
    appState.customers = [];
    appState.activity = [];
  }
  appState.demoMode = false;
  localStorage.removeItem(storageKeys.demoBackup);
  saveData();
}
