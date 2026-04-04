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
        <title>StrangerLink — World's Fastest Video Discovery</title>
        <meta name="description" content="Connect instantly with strangers worldwide. 100% anonymous, ephemeral, and encrypted video chat with premium WebRTC technology." />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#0a0a0c" />
        
        {/* PWA Manifest */}
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />

        {/* Open Graph / Facebook */}
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://strangerlink.chat/" />
        <meta property="og:title" content="StrangerLink — Meet Someone New" />
        <meta property="og:description" content="Ultra-low latency random video chat. High-fidelity, secure, and instant." />
        <meta property="og:image" content="https://strangerlink.chat/og-image.png" />

        {/* Twitter */}
        <meta property="twitter:card" content="summary_large_image" />
        <meta property="twitter:title" content="StrangerLink — Meet Someone New" />
        <meta property="twitter:description" content="Ultra-low latency random video chat. High-fidelity, secure, and instant." />

        <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>⚡</text></svg>" />
      </Head>
      <StrangerLinkApp />
    </>
  );
}
