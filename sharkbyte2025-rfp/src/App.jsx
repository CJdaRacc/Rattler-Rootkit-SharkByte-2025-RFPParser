import { useEffect, useState } from 'react';
import { Routes, Route, Link, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { Menu, LogOut } from 'lucide-react';
import { api } from './lib/api.js';
import LoginRegister from './pages/LoginRegister.jsx';
import Profile from './pages/Profile.jsx';
import RfpParser from './pages/RfpParser.jsx';
import Templating from './pages/Templating.jsx';
import Home from './pages/Home.jsx';
import WhiteHouseLogo from './components/WhiteHouseLogo.jsx';
import HackathonLayout from './components/HackathonLayout.jsx';

function App(){
  const [me, setMe] = useState(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const isAuthPage = location.pathname === '/login';
  const isHackathon = location.pathname.startsWith('/rfp') || location.pathname.startsWith('/templating');

  useEffect(() => {
    (async () => {
      try {
        const user = await api('/api/me');
        setMe(user);
      } catch {}
    })();
  }, []);

  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  async function logout(){
    try { await api('/api/auth/logout', { method: 'POST' }); } catch {}
    setMe(null);
    navigate('/login');
  }

  const NavLinks = () => (
    <div className="flex items-center gap-4">
      <NavLink to="/" label="Home" current={location.pathname === '/'} />
      <NavLink to="/profile" label="Profile" current={location.pathname.startsWith('/profile')} />
      <NavLink to="/templating" label="Templating" current={location.pathname.startsWith('/templating')} />
      <NavLink to="/rfp" label="RFP Parser" current={location.pathname.startsWith('/rfp')} />
    </div>
  );

  return (
    <div className="min-h-screen relative">
      {/* Watermark background (hidden on auth or hackathon pages to keep theme clean) */}
      {!isAuthPage && !isHackathon && (
        <div aria-hidden className="pointer-events-none absolute inset-0 select-none [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]">
          <div className="absolute -top-24 right-8 opacity-5 dark:opacity-10">
            <WhiteHouseLogo className="w-64 h-64" />
          </div>
        </div>
      )}

      {/* Navbar (hidden on auth page only) */}
      {!isAuthPage && (
        <header className="sticky top-0 z-40 border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur">
          <div className="container-app h-14 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <WhiteHouseLogo className="w-7 h-7 text-brand-700 dark:text-brand-300" />
              <span className="font-semibold tracking-tight text-slate-900 dark:text-slate-100">SharkByte RFP</span>
            </div>
            <nav className="hidden md:block">
              <NavLinks />
            </nav>
            <div className="flex items-center gap-3">
              {me ? (
                <div className="flex items-center gap-2">
                  <span className="hidden sm:inline text-sm text-slate-600 dark:text-slate-300">Hi, {me.name}</span>
                  <button className="btn btn-secondary" onClick={logout}>
                    <LogOut className="w-4 h-4 mr-1" /> Logout
                  </button>
                </div>
              ) : (
                <Link to="/login" className="btn btn-primary">Login / Register</Link>
              )}
              <button className="md:hidden p-2 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Open menu" aria-expanded={mobileOpen} onClick={() => setMobileOpen(v => !v)}>
                <Menu className="w-6 h-6" />
              </button>
            </div>
          </div>
          {mobileOpen && (
            <div className="md:hidden border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
              <div className="container-app py-3">
                <div className="flex flex-col gap-3">
                  <NavLinks />
                </div>
              </div>
            </div>
          )}
        </header>
      )}

      {/* Main content */}
      <main className={isHackathon ? '' : 'container-app py-6'}>
        <Routes>
          <Route path="/" element={<Home me={me} />} />
          <Route path="/login" element={me ? <Navigate to="/" replace /> : <LoginRegister onAuthed={setMe} />} />
          <Route path="/profile" element={<RequireAuth me={me}><Profile me={me} setMe={setMe} /></RequireAuth>} />
          <Route path="/templating" element={<RequireAuth me={me}><HackathonLayout><Templating me={me} /></HackathonLayout></RequireAuth>} />
          <Route path="/rfp" element={<RequireAuth me={me}><HackathonLayout><RfpParser me={me} /></HackathonLayout></RequireAuth>} />
          <Route path="*" element={<HomeRedirect me={me} />} />
        </Routes>
      </main>
    </div>
  );
}

function HackathonWrapper({ children }){
  // Simple wrapper to render pages inside the hackathon-themed layout
  const Wrapper = require('./components/HackathonLayout.jsx');
  const Default = Wrapper && Wrapper.default ? Wrapper.default : null;
  return Default ? <Default>{children}</Default> : children;
}

function NavLink({ to, label, current }){
  return (
    <Link
      to={to}
      className={
        `px-2 py-1 text-sm font-medium rounded-md transition-colors ` +
        (current
          ? 'text-brand-700 dark:text-brand-300 underline underline-offset-4'
          : 'text-slate-700 dark:text-slate-300 hover:text-brand-700 dark:hover:text-brand-300')
      }
      aria-current={current ? 'page' : undefined}
    >
      {label}
    </Link>
  );
}

function RequireAuth({ me, children }){
  const navigate = useNavigate();
  useEffect(() => { if (!me) navigate('/login'); }, [me]);
  return me ? children : null;
}

function HomeRedirect({ me }){
  const navigate = useNavigate();
  useEffect(() => { navigate(me ? '/rfp' : '/login'); }, [me]);
  return null;
}

export default App;
