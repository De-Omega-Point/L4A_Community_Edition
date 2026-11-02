import Image from 'next/image';
import Link from 'next/link';
import ProductBrand from '../product-brand';
import RegistrationForm from './registration-form';

export const dynamic = 'force-dynamic';

export default function Register() {
  return (
    <main className="product-site">
      <header className="site-header">
        <ProductBrand />
      </header>
      <section className="registration-section" aria-labelledby="registration-title">
        <div className="registration-intro">
          <Link className="logo-home-link" href="/" aria-label="Loyalty4All home"><Image className="registration-welcome-logo" src="/community/assets/loyalty-4-all-logo.png" width={128} height={128} unoptimized alt="Loyalty4All" /></Link>
          <p className="kicker">Free Community Edition</p>
          <h1 id="registration-title">A simple start to local loyalty.</h1>
          <p className="registration-lead">Register your business or yourself, save your Product ID, then install and launch the app.</p>
          <ul className="registration-assurances">
            <li>No payment or password required.</li>
            <li>Marketing emails are entirely optional.</li>
            <li>Your customer records stay on your device.</li>
          </ul>
          <div className="registration-notice">
            <h2>What registration does</h2>
            <p>Registration creates your unique Loyalty4All Product ID and unlocks access to the app. We store your registration details in our database. Marketing updates are optional.</p>
            <p>A secure cookie remembers registration in this browser. It is not an account or cross-device recovery service.</p>
            <p>Registration does not back up or sync customer records. Keep your own backups, even after installing the app.</p>
          </div>
        </div>
        <RegistrationForm />
      </section>
      <footer className="site-footer">
        <Link href="/">Back to Loyalty-4-All</Link>
        <nav aria-label="Legal">
          <a href="/registration/notices/2026-10-28-registration-3/privacy.html">Privacy</a>
          <a href="/registration/notices/2026-10-28-registration-3/terms.html">Terms</a>
        </nav>
      </footer>
    </main>
  );
}
