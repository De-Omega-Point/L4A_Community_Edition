import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { memberRewardTracking, memberDashboardData, filterDashboardMembers, renderMemberDashboard } from '../public/community/js/member-dashboard.js';
import { appState, loadData, restoreBackup, getCustomerById } from '../public/community/js/state.js';
import { addVisit, redeemReward } from '../public/community/js/rewards.js';
import { defaultBranding, normaliseBackup } from '../public/community/js/data-schema.js';
import { memoryStorage, installLocks, installDom } from './helpers/local-storage.mjs';

const now = Date.parse('2026-10-30T12:00:00Z');
const day = 86400000;
const customer = (id, days = null, extras = {}) => ({
  id, name: id, token: `CUST-${id.toUpperCase()}`, visits: days === null ? 0 : 1, points: 3,
  lastVisitAt: days === null ? '' : new Date(now - days * day).toISOString(),
  notes: [], redemptions: [], surpriseRewards: [], ...extras
});
test('dashboard is empty for a fresh workspace and excludes every demo record', () => {
  assert.deepEqual(memberDashboardData([], [], defaultBranding, now), { members: [], active: 0, points: 0, ready: 0, given: 0, surprisePending: 0 });
  assert.equal(memberDashboardData([customer('demo', 0, { isDemo: true })], [], defaultBranding, now).members.length, 0);
});
test('activity window matches existing CRM whole-day boundary without treating new members as active', () => {
  const result = memberDashboardData([customer('new'), customer('today', 0), customer('edge', 30.99), customer('cooling', 31), customer('old', 46)], [], defaultBranding, now);
  assert.equal(result.active, 2);
  assert.deepEqual(result.members.map(member => member.status.key), ['active', 'active', 'cooling', 'follow-up', 'new']);
});
test('legacy activity fallback uses visit records, never notes or signup dates', () => {
  const customers = [customer('visitor', null, { visits: 2 }), customer('note', null, { visits: 1 })];
  const activity = [{ customerId: 'visitor', type: 'visit', at: new Date(now).toISOString() }, { customerId: 'note', type: 'note', at: new Date(now).toISOString() }];
  const result = memberDashboardData(customers, activity, defaultBranding, now);
  assert.equal(result.active, 1);
  assert.equal(result.members[0].customer.id, 'visitor');
  assert.equal(result.members[1].lastVisit, null);
});
test('totals use current balances and configured reward threshold, including pending surprise rewards', () => {
  const result = memberDashboardData([customer('a', 0, { points: 5 }), customer('b', 50, { points: 0, surpriseRewards: [{ redeemedAt: null }] })], [], { ...defaultBranding, rewardThreshold: 5 }, now);
  assert.equal(result.points, 5);
  assert.equal(result.ready, 2);
  assert.equal(result.active, 1);
});
test('filter and search are case-insensitive, preserve source records, and handle no matches', () => {
  const customers = [customer('Alex', 0), customer('Blair', 50)];
  const before = JSON.stringify(customers);
  const data = memberDashboardData(customers, [], defaultBranding, now);
  assert.equal(filterDashboardMembers(data.members, 'active', '').length, 1);
  assert.equal(filterDashboardMembers(data.members, 'all', 'cust-BLAIR')[0].customer.id, 'Blair');
  assert.equal(filterDashboardMembers(data.members, 'all', 'missing').length, 0);
  assert.equal(JSON.stringify(customers), before);
});
test('rendering escapes member content and never awards points', () => {
  const element = installDom();
  appState.customers = [customer('safe', 0, { name: '<img onerror=bad>', points: 5 })];
  appState.activity = [];
  appState.branding = { ...defaultBranding, pointsPerVisit: 2 };
  element('memberFilter').value = 'all';
  renderMemberDashboard();
  renderMemberDashboard();
  assert.equal(appState.customers[0].points, 5);
  assert.match(element('memberList').innerHTML, /&lt;img onerror=bad&gt;/);
  assert.doesNotMatch(element('memberList').innerHTML, /<img/);
  assert.match(element('memberPointsRule').textContent, /2 points.*no daily visit limit/);
});
test('every deliberate same-day check-in earns configured points and survives backup normalization', async () => {
  globalThis.localStorage = memoryStorage(); globalThis.indexedDB = undefined;
  installLocks(); installDom();
  await loadData();
  await restoreBackup({ schemaVersion: 7, customers: [customer('repeat', null, { points: 0 })], activity: [], branding: { ...defaultBranding, pointsPerVisit: 2.5 } });
  await addVisit('repeat'); await addVisit('repeat'); await addVisit('repeat');
  const saved = getCustomerById('repeat');
  assert.equal(saved.visits, 3); assert.equal(saved.points, 7.5);
  assert.equal(appState.activity.filter(entry => entry.type === 'visit').length, 3);
  const backup = normaliseBackup({ customers: appState.customers, activity: appState.activity, branding: appState.branding });
  assert.equal(backup.customers[0].points, 7.5);
  assert.equal(memberDashboardData(backup.customers, backup.activity, backup.branding).active, 1);
});
test('dashboard has labelled controls, local-only explanation and complete versioned offline shell', () => {
  const html = readFileSync('public/community/index.html', 'utf8');
  assert.match(html, /label for="memberFilter"/);
  assert.match(html, /label for="memberSearch"/);
  assert.match(html, /Demo customers are excluded/);
  const sw = readFileSync('public/community/service-worker.js', 'utf8');
  assert.match(sw, /\.\/js\/member-dashboard.js/);
  const app = readFileSync('public/community/js/app.js', 'utf8');
  assert.match(app, /if \(pending\) return/);
  assert.match(app, /selectCounterCustomer\(getCustomerById\(event.detail.customerId\)\)\) showScreen\('counter'\)/);
});

