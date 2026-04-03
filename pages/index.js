import dynamic from 'next/dynamic';
import Head from 'next/head';

// This is the CRITICAL FIX for the "ReferenceError: (V/U) before initialization"
// We use a NO-SSR dynamic import to completely bypass the Vercel Build-time 
// Prerendering (Step 9) that is crashing the build.
const StrangerLinkApp = dynamic(() => import('../components/StrangerLinkApp'), {
  ssr: false,
  loading: () => (
    <div style={{ 
      display: 'flex', 
      justifyContent: 'center', 
      alignItems: 'center', 
      height: '100vh', 
      background: '#0a0a0c', 
      color: '#fff', 
      fontFamily: 'Syne, sans-serif' 
    }}>
      <div style={{ textAlign: 'center' }}>
        <p style={{ opacity: 0.6, fontSize: '14px', letterSpacing: '1px' }}>INITIALIZING SECURE LINK...</p>
      </div>
    </div>
  )
});

export default function Home() {
  return (
    <>
      <Head>
        <title>StrangerLink — Meet Someone New</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>⚡</text></svg>" />
      </Head>
      <StrangerLinkApp />
    </>
  );
}
