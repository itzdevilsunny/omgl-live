import { useState, useEffect } from 'react';
import Head from 'next/head';
import styles from '../styles/Home.module.css';
import Pusher from 'pusher-js';

export default function AdminDashboard() {
  const [authorized, setAuthorized] = useState(false);
  const [secret, setSecret] = useState('');
  const [stats, setStats] = useState({ activeUsers: 0, waitingCount: 0, trendingTags: [] });
  const [broadcastMsg, setBroadcastMsg] = useState('');
  const [status, setStatus] = useState('');

  // 1. Fetch Stats Periodically
  useEffect(() => {
    if (!authorized) return;
    const fetchStats = async () => {
      try {
        const res = await fetch('/api/admin-stats', {
          headers: { 'x-admin-secret': secret }
        });
        if (res.ok) {
          const data = await res.json();
          setStats(data);
        } else if (res.status === 401) {
          setAuthorized(false);
        }
      } catch (err) { console.error(err); }
    };

    fetchStats();
    const interval = setInterval(fetchStats, 5000);
    return () => clearInterval(interval);
  }, [authorized, secret]);

  // 2. Handle Broadcast
  const handleBroadcast = async (e) => {
    e.preventDefault();
    if (!broadcastMsg) return;
    setStatus('Sending...');
    try {
      const res = await fetch('/api/admin-broadcast', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-admin-secret': secret 
        },
        body: JSON.stringify({ message: broadcastMsg })
      });
      if (res.ok) {
        setStatus('✅ Broadcast Sent!');
        setBroadcastMsg('');
        setTimeout(() => setStatus(''), 3000);
      } else {
        const err = await res.json();
        setStatus(`❌ Error: ${err.error}`);
      }
    } catch (err) { setStatus('❌ Failed to connect'); }
  };

  if (!authorized) {
    return (
      <div className={styles.container} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <Head><title>Admin Login | StrangerLink</title></Head>
        <div className={styles.interestCard} style={{ maxWidth: '400px', textAlign: 'center' }}>
          <h1 className={styles.interestTitle}>🔒 Command Center</h1>
          <p className={styles.interestSubtitle}>Please enter your administration secret key</p>
          <input 
            type="password" 
            className={styles.input} 
            placeholder="Secret Key..." 
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && setAuthorized(true)}
            style={{ borderRadius: '8px' }}
          />
          <button className={styles.btnStart} onClick={() => setAuthorized(true)} style={{ width: '100%', justifyContent: 'center', marginTop: '10px' }}>
            Unlock Session
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container} style={{ padding: '80px 20px', minHeight: '100vh' }}>
      <Head><title>Command Center | StrangerLink</title></Head>
      
      <div style={{ maxWidth: '900px', margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '40px' }}>
          <div>
            <h1 className={styles.heroTitle} style={{ fontSize: '32px', marginBottom: '5px' }}>
              Command <span className={styles.textGradient}>Center</span>
            </h1>
            <p className={styles.heroSubtitle} style={{ fontSize: '14px' }}>Real-time platform activity and moderation</p>
          </div>
          <button className={styles.themeBtn} onClick={() => setAuthorized(false)}>🚪 Logout</button>
        </div>

        {/* 🏆 STATS GRID */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginBottom: '40px' }}>
          <div className={styles.searchCard} style={{ padding: '20px' }}>
            <p className={styles.settingsLabel}>Active Users</p>
            <h2 style={{ fontSize: '36px', fontWeight: '800', margin: '10px 0' }}>{stats.activeUsers}</h2>
            <p style={{ fontSize: '10px', color: 'var(--green)' }}>● Live on heartbeat</p>
          </div>
          <div className={styles.searchCard} style={{ padding: '20px' }}>
            <p className={styles.settingsLabel}>Queue Size</p>
            <h2 style={{ fontSize: '36px', fontWeight: '800', margin: '10px 0' }}>{stats.waitingCount}</h2>
            <p style={{ fontSize: '10px', color: 'var(--accent)' }}>● Waiting for matches</p>
          </div>
          <div className={styles.searchCard} style={{ padding: '20px' }}>
            <p className={styles.settingsLabel}>System Load</p>
            <h2 style={{ fontSize: '36px', fontWeight: '800', margin: '10px 0' }}>LOW</h2>
            <p style={{ fontSize: '10px', color: 'var(--text-muted)' }}>● API & Signaling Healthy</p>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '30px' }}>
          {/* 📢 BROADCAST */}
          <div className={styles.searchCard} style={{ flex: '1.5' }}>
            <h3 className={styles.interestTitle} style={{ fontSize: '18px' }}>Global Broadcast</h3>
            <p className={styles.interestSubtitle}>Send a global message to ALL active sessions</p>
            <form onSubmit={handleBroadcast}>
              <textarea 
                className={styles.input} 
                rows="4" 
                placeholder="Type global announcement..."
                value={broadcastMsg}
                onChange={(e) => setBroadcastMsg(e.target.value)}
                style={{ borderRadius: '12px', resize: 'none', marginBottom: '15px' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '11px', color: 'var(--accent)' }}>{status}</span>
                <button className={styles.btnStart} type="submit" disabled={!broadcastMsg}>
                  📣 Send Broadcast
                </button>
              </div>
            </form>
          </div>

          {/* 🔥 TRENDING TAGS */}
          <div className={styles.searchCard}>
            <h3 className={styles.interestTitle} style={{ fontSize: '18px' }}>Trending Tags</h3>
            <p className={styles.interestSubtitle}>Most popular interest scores</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '15px' }}>
              {stats.trendingTags.map((tag, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.03)', padding: '10px', borderRadius: '8px' }}>
                  <span style={{ fontSize: '14px', fontWeight: '600' }}>#{tag[0]}</span>
                  <span style={{ fontSize: '12px', fontFamily: 'var(--font-mono)', opacity: 0.6 }}>{tag[1]} hits</span>
                </div>
              ))}
              {stats.trendingTags.length === 0 && <p style={{ fontSize: '12px', opacity: 0.5 }}>No active tags recorded.</p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
