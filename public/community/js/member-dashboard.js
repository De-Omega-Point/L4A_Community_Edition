import { crmStatus, lastVisitAt } from './crm.js';
import { appState, standardRewardReady, pendingSurpriseReward } from './state.js';
import { escapeHtml } from './utils.js';

export function memberRewardTracking(customer, branding) {
  const threshold = Math.max(1, Number(branding.rewardThreshold || 10));
  const points = Number(customer.points || 0);
  const surprises = customer.surpriseRewards || [];
  const standardGiven = (customer.redemptions || []).length;
  const surpriseGiven = surprises.filter(award => award.redeemedAt).length;
  return {
    threshold, progress: Math.min(points, threshold), remaining: Math.max(0, threshold - points),
    standardGiven, surpriseEarned: surprises.length, surpriseGiven,
    surprisePending: surprises.length - surpriseGiven,
    given: standardGiven + surpriseGiven
  };
}

// Read-only projection: no new storage fields, inferred visits, or point awards.
export function memberDashboardData(customers, activity, branding, now = Date.now()) {
  const members = customers.filter(customer => !customer.isDemo).map(customer => ({
    customer,
    status: crmStatus(customer, now, activity),
    lastVisit: lastVisitAt(customer, activity),
    ready: Boolean(standardRewardReady(customer, branding) || pendingSurpriseReward(customer)),
    rewards: memberRewardTracking(customer, branding)
  })).sort((a, b) => (Date.parse(b.lastVisit) || 0) - (Date.parse(a.lastVisit) || 0) || a.customer.name.localeCompare(b.customer.name));
  return {
    members,
    active: members.filter(member => member.status.key === 'active').length,
    points: members.reduce((sum, { customer }) => sum + Number(customer.points || 0), 0),
    ready: members.filter(member => member.ready).length,
    given: members.reduce((sum, member) => sum + member.rewards.given, 0),
    surprisePending: members.reduce((sum, member) => sum + member.rewards.surprisePending, 0)
  };
}

export function filterDashboardMembers(members, filter, query) {
  const search = String(query || '').trim().toLocaleLowerCase();
  return members.filter(({ customer, status }) =>
    (filter !== 'active' || status.key === 'active') &&
    (!search || customer.name.toLocaleLowerCase().includes(search) || customer.token.toLocaleLowerCase().includes(search)));
}

function visitLabel(value) {
  const date = new Date(value);
  return value && Number.isFinite(date.getTime()) ? date.toLocaleString() : 'No recorded visit date';
}

export function renderMemberDashboard() {
  const target = document.getElementById('memberList');
  if (!target) return;
  const data = memberDashboardData(appState.customers, appState.activity, appState.branding);
  document.getElementById('memberTotals').innerHTML = [
    [data.active, 'Active · 0–30 days'],
    [data.members.length, 'Total members'],
    [data.points, 'Current points · all members'],
    [data.ready, 'Reward ready · all members'],
    [data.given, 'Rewards given · recorded history'],
    [data.surprisePending, 'Surprise awards awaiting collection']
  ].map(([value, label]) => `<div><strong>${value}</strong><span>${label}</span></div>`).join('');
  const points = Number(appState.branding.pointsPerVisit || 1);
  document.getElementById('memberPointsRule').textContent = `Each recorded visit earns ${points} ${points === 1 ? 'point' : 'points'} — no purchase required. Current settings have no daily visit limit.`;
  const members = filterDashboardMembers(data.members, document.getElementById('memberFilter').value, document.getElementById('memberSearch').value);
  document.getElementById('memberResultCount').textContent = `${members.length} ${members.length === 1 ? 'member' : 'members'} shown · latest visit first`;
  target.innerHTML = members.length ? members.map(({ customer, status, lastVisit, ready, rewards }) => `
    <button class="member-row" type="button" data-cid="${escapeHtml(customer.id)}">
      <span class="member-identity"><strong>${escapeHtml(customer.name)}</strong><span>${escapeHtml(customer.token)}</span><span>${escapeHtml(status.label)}${ready ? ' · Reward ready' : ''}</span></span>
      <span class="member-visit">Last visit: ${escapeHtml(visitLabel(lastVisit))}</span>
      <span class="member-rewards">
        <span><strong>${rewards.progress} / ${rewards.threshold} points</strong> towards ${escapeHtml(appState.branding.rewardName)}</span>
        <span class="member-progress" aria-hidden="true"><span style="width:${Math.round(rewards.progress / rewards.threshold * 100)}%"></span></span>
        <span>${rewards.remaining ? `${rewards.remaining} points to reward` : 'Standard reward ready to give'}</span>
        <span>Standard rewards given: ${rewards.standardGiven}</span>
        <span>Surprise awards earned: ${rewards.surpriseEarned} · pending: ${rewards.surprisePending} · given: ${rewards.surpriseGiven}</span>
      </span>
      <span class="member-balance"><strong>${Number(customer.points || 0)} points</strong><span>${Number(customer.visits || 0)} all-time visits</span><span class="member-open">Open at counter →</span></span>
    </button>`).join('') : `<div class="empty-state"><strong>${data.members.length ? 'No matching members' : 'No members yet'}</strong><span>${data.members.length ? 'Try All members or a different name or code.' : 'Add a customer in Customers, then record their visit at the counter.'}</span></div>`;
  target.querySelectorAll('.member-row').forEach(button => button.addEventListener('click', () => {
    window.dispatchEvent(new CustomEvent('lfa:quick-customer', { detail: { customerId: button.dataset.cid } }));
    document.getElementById('btnCheckIn')?.focus();
  }));
}
