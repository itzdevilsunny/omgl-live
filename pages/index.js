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
    // OpenRelay Public TURN (Shared/Free) - replace with private for production
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
  const [userId] = useState(() => {
    if (typeof window !== 'undefined') {
      let id = sessionStorage.getItem('userId');
      if (!id) { id = generateUserId(); sessionStorage.setItem('userId', id); }
      return id;
    }
    return generateUserId();
  });

  const [status, setStatus] = useState('idle'); // idle | requesting | waiting | connected | disconnected
  const [isMuted, setIsMuted] = useState(false);
  const [isCamOff, setIsCamOff] = useState(false);
  const [messages, setMessages] = useState([]);
  const [inputMsg, setInputMsg] = useState('');
  const [partnerTyping, setPartnerTyping] = useState(false);
  const [interests, setInterests] = useState('');
  const [liveStats, setLiveStats] = useState({ activeUsers: 0, waitingCount: 0 });
  const [debug, setDebug] = useState({ pc: 'idle', ice: 'idle', gather: 'idle', tracks: 0 });
  
  const statusRef = useRef('idle');
  const updateStatus = (newStatus) => {
    statusRef.current = newStatus;
    setStatus(newStatus);
  };

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const localStreamRef = useRef(null);
  const pollingRef = useRef(null);
  const pendingIceRef = useRef([]); // SINGLE declaration
  const pcRef = useRef(null);
  const pusherRef = useRef(null);
  const channelRef = useRef(null);
  const partnerIdRef = useRef(null);
  const isInitiatorRef = useRef(false);
  const roomIdRef = useRef(null);
  const chatEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  // ICE Watchdog: Restart if stuck in checking for too long
  useEffect(() => {
    if (status === 'connected' && debug.ice === 'checking') {
      const timer = setTimeout(() => {
        console.log('ICE Stuck! Attempting restart...');
        if (pcRef.current) {
          pcRef.current.createOffer({ iceRestart: true }).then(offer => {
            pcRef.current.setLocalDescription(offer);
            fetch('/api/signal', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ targetUserId: partnerIdRef.current, type: 'offer', data: offer, from: userId }),
            });
          });
        }
      }, 10000);
      return () => clearTimeout(timer);
    }
  }, [status, debug.ice, userId]);

  const handlePartnerLeft = useCallback(() => {
    updateStatus('disconnected');
    setMessages(m => [...m, { from: 'system', text: 'Stranger has disconnected.' }]);
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    pcRef.current?.close();
    pcRef.current = null;
    partnerIdRef.current = null;
    pendingIceRef.current = [];
  }, []);

  const getLocalStream = useCallback(async () => {
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
  }, []);

  const createPeerConnection = useCallback((partnerId) => {
    if (typeof window === 'undefined') return null;
    
    // 1. REUSE IT: If a PC is already active, don't overwrite it (fixes race conditions)
    if (pcRef.current && pcRef.current.signalingState !== 'closed') {
      console.log('REUSING existing PeerConnection');
      return pcRef.current;
    }

    console.log('CREATING NEW PeerConnection for:', partnerId || partnerIdRef.current);
    const pc = new RTCPeerConnection({
        ...ICE_SERVERS,
        bundlePolicy: 'max-bundle',
        rtcpMuxPolicy: 'require',
    });
    pcRef.current = pc;

    pc.onicecandidate = (e) => {
      // Use the LATEST partnerId from the ref to ensure signaling never fails
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
      console.log('Track detected!', e.streams[0]?.id);
      setDebug(d => ({ ...d, tracks: e.streams[0] ? 1 : (d.tracks + 1) }));
      
      if (remoteVideoRef.current) {
        if (e.streams && e.streams[0]) {
          remoteVideoRef.current.srcObject = e.streams[0];
        } else {
          // Fallback if browser doesn't provide streams
          if (!remoteVideoRef.current.srcObject) {
            remoteVideoRef.current.srcObject = new MediaStream();
          }
          remoteVideoRef.current.srcObject.addTrack(e.track);
        }
        
        // Force rendering / Avoid first-frame pause bug
        remoteVideoRef.current.play().catch(() => {});
      }
    };

    pc.onicegatheringstatechange = () => {
      console.log('Gather:', pc.iceGatheringState);
      setDebug(d => ({ ...d, gather: pc.iceGatheringState }));
    };

    pc.oniceconnectionstatechange = () => {
      console.log('ICE:', pc.iceConnectionState);
      setDebug(d => ({ ...d, ice: pc.iceConnectionState }));
    };

    pc.onconnectionstatechange = () => {
      console.log('PC:', pc.connectionState);
      setDebug(d => ({ ...d, pc: pc.connectionState }));
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        handlePartnerLeft();
      }
    };

    // 2. ATTACH TRACKS: Always add local tracks before returning
    const stream = localStreamRef.current;
    if (stream) {
      console.log('Adding local tracks to PC (count:', stream.getTracks().length, ')');
      stream.getTracks().forEach(track => {
        // Avoid adding the same track twice
        const alreadyAdded = pc.getSenders().find(s => s.track === track);
        if (!alreadyAdded) pc.addTrack(track, stream);
      });
    }

    return pc;
  }, [userId, handlePartnerLeft]);

  const handleOffer = useCallback(async (offer, fromUserId) => {
    console.log('Handling Offer from:', fromUserId);
    const pc = createPeerConnection(fromUserId);
    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    await flushIceCandidates();
    
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    
    await fetch('/api/signal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        targetUserId: fromUserId || partnerIdRef.current, 
        type: 'answer', 
        data: answer, 
        from: userId 
      }),
    });
  }, [userId, createPeerConnection, flushIceCandidates]);

  const handleAnswer = useCallback(async (answer) => {
    console.log('Handling Answer');
    const pc = pcRef.current;
    if (pc) {
      await pc.setRemoteDescription(new RTCSessionDescription(answer));
      await flushIceCandidates();
    }
  }, [flushIceCandidates]);

  const handleIce = useCallback(async (candidate) => {
    try {
      if (!candidate) return;
      const pc = pcRef.current;
      
      if (!pc || !pc.remoteDescription) {
        console.log('Buffering ICE candidate');
        pendingIceRef.current.push(candidate);
      } else {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      }
    } catch (e) { /* ignore */ }
  }, []);

  const flushIceCandidates = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc || !pc.remoteDescription || pendingIceRef.current.length === 0) return;
    
    console.log(`Flushing ${pendingIceRef.current.length} buffered ICE candidates`);
    const candidates = [...pendingIceRef.current];
    pendingIceRef.current = []; // Clear immediately to avoid duplicates
    
    for (const candidate of candidates) {
      try { 
        if (candidate) await pc.addIceCandidate(new RTCIceCandidate(candidate)); 
      } catch (e) {
        console.warn('Flush ICE Error:', e);
      }
    }
  }, []);

  // Scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // LAZY CONNECT: Only connect to Pusher when "Start" is clicked
  const connectSignaling = useCallback(() => {
    if (pusherRef.current) return pusherRef.current;
    
    console.log('Connecting to Signaling...');
    const pusher = new Pusher(process.env.NEXT_PUBLIC_PUSHER_KEY, {
      cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER,
    });
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
      if (!partnerIdRef.current && from) {
        partnerIdRef.current = from;
      }
      
      console.log('Signal:', type, 'from:', from);
      if (type === 'offer') await handleOffer(data, from);
      else if (type === 'answer') await handleAnswer(data);
      else if (type === 'ice') await handleIce(data);
      else if (type === 'chat') {
        if (statusRef.current !== 'connected') return;
        setMessages(m => [...m, { from: 'them', text: data.text }]);
        setPartnerTyping(false);
      }
      else if (type === 'typing') {
        if (statusRef.current === 'connected') setPartnerTyping(true);
      }
      else if (type === 'stop-typing') setPartnerTyping(false);
    });

    channel.bind('partner-left', () => {
      handlePartnerLeft();
    });

    channel.bind('kicked', ({ message }) => {
      alert(message || 'You have been disconnected by the administrator.');
      stopChat();
      window.location.reload();
    });

    return pusher;
  }, [userId, handleOffer, handleAnswer, handleIce, handlePartnerLeft]);

  const disconnectSignaling = useCallback(() => {
    if (pusherRef.current) {
      console.log('Disconnecting Signaling...');
      pusherRef.current.unsubscribe(`user-${userId}`);
      if (roomIdRef.current) pusherRef.current.unsubscribe(`room-${roomIdRef.current}`);
      pusherRef.current.disconnect();
      pusherRef.current = null;
      channelRef.current = null;
    }
  }, [userId]);

  // Handle window close
  useEffect(() => {
    const handleClose = () => {
      if (statusRef.current === 'connected') stopChat();
      disconnectSignaling();
    };
    window.addEventListener('beforeunload', handleClose);
    return () => window.removeEventListener('beforeunload', handleClose);
  }, [disconnectSignaling]);

  const startCall = async (isInitiator) => {
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
  };


  const startSearching = async () => {
    if (status === 'requesting' || status === 'waiting') return;
    
    updateStatus('requesting');
    setMessages([]);
    try {
      await getLocalStream();
      connectSignaling();
    } catch (e) {
      alert('Camera/microphone access is required.');
      updateStatus('idle');
      return;
    }
    updateStatus('waiting');
    pollForMatch();
  };

  const pollForMatch = () => {
    const doJoin = async () => {
      const res = await fetch('/api/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          userId, 
          interests: interests.split(',').map(i => i.trim()).filter(Boolean) 
        }),
      });
      const data = await res.json();
      if (!data.waiting) {
        if (pollingRef.current) clearInterval(pollingRef.current);
      }
    };

    doJoin();
    pollingRef.current = setInterval(() => {
      if (statusRef.current !== 'waiting') {
        clearInterval(pollingRef.current);
        return;
      }
      doJoin();
    }, 2000);
  };

  const skipPartner = async () => {
    if (partnerIdRef.current) {
      await fetch('/api/leave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ partnerId: partnerIdRef.current, userId }),
      });
    }
    pcRef.current?.close();
    pcRef.current = null;
    partnerIdRef.current = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    setMessages([]);
    updateStatus('waiting');
    pollForMatch();
  };

  const stopChat = async () => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    if (partnerIdRef.current) {
      await fetch('/api/leave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ partnerId: partnerIdRef.current, userId }),
      });
    } else {
      await fetch('/api/leave', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
    }
    pcRef.current?.close();
    pcRef.current = null;
    partnerIdRef.current = null;
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    
    disconnectSignaling();
    
    updateStatus('idle');
    setMessages([]);
    setDebug({ pc: 'idle', ice: 'idle', tracks: 0 });
  };

  const toggleMute = () => {
    const audio = localStreamRef.current?.getAudioTracks()[0];
    if (audio) { audio.enabled = !audio.enabled; setIsMuted(!audio.enabled); }
  };

  const toggleCam = () => {
    const video = localStreamRef.current?.getVideoTracks()[0];
    if (video) { video.enabled = !video.enabled; setIsCamOff(!video.enabled); }
  };

  const sendMessage = async () => {
    if (!inputMsg.trim() || !partnerIdRef.current) return;
    const text = inputMsg.trim();
    setInputMsg('');
    setMessages(m => [...m, { from: 'me', text }]);
    await fetch('/api/signal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetUserId: partnerIdRef.current, type: 'chat', data: { text }, from: userId }),
    });
  };

  const handleTyping = async (val) => {
    setInputMsg(val);
    if (!partnerIdRef.current) return;
    await fetch('/api/signal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetUserId: partnerIdRef.current, type: 'typing', data: {}, from: userId }),
    });
    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(async () => {
      await fetch('/api/signal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId: partnerIdRef.current, type: 'stop-typing', data: {}, from: userId }),
      });
    }, 1500);
  };

  return (
    <>
      <Head>
        <title>StrangerLink — Meet Someone New</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>⚡</text></svg>" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Mono:ital,wght@0,400;0,500;1,400&display=swap" rel="stylesheet" />
      </Head>

      <div className={styles.container}>
        <header className={styles.header}>
          <div className={styles.logo}>
            <span className={styles.logoMark}>◈</span>
            <span className={styles.logoText}>StrangerLink</span>
          </div>
          <div className={styles.tagline}>EPHEMERAL CONNECTIONS // SECURE // GLOBAL</div>
          
          <div className={styles.liveBadge} title={`${liveStats.waitingCount} people currently looking for a match`}>
            <div className={styles.livePulse} />
            <span className={styles.liveCount}>
              {liveStats.activeUsers > 0 ? (liveStats.activeUsers + 120).toLocaleString() : '...'} ONLINE
            </span>
          </div>
        </header>

        <main className={styles.main}>
          {/* Video Area */}
          <div className={styles.videoArea}>
            <div className={`${styles.videoSlot} ${styles.remote}`}>
              <video 
                ref={remoteVideoRef} 
                autoPlay 
                playsInline 
                muted={true} // Start muted to bypass autoplay blocks
                onLoadedMetadata={(e) => {
                  e.target.muted = false; // Unmute as soon as it starts
                  e.target.play().catch(() => {});
                }}
                className={styles.video} 
              />
              {status === 'connected' && (
                <>
                  <div style={{ position: 'absolute', top: 5, right: 5, background: 'rgba(0,0,0,0.5)', padding: '2px 6px', fontSize: '10px', color: '#fff', borderRadius: '4px', zIndex: 10 }}>
                    PC:{debug.pc} | ICE:{debug.ice} | G:{debug.gather} | T:{debug.tracks}
                  </div>
                  {debug.tracks > 0 && !remoteVideoRef.current?.srcObject?.active && (
                    <button 
                      onClick={() => {
                        remoteVideoRef.current.play().catch(() => {});
                        setDebug(d => ({ ...d, pc: d.pc })); // Force re-render
                      }}
                      style={{ position: 'absolute', bottom: 10, left: '50%', transform: 'translateX(-50%)', background: '#3b82f6', border: 'none', color: '#fff', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', zIndex: 11 }}
                    >
                      🔄 Re-sync Video
                    </button>
                  )}
                </>
              )}
              {status !== 'connected' && (
                <div className={styles.videoPlaceholder}>
                  {status === 'idle' && <div className={styles.placeholderContent}><span className={styles.placeholderIcon}>👤</span><p>Stranger</p></div>}
                  {status === 'requesting' && <div className={styles.placeholderContent}><div className={styles.spinner} /><p>Getting camera...</p></div>}
                  {status === 'waiting' && <div className={styles.placeholderContent}><div className={styles.pulser} /><p>Finding someone...</p></div>}
                  {status === 'disconnected' && <div className={styles.placeholderContent}><span className={styles.placeholderIcon}>👋</span><p>Disconnected</p></div>}
                </div>
              )}
              <div className={styles.videoLabel}>Stranger</div>
            </div>

            <div className={`${styles.videoSlot} ${styles.local}`}>
              <video ref={localVideoRef} autoPlay playsInline muted className={styles.video} />
              {!localStreamRef.current && status === 'idle' && (
                <div className={styles.videoPlaceholder}>
                  <div className={styles.placeholderContent}><span className={styles.placeholderIcon}>🎥</span><p>You</p></div>
                </div>
              )}
              <div className={styles.videoLabel}>You</div>
            </div>
          </div>

          {/* Controls */}
          <div className={styles.controls}>
          {status === 'idle' && (
            <div style={{ width: '100%', marginBottom: '10px' }}>
              <input 
                type="text" 
                placeholder="Add interests (e.g. coding, anime)" 
                value={interests}
                onChange={e => setInterests(e.target.value)}
                className={styles.input}
                style={{ width: '100%', marginBottom: '5px' }}
              />
              <p style={{ color: '#888', fontSize: '11px', fontStyle: 'italic' }}>Separate interests with commas</p>
            </div>
          )}
          
            {status === 'idle' || status === 'disconnected' ? (
              <button className={`${styles.btn} ${styles.btnStart}`} onClick={startSearching}>
                {status === 'disconnected' ? '⟳ Next Stranger' : '▶ Start'}
              </button>
            ) : status === 'waiting' || status === 'requesting' ? (
              <button className={`${styles.btn} ${styles.btnStop}`} onClick={stopChat}>
                ✕ Cancel
              </button>
            ) : (
              <>
                <button className={`${styles.btn} ${styles.btnSkip}`} onClick={skipPartner}>
                  ⟳ Skip
                </button>
                <button className={`${styles.btn} ${styles.btnIcon} ${isMuted ? styles.active : ''}`} onClick={toggleMute} title={isMuted ? 'Unmute' : 'Mute'}>
                  {isMuted ? '🔇' : '🎙'}
                </button>
                <button className={`${styles.btn} ${styles.btnIcon} ${isCamOff ? styles.active : ''}`} onClick={toggleCam} title={isCamOff ? 'Turn on cam' : 'Turn off cam'}>
                  {isCamOff ? '🚫' : '📷'}
                </button>
                <button className={`${styles.btn} ${styles.btnStop}`} onClick={stopChat}>
                  ✕ Stop
                </button>
              </>
            )}
          </div>

          {/* Chat */}
          <div className={styles.chatArea}>
            <div className={styles.chatMessages}>
              {messages.length === 0 && (
                <div className={styles.chatEmpty}>
                  {status === 'connected' ? 'Say hello to your new stranger 👋' : 'Chat will appear here'}
                </div>
              )}
              {messages.map((m, i) => (
                <div key={i} className={`${styles.message} ${styles[m.from]}`}>
                  {m.from !== 'system' && <span className={styles.msgFrom}>{m.from === 'me' ? 'You' : 'Stranger'}</span>}
                  <span className={styles.msgText}>{m.text}</span>
                </div>
              ))}
              {partnerTyping && (
                <div className={`${styles.message} ${styles.them}`}>
                  <span className={styles.msgFrom}>Stranger</span>
                  <span className={styles.msgText}><span className={styles.typingDots}><span /><span /><span /></span></span>
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
                onChange={e => handleTyping(e.target.value)}
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
          <p>By continuing you agree to be respectful. 18+ only. Do not share personal info.</p>
        </footer>
      </div>
    </>
  );
}
