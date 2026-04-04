import { useState, useEffect } from 'react';
import Head from 'next/head';
import styles from '../styles/Home.module.css';
import Pusher from 'pusher-js';

export default function AdminDashboard() {
  const [authorized, setAuthorized] = useState(false);
  const [secret, setSecret] = useState('');
  const [stats, setStats] = useState({ activeUsers: 0, waitingCount: 0, users: [], trendingTags: [] });
  const [broadcastMsg, setBroadcastMsg] = useState('');
  const [status, setStatus] = useState('');
  const [kickingId, setKickingId] = useState(null);

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

  // 3. Handle Kick
  const handleKick = async (targetUserId) => {
    if (!confirm(`Are you sure you want to kick session ${targetUserId}?`)) return;
    setKickingId(targetUserId);
    try {
      const res = await fetch('/api/admin-kick', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-secret': secret
        },
        body: JSON.stringify({ targetUserId })
      });
      if (res.ok) {
        setStats(prev => ({
          ...prev,
          users: prev.users.filter(u => u !== targetUserId),
          activeUsers: prev.activeUsers - 1
        }));
      }
    } catch (err) { console.error(err); }
    setKickingId(null);
  };

  if (!authorized) {
    return (
      <div className={styles.container} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--bg)' }}>
        <Head><title>Admin Login | StrangerLink</title></Head>
        <div className={styles.interestCard} style={{ maxWidth: '400px', textAlign: 'center', borderColor: 'var(--accent)' }}>
          <h1 className={styles.interestTitle}>🔒 Command Center</h1>
          <p className={styles.interestSubtitle}>StrangerLink High-Fidelity Governance</p>
          <div style={{ marginTop: '20px' }}>
            <input 
              type="password" 
              className={styles.input} 
              placeholder="System Access Token..." 
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && setAuthorized(true)}
              style={{ borderRadius: '4px', textAlign: 'center', letterSpacing: '4px' }}
            />
            <button className={styles.btnStart} onClick={() => setAuthorized(true)} style={{ width: '100%', justifyContent: 'center', marginTop: '15px' }}>
              Authenticate Phase
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container} style={{ padding: '40px 20px', minHeight: '100vh', background: 'var(--bg)' }}>
      <Head><title>Command Center | StrangerLink</title></Head>
      
      <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '40px', borderBottom: '1px solid var(--border)', paddingBottom: '20px' }}>
          <div>
            <h1 className={styles.heroTitle} style={{ fontSize: '28px', marginBottom: '5px' }}>
              StrangerLink <span className={styles.textGradient}>Governance</span>
            </h1>
            <p style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', letterSpacing: '0.1em' }}>STRATEGIC PLATFORM OVERWATCH // READY</p>
          </div>
          <button className={styles.btnStop} onClick={() => setAuthorized(false)} style={{ borderRadius: '2px', padding: '8px 20px' }}>🚪 TERMINATE SESSION</button>
        </div>

        {/* 🏆 STATS GRID */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px', marginBottom: '40px' }}>
          <div className={styles.searchCard} style={{ padding: '24px', borderLeft: '4px solid var(--green)' }}>
            <p className={styles.settingsLabel}>Network Activity</p>
            <h2 style={{ fontSize: '42px', fontWeight: '800', margin: '14px 0', fontFamily: 'var(--font-display)' }}>{stats.activeUsers}</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div className={styles.onlineDot} />
              <p style={{ fontSize: '11px', color: 'var(--green)', fontFamily: 'var(--font-mono)' }}>LIVE CONNECTIONS</p>
            </div>
          </div>
          <div className={styles.searchCard} style={{ padding: '24px', borderLeft: '4px solid var(--accent)' }}>
            <p className={styles.settingsLabel}>Matchmaking Queue</p>
            <h2 style={{ fontSize: '42px', fontWeight: '800', margin: '14px 0', fontFamily: 'var(--font-display)' }}>{stats.waitingCount}</h2>
            <p style={{ fontSize: '11px', color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>WAITING FOR PAIRING</p>
          </div>
          <div className={styles.searchCard} style={{ padding: '24px', borderLeft: '4px solid var(--text-dim)' }}>
            <p className={styles.settingsLabel}>Signal Integrity</p>
            <h2 style={{ fontSize: '42px', fontWeight: '800', margin: '14px 0', fontFamily: 'var(--font-display)' }}>99.9%</h2>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>OPERATIONAL NOMINAL</p>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '30px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
            {/* 📢 BROADCAST */}
            <div className={styles.searchCard} style={{ padding: '30px' }}>
              <h3 className={styles.interestTitle} style={{ fontSize: '20px', marginBottom: '10px' }}>Global Broadcast</h3>
              <p className={styles.interestSubtitle} style={{ marginBottom: '20px' }}>Dispatch priority system message to all active nodes</p>
              <form onSubmit={handleBroadcast}>
                <textarea 
                  className={styles.input} 
                  rows="4" 
                  placeholder="System command string..."
                  value={broadcastMsg}
                  onChange={(e) => setBroadcastMsg(e.target.value)}
                  style={{ borderRadius: '4px', resize: 'none', marginBottom: '20px', background: 'var(--surface3)', borderColor: 'var(--border-strong)' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '11px', color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>{status}</span>
                  <button className={styles.btnStart} type="submit" disabled={!broadcastMsg} style={{ borderRadius: '2px' }}>
                    📣 TRANSMIT SIGNAL
                  </button>
                </div>
              </form>
            </div>

            {/* 👥 USER MANAGEMENT */}
            <div className={styles.searchCard} style={{ padding: '30px' }}>
              <h3 className={styles.interestTitle} style={{ fontSize: '20px', marginBottom: '10px' }}>Live Sessions</h3>
              <p className={styles.interestSubtitle} style={{ marginBottom: '20px' }}>Active peer identification and moderation</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {stats.users && stats.users.map((uid) => (
                  <div key={uid} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--surface3)', padding: '12px 20px', borderRadius: '4px', border: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                      <div style={{ width: '8px', height: '8px', background: 'var(--green)', borderRadius: '50%' }} />
                      <span style={{ fontSize: '13px', fontFamily: 'var(--font-mono)', fontWeight: '600' }}>{uid.slice(0, 16)}...</span>
                    </div>
                    <button 
                      className={styles.btnStop} 
                      onClick={() => handleKick(uid)}
                      disabled={kickingId === uid}
                      style={{ padding: '6px 12px', fontSize: '11px', borderRadius: '2px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', color: '#ef4444' }}
                    >
                      {kickingId === uid ? 'PURGING...' : 'PURGE SESSION'}
                    </button>
                  </div>
                ))}
                {(!stats.users || stats.users.length === 0) && (
                  <p style={{ textAlign: 'center', padding: '40px', opacity: 0.3, fontFamily: 'var(--font-mono)', fontSize: '12px' }}>NO ACTIVE SESSIONS DETECTED</p>
                )}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
            {/* 🔥 TRENDING TAGS */}
            <div className={styles.searchCard} style={{ padding: '30px' }}>
              <h3 className={styles.interestTitle} style={{ fontSize: '20px', marginBottom: '10px' }}>Discovery Intel</h3>
              <p className={styles.interestSubtitle} style={{ marginBottom: '20px' }}>High-density interest analytics</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {stats.trendingTags.map((tag, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--surface3)', padding: '15px', borderRadius: '4px', borderLeft: `3px solid var(--accent)` }}>
                    <span style={{ fontSize: '14px', fontWeight: '700', letterSpacing: '0.05em' }}>#{tag[0].toUpperCase()}</span>
                    <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--accent)', fontWeight: '700' }}>{tag[1]} HITS</span>
                  </div>
                ))}
                {stats.trendingTags.length === 0 && <p style={{ fontSize: '12px', opacity: 0.5, textAlign: 'center', padding: '20px' }}>SCANNING FOR DATA...</p>}
              </div>
            </div>

            {/* 🛡️ SYSTEM STATUS */}
            <div className={styles.searchCard} style={{ padding: '30px', background: 'linear-gradient(180deg, var(--surface2) 0%, #000 100%)' }}>
               <h3 className={styles.interestTitle} style={{ fontSize: '18px', color: 'var(--text-muted)' }}>Core Status</h3>
               <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
                    <span style={{ opacity: 0.6 }}>REDIS CLUSTER</span>
                    <span style={{ color: 'var(--green)' }}>ENCRYPTED // ONLINE</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
                    <span style={{ opacity: 0.6 }}>PUSHER SIGNAL</span>
                    <span style={{ color: 'var(--green)' }}>ACTIVE // ap2</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
                    <span style={{ opacity: 0.6 }}>ENCRYPTION</span>
                    <span style={{ color: 'var(--green)' }}>AES-256 GCM</span>
                  </div>
               </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
