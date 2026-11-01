import RegistrationPage from '../../register/page';
export { dynamic } from '../../register/page';

// Same form/provider, with guidance for a missing installed-context receipt.
export default function InstalledRegistrationPage() {
  return <>
    <aside className="container" aria-label="Existing registration help" style={{padding:'20px'}}>
      <strong>Already registered?</strong>
      <p>This app may not have received your browser’s digital receipt. Contact <a href="mailto:Hello@De-Omega-Point.Com">Hello@De-Omega-Point.Com</a> before registering again to avoid a duplicate. Your Product ID alone cannot restore access.</p>
      <p>Existing records are not deleted by this check. Do not clear website data. Registration does not transfer or sync customer records.</p>
    </aside>
    <RegistrationPage />
  </>;
}
