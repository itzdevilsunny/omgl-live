import { useEffect, useRef } from 'react';
import styles from '../styles/Home.module.css';

export default function AudioVisualizer({ stream }) {
  const canvasRef = useRef(null);
  const animationRef = useRef(null);
  const audioContextRef = useRef(null);

  useEffect(() => {
    if (!stream || !stream.getAudioTracks().length) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctxCanvas = canvas.getContext('2d');
    
    // Fix canvas resolution for crisp lines
    const width = 200;
    const height = 40;
    canvas.width = width * window.devicePixelRatio;
    canvas.height = height * window.devicePixelRatio;
    ctxCanvas.scale(window.devicePixelRatio, window.devicePixelRatio);

    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const audioCtx = new AudioCtx();
      audioContextRef.current = audioCtx;

      const src = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 128; // Reduced bins for fewer, thicker bars
      analyser.smoothingTimeConstant = 0.8;
      src.connect(analyser);

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const draw = () => {
        animationRef.current = requestAnimationFrame(draw);
        analyser.getByteFrequencyData(dataArray);

        ctxCanvas.clearRect(0, 0, width, height);

        const barWidth = (width / bufferLength) * 2.5;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
          const barHeight = (dataArray[i] / 255) * height;

          // Gradient color mapping based on intensity
          const r = barHeight + (25 * (i/bufferLength));
          const g = 150 - (barHeight * 2);
          const b = 255;
          ctxCanvas.fillStyle = `rgb(${r}, ${g}, ${b})`;

          // Draw pill-shaped bars
          ctxCanvas.beginPath();
          ctxCanvas.roundRect(x, height - barHeight, barWidth - 2, barHeight, 5);
          ctxCanvas.fill();

          x += barWidth;
        }
      };
      
      draw();
    } catch (err) {
      console.error('[AudioVisualizer] Failed to start:', err);
    }

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      if (audioContextRef.current) audioContextRef.current.close().catch(() => {});
    };
  }, [stream]);

  return (
    <div className={styles.glassVisualizer}>
      <canvas 
        ref={canvasRef} 
        style={{ width: '100%', height: '100%', display: 'block' }}
      />
    </div>
  );
}
