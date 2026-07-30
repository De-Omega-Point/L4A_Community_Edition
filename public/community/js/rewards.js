import { addActivity, appState, customerTierForPoints, getCustomerById, rewardReady, saveData } from './state.js';
import { nowIso } from './utils.js';

export function handleScan(inputValue) {
  const token = String(inputValue || document.getElementById('scanInput').value).trim();
  if (!token) return null;
  const customer = appState.customers.find(item => String(item.token).toLowerCase() === token.toLowerCase()) || null;
  if (customer) appState.currentCustomerId = customer.id;
  return customer;
}

export function addVisit(customerId = appState.currentCustomerId) {
  const customer = getCustomerById(customerId);
  if (!customer) return false;
  const points = Math.max(1, Number(appState.branding.pointsPerVisit || 5));
  customer.visits = Number(customer.visits || 0) + 1;
  customer.points = Number(customer.points || 0) + points;
  customer.tier = customerTierForPoints(customer.points);
  customer.lastInteractionAt = nowIso();
  addActivity('visit', customer.id, `Visit recorded (+${points} points)`);
  saveData();
  return customer;
}

export function addNote(text = document.getElementById('counterNote').value, customerId = appState.currentCustomerId) {
  const customer = getCustomerById(customerId);
  const note = String(text || '').trim();
  if (!customer || !note) return false;
  customer.notes = customer.notes || [];
  customer.notes.unshift({ text: note, at: nowIso() });
  customer.lastInteractionAt = nowIso();
  addActivity('note', customer.id, note);
  saveData();
  return customer;
}

export function addBonusPoints(customerId = appState.currentCustomerId, points = null) {
  const customer = getCustomerById(customerId);
  if (!customer) return false;
  const amount = points ?? Number(prompt('Bonus points to add:', String(appState.branding.pointsPerVisit || 5)));
  if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) return false;
  customer.points = Number(customer.points || 0) + Math.round(Number(amount));
  customer.tier = customerTierForPoints(customer.points);
  customer.lastInteractionAt = nowIso();
  addActivity('bonus_points', customer.id, `Added ${Math.round(Number(amount))} bonus points`);
  saveData();
  return customer;
}

export function redeemReward(customerId = appState.currentCustomerId) {
  const customer = getCustomerById(customerId);
  if (!customer || !rewardReady(customer)) return false;
  const threshold = Math.max(1, Number(appState.branding.rewardThreshold || 50));
  const description = appState.branding.rewardName || 'Reward';
  customer.points = Math.max(0, Number(customer.points || 0) - threshold);
  customer.tier = customerTierForPoints(customer.points);
  customer.redemptions = customer.redemptions || [];
  customer.redemptions.unshift({ at: nowIso(), description, pointsUsed: threshold });
  customer.lastInteractionAt = nowIso();
  addActivity('reward_redeemed', customer.id, description);
  saveData();
  return customer;
}
