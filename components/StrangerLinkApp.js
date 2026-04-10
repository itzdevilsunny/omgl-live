import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Head from 'next/head';
import Pusher from 'pusher-js';
import styles from '../styles/Home.module.css';
import AudioVisualizer from './AudioVisualizer';
import { useBackgroundBlur } from './BackgroundBlur';
import { useVideoFilters } from '../lib/useVideoFilters';

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

function getFlagEmoji(countryCode) {
  if (!countryCode || countryCode === 'UN') return '🌐';
  const codePoints = countryCode
    .toUpperCase()
    .split('')
    .map(char => 127397 + char.charCodeAt(0));
  try {
    return String.fromCodePoint(...codePoints);
  } catch {
    return '🌐';
  }
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
  const [snapshotUrl,   setSnapshotUrl]   = useState(null);  // 📸 selfie preview data URL
  const [shutterFlash,  setShutterFlash]  = useState(false); // 📸 white flash animation
  const [showEmojiBar,  setShowEmojiBar]  = useState(false); // 🆕 emoji picker toggle
  const [isGenerating,  setIsGenerating]  = useState(false); // 🆕 AI icebreaker toggle
  const [showSettings,  setShowSettings]  = useState(false); // 🆕 settings modal
  const [videoDevices,  setVideoDevices]  = useState([]);    // 🆕 list of cameras
  const [audioDevices,  setAudioDevices]  = useState([]);    // 🆕 list of mics
  const [selectedVideo, setSelectedVideo] = useState('');    // 🆕 chosen cameraId
  const [selectedAudio, setSelectedAudio] = useState('');    // 🆕 chosen micId
  const [onlineCount,   setOnlineCount]   = useState(0);     // 🆕 total users
  const [partnerCountry, setPartnerCountry] = useState(null); // 🆕 partner's location
  const [trendingTags,  setTrendingTags]  = useState([]);    // 🆕 popular interests
  const [connType,      setConnType]      = useState('Direct'); // P2P or Relay
  const [soundEnabled,  setSoundEnabled]  = useState(true);     // sound toggle
  const [sharedTag,     setSharedTag]     = useState('');      // 🆕 the shared interest tag
  const [pusherStatus,  setPusherStatus]  = useState('disconnected'); // 🆕 signaling state
  const [blurBackground, setBlurBackground] = useState(false); // 🆕 virtual bg blur
  const [chatTheme,      setChatTheme]      = useState('standard'); // 🆕 standard|neon|cyber|luxury
  const [notificationsEnabled, setNotificationsEnabled] = useState(false); // 🔔 push alert toggle
  
  // 🆕 Advanced Profile States
  const [chatMode,      setChatMode]      = useState('video');
  const [ageGroup,      setAgeGroup]      = useState('any');
  const [qualification, setQualification] = useState('any');
  const [showFilters,   setShowFilters]   = useState(false); // 🆕 filter carousel toggle

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

  /* ── BACKGROUND BLUR & VIDEO FILTERS ─────────────────────── */
  const { startBlur, stopBlur, isBlurActive, isLoading: isBlurLoading, blurStreamRef } = useBackgroundBlur();
  const [isCapturing, setIsCapturing] = useState(false);
  const captureTimeoutRef = useRef(null);
  const [facingMode, setFacingMode] = useState('user');
  const [isFlashActive, setIsFlashActive] = useState(false);

  const { 
    startProcessing, stopProcessing, setFilter, capturePhoto, 
    startRecording, stopRecording, activeFilter, isProcessing, 
    isARLoading, isRecording, filters 
  } = useVideoFilters();

  const handleCaptureTap = useCallback(() => {
    const dataUrl = capturePhoto();
    if (dataUrl) {
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `snap_${Date.now()}.png`;
      a.click();
    }
  }, [capturePhoto]);

  const handleCaptureStart = () => {
    captureTimeoutRef.current = setTimeout(() => {
      startRecording();
    }, 500); // 500ms for long press
  };

  const handleCaptureEnd = () => {
    if (captureTimeoutRef.current) {
        clearTimeout(captureTimeoutRef.current);
        if (!isRecording) {
            handleCaptureTap();
        } else {
            stopRecording();
        }
    }
  };

  const toggleCamera = async () => {
    const nextMode = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(nextMode);
    
    // Simplification: Log switch, normally would re-trigger startStream
    log(`Switching to ${nextMode} camera`);
  };

  const toggleFlash = () => {
    setIsFlashActive(true);
    setTimeout(() => setIsFlashActive(false), 300);
  };

  /* ── UTILS ─────────────────────────────────────────────────── */
  function updateStatus(s) { statusRef.current = s; setStatus(s); }
  function log(msg) {
    if (process.env.NODE_ENV !== 'production') {
      console.log('[SL]', msg);
    }
    setDebugMsg(msg);
  }
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
  const MAX_CALL_DURATION = 1200; // 20 minutes in seconds
  const timerStartRef = useRef(null); // performance.now() timestamp at call start

  function startTimer() {
    // Strict guard — reject any duplicate calls while timer is already running
    if (timerRef.current) return;

    // performance.now() = monotonic high-resolution clock (never drifts, unaffected by system clock)
    timerStartRef.current = performance.now();

    timerRef.current = setInterval(() => {
      if (!timerStartRef.current) return;
      // Elapsed seconds from the monotonic clock — 100% accurate, no drift
      const elapsed = Math.floor((performance.now() - timerStartRef.current) / 1000);
      setCallTimer(elapsed);

      if (elapsed >= MAX_CALL_DURATION) {
        clearInterval(timerRef.current);
        timerRef.current = null;
        setMessages(prev => [...prev, { from: 'system', text: '⏰ 20-minute session limit reached. Connect again to keep chatting!' }]);
        setTimeout(() => stopChat(), 3000);
      } else if (elapsed === MAX_CALL_DURATION - 60) {
        setMessages(prev => [...prev, { from: 'system', text: '⚠️ 1 minute remaining in this session.' }]);
      }
    }, 1000);
  }

  function stopTimer() {
    clearInterval(timerRef.current);
    timerRef.current = null;
    timerStartRef.current = null;
    setCallTimer(0);
  }

  /* ── EMOJI REACTIONS ───────────────────────────────────────── */
  function sendReaction(emoji) {
    spawnReaction(emoji, true);
    if (partnerIdRef.current) sig(partnerIdRef.current, 'reaction', { emoji });
  }

  function spawnReaction(emoji, isLocal = true) {
    if (!isLocal) playBeep('reaction');
    const id = Date.now() + Math.random().toString(36).substring(7);
    
    // Generate TikTok style trajectory parameters
    const randomLeft = Math.random() * 80 + 10;
    const sway = (Math.random() - 0.5) * 100; // random drift amount
    const duration = 2 + Math.random() * 1;
    const initialScale = 0.4 + Math.random() * 0.4;
    
    setReactions(prev => [...prev, { id, emoji, left: randomLeft, sway, duration, initialScale }]);
    setTimeout(() => setReactions(prev => prev.filter(r => r.id !== id)), duration * 1000);
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
  // Legacy visualizer functions removed in favor of <AudioVisualizer /> component
  
  /* ── MEDIA ─────────────────────────────────────────────────── */
  async function getLocalStream() {
    if (localStreamRef.current) return localStreamRef.current;
    const constraints = {
      video: {
        deviceId: selectedVideo ? { exact: selectedVideo } : undefined,
        width:       { ideal: 1280 },
        height:      { ideal: 720 },
        frameRate:   { ideal: 30, min: 15 },
        aspectRatio: { ideal: 4 / 3 },  // Most phone cameras' native ratio — prevents zoom
        facingMode:  'user',
      },
      audio: {
        deviceId:         selectedAudio ? { exact: selectedAudio } : undefined,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl:  true,
        sampleRate:       48000,
        channelCount:     1,   // mono voice — much lower latency than stereo
        sampleSize:       16,
      },
    };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    // Tell encoder this is live motion, not a static screen capture
    stream.getVideoTracks().forEach(t => { try { t.contentHint = 'motion'; } catch {} });
    localStreamRef.current = stream;
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = stream;
      localVideoRef.current.play().catch(() => {});
    }

    // 🆕 Apply Video Filters if active
    if (activeFilter !== 'none') {
      const filteredStream = await startProcessing(stream);
      if (filteredStream) {
        localStreamRef.current = filteredStream;
        if (localVideoRef.current) localVideoRef.current.srcObject = filteredStream;
        return filteredStream;
      }
    }

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

  /* ── BACKGROUND BLUR TOGGLE ────────────────────────────────── */
  async function handleBlurToggle() {
    const rawStream = localStreamRef.current;
    if (!rawStream) return;

    if (isBlurActive) {
      // Disable blur: swap back raw video track
      stopBlur();
      setBlurBackground(false);
      if (localVideoRef.current) localVideoRef.current.srcObject = rawStream;
      // Hot-swap the original raw video track back into RTC
      const rawVideoTrack = rawStream.getVideoTracks()[0];
      if (pcRef.current && rawVideoTrack) {
        const sender = pcRef.current.getSenders().find(s => s.track?.kind === 'video');
        if (sender) await sender.replaceTrack(rawVideoTrack);
      }
    } else {
      // Enable blur
      setBlurBackground(true);
      const blurred = await startBlur(rawStream);
      if (!blurred) { setBlurBackground(false); return; } // failed to load model

      // Show blurred preview locally
      if (localVideoRef.current) localVideoRef.current.srcObject = blurred;

      // Hot-swap blurred canvas video track into RTC
      const blurVideoTrack = blurred.getVideoTracks()[0];
      if (pcRef.current && blurVideoTrack) {
        const sender = pcRef.current.getSenders().find(s => s.track?.kind === 'video');
        if (sender) await sender.replaceTrack(blurVideoTrack);
      }
    }
  }

  /* ── SNAPCHAT FILTER ACTIVATION ──────────────────────────── */
  const handleFilterChange = async (filterId) => {
    try {
      setFilter(filterId);
      
      let targetStream = localStreamRef.current;
      if (!targetStream) return;

      // Force AR engine if not active
      if (!isProcessing) {
        log('Starting AR Engine...');
        const processed = await startProcessing(targetStream);
        if (processed) {
            targetStream = processed;
            if (localVideoRef.current) localVideoRef.current.srcObject = processed;
        }
      }

      // Sync to WebRTC Partner
      if (pcRef.current) {
        const videoTrack = (localVideoRef.current?.srcObject || targetStream).getVideoTracks()[0];
        if (videoTrack) {
          const sender = pcRef.current.getSenders().find(s => s.track?.kind === 'video');
          if (sender) {
            log('Syncing AR track to partner...');
            await sender.replaceTrack(videoTrack);
          }
        }
      }
    } catch (err) {
      console.error('[SnapHUD] Filter Switch Error:', err);
    }
  };

  /* ── QUALITY OPTIMIZATION HELPERS ─────────────────────────── */

  // Set codec order preference BEFORE creating the offer.
  // Must be called after addTrack() but before createOffer().
  function applyCodecPreferences(pc) {
    try {
      pc.getTransceivers().forEach(transceiver => {
        const kind = transceiver.sender.track?.kind;
        if (kind === 'video') {
          const caps = RTCRtpSender.getCapabilities?.('video');
          if (!caps) return;
          // Prefer H264 (hardware accelerated on most devices) → VP9 → VP8
          const h264  = caps.codecs.filter(c => c.mimeType === 'video/H264');
          const vp9   = caps.codecs.filter(c => c.mimeType === 'video/VP9');
          const vp8   = caps.codecs.filter(c => c.mimeType === 'video/VP8');
          const rest  = caps.codecs.filter(c => !['video/H264','video/VP9','video/VP8'].includes(c.mimeType));
          const ordered = [...h264, ...vp9, ...vp8, ...rest];
          if (ordered.length && transceiver.setCodecPreferences) {
            transceiver.setCodecPreferences(ordered);
          }
        }
        if (kind === 'audio') {
          const caps = RTCRtpSender.getCapabilities?.('audio');
          if (!caps) return;
          // Prefer Opus (lowest latency, best quality for voice)
          const opus = caps.codecs.filter(c => c.mimeType === 'audio/opus');
          const rest = caps.codecs.filter(c => c.mimeType !== 'audio/opus');
          if (opus.length && transceiver.setCodecPreferences) {
            transceiver.setCodecPreferences([...opus, ...rest]);
          }
        }
      });
    } catch (e) {
      log('applyCodecPreferences skipped: ' + e.message);
    }
  }

  // Apply high-quality encoding parameters AFTER ICE connects.
  // setParameters() only works on an active sender post-connection.
  function applyQualitySettings(pc) {
    try {
      pc.getSenders().forEach(sender => {
        if (!sender.track) return;
        const params = sender.getParameters();
        if (!params.encodings || params.encodings.length === 0) {
          params.encodings = [{}];
        }
        if (sender.track.kind === 'video') {
          params.encodings[0].maxBitrate     = 2_500_000; // 2.5 Mbps — crisp 720p
          params.encodings[0].maxFramerate   = 30;
          params.encodings[0].priority        = 'high';
          params.encodings[0].networkPriority = 'high';
        } else if (sender.track.kind === 'audio') {
          params.encodings[0].maxBitrate      = 128_000;  // 128 kbps Opus
          params.encodings[0].priority        = 'high';
          params.encodings[0].networkPriority = 'high';
        }
        sender.setParameters(params).catch(() => {});
      });
      log('Quality settings applied (2.5Mbps video, 128kbps audio)');
    } catch (e) {
      log('applyQualitySettings skipped: ' + e.message);
    }
  }

  /* ── WEBRTC ────────────────────────────────────────────────── */
  // Ref to track the disconnect grace timer so we can cancel it if connection recovers
  const disconnectTimerRef = useRef(null);

  function createPeerConnection() {
    if (pcRef.current) {
      pcRef.current.ontrack = null;
      pcRef.current.onicecandidate = null;
      pcRef.current.onconnectionstatechange = null;
      pcRef.current.oniceconnectionstatechange = null;
      pcRef.current.close();
      pcRef.current = null;
    }
    log('Creating PeerConnection...');
    const pc = new RTCPeerConnection(ICE_SERVERS);
    pcRef.current = pc;

    // Create the remote stream container — do NOT assign to srcObject yet
    const remoteStream = new MediaStream();
    remoteStreamRef.current = remoteStream;

    // ── Reliable remote video player ──────────────────────────────
    const playRemoteVideo = () => {
      const vid = remoteVideoRef.current;
      if (!vid) return;
      // Assign fresh srcObject reference so browser detects the change
      if (vid.srcObject !== remoteStream) {
        vid.srcObject = remoteStream;
      }
      vid.muted = false;
      // Always attempt play; if autoplay policy blocks it, fallback to muted then unmute
      vid.play().catch((err) => {
        log('RemotePlay blocked: ' + err.name);
        if (err.name === 'NotAllowedError') {
          // Muted autoplay is always allowed; unmute after
          vid.muted = true;
          vid.play()
            .then(() => { vid.muted = false; })
            .catch(() => {});
        }
      });
    };

    pc.ontrack = (e) => {
      log(`Track: ${e.track.kind}`);
      // Only add the track if it's not already in the stream
      if (!remoteStream.getTracks().find(t => t.id === e.track.id)) {
        remoteStream.addTrack(e.track);
      }
      // Attempt to play as soon as ANY track arrives
      playRemoteVideo();
    };

    pc.onicecandidate = (e) => {
      if (e.candidate) {
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
      if (pc.iceConnectionState === 'failed') {
        log('ICE failed — restarting');
        pc.restartIce();
      }
      // When ICE reaches connected/completed, retry video play in case
      // ontrack fired before the stream was ready to render
      if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        // Apply encoding params AFTER ICE connects — setParameters() only works post-connection
        setTimeout(() => applyQualitySettings(pc), 500);
        setTimeout(playRemoteVideo, 300);
      }
    };

    pc.onconnectionstatechange = () => {
      log(`PC: ${pc.connectionState}`);
      
      if (pc.connectionState === 'connected') {
        clearTimeout(disconnectTimerRef.current);
        setTimeout(playRemoteVideo, 300);
        setTimeout(() => applyQualitySettings(pc), 600);
      }
      
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        // 🔄 Attempt an ICE restart if supported
        try {
          if (pc.restartIce) {
            pc.restartIce();
            log('ICE Restarting — attempting to recover connection...');
          }
        } catch (e) {
          log('ICE Restart failed: ' + e.message);
        }

        // Show a temporary system message to indicate instability
        setMessages(m => [
          ...m, 
          { from: 'system', text: '📶 Connection unstable. Attempting to reconnect automatically...' }
        ]);

        // ⏱ Grace Period: 60s for both disconnected AND failed states
        // This prevents the call from dropping instantly on network blips.
        clearTimeout(disconnectTimerRef.current);
        disconnectTimerRef.current = setTimeout(() => {
          if (pcRef.current && (pcRef.current.connectionState === 'disconnected' || pcRef.current.connectionState === 'failed')) {
            log(`Call dropped — connection remained ${pcRef.current.connectionState} for 60s`);
            handlePartnerLeft();
          }
        }, 60000);
      }
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
    try {
      const res = await fetch('/api/signal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId, type, data, from: userIdRef.current }),
      });

      if (!res.ok && type === 'chat' && res.status === 403) {
        // Handle AI Moderation Flag
        const errData = await res.json().catch(() => ({}));
        setMessages(m => [...m, { 
          from: 'system', 
          text: `🚫 Message not sent. Reason: ${errData.reason || 'Violates community guidelines.'}`
        }]);
      }
    } catch (err) {
      console.error('[SL] Signaling Error:', err);
    }
  }

  async function handleOffer(offer, fromId) {
    log(`Offer from ${fromId} (state: ${pcRef.current?.signalingState ?? 'none'})`);
    partnerIdRef.current = fromId;

    // ALWAYS create a fresh PC for an incoming offer.
    // We must not reuse an existing initiator PC — it has wrong state.
    // Close any glared local offer first.
    if (pcRef.current && pcRef.current.signalingState === 'have-local-offer') {
      log('Glare: closing our local PC to accept remote offer');
    }
    // createPeerConnection() safely closes the old one
    const pc = createPeerConnection();

    // Ensure local stream tracks are on this new PC
    const stream = localStreamRef.current;
    if (stream) {
      const existingSenders = pc.getSenders().map(s => s.track?.id);
      stream.getTracks().forEach(t => {
        if (!existingSenders.includes(t.id)) pc.addTrack(t, stream);
      });
    }

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

    // Only apply if we're still waiting for the remote answer
    if (pc.signalingState !== 'have-local-offer') {
      log(`Skip answer: not in have-local-offer (current: ${pc.signalingState})`);
      return;
    }

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(answer));
      await flushIce();
      log('Answer applied — remote description set');
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
    if (chatMode !== 'text') {
      await getLocalStream();
    }
    startTimer();
    if (isInitiator && chatMode !== 'text') {
      // 200ms: enough for the non-initiator to subscribe to Pusher, but fast
      await new Promise(r => setTimeout(r, 200));
      const pc = createPeerConnection();
      // Set codec preferences BEFORE creating the offer (must be done after addTrack)
      applyCodecPreferences(pc);
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
    
    // 📶 Signaling State Persistence
    pusher.connection.bind('state_change', (states) => {
      // states = { previous, current }
      log(`Pusher: ${states.current}`);
      setPusherStatus(states.current);
      
      if (states.current === 'unavailable' || states.current === 'failed') {
        setMessages(m => [
          ...m, 
          { from: 'system', text: '📶 Signaling unstable. Attempting to reconnect to matchmaker...' }
        ]);
      }
    });

    // Unsubscribe from old channel if exists
    pusher.unsubscribe(`user-${userId}`);
    const ch = pusher.subscribe(`user-${userId}`);

    ch.bind('pusher:subscription_succeeded', () => setPusherStatus('connected'));
    ch.bind('pusher:subscription_error', () => {
      setPusherStatus('error');
      // Retry subscription after 3s if failed
      setTimeout(() => ch.subscribe(`user-${userId}`), 3000);
    });

    ch.bind('matched', async ({ roomId, isInitiator, partnerId, matchedTag, partnerCountry: pCountry }) => {
      log(`Matched! room=${roomId} init=${isInitiator} tag=${matchedTag} country=${pCountry}`);
      roomIdRef.current = roomId;
      if (partnerId) partnerIdRef.current = partnerId;
      if (pollingRef.current) clearInterval(pollingRef.current);
      playBeep('match');
      if (matchedTag) setSharedTag(matchedTag);
      if (pCountry) setPartnerCountry(pCountry);
      updateStatus('connected');
      
      // 🔔 Push Notification if backgrounded
      if (typeof window !== 'undefined' && 'Notification' in window) {
        if (Notification.permission === 'granted' && document.hidden) {
          const flag = getFlagEmoji(pCountry);
          new Notification(`🎉 New Match Found! ${flag}`, {
            body: `Connected with someone from ${pCountry || 'Earth'}. Tap to chat!`,
            icon: '/favicon.ico',
            tag: 'match-found',
            renotify: true
          }).onclick = () => { window.focus(); };
        }
      }

      const flag = getFlagEmoji(pCountry);
      setMessages([{ from: 'system', text: `🔗 Connected! ${flag} ${matchedTag ? `Matched on #${matchedTag}` : 'Found a stranger.'}` }]);
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
    setUnreadCount(0);
    
    // Explicitly hide idleView first
    updateStatus('requesting');

    try { 
      if (chatMode !== 'text') {
        await getLocalStream(); 
      }
    } catch (err) {
      console.error('[SL] Matchmaking abort: Media Denied', err);
      updateStatus('idle'); 
      return;
    }
    
    if (!pusherRef.current) {
      console.error('[SL] Matchmaking abort: Signaling client missing.');
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
          body: JSON.stringify({ userId, interests: getInterestsArray(), mode: chatMode, age: ageGroup, qual: qualification, language: navigator.language }),
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
    setPartnerCountry(null);
    updateStatus('waiting');

    async function doJoin() {
      try { await fetch('/api/join', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ userId, interests: getInterestsArray(), mode: chatMode, age: ageGroup, qual: qualification, language: navigator.language }) }); } catch {}
    }
    doJoin();
    pollingRef.current = setInterval(() => {
      if (statusRef.current !== 'waiting') { clearInterval(pollingRef.current); return; }
      doJoin();
    }, 2000);
  }

  async function stopChat() {
    stopTimer();
    if (pollingRef.current) clearInterval(pollingRef.current);
    if (partnerIdRef.current) fetch('/api/leave', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ partnerId: partnerIdRef.current, userId }) }).catch(() => {});
    pcRef.current?.close(); pcRef.current = null;
    partnerIdRef.current = null; pendingIceRef.current = [];
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
    stopProcessing(); // 🆕 cleanup canvas pipeline
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    remoteStreamRef.current = null;
    disconnectSignaling();
    updateStatus('idle');
    setMessages([]); setDebugMsg(''); setUnreadCount(0); setReactions([]); setSharedTag(''); setPartnerCountry(null);
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

  /* ── SELFIE / SNAPSHOT ─────────────────────────────────────── */
  function captureSnapshot() {
    const remoteVid = remoteVideoRef.current;
    const localVid  = localVideoRef.current;
    if (!remoteVid || !localVid) return;

    // Canvas: remote video full-width, local as PiP bottom-right
    const W = 1280, H = 720;
    const pipW = 240, pipH = 135;
    const canvas = document.createElement('canvas');
    canvas.width  = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');

    // 1. Draw remote video (full frame)
    try { ctx.drawImage(remoteVid, 0, 0, W, H); } catch {}

    // 2. Draw rounded PiP border for local
    const pipX = W - pipW - 16;
    const pipY = H - pipH - 16;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.roundRect(pipX - 3, pipY - 3, pipW + 6, pipH + 6, 10);
    ctx.fillStyle = '#000';
    ctx.fill();
    ctx.restore();

    // 3. Draw local video as PiP
    try {
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(pipX, pipY, pipW, pipH, 8);
      ctx.clip();
      ctx.drawImage(localVid, pipX, pipY, pipW, pipH);
      ctx.restore();
    } catch {}

    // 4. Watermark
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = 'bold 18px Inter, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('omgl.live', W - 18, H - 18);

    // 5. Flash + show preview
    setShutterFlash(true);
    setTimeout(() => setShutterFlash(false), 400);

    const url = canvas.toDataURL('image/png');
    setSnapshotUrl(url);
  }

  function downloadSnapshot() {
    if (!snapshotUrl) return;
    const a = document.createElement('a');
    a.href = snapshotUrl;
    a.download = `omgl-selfie-${Date.now()}.png`;
    a.click();
  }

  async function shareSnapshot() {
    if (!snapshotUrl) return;
    try {
      // Convert data URL to blob for Web Share API
      const res = await fetch(snapshotUrl);
      const blob = await res.blob();
      const file = new File([blob], 'omgl-selfie.png', { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'My omgl.live moment!', text: 'Met someone interesting on omgl.live 🌍' });
      } else {
        // Fallback: just download
        downloadSnapshot();
      }
    } catch {}
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

  /* ── ICEBREAKER (AI) ───────────────────────────────────────── */
  async function handleIcebreaker() {
    setIsGenerating(true);
    try {
      const res = await fetch('/api/icebreaker', {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tag: sharedTag })
      });
      const data = await res.json();
      if (data.icebreaker && typeof data.icebreaker === 'string') {
        setInputMsg(data.icebreaker);
      }
    } catch (err) {
      console.error('[SL] Icebreaker error:', err);
    }
    setIsGenerating(false);
  }  /* ── EFFECTS ────────────────────────────────────────────────── */
  useEffect(() => {
    setMounted(true);
    refreshDevices();
    
    // Initial camera preview
    (async () => {
      try { 
        const stream = await getLocalStream(); 
        // Re-assign if ref was null earlier
        if (localVideoRef.current && !localVideoRef.current.srcObject) {
          localVideoRef.current.srcObject = stream;
        }
      } catch (err) { 
        console.warn('[SL] Camera preview blocked:', err); 
      }
    })();
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
      const savedCT = localStorage.getItem('sl-chat-theme') || 'standard';
      setChatTheme(savedCT);
      const savedNotifs = localStorage.getItem('sl-notifications') === 'true';
      setNotificationsEnabled(savedNotifs);
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

  // 🆕 Tab Visibility Listener: Optimization & Privacy
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // If hidden and NOT in a call, stop AI to save CPU/Battery
        if (statusRef.current !== 'connected' && isBlurActive) {
          stopBlur();
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isBlurActive, stopBlur]);

  // Comprehensive Cleanup on Unmount
  useEffect(() => {
    return () => {
      if (pcRef.current) pcRef.current.close();
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(t => t.stop());
      }
      if (pusherRef.current) pusherRef.current.disconnect();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  if (!mounted) return <div style={{ background: '#121212', height: '100vh' }} />;

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
        <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=Inter:ital,wght@0,100..900;1,100..900&display=swap" rel="stylesheet" />
      </Head>

      <div className={`${styles.container} ${theme === 'light' ? styles.lightTheme : ''}`} data-chat-theme={chatTheme}>
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
            <div className={styles.videoSlotRemote} onClick={() => {
              // User gesture: unblock autoplay if browser blocked it
              const vid = remoteVideoRef.current;
              if (vid && vid.srcObject && vid.paused) {
                vid.muted = false;
                vid.play().catch(() => { vid.muted = true; vid.play().catch(() => {}); });
              }
            }}>
              <video ref={remoteVideoRef} autoPlay playsInline className={styles.videoRemote} />
              <div className={styles.videoLabel}>
                Partner
                {isActive && (
                  <div className={styles.soundWave}>
                    <span /><span /><span /><span />
                  </div>
                )}
              </div>
              <div className={`${styles.holographicGlow} ${isActive ? styles.holographicGlowActive : ''}`} />
              {!isActive && (
                <div className={styles.videoOverlay}>
                  {isSearching ? (
                    <div className={styles.searchingState}>
                      <div className={styles.holographicBeam} />
                      <div className={styles.spinner} />
                      <p className={styles.searchingText}>Establishing Quantum Link...</p>
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

              {/* 🆕 Glassmorphism Audio Visualizer (Remote) */}
              {remoteStreamRef.current && (
                <AudioVisualizer stream={remoteStreamRef.current} />
              )}

              {/* Debug HUD */}
              {isActive && (
                <div className={styles.debugHud}>
                  <div className={styles.debugRow}><span>SIG:</span> <span style={{ color: pusherStatus === 'connected' ? 'var(--green)' : 'var(--red)' }}>{pusherStatus.toUpperCase()}</span></div>
                  <div className={styles.debugRow}><span>NET:</span> {connType}</div>
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
            <div className={`${styles.videoSlotLocal} ${isBlurActive ? styles.blurFilterContainer : ''} ${showFilters ? styles.videoSlotLocalFullscreen : ''}`}>
              <video ref={localVideoRef} autoPlay playsInline muted className={styles.videoLocal} />
              <div className={styles.videoVignette} />
              <span className={styles.videoLabel}>You</span>
              
              {/* 📸 SNAPCHAT IMMERSIVE HUD */}
              <AnimatePresence>
                {showFilters && (
                  <motion.div 
                    className={styles.snapHUD}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                  >
                    {isFlashActive && <div style={{ position: 'absolute', inset: 0, background: '#fff', zIndex: 9999 }} />}
                    <div className={styles.snapTopBar}>
                      <button className={styles.snapIconBtn} onClick={() => setShowSettings(true)}>⚙️</button>
                      <motion.div 
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        key={activeFilter}
                        className={styles.snapFilterName}
                      >
                        {filters.find(f => f.id === activeFilter)?.name || 'Original'}
                      </motion.div>
                      <button className={styles.snapIconBtn} onClick={() => setShowFilters(false)}>✖</button>
                    </div>

                    <div className={styles.snapSideBar}>
                      <button className={styles.snapIconBtn} title="Switch Camera" onClick={toggleCamera}>🔄</button>
                      <button className={styles.snapIconBtn} title="Flash" onClick={toggleFlash}>⚡</button>
                      <button className={styles.snapIconBtn} title="Timer">⏲️</button>
                    </div>

                    <div className={styles.snapBottomArea}>
                      <div className={styles.snapCarousel}>
                        {filters.map(f => (
                          <motion.div
                            key={f.id}
                            className={`${styles.snapFilterCircle} ${activeFilter === f.id ? styles.snapFilterCircleActive : ''}`}
                            onClick={() => handleFilterChange(f.id)}
                            whileTap={{ scale: 0.9 }}
                          >
                            <span className={styles.snapFilterIcon}>{f.thumb || '✨'}</span>
                            <span className={styles.snapFilterLabel}>{f.name}</span>
                          </motion.div>
                        ))}
                      </div>

                      <div className={styles.snapCaptureContainer}>
                        {isRecording && <div className={styles.snapCaptureProgress} />}
                        <button 
                          className={`${styles.snapCaptureBtn} ${isRecording ? styles.snapCaptureBtnRecording : ''}`}
                          onMouseDown={handleCaptureStart}
                          onMouseUp={handleCaptureEnd}
                          onTouchStart={handleCaptureStart}
                          onTouchEnd={handleCaptureEnd}
                        >
                          <div className={styles.snapCaptureBtnInner} />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* 🆕 AR Model Loading Indicator */}
              {isARLoading && (
                <div className={styles.arLoadingOverlay}>
                  <div className={styles.arLoadingPulse} />
                  <span>AI LENSES INITIALIZING...</span>
                </div>
              )}

              {/* 🆕 Glassmorphism Audio Visualizer */}
              {localStreamRef.current && (
                <AudioVisualizer stream={localStreamRef.current} />
              )}
            </div>

            {/* 🆕 Floating emoji reactions on video */}
            <AnimatePresence>
              {reactions.map(r => (
                <motion.div
                  key={r.id}
                  className={styles.floatingReaction}
                  initial={{ opacity: 0, scale: r.initialScale, y: 50, x: 0 }}
                  animate={{ 
                    opacity: [0, 1, 1, 0], 
                    scale: [r.initialScale, 1.2, 1], 
                    y: -400, 
                    x: [0, r.sway, -r.sway/2, 0] 
                  }}
                  exit={{ opacity: 0, scale: 0.5 }}
                  transition={{ duration: r.duration, ease: "easeOut" }}
                  style={{ left: `${r.left}%` }}
                >
                  {r.emoji}
                </motion.div>
              ))}
            </AnimatePresence>

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
                  
                  <h3 className={styles.interestTitle}>Start Chatting</h3>
                  <p className={styles.interestSubtitle}>Configure your perfect match parameters</p>
                  
                  <div className={styles.interestWrapper} style={{ marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                      <button className={`${styles.tagChip} ${chatMode === 'video' ? styles.tagChipActive : ''}`} onClick={() => setChatMode('video')} style={{ flex: 1 }}>📹 Video Mode</button>
                      <button className={`${styles.tagChip} ${chatMode === 'text' ? styles.tagChipActive : ''}`} onClick={() => setChatMode('text')} style={{ flex: 1 }}>💬 Text Mode</button>
                    </div>
                    <select className={styles.settingsSelect} value={ageGroup} onChange={e => setAgeGroup(e.target.value)} style={{ padding: '8px', fontSize: '13px' }}>
                      <option value="any">Any Age</option>
                      <option value="18-21">18-21</option>
                      <option value="22-25">22-25</option>
                      <option value="26-30">26-30</option>
                      <option value="30+">30+</option>
                    </select>
                    <select className={styles.settingsSelect} value={qualification} onChange={e => setQualification(e.target.value)} style={{ padding: '8px', fontSize: '13px' }}>
                      <option value="any">Any Background</option>
                      <option value="highschool">High School</option>
                      <option value="college">College Student</option>
                      <option value="professional">Professional</option>
                    </select>
                  </div>
                  
                  <div className={styles.interestWrapper} style={{ marginBottom: '24px' }}>
                    <p className={styles.settingsLabel} style={{ fontSize: '11px', marginBottom: '8px' }}>Select interests to match faster</p>
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
                    <button className={styles.btnIcon} onClick={() => setShowFilters(!showFilters)} title="Filters ✨">
                      ✨
                    </button>
                    <button className={styles.btnIcon} onClick={captureSnapshot} title="Take Selfie 📸">
                      📸
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

            {/* LEGACY Filter Carousel (REMOVED - Replaced by SnapHUD) */}
          </div>

          {/* 📸 Shutter Flash Overlay */}
          {shutterFlash && <div className={styles.shutterFlash} />}

          {/* ══ RIGHT PANEL: CHAT ════════════════════════════ */}
          <div className={styles.rightPanel}>

            {/* Chat header */}
            <div className={styles.chatHeader}>
              <span className={styles.chatHeaderTitle}>💬 Chat {partnerCountry && `(${getFlagEmoji(partnerCountry)})`}</span>
              {/* 🆕 Unread badge */}
              {unreadCount > 0 && (
                <span className={styles.unreadBadge}>{unreadCount}</span>
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
                  <motion.div
                    key={m.id || i}
                    initial={{ opacity: 0, y: 15, scale: 0.9 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ type: 'spring', damping: 20, stiffness: 400 }}
                    className={`${styles.message} ${styles[m.from]}`}
                  >
                    {m.from !== 'system' && (
                      <span className={styles.msgFrom}>
                        {m.from === 'me' ? 'You' : `Stranger ${partnerCountry ? getFlagEmoji(partnerCountry) : ''}`}
                      </span>
                    )}
                    <span className={styles.msgText}>
                      {m.text}
                      {m.translated && (
                        <span className={styles.translatedBadge} title={`Original: ${m.original}`}>
                          (Translated)
                        </span>
                      )}
                    </span>
                  </motion.div>
                ))}
                {partnerTyping && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className={`${styles.message} ${styles.them}`}
                  >
                    <span className={styles.msgFrom}>Stranger is typing...</span>
                    <span className={styles.msgText} style={{ padding: '4px 8px' }}>
                      <div className={styles.typingIndicator}>
                        <div className={styles.typingDot} />
                        <div className={styles.typingDot} />
                        <div className={styles.typingDot} />
                      </div>
                    </span>
                  </motion.div>
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
                {/* 🆕 Icebreaker toggle */}
                {isActive && (
                  <button
                    className={`${styles.btnIcon} ${isGenerating ? styles.pulseAnim : ''}`}
                    onClick={handleIcebreaker}
                    disabled={isGenerating}
                    title="Generate AI Icebreaker"
                    style={{ flexShrink: 0, marginLeft: '4px' }}
                  >
                    {isGenerating ? '⏳' : '🎲'}
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
            <div className={styles.settingsCard}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h2 className={styles.interestTitle} style={{ margin: 0, fontSize: '15px' }}>⚙️ Settings</h2>
                <button 
                  className={styles.btnIcon} 
                  onClick={() => setShowSettings(false)}
                  style={{ width: '28px', height: '28px', fontSize: '14px' }}
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
                <label className={styles.settingsLabel}>🎨 Chat Theme</label>
                <div style={{ display: 'flex', gap: '6px' }}>
                  {[
                    { id: 'standard', color: '#7c6aff', name: 'Original' },
                    { id: 'neon',     color: '#bc13fe', name: 'Neon' },
                    { id: 'cyber',    color: '#ff0055', name: 'Cyber' },
                    { id: 'luxury',   color: '#d4af37', name: 'Luxury' }
                  ].map(t => (
                    <button
                      key={t.id}
                      onClick={() => {
                        setChatTheme(t.id);
                        localStorage.setItem('sl-chat-theme', t.id);
                      }}
                      style={{
                        flex: 1,
                        height: '30px',
                        borderRadius: '6px',
                        background: t.color,
                        border: chatTheme === t.id ? '2.5px solid #fff' : '2px solid rgba(255,255,255,0.1)',
                        cursor: 'pointer',
                        fontSize: '9px',
                        fontWeight: 'bold',
                        color: t.id === 'luxury' ? '#000' : '#fff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.2s ease',
                        transform: chatTheme === t.id ? 'scale(1.05)' : 'scale(1)'
                      }}
                    >
                      {t.name}
                    </button>
                  ))}
                </div>
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

              <div className={styles.settingsGroup} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <label className={styles.settingsLabel} style={{ marginBottom: 0 }}>Audio Feedback</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input 
                    type="checkbox" 
                    checked={soundEnabled}
                    onChange={(e) => setSoundEnabled(e.target.checked)}
                    id="sound-toggle"
                    style={{ scale: '1.1' }}
                  />
                  <label htmlFor="sound-toggle" style={{ fontSize: '12px', cursor: 'pointer', whiteSpace: 'nowrap' }}>Sound Effects</label>
                </div>
              </div>

              <div className={styles.settingsGroup}>
                <label className={styles.settingsLabel}>🔔 Background Alerts</label>
                <button
                  onClick={async () => {
                    if (!notificationsEnabled) {
                      const res = await Notification.requestPermission();
                      if (res === 'granted') {
                        setNotificationsEnabled(true);
                        localStorage.setItem('sl-notifications', 'true');
                      } else {
                        alert('Please enable notifications in your browser settings to use this feature.');
                      }
                    } else {
                      setNotificationsEnabled(false);
                      localStorage.setItem('sl-notifications', 'false');
                    }
                  }}
                  className={`${styles.blurToggleBtn} ${notificationsEnabled ? styles.blurToggleBtnActive : ''}`}
                  style={{ padding: '7px 10px', fontSize: '11px', width: '100%' }}
                >
                  {notificationsEnabled ? '✅ Notifications: ON' : '🔔 Enable Push Notifications'}
                </button>
              </div>

              {/* Peer ID — compact single line */}
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-muted)', padding: '4px 0', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', marginBottom: '10px' }}>
                Peer: {userId.slice(0,8)}...
              </div>

              <div className={styles.settingsGroup}>
                <label className={styles.settingsLabel}>🎭 Privacy</label>
                <button
                  className={`${styles.blurToggleBtn} ${isBlurActive ? styles.blurToggleBtnActive : ''}`}
                  onClick={handleBlurToggle}
                  disabled={isBlurLoading || !localStreamRef.current}
                  style={{ padding: '7px 10px', fontSize: '11px', width: '100%' }}
                >
                  {isBlurLoading
                    ? '⏳ Loading AI Model...'
                    : isBlurActive
                    ? '✅ Background Blur: ON'
                    : '🌫️ Background Blur: OFF'}
                </button>
              </div>

              <button className={styles.btnStart} onClick={() => setShowSettings(false)} style={{ width: '100%', justifyContent: 'center', padding: '10px', fontSize: '13px', marginTop: '4px' }}>
                Done
              </button>
            </div>
          </div>
        )}
        {/* 📸 SNAPSHOT PREVIEW MODAL */}
        {snapshotUrl && (
          <div className={styles.snapshotOverlay} onClick={() => setSnapshotUrl(null)}>
            <div className={styles.snapshotModal} onClick={e => e.stopPropagation()}>
              <div className={styles.snapshotHeader}>
                <span>📸 Your Omgl Moment</span>
                <button className={styles.btnIcon} onClick={() => setSnapshotUrl(null)} style={{ width: 32, height: 32 }}>✕</button>
              </div>
              <img src={snapshotUrl} alt="snapshot" className={styles.snapshotImg} />
              <div className={styles.snapshotActions}>
                <button className={styles.btnStart} onClick={downloadSnapshot}>
                  ⬇️ Download PNG
                </button>
                <button className={styles.btnSkip} onClick={shareSnapshot}>
                  📤 Share
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
