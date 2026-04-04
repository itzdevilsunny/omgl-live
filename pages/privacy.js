import Head from 'next/head';
import styles from '../styles/Home.module.css';

export default function Privacy() {
  return (
    <div className={styles.container} style={{ padding: '80px 20px', minHeight: '100vh', overflowY: 'auto' }}>
      <Head><title>Privacy Policy | StrangerLink</title></Head>
      <div style={{ maxWidth: '800px', margin: '0 auto', color: 'var(--text)' }}>
        <h1 className={styles.heroTitle} style={{ fontSize: '32px' }}>Privacy <span className={styles.textGradient}>Policy</span></h1>
        <p className={styles.heroSubtitle}>Your anonymity is our core principle.</p>
        
        <div style={{ lineHeight: '1.8', opacity: 0.8 }}>
          <h3 style={{ marginTop: '40px' }}>1. Data Encryption</h3>
          <p>All video and audio streams are Peer-to-Peer (P2P) whenever possible. This means your media is encrypted and flows directly between you and your partner. StrangerLink never records or stores your video chat sessions.</p>

          <h3 style={{ marginTop: '30px' }}>2. Ephemeral Sessions</h3>
          <p>Your session IDs and partner links are deleted the moment you disconnect. We use Upstash Redis for temporary real-time matchmaking, and these records are purged automatically on a rolling basis.</p>

          <h3 style={{ marginTop: '30px' }}>3. No Tracking</h3>
          <p>We do not use tracking cookies for advertising. Your "Interests" are only used to find a partner who shares those tags and are deleted once the session ends.</p>

          <h3 style={{ marginTop: '30px' }}>4. Safety Reporting</h3>
          <p>When you use the "Report" button, we receive the anonymous ID of the partner to flag them from future matchmaking. This is the only persistent record created to maintain platform safety.</p>
        </div>

        <button 
          className={styles.btnStart} 
          onClick={() => window.location.href = '/'} 
          style={{ marginTop: '50px', justifyContent: 'center' }}
        >
          Back to Chat
        </button>
      </div>
    </div>
  );
}
