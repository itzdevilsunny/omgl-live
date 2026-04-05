/**
 * lib/useVideoFilters.js
 * Processes a MediaStream through an off-screen Canvas to apply 
 * real-time "Instagram-style" CSS filters before sending over WebRTC.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { FaceFilterEngine } from './FaceFilterEngine';

export const VIDEO_FILTERS = [
  { id: 'none',       name: 'Original',   filter: 'none' },
  // Snapchat AR Lenses
  { id: 'beauty',     name: '✨ Beauty',   filter: 'none', isAR: true, thumb: '💍' },
  { id: 'hearts',     name: '💖 Hearts',   filter: 'none', isAR: true, thumb: '💗' },
  { id: 'freckles',   name: '🍓 Freckles', filter: 'none', isAR: true, thumb: '✨' },
  { id: 'tv',         name: '📺 90s TV',   filter: 'none', isAR: true, thumb: '📼' },
  { id: 'dog',        name: '🐶 Doggy',    filter: 'none', isAR: true, thumb: '🐾' },
  { id: 'neo',        name: '🕶️ Neo',      filter: 'none', isAR: true, thumb: '🆒' },
  { id: 'bloom',      name: '🌸 Bloom',    filter: 'none', isAR: true, thumb: '💐' },
  // Color Grading
  { id: 'noir',       name: 'Noir',       filter: 'grayscale(1) contrast(1.5) brightness(0.9)' },
  { id: 'cyberpunk',  name: 'Cyber',      filter: 'hue-rotate(280deg) saturate(2.5) contrast(1.1) brightness(1.1)' },
  { id: 'golden',     name: 'Golden',     filter: 'sepia(0.3) saturate(1.8) contrast(1.1) brightness(1.1) hue-rotate(-10deg)' },
];

export function useVideoFilters() {
  const [activeFilter, setActiveFilter] = useState('none');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isARLoading, setIsARLoading]   = useState(false);
  const [isRecording, setIsRecording]   = useState(false);
  
  const canvasRef      = useRef(null);
  const rafRef         = useRef(null);
  const hiddenVideoRef = useRef(null);
  const outStreamRef   = useRef(null);
  const filterStringRef= useRef('none');
  const activeFilterIdRef = useRef('none');
  const recorderRef    = useRef(null);
  const recordedChunks = useRef([]);

  // AR Engine instance
  const faceEngineRef  = useRef(null);

  /** 
   * startProcessing: 
   * Takes a raw MediaStream and returns a filtered MediaStream
   */
  const startProcessing = useCallback(async (rawStream) => {
    if (!rawStream || typeof window === 'undefined') return rawStream;

    try {
        // Load AR Engine if needed
        if (!faceEngineRef.current) {
            setIsARLoading(true);
            try {
                faceEngineRef.current = new FaceFilterEngine();
                await faceEngineRef.current.init();
                
                // Load All Assets
                const assetsToLoad = [
                    { id: 'dog',      path: '/filters/dog.png' },
                    { id: 'neo',      path: '/filters/neo.png' },
                    { id: 'bloom',    path: '/filters/bloom.png' },
                    { id: 'hearts',   path: '/filters/hearts.png' },
                    { id: 'freckles', path: '/filters/freckles.png' },
                    { id: 'tv',       path: '/filters/tv.png' }
                ];

                await Promise.all(assetsToLoad.map(a => faceEngineRef.current.loadAsset(a.id, a.path)));
            } catch (err) {
                console.error('[useVideoFilters] AR Init Error:', err);
                setIsARLoading(false);
                return rawStream; // Fallback to raw
            }
            setIsARLoading(false);
        }

        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        
        const hiddenVideo = document.createElement('video');
        hiddenVideo.srcObject = rawStream;
        hiddenVideo.muted = true;
        await hiddenVideo.play().catch(e => console.warn('Hidden video play blocked', e));
        hiddenVideoRef.current = hiddenVideo;

        const canvas = document.createElement('canvas');
        canvasRef.current = canvas;

        const updateCanvasSize = () => {
          canvas.width  = hiddenVideo.videoWidth  || 640;
          canvas.height = hiddenVideo.videoHeight || 480;
        };
        
        hiddenVideo.onloadedmetadata = updateCanvasSize;
        const ctx = canvas.getContext('2d', { alpha: false });

        const processFrame = async () => {
          if (!hiddenVideo || hiddenVideo.paused || hiddenVideo.ended) return;
          if (canvas.width !== hiddenVideo.videoWidth) updateCanvasSize();

          ctx.filter = filterStringRef.current;
          ctx.drawImage(hiddenVideo, 0, 0, canvas.width, canvas.height);

          if (activeFilterIdRef.current !== 'none' && faceEngineRef.current) {
              await faceEngineRef.current.process(hiddenVideo, ctx, activeFilterIdRef.current);
          }
          
          rafRef.current = requestAnimationFrame(processFrame);
        };

        processFrame();

        const filteredStream = canvas.captureStream(30);
        const audioTracks = rawStream.getAudioTracks();
        audioTracks.forEach(track => filteredStream.addTrack(track));

        outStreamRef.current = filteredStream;
        setIsProcessing(true);
        return filteredStream;
    } catch (err) {
        console.error('[useVideoFilters] Processing Error:', err);
        setIsProcessing(false);
        return rawStream;
    }
  }, []);

  const capturePhoto = useCallback(() => {
    if (!canvasRef.current) return null;
    return canvasRef.current.toDataURL('image/png');
  }, []);

  const startRecording = useCallback(() => {
    if (!outStreamRef.current || isRecording) return;
    
    recordedChunks.current = [];
    const recorder = new MediaRecorder(outStreamRef.current, { mimeType: 'video/webm;codecs=vp9' });
    
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) recordedChunks.current.push(e.data);
    };

    recorder.onstop = () => {
      const blob = new Blob(recordedChunks.current, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `snap_capture_${Date.now()}.webm`;
      a.click();
      URL.revokeObjectURL(url);
    };

    recorder.start();
    recorderRef.current = recorder;
    setIsRecording(true);
  }, [isRecording]);

  const stopRecording = useCallback(() => {
    if (recorderRef.current && isRecording) {
      recorderRef.current.stop();
      setIsRecording(false);
    }
  }, [isRecording]);

  const stopProcessing = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (hiddenVideoRef.current) {
      hiddenVideoRef.current.pause();
      hiddenVideoRef.current.srcObject = null;
    }
    setIsProcessing(false);
  }, []);

  const setFilter = useCallback((filterId) => {
    const f = VIDEO_FILTERS.find(x => x.id === filterId);
    if (f) {
      filterStringRef.current = f.filter;
      activeFilterIdRef.current = filterId;
      setActiveFilter(filterId);
    }
  }, []);

  useEffect(() => {
    return () => stopProcessing();
  }, [stopProcessing]);

  return {
    startProcessing,
    stopProcessing,
    setFilter,
    capturePhoto,
    startRecording,
    stopRecording,
    activeFilter,
    isProcessing,
    isARLoading,
    isRecording,
    filters: VIDEO_FILTERS
  };
}
