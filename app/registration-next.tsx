'use client';
import { useEffect, useState } from 'react';
import { bindRegistrationLifecycle, createRegistrationFlow, initialRegistrationState } from './register/registration-flow.mjs';

export default function RegistrationNext() {
  const [state, setState] = useState(initialRegistrationState);
  useEffect(() => {
    const flow = createRegistrationFlow({ onChange: setState });
    const stop = bindRegistrationLifecycle(flow, window);
    void flow.check();
    return stop;
  }, []);
  if (state.phase === 'saved') return <div className="welcome-registration" aria-label="Your registration and next step">
    <p className="kicker">Registration confirmed in this browser</p>
    <p>Your Product ID: <strong style={{overflowWrap:'anywhere'}}>{state.productId}</strong></p>
    <a className="primary-cta" href="/community/">Install Loyalty4All <span aria-hidden="true">→</span></a>
    <p className="registration-help">Installation is recommended: follow the steps and open the new app icon. Already installed? Open its icon on your device. Back up existing records before moving; records and registration receipts do not automatically transfer. Installed apps also need backups. If you cannot install, the setup screen offers Continue in browser as a last option after a data-loss warning.</p>
  </div>;
  return <div className="welcome-registration">
    <p className="registration-help" role="status">{state.phase === 'checking' ? 'Checking your digital registration receipt…' : state.phase === 'ready' ? 'Register once, return here, then install and open the app.' : 'Registration could not be confirmed in this browser. Use the original browser or installed app, or contact support. Re-registering the same email does not recover access.'}</p>
    <div className="hero-actions"><a className="primary-cta" href="/community/register">Start using Loyalty4All</a><a className="secondary-cta" href="#install">Installation steps</a></div>
  </div>;
}
