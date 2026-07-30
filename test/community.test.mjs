import test from 'node:test';
import assert from 'node:assert/strict';

class MemoryStorage {
  #values = new Map();
  getItem(key) { return this.#values.has(key) ? this.#values.get(key) : null; }
  setItem(key, value) { this.#values.set(key, String(value)); }
  removeItem(key) { this.#values.delete(key); }
  clear() { this.#values.clear(); }
}

globalThis.localStorage = new MemoryStorage();

const registration = await import('../js/registration.js');
const state = await import('../js/state.js');
const rewards = await import('../js/rewards.js');

test('Product IDs use the Community Edition format and avoid ambiguous characters', () => {
  const ids = new Set(Array.from({ length: 100 }, () => registration.generateProductId()));
  assert.equal(ids.size, 100);
  for (const id of ids) assert.match(id, /^LFA-CE-[2-9A-HJ-NP-Z]{8}$/);
});

test('Registration records can be saved and recovered locally', () => {
  const record = {
    productId: registration.generateProductId(),
    businessName: 'Test Café',
    contactName: 'Test Owner',
    email: 'owner@example.com'
  };
  registration.saveRegistration(record);
  assert.deepEqual(registration.loadRegistration(), record);
});

test('Visits add configured points and rewards redeem at the threshold', () => {
  localStorage.clear();
  state.appState.customers = [{
    id: 'cust_test',
    token: 'CUST-TEST01',
    name: 'Test Customer',
    visits: 0,
    points: 0,
    tier: 'Standard',
    redemptions: []
  }];
  state.appState.activity = [];
  state.appState.branding.pointsPerVisit = 5;
  state.appState.branding.rewardThreshold = 10;
  state.appState.branding.rewardName = 'Free coffee';

  rewards.addVisit('cust_test');
  rewards.addVisit('cust_test');
  assert.equal(state.appState.customers[0].visits, 2);
  assert.equal(state.appState.customers[0].points, 10);
  assert.equal(state.rewardReady(state.appState.customers[0]), true);

  rewards.redeemReward('cust_test');
  assert.equal(state.appState.customers[0].points, 0);
  assert.equal(state.appState.customers[0].redemptions.length, 1);
  assert.equal(state.appState.customers[0].redemptions[0].description, 'Free coffee');
});

test('Demo mode restores the prior local records', () => {
  state.appState.customers = [{ id: 'cust_real', token: 'CUST-REAL01', name: 'Real Customer', visits: 1, points: 5 }];
  state.appState.activity = [];
  state.appState.demoMode = false;
  state.saveData();

  state.loadDemoData();
  assert.equal(state.appState.demoMode, true);
  assert.equal(state.appState.customers.every(customer => customer.isDemo), true);

  state.clearDemoData();
  assert.equal(state.appState.demoMode, false);
  assert.equal(state.appState.customers.length, 1);
  assert.equal(state.appState.customers[0].name, 'Real Customer');
});

test('Backups expose the current schema and omit product registration', () => {
  const backup = state.serialisableState();
  assert.equal(backup.schemaVersion, 4);
  assert.ok(Array.isArray(backup.customers));
  assert.equal('productId' in backup, false);
  assert.equal('email' in backup, false);
});
