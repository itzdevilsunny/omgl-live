/**
 * BackgroundBlur.js
 * Intercepts a MediaStream, runs TensorFlow body-segmentation per frame,
 * composites a blurred background + sharp foreground on a Canvas,
 * and exposes the result back as a new MediaStream.
 *
 * Usage:
 *   const { startBlur, stopBlur, blurredStream } = useBackgroundBlur();
 *   await startBlur(rawStream);
 *   // then hot-swap blurredStream into the RTC sender
 */

import { useRef, useState, useCallback } from 'react';

// Lazy-loaded to avoid SSR errors (TF requires browser APIs)
let bodySegmentation = null;
let tf = null;

async function loadLibs() {
  if (!bodySegmentation) {
    tf = await import('@tensorflow/tfjs-core');
    await import('@tensorflow/tfjs-backend-webgl');
    bodySegmentation = await import('@tensorflow-models/body-segmentation');
  }
}

export function useBackgroundBlur() {
  const [isBlurActive, setIsBlurActive]   = useState(false);
  const [isLoading,    setIsLoading]      = useState(false);
  const segmenterRef   = useRef(null);
  const rafRef         = useRef(null);
  const hiddenVideoRef = useRef(null);
  const outputCanvasRef= useRef(null);
  const blurStreamRef  = useRef(null);

  /** Start the blur pipeline on a raw MediaStream */
  const startBlur = useCallback(async (rawStream) => {
    if (!rawStream || typeof window === 'undefined') return null;
    setIsLoading(true);

    try {
      await loadLibs();
      await tf.setBackend('webgl');
      await tf.ready();

      // Load the MediaPipe Selfie Segmentation model (web-friendly)
      if (!segmenterRef.current) {
        const model = bodySegmentation.SupportedModels.MediaPipeSelfieSegmentation;
        segmenterRef.current = await bodySegmentation.createSegmenter(model, {
          runtime: 'tfjs',
          modelType: 'general',
        });
      }

      // Create a hidden <video> element to play the raw stream
      const hiddenVideo = document.createElement('video');
      hiddenVideo.srcObject = rawStream;
      hiddenVideo.autoplay = true;
      hiddenVideo.playsInline = true;
      hiddenVideo.muted = true;
      hiddenVideo.width  = 640;
      hiddenVideo.height = 480;
      await hiddenVideo.play();
      hiddenVideoRef.current = hiddenVideo;

      // Create off-screen output canvas
      const canvas = document.createElement('canvas');
      canvas.width  = hiddenVideo.videoWidth  || 640;
      canvas.height = hiddenVideo.videoHeight || 480;
      outputCanvasRef.current = canvas;

      // Capture the canvas as a new video-only track
      const canvasStream = canvas.captureStream(30);
      
      // Merge canvas video track + original audio track
      const audioTracks = rawStream.getAudioTracks();
      audioTracks.forEach(t => canvasStream.addTrack(t));
      blurStreamRef.current = canvasStream;

      // Start the drawing loop
      const ctx = canvas.getContext('2d');
      
      const draw = async () => {
        if (!hiddenVideoRef.current || hiddenVideo.paused) return;

        try {
          const segmentation = await segmenterRef.current.segmentPeople(hiddenVideo, {
            flipHorizontal: false,
            multiSegmentation: false,
            segmentBodyParts: false,
          });

          const { width, height } = canvas;

          // Draw original frame
          ctx.drawImage(hiddenVideo, 0, 0, width, height);

          if (segmentation && segmentation.length > 0) {
            // Get mask as ImageData
            const coloredPartImage = await bodySegmentation.toBinaryMask(
              segmentation,
              { r: 0, g: 0, b: 0, a: 0 },   // foreground = transparent
              { r: 0, g: 0, b: 0, a: 255 },  // background = opaque black
            );

            // Create a temp canvas for the mask
            const maskCanvas = new OffscreenCanvas(width, height);
            const maskCtx = maskCanvas.getContext('2d');
            const imageData = new ImageData(coloredPartImage.data, width, height);
            maskCtx.putImageData(imageData, 0, 0);

            // Draw blurred background underneath
            ctx.save();
            ctx.filter = 'blur(18px)';
            ctx.drawImage(hiddenVideo, 0, 0, width, height);
            ctx.restore();

            // Re-composite sharp foreground on top using the mask
            // mask = black where background, transparent where person
            ctx.save();
            ctx.globalCompositeOperation = 'destination-over';
            ctx.drawImage(maskCanvas, 0, 0, width, height);
            ctx.restore();

            // Finally: cut out only the non-person pixels for the blur
            ctx.save();
            ctx.globalCompositeOperation = 'destination-atop';
            ctx.drawImage(hiddenVideo, 0, 0, width, height);
            ctx.restore();
          }
        } catch (err) {
          // On model error, fall back to showing raw frame
          ctx.drawImage(hiddenVideo, 0, 0, canvas.width, canvas.height);
        }

        rafRef.current = requestAnimationFrame(draw);
      };

      draw();
      setIsBlurActive(true);
      setIsLoading(false);
      console.log('[BackgroundBlur] Segmentation pipeline started');
      return canvasStream;
    } catch (err) {
      console.error('[BackgroundBlur] Failed to start:', err);
      setIsLoading(false);
      return null;
    }
  }, []);

  /** Stop and clean up the blur pipeline */
  const stopBlur = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (hiddenVideoRef.current) {
      hiddenVideoRef.current.pause();
      hiddenVideoRef.current.srcObject = null;
      hiddenVideoRef.current = null;
    }
    if (blurStreamRef.current) {
      blurStreamRef.current.getTracks().forEach(t => t.stop());
      blurStreamRef.current = null;
    }
    outputCanvasRef.current = null;
    setIsBlurActive(false);
    console.log('[BackgroundBlur] Segmentation pipeline stopped');
  }, []);

  return { startBlur, stopBlur, isBlurActive, isLoading, blurStreamRef };
}
