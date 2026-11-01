'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  bindRegistrationLifecycle,
  createRegistrationFlow,
  initialRegistrationState,
  registrationPayload,
  registrationWelcomePath,
} from './registration-flow.mjs';

export default function RegistrationForm() {
  const [state, setState] = useState(initialRegistrationState);
  const [kind, setKind] = useState('business');
  const flow = useRef<ReturnType<typeof createRegistrationFlow> | null>(null);

  useEffect(() => {
    const current = createRegistrationFlow({ onChange: setState });
    flow.current = current;
    const stop = bindRegistrationLifecycle(current, window);
    void current.check();
    return () => { stop(); flow.current = null; };
  }, []);

  useEffect(() => {
    if (state.phase === 'saved') window.location.replace(registrationWelcomePath(window.location.pathname));
  }, [state.phase]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!event.currentTarget.reportValidity()) return;
    void flow.current?.submit(registrationPayload(new FormData(event.currentTarget)));
  }

  const busy = state.phase === 'checking' || state.phase === 'saving';
  const retry = ['error', 'uncertain', 'paused'].includes(state.phase);

  if (state.phase === 'saved') {
    return (
      <section className="registration-card registration-success" aria-labelledby="registration-saved-title">
        <p className="kicker">Ready to continue</p>
        <h2 id="registration-saved-title">Registration saved</h2>
        <p role="status">{state.message}</p>
        <dl className="registration-id">
          <dt>Your Product ID</dt>
          <dd>{state.productId}</dd>
        </dl>
        <p className="registration-help">Keep this ID for reference. It is not a password or proof of identity.</p>
        <a className="primary-cta" href="/community/welcome">Return to welcome page <span aria-hidden="true">→</span></a>
        <p className="registration-help">Returning to the welcome page, where you can confirm your Product ID and choose Install Loyalty4All.</p>
      </section>
    );
  }

  return (
    <form className="registration-card registration-form" onSubmit={submit} aria-label="Register for Loyalty-4-All" aria-busy={busy}>
      <input type="hidden" name="noticeVersion" value="2026-10-28-registration-3" />
      <h2>Your details</h2>
      <p className="registration-help">Required fields are marked with an asterisk (*).</p>
      <div id="registration-status" className={`registration-status${retry ? ' registration-status-error' : ''}`}
        role={retry ? 'alert' : 'status'} aria-live="polite" aria-atomic="true">
        {state.message}
      </div>
      {retry && <button className="secondary-cta registration-retry" type="button" onClick={() => void flow.current?.check()}>
        {state.phase === 'uncertain' || state.phase === 'paused' ? 'Check saved status' : 'Try checking again'}
      </button>}
      <fieldset disabled={state.phase !== 'ready'}>
        <legend className="registration-visually-hidden">Your registration</legend>
        <div className="registration-field">
          <label htmlFor="registrationKind">Register as *</label>
          <select id="registrationKind" name="kind" value={kind} onChange={event => setKind(event.target.value)} required>
            <option value="business">A business</option>
            <option value="individual">An individual</option>
          </select>
        </div>
        <div className="registration-field">
          <label htmlFor="registrationContact">Your name *</label>
          <input id="registrationContact" name="contactName" maxLength={120} autoComplete="name" required />
        </div>
        <div className="registration-field" hidden={kind !== 'business'}>
          <label htmlFor="registrationBusiness">Business name *</label>
          <input id="registrationBusiness" name="businessName" maxLength={120} autoComplete="organization"
            required={kind === 'business'} disabled={kind !== 'business'} />
        </div>
        <div className="registration-field">
          <label htmlFor="registrationEmail">Email address *</label>
          <input id="registrationEmail" name="email" type="email" maxLength={254} autoComplete="email" required
            aria-describedby="registration-email-help" />
          <span id="registration-email-help" className="registration-help">This email is saved as supplied, not verified. No password or email sign-in is created.</span>
        </div>
        <div className="registration-consents">
          <label className="registration-checkbox">
            <input type="checkbox" name="termsAccepted" required />
            <span>I accept the <a href="/registration/notices/2026-10-28-registration-3/terms.html" target="_blank" rel="noreferrer">terms of use</a>. * <span className="registration-help">(Opens in a new tab.)</span></span>
          </label>
          <label className="registration-checkbox">
            <input type="checkbox" name="privacyAcknowledged" required />
            <span>I have read the <a href="/registration/notices/2026-10-28-registration-3/privacy.html" target="_blank" rel="noreferrer">privacy information</a>. * <span className="registration-help">(Opens in a new tab.)</span></span>
          </label>
          <label className="registration-checkbox registration-optional">
            <input type="checkbox" name="marketingConsent" />
            <span>I would like occasional Loyalty-4-All product updates by email. <strong>Optional.</strong> Leave unchecked to use the app without marketing emails.</span>
          </label>
        </div>
        <button className="primary-cta registration-submit" type="submit" aria-describedby="registration-status">
          {state.phase === 'saving' ? 'Saving registration…' : 'Save registration'}
        </button>
      </fieldset>
      <noscript><p className="registration-status-error">Turn on JavaScript to check and save your registration. Nothing has been submitted.</p></noscript>
    </form>
  );
}
