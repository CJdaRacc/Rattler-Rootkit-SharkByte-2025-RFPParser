import { useEffect, useState } from 'react';
import { Routes, Route, Link, useNavigate } from 'react-router-dom';
import { api } from './lib/api.js';
import LoginRegister from './pages/LoginRegister.jsx';
import Profile from './pages/Profile.jsx';
import RfpParser from './pages/RfpParser.jsx';
import Templating from './pages/Templating.jsx';
import './App.css';

function App(){
  const [me, setMe] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      try {
        const user = await api('/api/me');
        setMe(user);
      } catch {}
    })();
  }, []);

  async function logout(){
    try { await api('/api/auth/logout', { method: 'POST' }); } catch {}
    setMe(null);
    navigate('/login');
  }

  return (
    <div>
      <nav style={{display:'flex',gap:12,padding:12,borderBottom:'1px solid #e2e8f0'}}>
        <Link to="/profile">Profile</Link>
        <Link to="/templating">Templating</Link>
        <Link to="/rfp">RFP Parser</Link>
        <div style={{marginLeft:'auto'}}>
          {me ? (
            <>
              <span style={{marginRight:8}}>Hi, {me.name}</span>
              <button onClick={logout}>Logout</button>
            </>
          ) : (
            <Link to="/login">Login / Register</Link>
          )}
        </div>
      </nav>
      <div style={{padding:16}}>
        <Routes>
          <Route path="/login" element={<LoginRegister onAuthed={setMe} />} />
          <Route path="/profile" element={<RequireAuth me={me}><Profile me={me} setMe={setMe} /></RequireAuth>} />
          <Route path="/templating" element={<RequireAuth me={me}><Templating me={me} /></RequireAuth>} />
          <Route path="/rfp" element={<RequireAuth me={me}><RfpParser me={me} /></RequireAuth>} />
          <Route path="*" element={<HomeRedirect me={me} />} />
        </Routes>
      </div>
    </div>
  );
}

function RequireAuth({ me, children }){
  const navigate = useNavigate();
  useEffect(() => { if (!me) navigate('/login'); }, [me]);
  return me ? children : null;
}

function HomeRedirect({ me }){
  const navigate = useNavigate();
  useEffect(() => { navigate(me ? '/profile' : '/login'); }, [me]);
  return null;
}

export default App;
