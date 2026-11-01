// Browser capability, never a stored installed flag or registration authority.
export function createInstallController({ target = window, render = () => {}, status = () => {}, showHelp = () => {}, installed = () => {}, requested = () => {} } = {}) {
  let deferred = null;
  let pending = false;
  let observed = false;
  const update = () => render({ available: Boolean(deferred) && !observed, pending, observed });
  target.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    if (observed) return;
    deferred = event;
    status('Ready to install. Choose Install app, then confirm in your browser.');
    update();
  });
  target.addEventListener('appinstalled', event => {
    if (!event.isTrusted) return;
    observed = true;
    deferred = null;
    status('Your browser reported installation. Open the Loyalty4All icon to check registration and offline readiness.');
    installed();
    update();
  });
  return {
    hasPrompt: () => Boolean(deferred) && !observed,
    actionState: () => ({ pending, observed }),
    async install() {
      if (pending || observed) return;
      if (!deferred) { showHelp(); return; }
      const prompt = deferred;
      deferred = null;
      pending = true;
      requested();
      status('Confirm installation in your browser’s dialog.');
      update();
      try {
        // Keep prompt() on the original click stack: no await before this call.
        const response = await prompt.prompt();
        const choice = response || await prompt.userChoice;
        if (!observed) status(choice?.outcome === 'accepted'
          ? 'Installation accepted. Wait for your browser to finish, then open the Loyalty4All icon. Registration is checked separately.'
          : 'Installation was not confirmed. Nothing was marked installed. Use your browser’s Install option, or try again when offered.');
      } catch {
        if (!observed) status('The browser could not open installation. Nothing was marked installed. Use Installation help for this browser’s options.');
      } finally {
        pending = false;
        update();
      }
    }
  };
}
