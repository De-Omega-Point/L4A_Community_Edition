// One validator for imports, migrations and writes. Invalid records are never repaired by deletion.
export const MAX_BACKUP_BYTES = 20 * 1024 * 1024;
export const defaultBranding = Object.freeze({
  businessName: 'My Business', brandColour: '#07865f', brandLogo: '', pointsPerVisit: 1,
  rewardThreshold: 10, rewardName: 'Free reward', surpriseEnabled: false,
  surpriseChance: 20, surpriseRewardName: 'Surprise reward', productId: ''
});
const ID = /^[A-Za-z0-9_-]{1,80}$/;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function invalid(field) { throw new Error(`Invalid backup: check ${field}. Your existing records have not been replaced.`); }
function text(value, field, max, fallback = '') {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== 'string' || value.length > max) invalid(field);
  return value;
}
function number(value, field, min = 0, max = Number.MAX_SAFE_INTEGER, fallback = 0) {
  const result = value === undefined ? fallback : value;
  if (typeof result !== 'number' || !Number.isFinite(result) || result < min || result > max) invalid(field);
  return result;
}
function integer(value, field, min = 0, max = Number.MAX_SAFE_INTEGER, fallback = 0) {
  const number = value === undefined ? fallback : value;
  if (typeof number !== 'number' || !Number.isSafeInteger(number) || number < min || number > max) invalid(field);
  return number;
}
function flag(value, field) {
  if (value === undefined) return false;
  if (typeof value !== 'boolean') invalid(field);
  return value;
}
function date(value, field) {
  if (value === undefined || value === null || value === '') return '';
  const result = text(value, field, 40);
  if (!Number.isFinite(Date.parse(result))) invalid(field);
  return result;
}
function list(value, field, max = 50000) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > max || value.some(item => !object(item))) invalid(field);
  return value;
}
function id(value, field) {
  if (typeof value !== 'string' || !ID.test(value)) invalid(field);
  return value;
}
export function normaliseToken(value) {
  return String(value ?? '').trim().toUpperCase().replace(/\s+/g, '-');
}
export function normaliseBranding(value = {}, base = defaultBranding) {
  if (!object(value)) invalid('business settings');
  const branding = { ...defaultBranding, ...base, ...value };
  const logo = text(branding.brandLogo, 'logo', 900000);
  if (logo && !/^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=\s]+$/i.test(logo)) {
    try { if (!['https:', 'http:'].includes(new URL(logo, globalThis.location?.href || 'https://local.invalid/').protocol)) invalid('logo address'); } catch { invalid('logo address'); }
  }
  const colour = text(branding.brandColour, 'brand colour', 7);
  if (!/^#[0-9a-f]{6}$/i.test(colour)) invalid('brand colour');
  const chance = integer(branding.surpriseChance, 'surprise odds', 1, 50, 20);
  if (![10, 20, 50].includes(chance)) invalid('surprise odds');
  return {
    businessName: text(branding.businessName, 'business name', 120).trim() || 'My Business',
    brandColour: colour, brandLogo: logo,
    pointsPerVisit: number(branding.pointsPerVisit, 'points per visit', 1, 100, 1),
    rewardThreshold: number(branding.rewardThreshold, 'reward threshold', 1, 10000, 10),
    rewardName: text(branding.rewardName, 'reward name', 80).trim() || 'Free reward',
    surpriseEnabled: flag(branding.surpriseEnabled, 'surprise setting'), surpriseChance: chance,
    surpriseRewardName: text(branding.surpriseRewardName, 'surprise reward name', 80).trim() || 'Surprise reward',
    productId: text(branding.productId, 'business identity', 100)
  };
}
export function normaliseBackup(input, baseBranding = defaultBranding) {
  if (!object(input)) invalid('file contents');
  if (input.schemaVersion !== undefined && ![3, 4, 5, 6, 7].includes(input.schemaVersion)) invalid('backup version');
  const parsed = input.data && !input.customers ? { ...input, customers: input.data, activity: input.activity ?? [] } : input;
  if (!Array.isArray(parsed.customers) || !Array.isArray(parsed.activity)) invalid('customer and activity lists');
  const ids = new Set();
  const tokens = new Set();
  const customers = list(parsed.customers, 'customers', 10000).map(customer => {
    const customerId = id(customer.id, 'customer ID');
    const name = text(customer.name, 'customer name', 120).trim();
    const token = normaliseToken(text(customer.token, 'customer code', 40));
    if (!name || !/^[A-Z0-9][A-Z0-9_-]{0,39}$/.test(token) || ids.has(customerId) || tokens.has(token)) invalid('unique customer IDs and codes');
    ids.add(customerId); tokens.add(token);
    const notes = list(customer.notes, 'notes').map(note => ({ text: text(note.text, 'note', 500), at: date(note.at, 'note date') }));
    const redemptions = list(customer.redemptions, 'redemptions').map(reward => ({
      at: date(reward.at, 'redemption date'), description: text(reward.description, 'reward description', 500),
      ...(reward.pointsUsed === undefined ? {} : { pointsUsed: number(reward.pointsUsed, 'redeemed points', 1) })
    }));
    const surpriseIds = new Set();
    const surpriseRewards = list(customer.surpriseRewards, 'surprise rewards').map(reward => {
      const rewardId = id(reward.id, 'surprise reward ID');
      if (surpriseIds.has(rewardId)) invalid('unique surprise reward IDs');
      surpriseIds.add(rewardId);
      return { id: rewardId, description: text(reward.description, 'surprise description', 500), awardedAt: date(reward.awardedAt, 'award date'), redeemedAt: date(reward.redeemedAt, 'award redemption date') || null };
    });
    const rollDate = text(customer.lastSurpriseRollDate, 'surprise draw date', 10);
    if (rollDate && (!/^\d{4}-\d{2}-\d{2}$/.test(rollDate) || !Number.isFinite(Date.parse(rollDate)))) invalid('surprise draw date');
    return {
      id: customerId, name, token, email: text(customer.email, 'email', 254), phone: text(customer.phone, 'phone', 40),
      contactConsent: flag(customer.contactConsent, 'contact consent'), visits: integer(customer.visits, 'visits'),
      points: number(customer.points, 'points'), tier: text(customer.tier, 'customer tier', 40, 'Standard'),
      notes, redemptions, surpriseRewards, createdAt: date(customer.createdAt, 'created date'),
      lastInteractionAt: date(customer.lastInteractionAt, 'last interaction'), lastVisitAt: date(customer.lastVisitAt, 'last visit'),
      lastSurpriseRollDate: rollDate, ...(customer.isDemo === undefined ? {} : { isDemo: flag(customer.isDemo, 'demo flag') })
    };
  });
  const activityIds = new Set();
  const activity = list(parsed.activity, 'activity').map(entry => {
    const entryId = id(entry.id, 'activity ID');
    if (activityIds.has(entryId)) invalid('unique activity IDs');
    activityIds.add(entryId);
    return { id: entryId, customerId: id(entry.customerId, 'activity customer ID'), type: text(entry.type, 'activity type', 80), details: text(entry.details, 'activity details', 1000), at: date(entry.at, 'activity date') };
  }).sort((a, b) => Date.parse(b.at || 0) - Date.parse(a.at || 0));
  const lastVisits = new Map();
  for (const entry of activity) if (entry.type === 'visit' && !lastVisits.has(entry.customerId)) lastVisits.set(entry.customerId, entry.at);
  for (const customer of customers) {
    const recent = lastVisits.get(customer.id);
    if (recent && (!customer.lastVisitAt || Date.parse(recent) > Date.parse(customer.lastVisitAt))) customer.lastVisitAt = recent;
  }
  const result = { customers, activity, branding: normaliseBranding(parsed.branding ?? {}, baseBranding) };
  if (new TextEncoder().encode(JSON.stringify(result)).length > MAX_BACKUP_BYTES - 4096) invalid('backup size (maximum 20 MB)');
  return result;
}
export function normaliseSnapshot(value, baseBranding = defaultBranding) {
  const snapshot = normaliseBackup(value, baseBranding);
  snapshot.demoMode = flag(value.demoMode, 'demo mode');
  snapshot.demoBackup = value.demoBackup == null ? null : normaliseBackup(value.demoBackup, baseBranding);
  if (snapshot.demoMode && !snapshot.demoBackup) invalid('demo restore point');
  return snapshot;
}
