import { Link } from 'react-router-dom';

export default function Home({ me }){
  return (
    <div className="min-h-[70vh] flex items-center">
      <div className="container-app">
        <div className="grid gap-8 md:grid-cols-2">
          <section className="card">
            <div className="card-body">
              <h1 className="text-2xl font-semibold mb-2">SharkByte RFP Toolkit</h1>
              <p className="text-slate-600 dark:text-slate-300 mb-4">
                Analyze RFPs, extract structured requirements, and generate a proposal draft with a polished hackathon layout.
              </p>
              <div className="flex gap-3">
                <Link className="btn btn-primary" to="/rfp">Open RFP Parser</Link>
                <Link className="btn btn-secondary" to="/templating">Open Templating</Link>
              </div>
            </div>
          </section>
          <section className="card">
            <div className="card-body">
              <h2 className="text-xl font-semibold mb-2">Account</h2>
              {me ? (
                <>
                  <p className="text-slate-600 dark:text-slate-300 mb-4">Signed in as <strong>{me.name}</strong></p>
                  <div className="flex gap-3">
                    <Link className="btn btn-secondary" to="/profile">Profile</Link>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-slate-600 dark:text-slate-300 mb-4">Login or register to save RFPs, manage tags, and export proposals.</p>
                  <Link className="btn btn-primary" to="/login">Login / Register</Link>
                </>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
