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

  async function submit(e){
    e.preventDefault();
    setError('');
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
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center py-10">
      <WhiteHouseLogo className="w-16 h-16 mb-6 text-brand-700 dark:text-brand-300" />
      <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-4">{mode === 'login' ? 'Login' : 'Register'}</h2>
        {error && <div className="text-red-700 dark:text-red-400 mb-3 text-sm">{error}</div>}
        <form onSubmit={submit} className="space-y-3">
          {mode === 'register' && (
            <>
              <label className="block text-sm text-slate-700 dark:text-slate-300">
                Name
                <input className="mt-1 w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-md bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500" type="text" value={name} onChange={e=>setName(e.target.value)} required />
              </label>
              <label className="block text-sm text-slate-700 dark:text-slate-300">
                Company Name
                <input className="mt-1 w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-md bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500" type="text" value={companyName} onChange={e=>setCompanyName(e.target.value)} />
              </label>
            </>
          )}
          <label className="block text-sm text-slate-700 dark:text-slate-300">
            Email
            <input className="mt-1 w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-md bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500" type="email" value={email} onChange={e=>setEmail(e.target.value)} required />
          </label>
          <label className="block text-sm text-slate-700 dark:text-slate-300">
            Password
            <input className="mt-1 w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-md bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500" type="password" value={password} onChange={e=>setPassword(e.target.value)} required />
          </label>
          <div className="flex gap-2 pt-2">
            <button className="btn btn-primary" type="submit">{mode === 'login' ? 'Login' : 'Register'}</button>
            <button className="btn btn-secondary" type="button" onClick={()=>setMode(mode==='login'?'register':'login')}>
              Switch to {mode==='login'?'Register':'Login'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
