import { useEffect, useRef, useState } from 'react';
import Head from 'next/head';
import Pusher from 'pusher-js';
import styles from '../styles/Home.module.css';

/* ── ICE Config ─────────────────────────────────────────────── */
const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
    { urls: 'turn:openrelay.metered.ca:80',     username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443',    username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
  ],
};

const QUICK_TAGS = ['gaming', 'coding', 'music', 'anime', 'movies', 'art', 'sports', 'travel'];

function generateUserId() {
  return 'u-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

/* ── Component ──────────────────────────────────────────────── */
export default function StrangerLinkApp() {
  /* STATE */
  const [mounted, setMounted] = useState(false);
  const [userId] = useState(() => {
    if (typeof window !== 'undefined') {
      let id = sessionStorage.getItem('userId');
      if (!id) { id = generateUserId(); sessionStorage.setItem('userId', id); }
      return id;
    }
    return 'ssr';
  });

  const [status, setStatus] = useState('idle');
  // idle | requesting | waiting | connected | disconnected
  const [isMuted, setIsMuted] = useState(false);
  const [isCamOff, setIsCamOff] = useState(false);
  const [messages, setMessages] = useState([]);
  const [inputMsg, setInputMsg] = useState('');
  const [partnerTyping, setPartnerTyping] = useState(false);
  const [interests, setInterests] = useState('');
  const [activeTags, setActiveTags] = useState([]);
  const [debugMsg, setDebugMsg] = useState('');
  const [msgCount, setMsgCount] = useState(0);

  /* REFS */
  const statusRef      = useRef('idle');
  const localVideoRef  = useRef(null);
  const remoteVideoRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteStreamRef= useRef(null);
  const pollingRef     = useRef(null);
  const pendingIceRef  = useRef([]);
  const pcRef          = useRef(null);
  const pusherRef      = useRef(null);
  const partnerIdRef   = useRef(null);
  const roomIdRef      = useRef(null);
  const chatEndRef     = useRef(null);
  const typingTimer    = useRef(null);
  const userIdRef      = useRef(userId);

  /* ── UTILS ─────────────────────────────────────────────────── */
  function updateStatus(s) { statusRef.current = s; setStatus(s); }
  function log(msg) { console.log('[SL]', msg); setDebugMsg(msg); }

  function getInterestsArray() {
    const manual = interests.split(',').map(i => i.trim()).filter(Boolean);
    return [...new Set([...activeTags, ...manual])];
  }

  /* ── MEDIA ──────────────────────────────────────────────────── */
  async function getLocalStream() {
    if (localStreamRef.current) return localStreamRef.current;
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    localStreamRef.current = stream;
    if (localVideoRef.current) localVideoRef.current.srcObject = stream;
    return stream;
  }

  /* ── WEBRTC ─────────────────────────────────────────────────── */
  function createPeerConnection() {
    if (pcRef.current) { pcRef.current.close(); pcRef.current = null; }

    log('Creating PeerConnection...');
    const pc = new RTCPeerConnection(ICE_SERVERS);
    pcRef.current = pc;

    // Stable remote stream — attach once to video element
    const remoteStream = new MediaStream();
    remoteStreamRef.current = remoteStream;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream;

    pc.ontrack = (e) => {
      log(`Track: ${e.track.kind}`);
      remoteStream.addTrack(e.track);
      if (remoteVideoRef.current && remoteVideoRef.current.srcObject !== remoteStream) {
        remoteVideoRef.current.srcObject = remoteStream;
      }
    };

    pc.onicecandidate = (e) => {
      if (e.candidate && partnerIdRef.current) {
        fetch('/api/signal', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetUserId: partnerIdRef.current, type: 'ice', data: e.candidate, from: userIdRef.current }),
        });
      }
    };

    pc.onicegatheringstatechange = () => log(`Gathering: ${pc.iceGatheringState}`);
    pc.oniceconnectionstatechange = () => {
      log(`ICE: ${pc.iceConnectionState}`);
      if (pc.iceConnectionState === 'failed') { log('ICE failed — restarting'); pc.restartIce(); }
    };
    pc.onconnectionstatechange = () => {
      log(`PC: ${pc.connectionState}`);
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') handlePartnerLeft();
    };

    const stream = localStreamRef.current;
    if (stream) stream.getTracks().forEach(t => pc.addTrack(t, stream));

    return pc;
  }

  async function flushIce() {
    const pc = pcRef.current;
    if (!pc || !pc.remoteDescription) return;
    const queue = [...pendingIceRef.current];
    pendingIceRef.current = [];
    for (const c of queue) try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch {}
  }

  /* ── SIGNALING HANDLERS ────────────────────────────────────── */
  async function handleOffer(offer, fromId) {
    log(`Offer from ${fromId}`);
    partnerIdRef.current = fromId;
    const pc = createPeerConnection();
    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    await flushIce();
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await sig(fromId, 'answer', answer);
    log('Answer sent');
  }

  async function handleAnswer(answer) {
    log('Answer received');
    const pc = pcRef.current;
    if (!pc) return;
    await pc.setRemoteDescription(new RTCSessionDescription(answer));
    await flushIce();
  }

  async function handleIce(candidate) {
    const pc = pcRef.current;
    if (!pc || !pc.remoteDescription) { pendingIceRef.current.push(candidate); }
    else try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch {}
  }

  async function sig(targetUserId, type, data) {
    await fetch('/api/signal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetUserId, type, data, from: userIdRef.current }),
    });
  }

  /* ── CALL FLOW ─────────────────────────────────────────────── */
  async function startCall(isInitiator) {
    log(`startCall isInitiator=${isInitiator}`);
    await getLocalStream();
    if (isInitiator) {
      await new Promise(r => setTimeout(r, 800));
      const pc = createPeerConnection();
      const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
      await pc.setLocalDescription(offer);
      log(`Sending offer to ${partnerIdRef.current}`);
      await sig(partnerIdRef.current, 'offer', offer);
    }
  }

  /* ── PUSHER ─────────────────────────────────────────────────── */
  function connectSignaling() {
    if (pusherRef.current) return;
    const pusher = new Pusher(process.env.NEXT_PUBLIC_PUSHER_KEY, { cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER });
    pusherRef.current = pusher;
    const ch = pusher.subscribe(`user-${userId}`);

    ch.bind('matched', async ({ roomId, isInitiator, partnerId }) => {
      log(`Matched! room=${roomId} init=${isInitiator}`);
      roomIdRef.current = roomId;
      if (partnerId) partnerIdRef.current = partnerId;
      if (pollingRef.current) clearInterval(pollingRef.current);
      updateStatus('connected');
      setMessages([]);
      setMsgCount(0);
      await startCall(isInitiator);
    });

    ch.bind('signal', async ({ type, data, from }) => {
      if (from && !partnerIdRef.current) partnerIdRef.current = from;
      if (type === 'offer')        await handleOffer(data, from);
      else if (type === 'answer')  await handleAnswer(data);
      else if (type === 'ice')     await handleIce(data);
      else if (type === 'chat' && statusRef.current === 'connected') {
        setMessages(m => [...m, { from: 'them', text: data.text }]);
        setMsgCount(n => n + 1);
        setPartnerTyping(false);
      }
      else if (type === 'typing')       setPartnerTyping(true);
      else if (type === 'stop-typing')  setPartnerTyping(false);
    });

    ch.bind('partner-left', () => handlePartnerLeft());
    ch.bind('kicked', ({ message }) => { alert(message || 'Disconnected by admin.'); window.location.reload(); });
  }

  function disconnectSignaling() {
    if (pusherRef.current) { pusherRef.current.disconnect(); pusherRef.current = null; }
  }

  /* ── ACTIONS ────────────────────────────────────────────────── */
  function handlePartnerLeft() {
    log('Partner left');
    updateStatus('disconnected');
    setMessages(m => [...m, { from: 'system', text: 'Stranger has left the chat.' }]);
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    remoteStreamRef.current = null;
    pcRef.current?.close();
    pcRef.current = null;
    partnerIdRef.current = null;
    pendingIceRef.current = [];
  }

  async function startSearching() {
    if (statusRef.current === 'requesting' || statusRef.current === 'waiting') return;
    updateStatus('requesting');
    setMessages([]);
    try { await getLocalStream(); } catch {
      alert('Camera and microphone required. Please allow access and try again.');
      updateStatus('idle'); return;
    }
    connectSignaling();
    updateStatus('waiting');
    partnerIdRef.current = null;
    pendingIceRef.current = [];

    async function doJoin() {
      try {
        await fetch('/api/join', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, interests: getInterestsArray() }),
        });
      } catch {}
    }
    doJoin();
    pollingRef.current = setInterval(() => {
      if (statusRef.current !== 'waiting') { clearInterval(pollingRef.current); return; }
      doJoin();
    }, 2000);
  }

  async function skipPartner() {
    if (partnerIdRef.current) {
      fetch('/api/leave', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ partnerId: partnerIdRef.current, userId }) }).catch(() => {});
    }
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    remoteStreamRef.current = null;
    pcRef.current?.close(); pcRef.current = null;
    partnerIdRef.current = null;
    pendingIceRef.current = [];
    setMessages([]);
    updateStatus('waiting');
    async function doJoin() {
      try { await fetch('/api/join', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ userId, interests: getInterestsArray() }) }); } catch {}
    }
    doJoin();
    pollingRef.current = setInterval(() => {
      if (statusRef.current !== 'waiting') { clearInterval(pollingRef.current); return; }
      doJoin();
    }, 2000);
  }

  async function stopChat() {
    if (pollingRef.current) clearInterval(pollingRef.current);
    if (partnerIdRef.current) fetch('/api/leave', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ partnerId: partnerIdRef.current, userId }) }).catch(() => {});
    pcRef.current?.close(); pcRef.current = null;
    partnerIdRef.current = null; pendingIceRef.current = [];
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    remoteStreamRef.current = null;
    disconnectSignaling();
    updateStatus('idle');
    setMessages([]); setDebugMsg(''); setMsgCount(0);
  }

  function toggleMute() {
    const tr = localStreamRef.current?.getAudioTracks()[0];
    if (tr) { tr.enabled = !tr.enabled; setIsMuted(!tr.enabled); }
  }
  function toggleCam() {
    const tr = localStreamRef.current?.getVideoTracks()[0];
    if (tr) { tr.enabled = !tr.enabled; setIsCamOff(!tr.enabled); }
  }

  async function sendMessage() {
    if (!inputMsg.trim() || !partnerIdRef.current) return;
    const text = inputMsg.trim();
    setInputMsg('');
    setMessages(m => [...m, { from: 'me', text }]);
    await sig(partnerIdRef.current, 'chat', { text });
  }

  function handleTypingInput(val) {
    setInputMsg(val);
    if (!partnerIdRef.current) return;
    sig(partnerIdRef.current, 'typing', {});
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => sig(partnerIdRef.current, 'stop-typing', {}), 1500);
  }

  function toggleTag(tag) {
    setActiveTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
  }

  /* ── EFFECTS ────────────────────────────────────────────────── */
  useEffect(() => {
    setMounted(true);
    return () => { if (statusRef.current !== 'idle') stopChat(); };
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (!mounted) return <div style={{ background: '#07070d', height: '100vh' }} />;

  const isActive = status === 'connected';
  const isSearching = status === 'waiting' || status === 'requesting';

  /* ── RENDER ─────────────────────────────────────────────────── */
  return (
    <>
      <Head>
        <title>StrangerLink — Meet Someone New</title>
        <meta name="description" content="Connect with random strangers via video chat. Ephemeral, anonymous, global." />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>◈</text></svg>" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />
      </Head>

      <div className={styles.container}>
        {/* ── HEADER ─────────────────────────────────────────── */}
        <header className={styles.header}>
          <div className={styles.logo}>
            <span className={styles.logoMark}>◈</span>
            <span className={styles.logoText}>StrangerLink</span>
          </div>
          <div className={styles.tagline}>EPHEMERAL · ANONYMOUS · GLOBAL</div>
          <div className={styles.liveBadge}>
            <div className={styles.livePulse} />
            <span className={styles.liveCount}>LIVE</span>
          </div>
        </header>

        {/* ── MAIN ───────────────────────────────────────────── */}
        <main className={styles.main}>

          {/* LEFT: VIDEO AREA */}
          <div className={styles.videoArea}>
            {/* Remote video */}
            <div className={styles.videoSlotRemote}>
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                muted
                className={styles.videoRemote}
              />

              {/* Vignette overlay */}
              <div className={styles.videoVignette} />

              {/* Status indicator */}
              {status !== 'idle' && (
                <div className={styles.connectionStatus}>
                  <div className={`${styles.connectionDot} ${isSearching ? styles.connectionDotWaiting : ''}`} />
                  <span className={styles.connectionLabel}>
                    {isSearching ? 'SEARCHING...' : isActive ? 'CONNECTED' : 'DISCONNECTED'}
                  </span>
                </div>
              )}

              {/* Debug HUD */}
              {debugMsg && isActive && (
                <div className={styles.debugHud}>{debugMsg}</div>
              )}

              {/* Placeholder for remote */}
              {status !== 'connected' && (
                <div className={styles.videoPlaceholder}>
                  <div className={styles.placeholderContent}>
                    {status === 'idle' && (
                      <>
                        <span className={styles.placeholderIcon}>👤</span>
                        <span className={styles.placeholderText}>Start to meet someone</span>
                      </>
                    )}
                    {status === 'requesting' && (
                      <>
                        <div className={styles.spinner} />
                        <span className={styles.placeholderText}>Requesting camera...</span>
                      </>
                    )}
                    {status === 'waiting' && (
                      <>
                        <div className={styles.pulser} />
                        <span className={styles.placeholderText}>Finding a stranger...</span>
                      </>
                    )}
                    {status === 'disconnected' && (
                      <>
                        <span className={styles.placeholderIcon}>👋</span>
                        <span className={styles.placeholderText}>Stranger left. Start again?</span>
                      </>
                    )}
                  </div>
                </div>
              )}

              <span className={styles.videoLabel}>Stranger</span>
            </div>

            {/* PiP Local video */}
            <div className={styles.videoSlotLocal}>
              <video ref={localVideoRef} autoPlay playsInline muted className={styles.videoLocal} />
              <span className={styles.videoLabel}>You</span>
            </div>

            {/* Interests overlay (idle only) */}
            {status === 'idle' && (
              <div className={styles.interestOverlay}>
                <div className={styles.interestCard}>
                  <div>
                    <h1 className={styles.interestTitle}>Meet a Stranger</h1>
                    <p className={styles.interestSubtitle}>Anonymous · End-to-end · Ephemeral</p>
                  </div>
                  <div className={styles.interestTags}>
                    {QUICK_TAGS.map(tag => (
                      <button
                        key={tag}
                        className={`${styles.tagChip} ${activeTags.includes(tag) ? styles.tagChipActive : ''}`}
                        onClick={() => toggleTag(tag)}
                      >
                        {activeTags.includes(tag) ? '✓ ' : '# '}{tag}
                      </button>
                    ))}
                  </div>
                  <input
                    type="text"
                    placeholder="Or type custom interests..."
                    value={interests}
                    onChange={e => setInterests(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && startSearching()}
                    className={styles.input}
                  />
                  <button className={styles.btnStart} onClick={startSearching}>
                    ▶ Start Chatting
                  </button>
                </div>
              </div>
            )}

            {status === 'disconnected' && (
              <div className={styles.interestOverlay} style={{ background: 'rgba(7,7,13,0.7)' }}>
                <div className={styles.interestCard}>
                  <h2 className={styles.interestTitle}>Stranger left 👋</h2>
                  <p className={styles.interestSubtitle}>Chat ended. Meet someone new?</p>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button className={styles.btnStart} onClick={startSearching} style={{ flex: 1 }}>
                      ⟳ Next Stranger
                    </button>
                    <button className={styles.btnStop} onClick={stopChat}>
                      ✕ Stop
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Floating Controls Bar */}
            {(isSearching || isActive) && (
              <div className={styles.controlsBar}>
                {isActive && (
                  <>
                    <button className={styles.btnSkip} onClick={skipPartner}>
                      ⟳ Skip
                    </button>
                    <div className={styles.divider} />
                    <button
                      className={`${styles.btnIcon} ${isMuted ? styles.btnIconActive : ''}`}
                      onClick={toggleMute}
                      title={isMuted ? 'Unmute mic' : 'Mute mic'}
                    >
                      {isMuted ? '🔇' : '🎙'}
                    </button>
                    <button
                      className={`${styles.btnIcon} ${isCamOff ? styles.btnIconActive : ''}`}
                      onClick={toggleCam}
                      title={isCamOff ? 'Turn cam on' : 'Turn cam off'}
                    >
                      {isCamOff ? '🚫' : '📷'}
                    </button>
                    <div className={styles.divider} />
                  </>
                )}
                {isSearching && (
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'rgba(255,255,255,0.5)', letterSpacing: '0.08em' }}>
                    Searching...
                  </span>
                )}
                <button className={styles.btnStop} onClick={stopChat}>
                  ✕ {isSearching ? 'Cancel' : 'Stop'}
                </button>
              </div>
            )}
          </div>

          {/* RIGHT PANEL: Chat */}
          <div className={styles.rightPanel}>
            <div className={styles.chatHeader}>
              <span className={styles.chatHeaderTitle}>💬 Chat</span>
              {isActive && msgCount > 0 && (
                <span className={styles.chatHeaderSub}>{msgCount} messages</span>
              )}
            </div>

            <div className={styles.chatArea}>
              <div className={styles.chatMessages}>
                {messages.length === 0 && (
                  <div className={styles.chatEmpty}>
                    <span className={styles.chatEmptyIcon}>{isActive ? '👋' : '💬'}</span>
                    <span className={styles.chatEmptyText}>
                      {isActive ? 'Say hello to your new stranger' : 'Chat messages will appear here'}
                    </span>
                  </div>
                )}
                {messages.map((m, i) => (
                  <div key={i} className={`${styles.message} ${styles[m.from]}`}>
                    {m.from !== 'system' && (
                      <span className={styles.msgFrom}>{m.from === 'me' ? 'You' : 'Stranger'}</span>
                    )}
                    <span className={styles.msgText}>{m.text}</span>
                  </div>
                ))}
                {partnerTyping && (
                  <div className={`${styles.message} ${styles.them}`}>
                    <span className={styles.msgFrom}>Stranger</span>
                    <span className={styles.msgText}>
                      <span className={styles.typingDots}>
                        <span /><span /><span />
                      </span>
                    </span>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              <div className={styles.chatInput}>
                <input
                  type="text"
                  placeholder={isActive ? 'Type a message...' : 'Connect to chat...'}
                  value={inputMsg}
                  disabled={!isActive}
                  onChange={e => handleTypingInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && sendMessage()}
                  className={styles.input}
                />
                <button
                  className={styles.btnSend}
                  onClick={sendMessage}
                  disabled={!isActive || !inputMsg.trim()}
                >
                  Send ↵
                </button>
              </div>
            </div>
          </div>
        </main>

        <footer className={styles.footer}>
          Be respectful · 18+ only · Do not share personal information
        </footer>
      </div>
    </>
  );
}
