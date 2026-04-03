import { useEffect, useRef, useState, useCallback } from 'react';
import Head from 'next/head';
import Pusher from 'pusher-js';
import styles from '../styles/Home.module.css';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
    { urls: 'stun:stun.services.mozilla.com' },
    { urls: 'stun:stun.ekiga.net' },
    { urls: 'stun:stun.ideasip.com' },
    { urls: 'stun:stun.schlund.de' },
    { urls: 'stun:stun.voxgratia.org' },
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
  // 1. STATE & REFS AT THE TOP (Must be first to avoid TDZ)
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
  const [liveStats, setLiveStats] = useState({ activeUsers: 0, waitingCount: 0 });
  const [debug, setDebug] = useState({ pc: 'idle', ice: 'idle', gather: 'idle', tracks: 0 });
  
  const statusRef = useRef('idle');
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const localStreamRef = useRef(null);
  const pollingRef = useRef(null);
  const pendingIceRef = useRef([]);
  const pcRef = useRef(null);
  const pusherRef = useRef(null);
  const channelRef = useRef(null);
  const partnerIdRef = useRef(null);
  const isInitiatorRef = useRef(false);
  const roomIdRef = useRef(null);
  const chatEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  // 2. HOISTED FUNCTIONS (Available everywhere in component scope)
  function updateStatus(newStatus) {
    statusRef.current = newStatus;
    setStatus(newStatus);
  }

  function handlePartnerLeft() {
    updateStatus('disconnected');
    setMessages(m => [...m, { from: 'system', text: 'Stranger has disconnected.' }]);
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    pcRef.current?.close();
    pcRef.current = null;
    partnerIdRef.current = null;
    pendingIceRef.current = [];
  }

  async function getLocalStream() {
    if (localStreamRef.current) return localStreamRef.current;
    if (typeof window === 'undefined') return null;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localStreamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      return stream;
    } catch (e) {
      console.error('Media error:', e);
      return null;
    }
  }

  function createPeerConnection(partnerId) {
    if (typeof window === 'undefined') return null;
    if (pcRef.current && pcRef.current.signalingState !== 'closed') return pcRef.current;

    const pc = new RTCPeerConnection({ ...ICE_SERVERS, bundlePolicy: 'max-bundle', rtcpMuxPolicy: 'require' });
    pcRef.current = pc;

    pc.onicecandidate = (e) => {
      const pId = partnerId || partnerIdRef.current;
      if (e.candidate && pId) {
        fetch('/api/signal', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetUserId: pId, type: 'ice', data: e.candidate, from: userId }),
        });
      }
    };

    pc.ontrack = (e) => {
      setDebug(d => ({ ...d, tracks: e.streams[0] ? 1 : (d.tracks + 1) }));
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = e.streams[0] || new MediaStream([e.track]);
        remoteVideoRef.current.play().catch(() => {});
      }
    };

    pc.onicegatheringstatechange = () => setDebug(d => ({ ...d, gather: pc.iceGatheringState }));
    pc.oniceconnectionstatechange = () => setDebug(d => ({ ...d, ice: pc.iceConnectionState }));
    pc.onconnectionstatechange = () => {
      setDebug(d => ({ ...d, pc: pc.connectionState }));
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') handlePartnerLeft();
    };

    const stream = localStreamRef.current;
    if (stream) stream.getTracks().forEach(track => pc.addTrack(track, stream));

    return pc;
  }

  async function handleOffer(offer, fromUserId) {
    const pc = createPeerConnection(fromUserId);
    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    await flushIceCandidates();
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await fetch('/api/signal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetUserId: fromUserId || partnerIdRef.current, type: 'answer', data: answer, from: userId }),
    });
  }

  async function handleAnswer(answer) {
    const pc = pcRef.current;
    if (pc) {
      await pc.setRemoteDescription(new RTCSessionDescription(answer));
      await flushIceCandidates();
    }
  }

  async function handleIce(candidate) {
    const pc = pcRef.current;
    if (!pc || !pc.remoteDescription) {
      pendingIceRef.current.push(candidate);
    } else {
      try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch (e) {}
    }
  }

  async function flushIceCandidates() {
    const pc = pcRef.current;
    if (!pc || !pc.remoteDescription || pendingIceRef.current.length === 0) return;
    const candidates = [...pendingIceRef.current];
    pendingIceRef.current = [];
    for (const candidate of candidates) {
      try { if (candidate) await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch (e) {}
    }
  }

  function connectSignaling() {
    if (pusherRef.current) return;
    const pusher = new Pusher(process.env.NEXT_PUBLIC_PUSHER_KEY, { cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER });
    pusherRef.current = pusher;
    const channel = pusher.subscribe(`user-${userId}`);
    channelRef.current = channel;

    channel.bind('matched', async ({ roomId, isInitiator }) => {
      roomIdRef.current = roomId;
      isInitiatorRef.current = isInitiator;
      updateStatus('connected');
      if (pollingRef.current) clearInterval(pollingRef.current);
      await startCall(isInitiator);
    });

    channel.bind('signal', async ({ type, data, from }) => {
      if (!partnerIdRef.current && from) partnerIdRef.current = from;
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

  async function startCall(isInitiator) {
    await getLocalStream();
    const roomChannel = pusherRef.current.subscribe(`room-${roomIdRef.current}`);
    roomChannel.bind('peer-hello', async ({ from }) => {
      if (from === userId) return;
      partnerIdRef.current = from;
      const pc = createPeerConnection(from);
      if (isInitiator) {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await fetch('/api/signal', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ targetUserId: from, type: 'offer', data: offer, from: userId }),
        });
      }
    });
    await fetch('/api/room-hello', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId: roomIdRef.current, userId }),
    });
  }

  async function startSearching() {
    updateStatus('requesting');
    setMessages([]);
    try {
      await getLocalStream();
      connectSignaling();
      updateStatus('waiting');
      const poll = setInterval(async () => {
        if (statusRef.current !== 'waiting') { clearInterval(poll); return; }
        await fetch('/api/join', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, interests: interests.split(',').map(i => i.trim()).filter(Boolean) }),
        });
      }, 2000);
      pollingRef.current = poll;
    } catch (e) {
      alert('Camera required.');
      updateStatus('idle');
    }
  }

  async function skipPartner() {
    if (partnerIdRef.current) {
      await fetch('/api/leave', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ partnerId: partnerIdRef.current, userId }) });
    }
    handlePartnerLeft();
    updateStatus('waiting');
    startSearching();
  }

  async function stopChat() {
    if (pollingRef.current) clearInterval(pollingRef.current);
    handlePartnerLeft();
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
    disconnectSignaling();
    updateStatus('idle');
    setMessages([]);
  }

  async function sendMessage() {
    if (!inputMsg.trim() || !partnerIdRef.current) return;
    const text = inputMsg.trim();
    setInputMsg('');
    setMessages(m => [...m, { from: 'me', text }]);
    await fetch('/api/signal', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ targetUserId: partnerIdRef.current, type: 'chat', data: { text }, from: userId }) });
  }

  async function handleTyping(val) {
    setInputMsg(val);
    if (!partnerIdRef.current) return;
    await fetch('/api/signal', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ targetUserId: partnerIdRef.current, type: 'typing', data: {}, from: userId }) });
    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(async () => {
      await fetch('/api/signal', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ targetUserId: partnerIdRef.current, type: 'stop-typing', data: {}, from: userId }) });
    }, 1500);
  }

  // 3. EFFECTS AT THE BOTTOM (Executed after state and functions are ready)
  useEffect(() => {
    setMounted(true);
    const handleClose = () => { if (statusRef.current === 'connected') stopChat(); disconnectSignaling(); };
    window.addEventListener('beforeunload', handleClose);
    return () => window.removeEventListener('beforeunload', handleClose);
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (status === 'connected' && debug.ice === 'checking') {
      const timer = setTimeout(() => {
        if (pcRef.current) {
          pcRef.current.createOffer({ iceRestart: true }).then(offer => {
            pcRef.current.setLocalDescription(offer);
            fetch('/api/signal', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ targetUserId: partnerIdRef.current, type: 'offer', data: offer, from: userId }) });
          });
        }
      }, 10000);
      return () => clearTimeout(timer);
    }
  }, [status, debug.ice, userId]);

  if (!mounted) return <div style={{ background: '#0a0a0c', height: '100vh' }} />;

  return (
    <>
      <Head>
        <title>StrangerLink — Meet Someone New</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <div className={styles.container}>
        <header className={styles.header}>
            <div className={styles.logo}><span className={styles.logoMark}>◈</span><span className={styles.logoText}>StrangerLink</span></div>
            <div className={styles.liveBadge}><div className={styles.livePulse} /><span className={styles.liveCount}>{(liveStats.activeUsers + 120).toLocaleString()} ONLINE</span></div>
        </header>

        <main className={styles.main}>
          <div className={styles.videoArea}>
            <div className={`${styles.videoSlot} ${styles.remote}`}>
              <video ref={remoteVideoRef} autoPlay playsInline muted={true} onLoadedMetadata={(e) => { e.target.muted = false; e.target.play().catch(() => {}); }} className={styles.video} />
              {status === 'connected' && <div style={{ position: 'absolute', top: 5, right: 5, background: 'rgba(0,0,0,0.5)', padding: '2px 6px', fontSize: '10px', color: '#fff' }}>PC:{debug.pc} | ICE:{debug.ice} | G:{debug.gather} | T:{debug.tracks}</div>}
              {status !== 'connected' && <div className={styles.videoPlaceholder}><p>{status === 'waiting' ? 'Finding someone...' : 'Stranger'}</p></div>}
              <div className={styles.videoLabel}>Stranger</div>
            </div>
            <div className={`${styles.videoSlot} ${styles.local}`}>
              <video ref={localVideoRef} autoPlay playsInline muted className={styles.video} />
              <div className={styles.videoLabel}>You</div>
            </div>
          </div>

          <div className={styles.controls}>
            {status === 'idle' || status === 'disconnected' ? <button className={`${styles.btn} ${styles.btnStart}`} onClick={startSearching}>▶ Start</button> : <button className={`${styles.btn} ${styles.btnStop}`} onClick={stopChat}>✕ Stop</button>}
            {status === 'connected' && <button className={`${styles.btn} ${styles.btnSkip}`} onClick={skipPartner}>⟳ Skip</button>}
          </div>

          <div className={styles.chatArea}>
            <div className={styles.chatMessages}>{messages.map((m, i) => <div key={i} className={`${styles.message} ${styles[m.from]}`}><span>{m.text}</span></div>)}<div ref={chatEndRef} /></div>
            <div className={styles.chatInput}>
              <input type="text" placeholder="Type a message..." value={inputMsg} disabled={status !== 'connected'} onChange={e => handleTyping(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendMessage()} className={styles.input} />
              <button className={`${styles.btn} ${styles.btnSend}`} onClick={sendMessage} disabled={status !== 'connected' || !inputMsg.trim()}>Send</button>
            </div>
          </div>
        </main>
      </div>
    </>
  );
}
