import RegistrationNext from './registration-next';
import ProductBrand from './product-brand';
import Image from 'next/image';

const benefits = [
  {
    title: "Reward loyal customers",
    copy: "Create customer loyalty cards, record visits and recognise repeat business from one simple counter screen.",
  },
  {
    title: "Make it your own",
    copy: "Showcase your shop name, colours, logo and rewards while Loyalty-4-All remains the trusted platform behind it.",
  },
  {
    title: "Keep control of your data",
    copy: "Core customer records stay on the device you use. Export a backup whenever you choose.",
  },
];

export default function Home() {
  return (
    <main className="product-site">
      <header className="site-header">
        <ProductBrand />
        <a className="header-cta" href="/community/register">Start using Loyalty4All</a>
      </header>

      <section className="hero logo-welcome">
        <div className="hero-copy">
          <p className="kicker">Built for independent businesses</p>
          <h1>Turn everyday visits into lasting local loyalty.</h1>
          <p className="hero-lead">
            A free, local-first loyalty app that helps small businesses reward returning customers—without expensive hardware, compulsory subscriptions or complicated setup.
          </p>
          <RegistrationNext />
          <div className="assurance-row" aria-label="Product assurances">
            <span>Free forever</span>
            <span>No credit card</span>
            <span>Works offline after setup</span>
          </div>
        </div>

        <aside className="product-glance logo-spotlight" aria-label="Loyalty-4-All product summary">
          <div className="glance-topline">
            <span className="live-dot" aria-hidden="true" />
            Available now
          </div>
          <Image className="welcome-logo" src="/community/assets/loyalty-4-all-logo.png" width={512} height={512} unoptimized priority alt="Loyalty4All — local business, lasting connections" />
          <p className="welcome-eyebrow">Welcome to</p>
          <h2>Loyalty4All</h2>
          <p className="welcome-edition">Community Edition</p>
          <p>Register once, return to this welcome page, then install Loyalty4All and open its icon. Installation is recommended; browser use is a last option after acknowledging local-data risks.</p>
          <a href="/community/register">Open Loyalty-4-All <span aria-hidden="true">→</span></a>
        </aside>
      </section>

      <section className="benefit-section" aria-labelledby="benefits-title">
        <div className="section-intro">
          <p className="kicker">Small-business practical</p>
          <h2 id="benefits-title">Everything needed to start a loyalty program today.</h2>
        </div>
        <div className="benefit-grid">
          {benefits.map((benefit, index) => (
            <article key={benefit.title}>
              <span>0{index + 1}</span>
              <h3>{benefit.title}</h3>
              <p>{benefit.copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="intelligence-callout" aria-labelledby="intelligence-title">
        <div>
          <p className="kicker">Updates are optional</p>
          <h2 id="intelligence-title">Stay current—not overwhelmed.</h2>
        </div>
        <p>Choose whether to receive product and marketing updates when you register. Leaving that choice unchecked does not restrict app access.</p>
      </section>

      <section className="install-section" id="install" aria-labelledby="install-title">
        <div>
          <p className="kicker">Fast-track access</p>
          <h2 id="install-title">Install directly from the web.</h2>
          <p>Register first, return here and choose Install Loyalty4All. Follow the instructions for your browser, then choose <strong>Install</strong> or <strong>Add to Home Screen</strong>, and Loyalty-4-All will appear alongside your other apps.</p>
        </div>
        <ol>
          <li><strong>Register and return</strong><span>One short form, then this welcome page confirms your Product ID.</span></li>
          <li><strong>Choose Install</strong><span>We show the right instructions for your device.</span></li>
          <li><strong>Open the installed icon</strong><span>Confirm registration, then set up your shop. Keep backups of existing records.</span></li>
        </ol>
        <p>Back up existing records before moving between browsers or app windows. Records and registration receipts do not automatically transfer. Clearing site data, private browsing or device problems can lose local records; installed apps also need regular backups. If installation is unavailable, the setup screen offers browser use as a last option after a risk acknowledgement.</p>
        <a className="primary-cta" href="/community/register">Register and start free</a>
      </section>

      <footer className="site-footer">
        <span><strong>Loyalty-4-All</strong> Community Edition</span>
        <span>A De-Omega-Point Project</span>
        <nav aria-label="Legal">
          <a href="/registration/notices/2026-10-28-registration-3/privacy.html">Privacy</a>
          <a href="/registration/notices/2026-10-28-registration-3/terms.html">Terms</a>
          <a href="/owner/registrations" rel="nofollow">Owner registrations</a>
        </nav>
      </footer>
    </main>
  );
}
