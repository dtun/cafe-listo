import { WaitlistForm } from "./WaitlistForm";

export function AppStoreLinks() {
  return (
    <section className="app-store-links" id="download">
      <h2>Get the App</h2>
      <p>
        Readiness isn&rsquo;t a prediction. You get ready before you need to be.
      </p>
      <WaitlistForm id="footer" />
      <div className="store-buttons">
        <div className="store-badge">
          <span>App Store</span>
          <span>Coming Soon</span>
        </div>
        <div className="store-badge">
          <span>Google Play</span>
          <span>Coming Soon</span>
        </div>
      </div>
    </section>
  );
}
