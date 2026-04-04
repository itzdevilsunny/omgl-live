import Head from 'next/head';
import styles from '../styles/Home.module.css';

export default function Terms() {
  return (
    <div className={styles.container} style={{ padding: '80px 20px', minHeight: '100vh', overflowY: 'auto' }}>
      <Head><title>Terms of Service | StrangerLink</title></Head>
      <div style={{ maxWidth: '800px', margin: '0 auto', color: 'var(--text)' }}>
        <h1 className={styles.heroTitle} style={{ fontSize: '32px' }}>Terms of <span className={styles.textGradient}>Service</span></h1>
        <p className={styles.heroSubtitle}>Be Kind. Be Respectful. Stay Safe.</p>
        
        <div style={{ lineHeight: '1.8', opacity: 0.8 }}>
          <h3 style={{ marginTop: '40px' }}>1. Age Restriction</h3>
          <p>By using StrangerLink, you represent that you are at least 18 years of age. This service is strictly for adults. Any attempt to bypass this by minors will result in a permanent ban.</p>

          <h3 style={{ marginTop: '30px' }}>2. Acceptable Conduct</h3>
          <p>You agree not to engage in harassment, bullying, or sharing of sexually explicit content with partners who do not consent. Any behavior that violates platform safety is grounds for an immediate, irrevocable session termination.</p>

          <h3 style={{ marginTop: '30px' }}>3. Disclaimer of Liability</h3>
          <p>StrangerLink is an ephemeral communication platform. We are not responsible for the actions, content, or behavior of our users. Use caution when sharing information; never share your full name, location, or financial details with strangers.</p>

          <h3 style={{ marginTop: '30px' }}>4. Termination</h3>
          <p>We reserve the right to terminate your access to the service at any time, for any reason, without notice. Safety features like our "Report" system are automated and binding.</p>
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
