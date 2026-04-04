import { useEffect, useRef, useState } from 'react';
import Head from 'next/head';
import Pusher from 'pusher-js';
import styles from '../styles/Home.module.css';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
    {
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    },
    {
      urls: 'turn:openrelay.metered.ca:443',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    },
    {
      urls: 'turn:openrelay.metered.ca:443?transport=tcp',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    }
  ],
};

function generateUserId() {
  return 'u-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export default function Home() {
  // ── STATE ──────────────────────────────────────────────────────────────────
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
  const [isMuted, setIsMuted] = useState(false);
  const [isCamOff, setIsCamOff] = useState(false);
  const [messages, setMessages] = useState([]);
  const [inputMsg, setInputMsg] = useState('');
  const [partnerTyping, setPartnerTyping] = useState(false);
  const [interests, setInterests] = useState('');
  const [debugInfo, setDebugInfo] = useState('');

  // ── REFS ───────────────────────────────────────────────────────────────────
  const statusRef = useRef('idle');
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);   // ✅ FIX: Stable stream ref for ontrack closure
  const pollingRef = useRef(null);
  const pendingIceRef = useRef([]);
  const pcRef = useRef(null);
  const pusherRef = useRef(null);
  const partnerIdRef = useRef(null);
  const roomIdRef = useRef(null);
  const roomChannelRef = useRef(null);
  const chatEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const userIdRef = useRef(userId);       // ✅ Stable ref for userId in async closures

  // ── HELPERS ────────────────────────────────────────────────────────────────
  function updateStatus(s) {
    statusRef.current = s;
    setStatus(s);
  }

  function log(msg) {
    console.log(`[SL] ${msg}`);
    setDebugInfo(msg);
  }

  // ── MEDIA ──────────────────────────────────────────────────────────────────
  async function getLocalStream() {
    if (localStreamRef.current) return localStreamRef.current;
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: true,
    });
    localStreamRef.current = stream;
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = stream;
    }
    return stream;
  }

  // ── WEBRTC ─────────────────────────────────────────────────────────────────
  function createPeerConnection() {
    // Close any lingering PC first
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }

    log('Creating PeerConnection...');
    const pc = new RTCPeerConnection(ICE_SERVERS);
    pcRef.current = pc;

    // ✅ FIX: Create a stable MediaStream ONCE and attach it to the video element.
    // All incoming tracks get added to this stream. This avoids stale closure bugs
    // where ontrack fires before remoteVideoRef is assigned.
    const remoteStream = new MediaStream();
    remoteStreamRef.current = remoteStream;
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = remoteStream;
    }

    // ✅ FIX: ontrack just adds the track to the stable stream. No .play() calls here
    // because the video element with autoPlay handles it automatically.
    pc.ontrack = (e) => {
      log(`ontrack: kind=${e.track.kind} state=${e.track.readyState}`);
      e.track.onunmute = () => {
        log(`Track unmuted: ${e.track.kind}`);
      };
      remoteStream.addTrack(e.track);
      // Force video element to use latest stream (handles re-connections)
      if (remoteVideoRef.current && remoteVideoRef.current.srcObject !== remoteStream) {
        remoteVideoRef.current.srcObject = remoteStream;
      }
    };

    pc.onicecandidate = (e) => {
      if (e.candidate && partnerIdRef.current) {
        fetch('/api/signal', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            targetUserId: partnerIdRef.current,
            type: 'ice',
            data: e.candidate,
            from: userIdRef.current,
          }),
        });
      }
    };

    pc.onicegatheringstatechange = () => log(`ICE Gathering: ${pc.iceGatheringState}`);
    pc.oniceconnectionstatechange = () => {
      log(`ICE Connection: ${pc.iceConnectionState}`);
      if (pc.iceConnectionState === 'failed') {
        log('ICE failed — attempting restart');
        pc.restartIce();
      }
    };
    pc.onconnectionstatechange = () => {
      log(`PC State: ${pc.connectionState}`);
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        handlePartnerLeft();
      }
    };

    // Add local tracks to the new PC
    const stream = localStreamRef.current;
    if (stream) {
      stream.getTracks().forEach(track => {
        pc.addTrack(track, stream);
        log(`Added local track: ${track.kind}`);
      });
    }

    return pc;
  }

  async function flushIceCandidates() {
    const pc = pcRef.current;
    if (!pc || !pc.remoteDescription) return;
    const queue = [...pendingIceRef.current];
    pendingIceRef.current = [];
    log(`Flushing ${queue.length} buffered ICE candidates`);
    for (const c of queue) {
      try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch (e) {}
    }
  }

  // ── SIGNALING HANDLERS ─────────────────────────────────────────────────────
  async function handleOffer(offer, fromId) {
    log(`handleOffer from ${fromId}`);
    partnerIdRef.current = fromId;
    const pc = createPeerConnection();
    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    await flushIceCandidates();
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await fetch('/api/signal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetUserId: fromId,
        type: 'answer',
        data: answer,
        from: userIdRef.current,
      }),
    });
    log('Answer sent');
  }

  async function handleAnswer(answer) {
    log('handleAnswer');
    const pc = pcRef.current;
    if (!pc) return;
    await pc.setRemoteDescription(new RTCSessionDescription(answer));
    await flushIceCandidates();
  }

  async function handleIce(candidate) {
    const pc = pcRef.current;
    if (!pc || !pc.remoteDescription) {
      pendingIceRef.current.push(candidate);
    } else {
      try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch (e) {}
    }
  }

  // ── CALL FLOW ──────────────────────────────────────────────────────────────
  //
  // ✅ FIX: The new call flow eliminates the peer-hello race condition.
  // 
  // OLD (broken) flow:
  //   matched → subscribe room → send peer-hello → wait for peer-hello event → create offer
  //   PROBLEM: The answerer may not have subscribed to the room yet when peer-hello fires.
  //
  // NEW (correct) flow:
  //   matched → subscribe room → BOTH sides ready
  //   The INITIATOR directly sends the offer via signal API to the known partnerId.
  //   The ANSWERER just waits for the offer signal (which already works reliably).
  //   No more peer-hello coordination needed.
  //
  async function startCall(isInitiator, roomId) {
    log(`startCall: isInitiator=${isInitiator}`);
    await getLocalStream();

    if (isInitiator) {
      // Brief delay to ensure answerer is subscribed to their signal channel
      await new Promise(r => setTimeout(r, 800));

      const pc = createPeerConnection();
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      });
      await pc.setLocalDescription(offer);
      log(`Sending offer to ${partnerIdRef.current}`);
      await fetch('/api/signal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetUserId: partnerIdRef.current,
          type: 'offer',
          data: offer,
          from: userIdRef.current,
        }),
      });
    }
    // The answerer just listens for the 'signal' event — no action needed here.
  }

  // ── PUSHER SIGNALING ───────────────────────────────────────────────────────
  function connectSignaling() {
    if (pusherRef.current) return;

    const pusher = new Pusher(process.env.NEXT_PUBLIC_PUSHER_KEY, {
      cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER,
    });
    pusherRef.current = pusher;

    const channel = pusher.subscribe(`user-${userId}`);

    channel.bind('matched', async ({ roomId, isInitiator, partnerId }) => {
      log(`Matched! roomId=${roomId} isInitiator=${isInitiator}`);
      roomIdRef.current = roomId;
      if (pollingRef.current) clearInterval(pollingRef.current);
      updateStatus('connected');
      setMessages([]);
      // partnerId comes from the signal event; if not present we derive from roomId
      if (partnerId) partnerIdRef.current = partnerId;
      await startCall(isInitiator, roomId);
    });

    channel.bind('signal', async ({ type, data, from }) => {
      // Always keep track of who our partner is
      if (from && !partnerIdRef.current) partnerIdRef.current = from;

      if (type === 'offer') await handleOffer(data, from);
      else if (type === 'answer') await handleAnswer(data);
      else if (type === 'ice') await handleIce(data);
      else if (type === 'chat') {
        if (statusRef.current === 'connected') {
          setMessages(m => [...m, { from: 'them', text: data.text }]);
          setPartnerTyping(false);
        }
      }
      else if (type === 'typing') setPartnerTyping(true);
      else if (type === 'stop-typing') setPartnerTyping(false);
    });

    channel.bind('partner-left', () => handlePartnerLeft());
    channel.bind('kicked', ({ message }) => {
      alert(message || 'You have been disconnected.');
      window.location.reload();
    });
  }

  function disconnectSignaling() {
    if (pusherRef.current) {
      pusherRef.current.disconnect();
      pusherRef.current = null;
    }
  }

  // ── ACTIONS ────────────────────────────────────────────────────────────────
  function handlePartnerLeft() {
    log('Partner left');
    updateStatus('disconnected');
    setMessages(m => [...m, { from: 'system', text: 'Stranger has disconnected.' }]);
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
    try {
      await getLocalStream();
    } catch (e) {
      alert('Camera and microphone access required.');
      updateStatus('idle');
      return;
    }
    connectSignaling();
    updateStatus('waiting');
    // Clear any old partnerId
    partnerIdRef.current = null;
    pendingIceRef.current = [];

    // Poll for match
    async function doJoin() {
      try {
        await fetch('/api/join', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId,
            interests: interests.split(',').map(i => i.trim()).filter(Boolean),
          }),
        });
      } catch (e) {}
    }
    doJoin();
    pollingRef.current = setInterval(() => {
      if (statusRef.current !== 'waiting') { clearInterval(pollingRef.current); return; }
      doJoin();
    }, 2000);
  }

  async function skipPartner() {
    if (partnerIdRef.current) {
      fetch('/api/leave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ partnerId: partnerIdRef.current, userId }),
      }).catch(() => {});
    }
    // Clean up current call
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    remoteStreamRef.current = null;
    pcRef.current?.close();
    pcRef.current = null;
    partnerIdRef.current = null;
    pendingIceRef.current = [];
    setMessages([]);
    // Start searching again
    updateStatus('waiting');
    async function doJoin() {
      try {
        await fetch('/api/join', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId,
            interests: interests.split(',').map(i => i.trim()).filter(Boolean),
          }),
        });
      } catch (e) {}
    }
    doJoin();
    pollingRef.current = setInterval(() => {
      if (statusRef.current !== 'waiting') { clearInterval(pollingRef.current); return; }
      doJoin();
    }, 2000);
  }

  async function stopChat() {
    if (pollingRef.current) clearInterval(pollingRef.current);
    if (partnerIdRef.current) {
      fetch('/api/leave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ partnerId: partnerIdRef.current, userId }),
      }).catch(() => {});
    }
    pcRef.current?.close();
    pcRef.current = null;
    partnerIdRef.current = null;
    pendingIceRef.current = [];
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    remoteStreamRef.current = null;
    disconnectSignaling();
    updateStatus('idle');
    setMessages([]);
    setDebugInfo('');
  }

  function toggleMute() {
    const audio = localStreamRef.current?.getAudioTracks()[0];
    if (audio) { audio.enabled = !audio.enabled; setIsMuted(!audio.enabled); }
  }

  function toggleCam() {
    const video = localStreamRef.current?.getVideoTracks()[0];
    if (video) { video.enabled = !video.enabled; setIsCamOff(!video.enabled); }
  }

  async function sendMessage() {
    if (!inputMsg.trim() || !partnerIdRef.current) return;
    const text = inputMsg.trim();
    setInputMsg('');
    setMessages(m => [...m, { from: 'me', text }]);
    await fetch('/api/signal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetUserId: partnerIdRef.current, type: 'chat', data: { text }, from: userId }),
    });
  }

  async function handleTypingInput(val) {
    setInputMsg(val);
    if (!partnerIdRef.current) return;
    fetch('/api/signal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetUserId: partnerIdRef.current, type: 'typing', data: {}, from: userId }),
    });
    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      fetch('/api/signal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId: partnerIdRef.current, type: 'stop-typing', data: {}, from: userId }),
      });
    }, 1500);
  }

  // ── EFFECTS ────────────────────────────────────────────────────────────────
  useEffect(() => {
    setMounted(true);
    return () => {
      // Cleanup on unmount
      if (statusRef.current !== 'idle') stopChat();
    };
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (!mounted) return <div style={{ background: '#0a0a0c', height: '100vh' }} />;

  // ── RENDER ─────────────────────────────────────────────────────────────────
  return (
    <>
      <Head>
        <title>StrangerLink — Meet Someone New</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />
      </Head>
      <div className={styles.container}>
        <header className={styles.header}>
          <div className={styles.logo}>
            <span className={styles.logoMark}>◈</span>
            <span className={styles.logoText}>StrangerLink</span>
          </div>
          <div className={styles.tagline}>EPHEMERAL CONNECTIONS // GLOBAL</div>
          <div className={styles.liveBadge}>
            <div className={styles.livePulse} />
            <span className={styles.liveCount}>LIVE</span>
          </div>
        </header>

        <main className={styles.main}>
          {/* ── VIDEO AREA ─────────────────────────────────────── */}
          <div className={styles.videoArea}>
            {/* Remote */}
            <div className={`${styles.videoSlot} ${styles.remote}`}>
              {/* 
                ✅ FIX: Video element is always rendered and always muted.
                The srcObject is managed imperatively via refs, not React props.
                This prevents React from clearing srcObject on re-renders.
                We never unmute via onLoadedMetadata — browser handles autoplay.
              */}
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                muted
                className={styles.video}
              />
              {status !== 'connected' && (
                <div className={styles.videoPlaceholder}>
                  <div className={styles.placeholderContent}>
                    {status === 'idle' && <><span className={styles.placeholderIcon}>👤</span><p>Stranger</p></>}
                    {status === 'requesting' && <><div className={styles.spinner} /><p>Getting camera...</p></>}
                    {status === 'waiting' && <><div className={styles.pulser} /><p>Finding someone...</p></>}
                    {status === 'disconnected' && <><span className={styles.placeholderIcon}>👋</span><p>Disconnected</p></>}
                  </div>
                </div>
              )}
              {/* Debug HUD */}
              {debugInfo && (
                <div style={{
                  position: 'absolute', bottom: 5, left: 5, right: 5,
                  background: 'rgba(0,0,0,0.7)', color: '#0f0', fontFamily: 'monospace',
                  fontSize: '10px', padding: '3px 6px', borderRadius: '4px', zIndex: 20,
                  overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
                }}>
                  {debugInfo}
                </div>
              )}
              <div className={styles.videoLabel}>Stranger</div>
            </div>

            {/* Local */}
            <div className={`${styles.videoSlot} ${styles.local}`}>
              <video ref={localVideoRef} autoPlay playsInline muted className={styles.video} />
              {status === 'idle' && (
                <div className={styles.videoPlaceholder}>
                  <div className={styles.placeholderContent}>
                    <span className={styles.placeholderIcon}>🎥</span><p>You</p>
                  </div>
                </div>
              )}
              <div className={styles.videoLabel}>You</div>
            </div>
          </div>

          {/* ── CONTROLS ───────────────────────────────────────── */}
          <div className={styles.controls}>
            {status === 'idle' && (
              <div style={{ width: '100%', marginBottom: '10px' }}>
                <input
                  type="text"
                  placeholder="Add interests (e.g. coding, anime)"
                  value={interests}
                  onChange={e => setInterests(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && startSearching()}
                  className={styles.input}
                  style={{ width: '100%', marginBottom: '5px' }}
                />
                <p style={{ color: '#888', fontSize: '11px', fontStyle: 'italic' }}>Separate with commas</p>
              </div>
            )}

            {(status === 'idle' || status === 'disconnected') && (
              <button className={`${styles.btn} ${styles.btnStart}`} onClick={startSearching}>
                {status === 'disconnected' ? '⟳ Next' : '▶ Start'}
              </button>
            )}

            {(status === 'waiting' || status === 'requesting') && (
              <button className={`${styles.btn} ${styles.btnStop}`} onClick={stopChat}>
                ✕ Cancel
              </button>
            )}

            {status === 'connected' && (
              <>
                <button className={`${styles.btn} ${styles.btnSkip}`} onClick={skipPartner}>⟳ Skip</button>
                <button
                  className={`${styles.btn} ${styles.btnIcon} ${isMuted ? styles.active : ''}`}
                  onClick={toggleMute}
                  title={isMuted ? 'Unmute' : 'Mute'}
                >
                  {isMuted ? '🔇' : '🎙'}
                </button>
                <button
                  className={`${styles.btn} ${styles.btnIcon} ${isCamOff ? styles.active : ''}`}
                  onClick={toggleCam}
                  title={isCamOff ? 'Turn cam on' : 'Turn cam off'}
                >
                  {isCamOff ? '🚫' : '📷'}
                </button>
                <button className={`${styles.btn} ${styles.btnStop}`} onClick={stopChat}>✕ Stop</button>
              </>
            )}
          </div>

          {/* ── CHAT ───────────────────────────────────────────── */}
          <div className={styles.chatArea}>
            <div className={styles.chatMessages}>
              {messages.length === 0 && (
                <div className={styles.chatEmpty}>
                  {status === 'connected' ? 'Say hello 👋' : 'Chat will appear here'}
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
                    <span className={styles.typingDots}><span /><span /><span /></span>
                  </span>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
            <div className={styles.chatInput}>
              <input
                type="text"
                placeholder={status === 'connected' ? 'Type a message...' : 'Connect to chat'}
                value={inputMsg}
                disabled={status !== 'connected'}
                onChange={e => handleTypingInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && sendMessage()}
                className={styles.input}
              />
              <button
                className={`${styles.btn} ${styles.btnSend}`}
                onClick={sendMessage}
                disabled={status !== 'connected' || !inputMsg.trim()}
              >
                Send
              </button>
            </div>
          </div>
        </main>

        <footer className={styles.footer}>
          <p>Be respectful. 18+ only. Do not share personal info.</p>
        </footer>
      </div>
    </>
  );
}
