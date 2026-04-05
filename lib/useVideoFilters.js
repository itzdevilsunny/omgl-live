/**
 * lib/useVideoFilters.js
 * Processes a MediaStream through an off-screen Canvas to apply 
 * real-time "Instagram-style" CSS filters before sending over WebRTC.
 */

import { useState, useRef, useCallback, useEffect } from 'react';

export const VIDEO_FILTERS = [
  { id: 'none',       name: 'Original',   filter: 'none' },
  { id: '1977',       name: 'Vintage',    filter: 'sepia(0.5) hue-rotate(-30deg) saturate(1.4) contrast(1.1)' },
  { id: 'noir',       name: 'Noir',       filter: 'grayscale(1) contrast(1.5) brightness(0.9)' },
  { id: 'cyberpunk',  name: 'Cyber',      filter: 'hue-rotate(280deg) saturate(2.5) contrast(1.1) brightness(1.1)' },
  { id: 'golden',     name: 'Golden',     filter: 'sepia(0.3) saturate(1.8) contrast(1.1) brightness(1.1) hue-rotate(-10deg)' },
  { id: 'aden',       name: 'Aden',       filter: 'sepia(0.2) brightness(1.15) saturate(1.4)' },
  { id: 'mayfair',    name: 'Warm',       filter: 'contrast(1.1) brightness(1.1) saturate(1.1) sepia(0.1)' },
  { id: 'emerald',    name: 'Emerald',    filter: 'hue-rotate(90deg) saturate(1.5) contrast(1.1)' },
  { id: 'amethyst',   name: 'Gem',        filter: 'hue-rotate(240deg) saturate(1.8) brightness(1.1)' },
];

export function useVideoFilters() {
  const [activeFilter, setActiveFilter] = useState('none');
  const [isProcessing, setIsProcessing] = useState(false);
  
  const canvasRef      = useRef(null);
  const rafRef         = useRef(null);
  const hiddenVideoRef = useRef(null);
  const outStreamRef   = useRef(null);

  const filterStringRef = useRef('none');

  /** 
   * startProcessing: 
   * Takes a raw MediaStream and returns a filtered MediaStream
   */
  const startProcessing = useCallback(async (rawStream) => {
    if (!rawStream || typeof window === 'undefined') return rawStream;

    // Create a hidden video element to feed the canvas
    const hiddenVideo = document.createElement('video');
    hiddenVideo.srcObject = rawStream;
    hiddenVideo.muted = true;
    hiddenVideo.play();
    hiddenVideoRef.current = hiddenVideo;

    // Create off-screen canvas
    const canvas = document.createElement('canvas');
    canvasRef.current = canvas;

    const updateCanvasSize = () => {
      canvas.width  = hiddenVideo.videoWidth  || 640;
      canvas.height = hiddenVideo.videoHeight || 480;
    };
    
    hiddenVideo.onloadedmetadata = updateCanvasSize;

    const ctx = canvas.getContext('2d', { alpha: false });

    const processFrame = () => {
      if (!hiddenVideo || hiddenVideo.paused || hiddenVideo.ended) return;

      if (canvas.width !== hiddenVideo.videoWidth) updateCanvasSize();

      // Apply the current filter string
      ctx.filter = filterStringRef.current;
      
      // Draw frame
      ctx.drawImage(hiddenVideo, 0, 0, canvas.width, canvas.height);
      
      rafRef.current = requestAnimationFrame(processFrame);
    };

    processFrame();

    // Capture the processed stream at 30fps
    const filteredStream = canvas.captureStream(30);
    
    // Merge audio from original stream
    const audioTracks = rawStream.getAudioTracks();
    audioTracks.forEach(track => filteredStream.addTrack(track));

    outStreamRef.current = filteredStream;
    setIsProcessing(true);
    return filteredStream;
  }, []);

  const stopProcessing = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (hiddenVideoRef.current) {
      hiddenVideoRef.current.pause();
      hiddenVideoRef.current.srcObject = null;
      hiddenVideoRef.current = null;
    }
    if (outStreamRef.current) {
      outStreamRef.current.getTracks().forEach(t => t.stop());
      outStreamRef.current = null;
    }
    setIsProcessing(false);
  }, []);

  const setFilter = useCallback((filterId) => {
    const f = VIDEO_FILTERS.find(x => x.id === filterId);
    if (f) {
      filterStringRef.current = f.filter;
      setActiveFilter(filterId);
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => stopProcessing();
  }, [stopProcessing]);

  return {
    startProcessing,
    stopProcessing,
    setFilter,
    activeFilter,
    isProcessing,
    filters: VIDEO_FILTERS
  };
}
