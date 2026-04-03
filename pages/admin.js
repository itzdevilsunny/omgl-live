import { useState, useEffect } from 'react';
import Head from 'next/head';
import styles from '../styles/Home.module.css'; // Reusing some base styles

export default function AdminDashboard() {
  const [secret, setSecret] = useState('');
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [stats, setStats] = useState({ waitingCount: 0, activeUsers: 0, trendingTags: [] });
  const [broadcastMsg, setBroadcastMsg] = useState('');
  const [error, setError] = useState('');
  const [targetUser, setTargetUser] = useState('');

  const fetchStats = async () => {
    try {
      const res = await fetch('/api/admin-stats', {
        headers: { 'x-admin-secret': secret }
      });
      if (res.status === 401) {
        setIsAuthorized(false);
        setError('Invalid Secret');
        return;
      }
      const data = await res.json();
      setStats(data);
      setIsAuthorized(true);
      setError('');
    } catch (e) {
      setError('Connection failed');
    }
  };

  useEffect(() => {
    if (isAuthorized) {
      const interval = setInterval(fetchStats, 5000);
      return () => clearInterval(interval);
    }
  }, [isAuthorized, secret]);

  const handleLogin = (e) => {
    e.preventDefault();
    fetchStats();
  };

  const handleBroadcast = async () => {
    if (!broadcastMsg) return;
    const res = await fetch('/api/admin-broadcast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-secret': secret },
      body: JSON.stringify({ message: broadcastMsg })
    });
    if (res.ok) {
      setBroadcastMsg('');
      alert('Broadcast sent!');
    }
  };

  const handleKick = async (id) => {
    const userId = id || targetUser;
    if (!userId) return;
    const res = await fetch('/api/admin-kick', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-secret': secret },
      body: JSON.stringify({ targetUserId: userId })
    });
    if (res.ok) {
      setTargetUser('');
      alert(`User ${userId} kicked.`);
      fetchStats();
    }
  };

  if (!isAuthorized) {
    return (
      <div className={styles.container} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <div style={{ background: '#111', padding: '2rem', borderRadius: '1rem', border: '1px solid #333', textAlign: 'center' }}>
          <h1 style={{ color: '#fff', marginBottom: '1rem' }}>🛡️ Admin Access</h1>
          <form onSubmit={handleLogin}>
            <input 
              type="password" 
              placeholder="Enter Admin Secret" 
              value={secret} 
              onChange={e => setSecret(e.target.value)}
              className={styles.input}
              style={{ padding: '0.75rem', marginBottom: '1rem', background: '#222', border: '1px solid #444', borderRadius: '0.5rem', color: '#fff' }}
            />
            <button type="submit" className={styles.btn} style={{ width: '100%', background: '#fff', color: '#000' }}>Login</button>
          </form>
          {error && <p style={{ color: 'red', marginTop: '1rem' }}>{error}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container} style={{ padding: '2rem', maxWidth: '1000px', margin: '0 auto' }}>
      <Head>
        <title>StrangerLink — Admin Hub</title>
      </Head>

      <header style={{ marginBottom: '2rem', borderBottom: '1px solid #333', paddingBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '2rem', color: '#fff' }}>🛡️ Platform Control</h1>
          <p style={{ color: '#888' }}>Real-time monitoring and moderation</p>
        </div>
        <button onClick={() => setIsAuthorized(false)} className={styles.btnStop}>Logout</button>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem', marginBottom: '3rem' }}>
        <div style={{ background: '#111', padding: '1.5rem', borderRadius: '1rem', border: '1px solid #333' }}>
          <h3 style={{ color: '#888', fontSize: '0.9rem', textTransform: 'uppercase' }}>Waiting Queue</h3>
          <p style={{ fontSize: '2.5rem', fontWeight: 'bold', color: '#fff' }}>{stats.waitingCount}</p>
          <div style={{ color: stats.waitingCount > 0 ? '#4caf50' : '#888', fontSize: '0.8rem' }}>● Live status</div>
        </div>
        <div style={{ background: '#111', padding: '1.5rem', borderRadius: '1rem', border: '1px solid #333' }}>
          <h3 style={{ color: '#888', fontSize: '0.9rem', textTransform: 'uppercase' }}>Active in 5min</h3>
          <p style={{ fontSize: '2.5rem', fontWeight: 'bold', color: '#fff' }}>{stats.activeUsers}</p>
          <div style={{ color: stats.activeUsers > 0 ? '#4caf50' : '#888', fontSize: '0.8rem' }}>● Tracking active</div>
        </div>
        <div style={{ background: '#111', padding: '1.5rem', borderRadius: '1rem', border: '1px solid #333' }}>
          <h3 style={{ color: '#888', fontSize: '0.9rem', textTransform: 'uppercase' }}>Trending Tags</h3>
          <div style={{ marginTop: '0.5rem' }}>
            {stats.trendingTags && stats.trendingTags.length > 0 ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                {stats.trendingTags.map((tag, i) => (
                  <span key={i} style={{ background: '#222', padding: '4px 8px', borderRadius: '4px', fontSize: '12px', color: '#aaa' }}>
                    #{tag}
                  </span>
                ))}
              </div>
            ) : (
              <p style={{ color: '#555', fontSize: '0.9rem' }}>No tags active yet</p>
            )}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '2rem' }}>
        {/* Broadcast */}
        <section style={{ background: '#0a0a0a', padding: '1.5rem', borderRadius: '1rem', border: '1px solid #222' }}>
          <h2 style={{ color: '#fff', marginBottom: '1.5rem', fontSize: '1.2rem' }}>Global Broadcast</h2>
          <textarea 
            placeholder="System announcement message..." 
            value={broadcastMsg}
            onChange={e => setBroadcastMsg(e.target.value)}
            style={{ width: '100%', height: '100px', background: '#111', border: '1px solid #333', borderRadius: '0.5rem', color: '#fff', padding: '1rem', marginBottom: '1rem' }}
          />
          <button onClick={handleBroadcast} className={styles.btn} style={{ width: '100%', background: '#ff9800', color: '#000' }}>🚀 Send Broadcast</button>
        </section>

        {/* Moderation */}
        <section style={{ background: '#0a0a0a', padding: '1.5rem', borderRadius: '1rem', border: '1px solid #222' }}>
          <h2 style={{ color: '#fff', marginBottom: '1.5rem', fontSize: '1.2rem' }}>Fast Purge</h2>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ color: '#888', fontSize: '0.8rem', display: 'block', marginBottom: '0.5rem' }}>User ID</label>
            <input 
              type="text" 
              placeholder="e.g. u-123abc456" 
              value={targetUser}
              onChange={e => setTargetUser(e.target.value)}
              className={styles.input}
              style={{ background: '#111', width: '100%', marginBottom: '1rem' }}
            />
          </div>
          <button onClick={() => handleKick()} className={styles.btnStop} style={{ width: '100%' }}>⚠️ Kick User Permanently</button>
        </section>
      </div>

      <footer style={{ marginTop: '4rem', padding: '2rem', borderTop: '1px solid #333', textAlign: 'center', color: '#555' }}>
        <p>StrangerLink Management Core v1.0.0 (Global Edge)</p>
      </footer>
    </div>
  );
}
