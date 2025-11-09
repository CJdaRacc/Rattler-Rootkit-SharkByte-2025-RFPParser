import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import WhiteHouseLogo from '../components/WhiteHouseLogo.jsx';

export default function LoginRegister({ onAuthed }){
  const navigate = useNavigate();
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e){
    e.preventDefault();
    if (loading) return;
    setError('');
    setLoading(true);
    try {
      if (mode === 'login'){
        const me = await api('/api/auth/login', { method: 'POST', body: { email, password } });
        onAuthed && onAuthed(me);
        navigate('/rfp');
      } else {
        const me = await api('/api/auth/register', { method: 'POST', body: { name, email, password, companyName } });
        onAuthed && onAuthed(me);
        navigate('/rfp');
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  const primaryLabel = loading
    ? (mode === 'login' ? 'Logging in…' : 'Registering…')
    : (mode === 'login' ? 'Login' : 'Register');

  return (
    <div className="min-h-screen flex flex-col items-center justify-center py-10">
      <WhiteHouseLogo className="w-16 h-16 mb-6 text-brand-700 dark:text-brand-300" />
      <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{mode === 'login' ? 'Login' : 'Register'}</h2>
          <a href="/" className="text-sm text-slate-600 hover:text-brand-700 dark:text-slate-300 dark:hover:text-brand-300">Back to Home</a>
        </div>
        {error && <div className="text-red-700 dark:text-red-400 mb-3 text-sm">{error}</div>}
        <form onSubmit={submit} className="space-y-3" aria-busy={loading}>
          {mode === 'register' && (
            <>
              <label className="block text-sm text-slate-700 dark:text-slate-300">
                Name
                <input className="mt-1 w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-md bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500" type="text" value={name} onChange={e=>setName(e.target.value)} required disabled={loading} />
              </label>
              <label className="block text-sm text-slate-700 dark:text-slate-300">
                Company Name
                <input className="mt-1 w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-md bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500" type="text" value={companyName} onChange={e=>setCompanyName(e.target.value)} disabled={loading} />
              </label>
            </>
          )}
          <label className="block text-sm text-slate-700 dark:text-slate-300">
            Email
            <input className="mt-1 w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-md bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500" type="email" value={email} onChange={e=>setEmail(e.target.value)} required disabled={loading} />
          </label>
          <label className="block text-sm text-slate-700 dark:text-slate-300">
            Password
            <input className="mt-1 w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-md bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500" type="password" value={password} onChange={e=>setPassword(e.target.value)} required disabled={loading} />
          </label>
          <div className="flex gap-2 pt-2 items-center">
            <button className="btn btn-primary inline-flex items-center gap-2" type="submit" disabled={loading}>
              {loading && (
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                </svg>
              )}
              <span>{primaryLabel}</span>
            </button>
            <button className="btn btn-secondary" type="button" onClick={()=>setMode(mode==='login'?'register':'login')} disabled={loading}>
              Switch to {mode==='login'?'Register':'Login'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