test('award history separates eligibility, given standard rewards, and earned or collected surprise awards', () => {
  const result = memberRewardTracking(customer('awards', 0, {
    points: 12, redemptions: [{ description: 'Older reward' }, { pointsUsed: 10 }],
    surpriseRewards: [{ redeemedAt: null }, { redeemedAt: '2026-10-01T00:00:00Z' }]
  }), { ...defaultBranding, rewardThreshold: 10 });
  assert.deepEqual(result, { threshold: 10, progress: 10, remaining: 0, standardGiven: 2, surpriseEarned: 2, surpriseGiven: 1, surprisePending: 1, given: 3 });
  assert.equal(memberRewardTracking(customer('new', null), defaultBranding).given, 0);
});

test('giving a reward updates dashboard history and a restored backup retains the owner rules and awards', async () => {
  globalThis.localStorage = memoryStorage(); globalThis.indexedDB = undefined;
  installLocks(); installDom(); await loadData();
  const branding = { ...defaultBranding, pointsPerVisit: 4, rewardThreshold: 8, rewardName: 'Owner chosen reward' };
  await restoreBackup({ schemaVersion: 7, customers: [customer('loyal', 0, { points: 12 })], activity: [], branding });
  await redeemReward('loyal');
  const result = memberDashboardData(appState.customers, appState.activity, appState.branding);
  assert.equal(result.given, 1);
  assert.equal(result.members[0].rewards.standardGiven, 1);
  assert.equal(result.members[0].rewards.remaining, 4);
  assert.equal(result.points, 4);
  const backup = structuredClone({ schemaVersion: 7, customers: appState.customers, activity: appState.activity, branding: appState.branding });
  await restoreBackup(backup);
  assert.equal(appState.branding.pointsPerVisit, 4);
  assert.equal(appState.branding.rewardThreshold, 8);
  assert.equal(appState.branding.rewardName, 'Owner chosen reward');
  assert.equal(memberDashboardData(appState.customers, appState.activity, appState.branding).given, 1);
  assert.equal(appState.customers[0].redemptions[0].description, 'Owner chosen reward');
});
