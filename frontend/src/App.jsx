import React from 'react';
import { Link, Routes, Route, Navigate } from 'react-router-dom';
import UploadRfp from './pages/UploadRfp.jsx';
import Templates from './pages/Templates.jsx';

export default function App() {
  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', margin: '0 auto', maxWidth: 960, padding: 16 }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <h2 style={{ marginRight: 'auto' }}>RFP → Proposal Generator (MERN)</h2>
        <nav style={{ display: 'flex', gap: 12 }}>
          <Link to="/rfps">Analyze RFP</Link>
          <Link to="/templates">Template</Link>
        </nav>
      </header>
      <main style={{ marginTop: 24 }}>
        <Routes>
          <Route path="/" element={<Navigate to="/rfps" replace />} />
          <Route path="/rfps" element={<UploadRfp />} />
          <Route path="/templates" element={<Templates />} />
        </Routes>
      </main>
      <footer style={{ marginTop: 40, fontSize: 12, color: '#555' }}>
        Backend proxy on /api → http://localhost:4000
      </footer>
    </div>
  );
}
