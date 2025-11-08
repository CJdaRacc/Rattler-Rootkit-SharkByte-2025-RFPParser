import { useState } from 'react';
import { api } from '../lib/api.js';

export default function LoginRegister({ onAuthed }){
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
      } else {
        const me = await api('/api/auth/register', { method: 'POST', body: { name, email, password, companyName } });
        onAuthed && onAuthed(me);
      }
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div style={{maxWidth:420}}>
      <h2>{mode === 'login' ? 'Login' : 'Register'}</h2>
      {error && <div style={{color:'#b91c1c', marginBottom:8}}>{error}</div>}
      <form onSubmit={submit}>
        {mode === 'register' && (
          <>
            <label>Name<input type="text" value={name} onChange={e=>setName(e.target.value)} required /></label>
            <label>Company Name<input type="text" value={companyName} onChange={e=>setCompanyName(e.target.value)} /></label>
          </>
        )}
        <label>Email<input type="email" value={email} onChange={e=>setEmail(e.target.value)} required /></label>
        <label>Password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} required /></label>
        <div style={{display:'flex', gap:8}}>
          <button type="submit">{mode === 'login' ? 'Login' : 'Register'}</button>
          <button type="button" onClick={()=>setMode(mode==='login'?'register':'login')}>
            Switch to {mode==='login'?'Register':'Login'}
          </button>
        </div>
      </form>
    </div>
  );
}
