import { addActivity, appState, customerTierForPoints, findCustomerByToken, pendingSurpriseReward, standardRewardReady, updateState } from './state.js';
import { nowIso, uid } from './utils.js';
function dayKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function randomWinner(oneIn) {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return values[0] % oneIn === 0;
}
export function handleScan(inputValue) {
  const raw = String(inputValue ?? document.getElementById('scanInput')?.value ?? '').trim();
  const customer = raw ? findCustomerByToken(raw) : null;
  appState.currentCustomerId = customer?.id || null;
  return customer;
}
function rollSurprise(draft, customer) {
  if (!draft.branding.surpriseEnabled || pendingSurpriseReward(customer)) return null;
  const today = dayKey();
  if (customer.lastSurpriseRollDate === today) return null;
  customer.lastSurpriseRollDate = today;
  if (!randomWinner(draft.branding.surpriseChance)) return null;
  const award = { id: uid('surprise'), description: draft.branding.surpriseRewardName, awardedAt: nowIso(), redeemedAt: null };
  customer.surpriseRewards.unshift(award);
  addActivity(draft, 'surprise_reward', customer.id, award.description);
  return award;
}
export function rollSurpriseReward(customerId = appState.currentCustomerId) {
  return updateState(draft => {
    const customer = draft.customers.find(item => item.id === customerId);
    return customer ? rollSurprise(draft, customer) : null;
  });
}
export function addVisit(customerId = appState.currentCustomerId) {
  return updateState(draft => {
    const customer = draft.customers.find(item => item.id === customerId);
    if (!customer) return null;
    const points = draft.branding.pointsPerVisit;
    customer.visits += 1; customer.points += points;
    customer.tier = customerTierForPoints(customer.points, draft.branding);
    customer.lastVisitAt = customer.lastInteractionAt = nowIso();
    addActivity(draft, 'visit', customer.id, `Visit recorded (+${points} ${points === 1 ? 'point' : 'points'})`);
    return { customer, surpriseAward: rollSurprise(draft, customer) };
  });
}
export function addNote(text = document.getElementById('counterNote')?.value, customerId = appState.currentCustomerId) {
  const note = String(text || '').trim().slice(0, 500);
  return updateState(draft => {
    const customer = draft.customers.find(item => item.id === customerId);
    if (!customer || !note) return false;
    customer.notes.unshift({ text: note, at: nowIso() });
    customer.lastInteractionAt = nowIso();
    addActivity(draft, 'note', customer.id, note);
    return customer;
  });
}
export function addBonusPoints(customerId = appState.currentCustomerId, points = null) {
  const amount = Number(points);
  return updateState(draft => {
    const customer = draft.customers.find(item => item.id === customerId);
    if (!customer || !Number.isSafeInteger(amount) || amount <= 0) return false;
    customer.points += amount;
    customer.tier = customerTierForPoints(customer.points, draft.branding);
    customer.lastInteractionAt = nowIso();
    addActivity(draft, 'bonus_points', customer.id, `Added ${amount} bonus points`);
    return customer;
  });
}
export function redeemReward(customerId = appState.currentCustomerId) {
  return updateState(draft => {
    const customer = draft.customers.find(item => item.id === customerId);
    if (!customer) return null;
    const surprise = pendingSurpriseReward(customer);
    if (surprise) {
      surprise.redeemedAt = nowIso();
      customer.lastInteractionAt = surprise.redeemedAt;
      addActivity(draft, 'surprise_redeemed', customer.id, surprise.description);
      return { customer, description: surprise.description, type: 'surprise' };
    }
    if (!standardRewardReady(customer, draft.branding)) return null;
    const threshold = draft.branding.rewardThreshold;
    const description = draft.branding.rewardName;
    customer.points -= threshold;
    customer.tier = customerTierForPoints(customer.points, draft.branding);
    customer.redemptions.unshift({ at: nowIso(), description, pointsUsed: threshold });
    customer.lastInteractionAt = nowIso();
    addActivity(draft, 'reward_redeemed', customer.id, description);
    return { customer, description, type: 'standard' };
  });
}
