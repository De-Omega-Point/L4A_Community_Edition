// Guidance only: never uninstall, clear storage, revoke a receipt or send a request.
export function mountUninstallGuidance({ document: doc = document } = {}) {
  const dialog = doc.getElementById('uninstallDialog');
  if (!dialog) return;
  let opener;
  let returnTarget;
  for (const [id, backupId] of [['btnSetupUninstall', 'btnSetupBackup'], ['btnSettingsUninstall', 'btnExportData']]) {
    const button = doc.getElementById(id);
    button?.addEventListener('click', () => {
      opener = button;
      returnTarget = null;
      dialog.dataset.backupTarget = backupId;
      if (!dialog.open) dialog.showModal();
    });
  }
  doc.getElementById('btnCloseUninstall')?.addEventListener('click', () => dialog.close());
  doc.getElementById('btnUninstallBackup')?.addEventListener('click', () => {
    returnTarget = doc.getElementById(dialog.dataset.backupTarget);
    dialog.close();
  });
  // Native Escape cancel closes the dialog; both Escape and buttons restore focus.
  dialog.addEventListener('close', () => {
    const target = returnTarget || opener;
    target?.focus();
    target?.scrollIntoView?.({ block: 'nearest' });
    returnTarget = null;
  });
}
