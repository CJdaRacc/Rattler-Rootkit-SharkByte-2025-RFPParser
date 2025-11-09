import { Link, useLocation } from 'react-router-dom';

export default function HackathonLayout({ children }){
  const location = useLocation();
  const onRfp = location.pathname.startsWith('/rfp');
  const onTpl = location.pathname.startsWith('/templating');

  return (
    <div className="sb-theme">
      <header className="sb-header">
        <div className="container">
          <h1>RFP Analyzer & Proposal Template</h1>
          <p className="subtitle">Generate structured requirements from an RFP and prepare a proposal draft template.</p>
        </div>
      </header>

      <main>
        <div className="container">
          {!onRfp && (
            <nav className="tabs" aria-label="Main tabs">
              <Link className={`tab ${onRfp ? 'active' : ''}`} to="/rfp">Analyze RFP</Link>
              <Link className={`tab ${onTpl ? 'active' : ''}`} to="/templating">Templating</Link>
            </nav>
          )}

          {children}
        </div>
      </main>

      <footer>
        <div className="container">
          <small>Tip: Use the GOOD RFP sample as a guide when reviewing parsed requirements.</small>
        </div>
      </footer>
    </div>
  );
}
