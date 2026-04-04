import { useEffect, useRef, useState, useCallback } from 'react';
import Head from 'next/head';
import Pusher from 'pusher-js';
import styles from '../styles/Home.module.css';

/* ── Constants ─────────────────────────────────────────────── */
const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
    { urls: 'turn:openrelay.metered.ca:80',                  username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443',                 username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443?transport=tcp',   username: 'openrelayproject', credential: 'openrelayproject' },
  ],
};

const QUICK_TAGS    = ['🎮 gaming','💻 coding','🎵 music','🎌 anime','🎬 movies','🎨 art','⚽ sports','✈️ travel','📚 books','🍕 food'];
const CHAT_EMOJIS   = ['😂','❤️','👍','🔥','😍','😭','🤣','✨','💯','😎','👀','🙏','💪','😅','🥰'];
const REACT_EMOJIS  = ['👋','❤️','😂','🔥','👏','🎉'];

function generateUserId() {
  return 'u-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function formatTime(sec) {
  const m = String(Math.floor(sec / 60)).padStart(2, '0');
  const s = String(sec % 60).padStart(2, '0');
  return `${m}:${s}`;
}

/* ── Component ─────────────────────────────────────────────── */
export default function StrangerLinkApp() {
  /* ── STATE ─────────────────────────────────────────────────── */
  const [mounted,       setMounted]       = useState(false);
  const [theme,         setTheme]         = useState('dark');   // 'dark' | 'light'
  const [status,        setStatus]        = useState('idle');   // idle|requesting|waiting|connected|disconnected
  const [isMuted,       setIsMuted]       = useState(false);
  const [isCamOff,      setIsCamOff]      = useState(false);
  const [messages,      setMessages]      = useState([]);
  const [inputMsg,      setInputMsg]      = useState('');
  const [partnerTyping, setPartnerTyping] = useState(false);
  const [activeTags,    setActiveTags]    = useState([]);
  const [debugMsg,      setDebugMsg]      = useState('');
  const [unreadCount,   setUnreadCount]   = useState(0);     // 🆕 unread badge
  const [callTimer,     setCallTimer]     = useState(0);     // 🆕 session timer (seconds)
  const [reactions,     setReactions]     = useState([]);    // 🆕 floating emoji [{id,emoji,x,y}]
  const [showEmojiBar,  setShowEmojiBar]  = useState(false); // 🆕 emoji picker toggle
  const [showSettings,  setShowSettings]  = useState(false); // 🆕 settings modal
  const [videoDevices,  setVideoDevices]  = useState([]);    // 🆕 list of cameras
  const [audioDevices,  setAudioDevices]  = useState([]);    // 🆕 list of mics
  const [selectedVideo, setSelectedVideo] = useState('');    // 🆕 chosen cameraId
  const [selectedAudio, setSelectedAudio] = useState('');    // 🆕 chosen micId
  const [audioLevel,    setAudioLevel]    = useState(0);     // 🆕 for visualizer
  const [onlineCount,   setOnlineCount]   = useState(0);     // 🆕 total users
  const [trendingTags,  setTrendingTags]  = useState([]);    // 🆕 popular interests
  const [connType,      setConnType]      = useState('Direct'); // P2P or Relay
  const [soundEnabled,  setSoundEnabled]  = useState(true);     // sound toggle
  const [sharedTag,     setSharedTag]     = useState('');      // 🆕 the shared interest tag
  const [pusherStatus,  setPusherStatus]  = useState('disconnected'); // 🆕 signaling state
  const [remoteAudioLevel, setRemoteAudioLevel] = useState(0);      // 🆕 for remote visualization

  const [userId] = useState(() => {
    if (typeof window !== 'undefined') {
      let id = sessionStorage.getItem('userId');
      if (!id) { id = generateUserId(); sessionStorage.setItem('userId', id); }
      return id;
    }
    return 'ssr';
  });

  /* ── REFS ──────────────────────────────────────────────────── */
  const statusRef       = useRef('idle');
  const localVideoRef   = useRef(null);
  const remoteVideoRef  = useRef(null);
  const localStreamRef  = useRef(null);
  const remoteStreamRef = useRef(null);
  const pollingRef      = useRef(null);
  const pendingIceRef   = useRef([]);
  const pcRef           = useRef(null);
  const pusherRef       = useRef(null);
  const partnerIdRef    = useRef(null);
  const roomIdRef       = useRef(null);
  const chatEndRef      = useRef(null);
  const typingTimer     = useRef(null);
  const userIdRef       = useRef(userId);
  const timerRef        = useRef(null);   // 🆕 interval for call timer
  const chatScrollRef   = useRef(null);   // 🆕 for unread badge logic
  const reactionIdRef   = useRef(0);      // 🆕 unique ID for floating reactions
  const audioContextRef = useRef(null);   // 🆕 for visualizer
  const audioAnalyserRef = useRef(null);  // 🆕 for visualizer
  const audioAnimRef    = useRef(null);   // 🆕 for visualizer

  /* ── UTILS ─────────────────────────────────────────────────── */
  function updateStatus(s) { statusRef.current = s; setStatus(s); }
  function log(msg) { console.log('[SL]', msg); setDebugMsg(msg); }
  function getInterestsArray() {
    return activeTags;
  }

  function addInterest(tag) {
    if (activeTags.includes(tag)) return;
    setActiveTags(prev => [...prev, tag]);
  }

  function removeInterest(tag) {
    setActiveTags(prev => prev.filter(t => t !== tag));
  }

  function toggleTag(tag) {
    setActiveTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
  }

  /* ── THEME ─────────────────────────────────────────────────── */
  function toggleTheme() {
    setTheme(t => {
      const next = t === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      try { localStorage.setItem('sl-theme', next); } catch {}
      return next;
    });
  }

  /* ── TIMER ─────────────────────────────────────────────────── */
  function startTimer() {
    setCallTimer(0);
    timerRef.current = setInterval(() => setCallTimer(n => n + 1), 1000);
  }
  function stopTimer() {
    clearInterval(timerRef.current);
    setCallTimer(0);
  }

  /* ── EMOJI REACTIONS ───────────────────────────────────────── */
  function sendReaction(emoji) {
    spawnReaction(emoji, true);
    if (partnerIdRef.current) sig(partnerIdRef.current, 'reaction', { emoji });
  }

  function spawnReaction(emoji, isLocal = true) {
    if (!isLocal) playBeep('reaction');
    const id = Date.now();
    setReactions(prev => [...prev, { id, emoji, left: Math.random() * 80 + 10 }]);
    setTimeout(() => setReactions(prev => prev.filter(r => r.id !== id)), 3000);
  }

  /* ── DEVICE DISCOVERY ─────────────────────────────────────── */
  const refreshDevices = useCallback(async () => {
    try {
      const devs = await navigator.mediaDevices.enumerateDevices();
      const vids = devs.filter(d => d.kind === 'videoinput');
      const auds = devs.filter(d => d.kind === 'audioinput');
      setVideoDevices(vids);
      setAudioDevices(auds);
      if (vids.length && !selectedVideo) setSelectedVideo(vids[0].deviceId);
      if (auds.length && !selectedAudio) setSelectedAudio(auds[0].deviceId);
    } catch {}
  }, [selectedVideo, selectedAudio]);

  function playBeep(type) {
    if (!soundEnabled) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      if (type === 'match') {
        osc.frequency.setValueAtTime(440, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
      } else if (type === 'msg') {
        osc.frequency.setValueAtTime(660, ctx.currentTime);
        gain.gain.setValueAtTime(0.05, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
      } else if (type === 'reaction') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1760, ctx.currentTime + 0.05);
        gain.gain.setValueAtTime(0.03, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
      }
      osc.start(); osc.stop(ctx.currentTime + 0.2);
    } catch {}
  }

  /* ── AUDIO VISUALIZER ─────────────────────────────────────── */
  function startVisualizer(stream) {
    if (!stream.getAudioTracks().length) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioCtx();
      audioContextRef.current = ctx;
      const src = ctx.createMediaStreamSource(stream);
      const ana = ctx.createAnalyser();
      ana.fftSize = 256;
      src.connect(ana);
      audioAnalyserRef.current = ana;

      const data = new Uint8Array(ana.frequencyBinCount);
      const update = () => {
        ana.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        setAudioLevel(avg);
        audioAnimRef.current = requestAnimationFrame(update);
      };
      update();
    } catch {}
  }

  function stopVisualizer() {
    if (audioAnimRef.current) cancelAnimationFrame(audioAnimRef.current);
    if (audioContextRef.current) audioContextRef.current.close().catch(() => {});
    setAudioLevel(0);
    setRemoteAudioLevel(0);
  }

  function startRemoteVisualizer(stream) {
    if (!stream.getAudioTracks().length) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const src = ctx.createMediaStreamSource(stream);
      const ana = ctx.createAnalyser();
      ana.fftSize = 256;
      src.connect(ana);
      const data = new Uint8Array(ana.frequencyBinCount);
      const update = () => {
        if (statusRef.current !== 'connected') return;
        ana.getByteFrequencyData(data);
        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        setRemoteAudioLevel(avg);
        requestAnimationFrame(update);
      };
      update();
    } catch {}
  }

  /* ── MEDIA ─────────────────────────────────────────────────── */
  async function getLocalStream() {
    if (localStreamRef.current) return localStreamRef.current;
    const constraints = {
      video: {
        deviceId: selectedVideo ? { exact: selectedVideo } : undefined,
        width: { ideal: 1280 },
        height: { ideal: 720 },
        facingMode: 'user'
      },
      audio: {
        deviceId: selectedAudio ? { exact: selectedAudio } : undefined,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      },
    };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    localStreamRef.current = stream;
    if (localVideoRef.current) localVideoRef.current.srcObject = stream;
    startVisualizer(stream);
    return stream;
  }

  /* ── TRACK SWITCHING ───────────────────────────────────────── */
  async function switchDevice(kind, deviceId) {
    if (kind === 'video') setSelectedVideo(deviceId);
    else setSelectedAudio(deviceId);

    if (!localStreamRef.current) return;

    // Stop old tracks of that kind
    localStreamRef.current.getTracks()
      .filter(t => t.kind === (kind === 'video' ? 'video' : 'audio'))
      .forEach(t => t.stop());

    // Get new sub-stream
    const constraints = kind === 'video'
      ? { video: { deviceId: { exact: deviceId }, width: 1280, height: 720 } }
      : { audio: { deviceId: { exact: deviceId } } };

    const newStream = await navigator.mediaDevices.getUserMedia(constraints);
    const newTrack = newStream.getTracks()[0];

    // Update local stream ref
    const tracks = localStreamRef.current.getTracks();
    const otherTrack = tracks.find(t => t.kind !== newTrack.kind);
    const combined = new MediaStream([newTrack, otherTrack].filter(Boolean));
    localStreamRef.current = combined;
    if (localVideoRef.current) localVideoRef.current.srcObject = combined;

    // If visualizing audio, restart
    if (kind === 'audio') { stopVisualizer(); startVisualizer(combined); }

    // 🔥 HOT SWAP: replace track in RTCPeerConnection
    if (pcRef.current) {
      const senders = pcRef.current.getSenders();
      const sender = senders.find(s => s.track?.kind === newTrack.kind);
      if (sender) {
        log(`Replacing ${newTrack.kind} track...`);
        await sender.replaceTrack(newTrack);
      }
    }
  }

  /* ── WEBRTC ────────────────────────────────────────────────── */
  function createPeerConnection() {
    if (pcRef.current) { pcRef.current.close(); pcRef.current = null; }
    log('Creating PeerConnection...');
    const pc = new RTCPeerConnection(ICE_SERVERS);
    pcRef.current = pc;

    const remoteStream = new MediaStream();
    remoteStreamRef.current = remoteStream;
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = remoteStream;
      remoteVideoRef.current.muted = false;
    }

    // Debounce play() to avoid AbortError when tracks arrive rapidly
    let playDebounce = null;
    pc.ontrack = (e) => {
      log(`Track: ${e.track.kind}`);
      remoteStream.addTrack(e.track);
      if (e.track.kind === 'audio') startRemoteVisualizer(remoteStream);
      if (remoteVideoRef.current) {
        remoteVideoRef.current.muted = false;
        remoteVideoRef.current.srcObject = remoteStream;
        // Debounce play to avoid AbortError when audio+video arrive back-to-back
        clearTimeout(playDebounce);
        playDebounce = setTimeout(() => {
          if (remoteVideoRef.current && remoteVideoRef.current.paused) {
            remoteVideoRef.current.play().catch(err => log('Remote play err: ' + err.name));
          }
        }, 200);
      }
    };

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        // 🆕 Connection quality check
        if (e.candidate.candidate.includes('relay')) setConnType('Relay (Secure)');
        else if (e.candidate.candidate.includes('srflx')) setConnType('P2P (Direct)');

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
      if (pc.iceConnectionState === 'failed') { log('ICE failed — restart'); pc.restartIce(); }
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

  /* ── SIGNALING ─────────────────────────────────────────────── */
  async function sig(targetUserId, type, data) {
    await fetch('/api/signal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetUserId, type, data, from: userIdRef.current }),
    });
  }

  async function handleOffer(offer, fromId) {
    log(`Offer from ${fromId} (state: ${pcRef.current?.signalingState ?? 'none'})`);
    partnerIdRef.current = fromId;

    // If we already sent an offer (glare condition), polite peer rolls back
    if (pcRef.current && pcRef.current.signalingState === 'have-local-offer') {
      log('Glare: rolling back local offer to accept remote offer');
      try { await pcRef.current.setLocalDescription({ type: 'rollback' }); } catch {}
    }

    // Only create a fresh PC if one doesn't exist yet
    const pc = (pcRef.current && pcRef.current.signalingState !== 'closed')
      ? pcRef.current
      : createPeerConnection();

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      await flushIce();
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await sig(fromId, 'answer', answer);
      log('Answer sent');
    } catch (err) {
      log('handleOffer error: ' + err.message);
    }
  }

  async function handleAnswer(answer) {
    log(`Answer received (state: ${pcRef.current?.signalingState ?? 'none'})`);
    const pc = pcRef.current;
    if (!pc) { log('No PC for answer'); return; }

    if (pc.signalingState === 'stable') {
      log('Answer already applied (state is stable), skipping');
      return;
    }

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(answer));
      await flushIce();
      log('Remote description set successfully');
    } catch (err) {
      log('handleAnswer error: ' + err.message);
    }
  }

  async function handleIce(candidate) {
    const pc = pcRef.current;
    if (!pc || !pc.remoteDescription) pendingIceRef.current.push(candidate);
    else try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch {}
  }

  /* ── CALL FLOW ─────────────────────────────────────────────── */
  async function startCall(isInitiator) {
    log(`startCall isInitiator=${isInitiator}`);
    await getLocalStream();
    startTimer();
    if (isInitiator) {
      await new Promise(r => setTimeout(r, 800));
      const pc = createPeerConnection();
      const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
      await pc.setLocalDescription(offer);
      await sig(partnerIdRef.current, 'offer', offer);
      log('Offer sent');
    }
  }

  /* ── PUSHER ─────────────────────────────────────────────────── */
  function connectSignaling() {
    if (!pusherRef.current) {
      log('Signaling client not ready!');
      return;
    }
    const pusher = pusherRef.current;
    
    // Unsubscribe from old channel if exists
    pusher.unsubscribe(`user-${userId}`);
    const ch = pusher.subscribe(`user-${userId}`);


    ch.bind('pusher:subscription_succeeded', () => setPusherStatus('connected'));
    ch.bind('pusher:subscription_error', () => setPusherStatus('error'));

    ch.bind('matched', async ({ roomId, isInitiator, partnerId, matchedTag }) => {
      log(`Matched! room=${roomId} init=${isInitiator} tag=${matchedTag}`);
      roomIdRef.current = roomId;
      if (partnerId) partnerIdRef.current = partnerId;
      if (pollingRef.current) clearInterval(pollingRef.current);
      playBeep('match');
      if (matchedTag) setSharedTag(matchedTag);
      updateStatus('connected');
      setMessages([{ from: 'system', text: `🔗 Connected! ${matchedTag ? `Matched on #${matchedTag}` : 'Found a stranger.'}` }]);
      setUnreadCount(0);
      await startCall(isInitiator);
    });

    ch.bind('signal', async ({ type, data, from }) => {
      if (from && !partnerIdRef.current) partnerIdRef.current = from;
      if      (type === 'offer')       await handleOffer(data, from);
      else if (type === 'answer')      await handleAnswer(data);
      else if (type === 'ice')         await handleIce(data);
      else if (type === 'reaction')    spawnReaction(data.emoji, false);  // 🆕
      else if (type === 'chat' && statusRef.current === 'connected') {
        playBeep('msg');
        setMessages(m => [...m, { from: 'them', text: data.text }]);
        setPartnerTyping(false);
        // 🆕 Increment unread if user has scrolled up
        if (chatScrollRef.current) {
          const el = chatScrollRef.current;
          const isScrolledUp = el.scrollHeight - el.scrollTop - el.clientHeight > 60;
          if (isScrolledUp) setUnreadCount(n => n + 1);
        }
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
    stopTimer();
    updateStatus('disconnected');
    setMessages(m => [...m, { from: 'system', text: '👋 Stranger has left the chat.' }]);
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    remoteStreamRef.current = null;
    pcRef.current?.close();
    pcRef.current = null;
    partnerIdRef.current = null;
    pendingIceRef.current = [];
    setReactions([]);
  }

  async function startSearching() {
    if (statusRef.current === 'requesting' || statusRef.current === 'waiting') return;
    updateStatus('requesting');
    setMessages([]);
    setUnreadCount(0);
    try { await getLocalStream(); } catch {
      alert('Camera and microphone access required. Please allow and try again.');
      updateStatus('idle'); return;
    }
    if (!pusherRef.current) {
      console.error('[SL] Cannot search: Signaling client missing. Check your NEXT_PUBLIC_PUSHER_KEY.');
      alert('Signaling error: Connection could not be established. Please refresh or contact admin.');
      updateStatus('idle');
      return;
    }

    connectSignaling();
    updateStatus('waiting');
    partnerIdRef.current = null;
    pendingIceRef.current = [];

    async function doJoin() {
      try {
        const res = await fetch('/api/join', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, interests: getInterestsArray() }),
        });
        const data = await res.json();
        if (data.onlineCount) setOnlineCount(data.onlineCount);
        if (data.trending) setTrendingTags(data.trending);
      } catch {}
    }
    doJoin();
    pollingRef.current = setInterval(() => {
      if (statusRef.current !== 'waiting') { clearInterval(pollingRef.current); return; }
      doJoin();
    }, 2000);
  }

  async function skipPartner() {
    stopTimer();
    if (partnerIdRef.current) {
      fetch('/api/leave', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ partnerId: partnerIdRef.current, userId }) }).catch(() => {});
    }
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    remoteStreamRef.current = null;
    pcRef.current?.close(); pcRef.current = null;
    partnerIdRef.current = null;
    pendingIceRef.current = [];
    setMessages([]);
    setUnreadCount(0);
    setReactions([]);
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
    stopTimer();
    stopVisualizer();
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
    setMessages([]); setDebugMsg(''); setUnreadCount(0); setReactions([]); setSharedTag('');
  }

  /* ── REPORTING ─────────────────────────────────────────────── */
  async function reportUser() {
    if (!partnerIdRef.current) return;
    const pId = partnerIdRef.current;
    log(`Reporting user ${pId}...`);
    // Optional: send to backend
    fetch('/api/report', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ partnerId: pId, userId }) }).catch(() => {});
    setMessages(m => [...m, { from: 'system', text: '🚩 Partner reported. Disconnecting...' }]);
    setTimeout(() => {
      skipPartner();
    }, 1200);
  }

  function toggleMute() {
    const tr = localStreamRef.current?.getAudioTracks()[0];
    if (tr) { tr.enabled = !tr.enabled; setIsMuted(!tr.enabled); }
  }

  function toggleCam() {
    const tr = localStreamRef.current?.getVideoTracks()[0];
    if (tr) { tr.enabled = !tr.enabled; setIsCamOff(!tr.enabled); }
  }

  async function sendMessage(text) {
    const msg = text || inputMsg.trim();
    if (!msg || !partnerIdRef.current) return;
    setInputMsg('');
    setShowEmojiBar(false);
    setMessages(m => [...m, { from: 'me', text: msg }]);
    await sig(partnerIdRef.current, 'chat', { text: msg });
  }

  function handleTypingInput(val) {
    setInputMsg(val);
    if (!partnerIdRef.current) return;
    sig(partnerIdRef.current, 'typing', {});
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => sig(partnerIdRef.current, 'stop-typing', {}), 1500);
  }



  /* ── EFFECTS ────────────────────────────────────────────────── */
  useEffect(() => {
    setMounted(true);
    refreshDevices();
    
    // Listen for device changes (plug/unplug)
    navigator.mediaDevices.ondevicechange = refreshDevices;

    // Initial stats fetch
    async function getInitialStats() {
      try {
        const res = await fetch('/api/admin-stats');
        const data = await res.json();
        if (data.onlineCount !== undefined) setOnlineCount(data.onlineCount);
      } catch (err) {
        console.error('[SL] Initial stats fetch failed:', err);
      }
    }
    getInitialStats();

    // Theme initialization
    try {
      const saved = localStorage.getItem('sl-theme') || 'dark';
      setTheme(saved);
      document.documentElement.setAttribute('data-theme', saved);
    } catch { document.documentElement.setAttribute('data-theme', 'dark'); }

    // Initialize Pusher on mount
    if (!pusherRef.current) {
      const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
      const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER || 'mt1';
      
      if (!key) {
        console.warn('[SL] Pusher Key missing! Matchmaking will NOT work. Please check Vercel Environment Variables.');
      } else {
        log('Initializing P2P Signaling...');
        pusherRef.current = new Pusher(key, {
          cluster,
          forceTLS: true
        });

        pusherRef.current.connection.bind('error', (err) => {
          console.error('[SL] Pusher Connection Error:', err);
        });
      }
    }

    return () => {
      if (statusRef.current !== 'idle') stopChat();
      stopTimer();
      if (pusherRef.current) {
        pusherRef.current.disconnect();
        pusherRef.current = null;
      }
    };
  }, [refreshDevices, userId]);

  /* ── ADMIN BROADCASTS ─────────────────────────────────────── */
  useEffect(() => {
    if (!mounted || !pusherRef.current) return;
    
    const pusher = pusherRef.current;
    const adminChannel = pusher.subscribe('global-announcements');
    
    adminChannel.bind('message', (data) => {
      const msg = {
        id: Date.now() + Math.random(),
        from: 'system',
        text: `🔔 SYSTEM ALERT: ${data.text}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setMessages(prev => [...prev, msg]);
      
      // Auto-open chat if it's closed to show the alert
      if (statusRef.current === 'active' && !chatOpen) {
        setChatOpen(true);
      }
    });

    return () => {
      pusherRef.current.unsubscribe('global-announcements');
    };
  }, [mounted]);

  // Auto-scroll chat to bottom and reset unread
  useEffect(() => {
    if (chatScrollRef.current) {
      const el = chatScrollRef.current;
      el.scrollTop = el.scrollHeight;
      setUnreadCount(0);
    }
  }, [messages]);

  if (!mounted) return <div style={{ background: '#07070d', height: '100vh' }} />;

  const isActive    = status === 'connected';
  const isSearching = status === 'waiting' || status === 'requesting';

  /* ── RENDER ─────────────────────────────────────────────────── */
  return (
    <>
      <Head>
        <title>StrangerLink — Meet Someone New</title>
        <meta name="description" content="Connect with random people via live video chat. Anonymous, ephemeral, global." />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>◈</text></svg>" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />
      </Head>

      <div className={`${styles.container} ${theme === 'light' ? styles.lightTheme : ''}`}>
        <div className={styles.noiseOverlay} />

        {/* ── HEADER ─────────────────────────────────────────── */}
        <header className={styles.header}>
          <div className={styles.logo}>
            <span className={styles.logoMark}>◈</span>
            <span className={styles.logoText}>StrangerLink</span>
          </div>

          <div className={styles.tagline}>EPHEMERAL · ANONYMOUS · GLOBAL</div>

          <div className={styles.headerActions}>
            {/* 🆕 Online count */}
            <div className={styles.onlineBadge}>
              <span className={styles.onlineDot} />
              <span className={styles.onlineText}>{onlineCount || '...'} ONLINE</span>
            </div>

            {/* 🆕 Session timer */}
            {isActive && (
              <div className={styles.timerBadge}>
                ⏱ {formatTime(callTimer)}
              </div>
            )}

            {/* 🆕 Settings toggle */}
            <button className={styles.themeBtn} onClick={() => setShowSettings(true)} title="Media Settings">
              ⚙️
            </button>

            {/* 🆕 Theme toggle */}
            <button className={styles.themeBtn} onClick={toggleTheme} title="Toggle theme">
              {theme === 'dark' ? '☀️' : '🌙'}
            </button>

            {/* Live badge */}
            <div className={styles.liveBadge}>
              <div className={styles.livePulse} />
              <span className={styles.liveCount}>LIVE</span>
            </div>
          </div>
        </header>

        {/* ── MAIN ───────────────────────────────────────────── */}
        <main className={styles.main}>

          {/* ══ LEFT: VIDEO AREA ══════════════════════════════ */}
          <div className={styles.videoArea}>

            {/* Video Slots */}

            {/* Remote */}
            <div className={styles.videoSlotRemote}>
              <video ref={remoteVideoRef} autoPlay playsInline className={styles.videoRemote} />
              <span className={styles.videoLabel}>Partner</span>
              <div className={`${styles.holographicGlow} ${isActive ? styles.holographicGlowActive : ''}`} />
              {!isActive && (
                <div className={styles.videoOverlay}>
                  {isSearching ? (
                    <div className={styles.searchingState}>
                      <div className={styles.holographicBeam} />
                      <div className={styles.spinner} />
                      <p className={styles.searchingText}>Establishing Link...</p>
                      <div className={styles.skeletonPulse} />
                    </div>
                  ) : (
                    <div className={styles.idleState}>
                      <p>Connect and start talking</p>
                    </div>
                  )}
                </div>
              )}
              <div className={styles.videoVignette} />

              {/* Status indicator */}
              {status !== 'idle' && (
                <div className={styles.connectionStatus}>
                  <div className={`${styles.connectionDot} ${isSearching ? styles.connectionDotWaiting : !isActive ? styles.connectionDotOff : ''}`} />
                  <span className={styles.connectionLabel}>
                    {isSearching ? 'SEARCHING...' : isActive ? connType.toUpperCase() : 'DISCONNECTED'}
                  </span>
                </div>
              )}

              {/* 🆕 Shared Interest Badge */}
              {isActive && sharedTag && (
                <div className={styles.sharedInterestBadge}>
                  <span className={styles.sharedTagIcon}>🏷️</span>
                  Matched on #{sharedTag}
                </div>
              )}

              {/* Debug HUD */}
              {isActive && (
                <div className={styles.debugHud}>
                  <div className={styles.debugRow}><span>SIG:</span> <span style={{ color: pusherStatus === 'connected' ? 'var(--green)' : 'var(--red)' }}>{pusherStatus.toUpperCase()}</span></div>
                  <div className={styles.debugRow}><span>NET:</span> {connType}</div>
                  <div className={styles.debugRow}><span>R-AUD:</span> {Math.round(remoteAudioLevel)}</div>
                  {debugMsg && <div className={styles.debugRow}><span>LOG:</span> {debugMsg}</div>}
                </div>
              )}

              {/* Placeholder */}
              {!isActive && (
                <div className={styles.videoPlaceholder}>
                  <div className={styles.placeholderContent}>
                    {status === 'idle'         && <><span className={styles.placeholderIcon}>👤</span><span className={styles.placeholderText}>Start to meet someone</span></>}
                    {status === 'requesting'   && <><div className={styles.spinner} /><span className={styles.placeholderText}>Requesting camera...</span></>}
                    {status === 'waiting'      && <><div className={styles.pulser} /><span className={styles.placeholderText}>Finding a stranger...</span></>}
                    {status === 'disconnected' && <><span className={styles.placeholderIcon}>👋</span><span className={styles.placeholderText}>Stranger left</span></>}
                  </div>
                </div>
              )}
            </div>

            {/* PiP Local */}
            <div className={styles.videoSlotLocal}>
              <video ref={localVideoRef} autoPlay playsInline muted className={styles.videoLocal} />
              <span className={styles.videoLabel}>You</span>
              
              {/* 🆕 Audio Visualizer Bar */}
              {localStreamRef.current && (
                <div className={styles.audioMeterContainer}>
                  <div 
                    className={styles.audioMeterBar} 
                    style={{ width: `${Math.min(100, (audioLevel / 128) * 100)}%` }} 
                  />
                </div>
              )}
            </div>

            {/* 🆕 Floating emoji reactions on video */}
            {reactions.map(r => (
              <div
                key={r.id}
                className={styles.floatingReaction}
                style={{ left: `${r.x}%`, bottom: `${r.y}%` }}
              >
                {r.emoji}
              </div>
            ))}

            {/* 🆕 Reaction bar (during connected) */}
            {isActive && (
              <div className={styles.reactionBar}>
                {REACT_EMOJIS.map(emoji => (
                  <button
                    key={emoji}
                    className={styles.reactionBtn}
                    onClick={() => sendReaction(emoji)}
                    title={`React ${emoji}`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}

            {/* 🆕 Hero Landing Overlay (LAST CHILD for best stacking) */}
            {status === 'idle' && (
              <div className={styles.idleView}>
                <div className={styles.heroSection}>
                   <h1 className={styles.heroTitle}>
                    Meet Strangers <br/>
                    <span className={styles.gradientText}>Instantly.</span>
                  </h1>
                  <p className={styles.heroSubtitle}>
                    High-fidelity, ephemeral video discovery. 
                    No registration. No tracking. Pure human connection.
                  </p>
                  
                  <div className={styles.featuresGrid}>
                    <div className={styles.featureItem}>
                      <div className={styles.featureIcon}>⚡</div>
                      <div>
                        <div className={styles.featureName}>P2P Precision</div>
                        <div className={styles.featureDesc}>Ultra-low latency signaling for instant response.</div>
                      </div>
                    </div>
                    <div className={styles.featureItem}>
                      <div className={styles.featureIcon}>🛡️</div>
                      <div>
                        <div className={styles.featureName}>End-to-End Secure</div>
                        <div className={styles.featureDesc}>Ephemeral sessions with zero logs.</div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className={styles.searchCard}>
                  <div className={styles.holographicBeam} />
                  <div className={styles.holographicGlow + ' ' + (activeTags.length > 0 ? styles.holographicGlowActive : '')} />
                  
                  <h3 className={styles.interestTitle}>Discovery Filters</h3>
                  <p className={styles.interestSubtitle}>Add tags to find people with shared vibes</p>
                  
                  <div className={styles.interestWrapper} style={{ marginBottom: '24px' }}>
                    <p className={styles.settingsLabel} style={{ fontSize: '9px', marginBottom: '8px' }}>Select interests to match faster</p>
                    <div className={styles.interestTags}>
                      {QUICK_TAGS.map(tag => (
                        <button
                          key={tag}
                          className={`${styles.tagChip} ${activeTags.includes(tag) ? styles.tagChipActive : ''}`}
                          onClick={() => toggleTag(tag)}
                        >
                          {tag}
                        </button>
                      ))}
                    </div>

                    {/* 🆕 Custom Input */}
                    <input 
                      type="text" 
                      placeholder="Add custom tags..." 
                      className={styles.interestInput}
                      style={{ marginTop: '16px' }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && e.target.value.trim()) {
                          addInterest(e.target.value.trim());
                          e.target.value = '';
                        }
                      }}
                    />
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <button className={styles.btnStart} onClick={startSearching} style={{ justifyContent: 'center', borderRadius: 'var(--radius-sm)' }}>
                      ▶ &nbsp;Start Chatting
                    </button>
                    <p style={{ fontSize: '10px', color: 'var(--text-muted)', textAlign: 'center' }}>
                      By clicking start, you agree to our Terms & Privacy Policy.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Disconnected overlay */}
            {status === 'disconnected' && (
              <div className={styles.interestOverlay} style={{ background: 'rgba(7,7,13,0.7)' }}>
                <div className={styles.interestCard}>
                  <h2 className={styles.interestTitle}>Stranger left 👋</h2>
                  <p className={styles.interestSubtitle}>
                    {callTimer > 0 ? `Chat lasted ${formatTime(callTimer)}` : 'Chat ended. Meet someone new?'}
                  </p>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button className={styles.btnStart} onClick={startSearching} style={{ flex: 1, justifyContent: 'center', borderRadius: 'var(--radius-sm)' }}>
                      ⟳ &nbsp;Next Stranger
                    </button>
                    <button className={styles.btnStop} onClick={stopChat}>
                      ✕ Stop
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Floating controls bar */}
            {(isSearching || isActive) && (
              <div className={styles.controlsBar}>
                {isActive && (
                  <>
                    <button className={styles.btnSkip} onClick={skipPartner}>⟳ Skip</button>
                    <div className={styles.divider} />
                    <button className={`${styles.btnIcon} ${isMuted ? styles.btnIconActive : ''}`} onClick={toggleMute} title={isMuted ? 'Unmute' : 'Mute'}>
                      {isMuted ? '🔇' : '🎙'}
                    </button>
                    <button className={`${styles.btnIcon} ${isCamOff ? styles.btnIconActive : ''}`} onClick={toggleCam} title={isCamOff ? 'Cam on' : 'Cam off'}>
                      {isCamOff ? '🚫' : '📷'}
                    </button>
                    <button className={styles.btnIcon} onClick={reportUser} title="Report User">
                      🚩
                    </button>
                    <div className={styles.divider} />
                  </>
                )}
                {isSearching && (
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-muted)', letterSpacing: '0.08em' }}>
                    Finding...
                  </span>
                )}
                <button className={styles.btnStop} onClick={stopChat}>
                  ✕ {isSearching ? 'Cancel' : 'Stop'}
                </button>
              </div>
            )}
          </div>

          {/* ══ RIGHT PANEL: CHAT ════════════════════════════ */}
          <div className={styles.rightPanel}>

            {/* Chat header */}
            <div className={styles.chatHeader}>
              <span className={styles.chatHeaderTitle}>💬 Chat</span>
              {/* 🆕 Unread badge */}
              {unreadCount > 0 && (
                <span className={styles.unreadBadge}>{unreadCount}</span>
              )}
              {isActive && callTimer > 0 && (
                <span className={styles.chatHeaderSub}>⏱ {formatTime(callTimer)}</span>
              )}
            </div>

            <div className={styles.chatArea}>
              <div
                className={styles.chatMessages}
                ref={chatScrollRef}
              >
                {messages.length === 0 && (
                  <div className={styles.chatEmpty}>
                    <span className={styles.chatEmptyIcon}>{isActive ? '👋' : '💬'}</span>
                    <span className={styles.chatEmptyText}>
                      {isActive ? 'Say hello to your stranger!' : 'Chat will appear here'}
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
                      <span className={styles.typingDots}><span /><span /><span /></span>
                    </span>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              {/* 🆕 Emoji quick-pick bar */}
              {isActive && showEmojiBar && (
                <div className={styles.emojiBar}>
                  {CHAT_EMOJIS.map(e => (
                    <button
                      key={e}
                      className={styles.emojiBtnChat}
                      onClick={() => { setInputMsg(prev => prev + e); setShowEmojiBar(false); }}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              )}

              {/* Chat input */}
              <div className={styles.chatInput}>
                {/* 🆕 Emoji toggle */}
                {isActive && (
                  <button
                    className={styles.btnIcon}
                    onClick={() => setShowEmojiBar(v => !v)}
                    title="Emoji"
                    style={{ flexShrink: 0 }}
                  >
                    😊
                  </button>
                )}
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
                  onClick={() => sendMessage()}
                  disabled={!isActive || !inputMsg.trim()}
                >
                  Send ↵
                </button>
              </div>
            </div>
          </div>
        </main>

        <footer className={styles.footer}>
          <span>StrangerLink · Be respectful · 18+ only</span>
          <div className={styles.footerLinks}>
            <a href="/privacy" className={styles.footerLink}>Privacy Policy</a>
            <a href="/terms" className={styles.footerLink}>Terms of Service</a>
          </div>
        </footer>

        {/* 🆕 SETTINGS MODAL */}
        {showSettings && (
          <div className={styles.interestOverlay} style={{ zIndex: 1000 }}>
            <div className={styles.interestCard} style={{ maxWidth: '360px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 className={styles.interestTitle}>Media Settings</h2>
                <button 
                  className={styles.btnIcon} 
                  onClick={() => setShowSettings(false)}
                  style={{ width: '32px', height: '32px' }}
                >✕</button>
              </div>
              
              <div className={styles.settingsGroup}>
                <label className={styles.settingsLabel}>Camera</label>
                <select 
                  className={styles.settingsSelect}
                  value={selectedVideo}
                  onChange={(e) => switchDevice('video', e.target.value)}
                >
                  {videoDevices.map(d => (
                    <option key={d.deviceId} value={d.deviceId}>{d.label || `Camera ${d.deviceId.slice(0,5)}`}</option>
                  ))}
                  {videoDevices.length === 0 && <option disabled>No cameras found</option>}
                </select>
              </div>

              <div className={styles.settingsGroup}>
                <label className={styles.settingsLabel}>Microphone</label>
                <select 
                  className={styles.settingsSelect}
                  value={selectedAudio}
                  onChange={(e) => switchDevice('audio', e.target.value)}
                >
                  {audioDevices.map(d => (
                    <option key={d.deviceId} value={d.deviceId}>{d.label || `Mic ${d.deviceId.slice(0,5)}`}</option>
                  ))}
                  {audioDevices.length === 0 && <option disabled>No microphones found</option>}
                </select>
              </div>

              <div className={styles.settingsGroup}>
                <label className={styles.settingsLabel}>Audio Feedback</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <input 
                    type="checkbox" 
                    checked={soundEnabled}
                    onChange={(e) => setSoundEnabled(e.target.checked)}
                    id="sound-toggle"
                    style={{ scale: '1.2' }}
                  />
                  <label htmlFor="sound-toggle" style={{ fontSize: '13px', cursor: 'pointer' }}>Enable Sound Effects</label>
                </div>
              </div>

              <div className={styles.debugHud} style={{ position: 'static', marginTop: '10px' }}>
                Peer ID: {userId.slice(0,8)}...
              </div>

              <button className={styles.btnStart} onClick={() => setShowSettings(false)} style={{ width: '100%', justifyContent: 'center' }}>
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
