// Injected only by the separate export-smoke feature-gated binary.
addEventListener('DOMContentLoaded', () => setTimeout(async () => {
  const scenario = window.__L4A_SMOKE_SCENARIO__;
  const backup = { schemaVersion: 7, edition: 'community', storageModel: 'local-first', customers: [{ id: 'synthetic-1', name: 'Synthetic Member', token: 'SYNTHETIC-1', points: 7, visits: 3 }], activity: [], branding: {} };
  const json = JSON.stringify(backup);
  const csv = '"Name","Customer Code","Email","Phone","Contact Consent","Visits","Points","Tier","Created"\r\n"Synthetic Member","SYNTHETIC-1","","","false","3","7","","2026-11-01"';
  const report = { scenario, syntheticOnly: true, productionRegistrationTested: false, offlineTested: false };
  try {
    const mailbox = window.__L4A_EXPORT_MAILBOX_V1__;
    if (!mailbox) throw new Error('Production mailbox was not injected');
    const text = scenario === 'saved-csv' ? csv : scenario === 'invalid' ? '{}' : scenario === 'oversized' ? 'x'.repeat(20 * 1024 * 1024 + 1) : json;
    const name = scenario === 'saved-csv' ? 'synthetic-customers.csv' : 'synthetic-backup.json';
    const type = scenario === 'saved-csv' ? 'text/csv;charset=utf-8' : 'application/json';
    const first = mailbox.save(name, text, type);
    if (scenario === 'repeated') report.secondStatus = (await mailbox.save(name, text, type)).status;
    if (scenario === 'busy-navigation') {
      const original = location.href;
      await new Promise(resolve => setTimeout(resolve, 500));
      location.href = original + '?navigation-must-be-blocked';
      report.status = (await first).status;
      report.navigationBlocked = location.href === original;
    } else if (scenario === 'timeout-retry') {
      report.firstStatus = (await first).status;
      report.secondStatus = (await mailbox.save(name, text, type)).status;
      document.title = 'L4A_EXPORT_STAGE:timeout-busy';
      await new Promise(resolve => setTimeout(resolve, 3000));
      report.status = (await mailbox.save(name, text, type)).status;
    } else report.status = (await first).status;
    report.expectedText = text.length < 4096 ? text : null;
  } catch (error) { report.error = String(error); }
  document.title = 'L4A_EXPORT_RESULT:' + JSON.stringify(report);
}, 500));
