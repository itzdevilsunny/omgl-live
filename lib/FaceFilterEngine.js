/**
 * lib/FaceFilterEngine.js
 * Handles face landmark detection and AR asset compositing (Snapchat style).
 */

import * as faceLandmarksDetection from '@tensorflow-models/face-landmarks-detection';
import * as tf from '@tensorflow/tfjs-core';
import '@tensorflow/tfjs-backend-webgl';

// Key Landmark Indices for MediaPipe Face Mesh (468 points)
const LANDMARKS = {
  NOSE_TIP: 1,
  LEFT_EYE: 33,
  RIGHT_EYE: 263,
  FOREHEAD: 10,
  LEFT_CHEEK: 234,
  RIGHT_CHEEK: 454,
  MOUTH_TOP: 13,
  MOUTH_BOTTOM: 14,
  LEFTEYEBROW: 70,
  LEFTEYEBROW: 70,
  RIGHTEYEBROW: 300,
  // Detailed paths for Neon
  L_EYE_PATH: [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246],
  R_EYE_PATH: [362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398],
  FACE_OUTLINE: [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109],
  LIPS_OUTLINE: [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291]
};

export class FaceFilterEngine {
  constructor() {
    this.detector = null;
    this.assets = {};
    this.isLoaded = false;
    this.particles = []; // For Fire / Gold
  }

  /**
   * Load the Face Mesh detector
   */
  async init() {
    if (this.isLoaded) return;
    
    await tf.ready();
    const model = faceLandmarksDetection.SupportedModels.MediaPipeFaceMesh;
    const detectorConfig = {
      runtime: 'tfjs',
      refineLandmarks: true,
      maxFaces: 1
    };
    
    this.detector = await faceLandmarksDetection.createDetector(model, detectorConfig);
    this.isLoaded = true;
    console.log('[FaceFilterEngine] Model Loaded');
  }

  /**
   * Remove green screen from asset and return a clean canvas
   */
  async loadAsset(id, src) {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        
        // Simple Chroma Key (Greenscreen removal)
        const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const l = frame.data.length / 4;
        for (let i = 0; i < l; i++) {
          const r = frame.data[i * 4 + 0];
          const g = frame.data[i * 4 + 1];
          const b = frame.data[i * 4 + 2];
          
          // Detect neon green (roughly g > r && g > b)
          if (g > 100 && g > r * 1.4 && g > b * 1.4) {
            frame.data[i * 4 + 3] = 0; // Transparent
          }
        }
        ctx.putImageData(frame, 0, 0);
        this.assets[id] = canvas;
        resolve(canvas);
      };
      img.src = src;
    });
  }

  /**
   * Main rendering loop integration
   */
  async process(video, ctx, filterId) {
    if (!this.detector || !this.isLoaded) return;

    // Apply high-level image preprocessing for specific filters (like Beauty)
    if (filterId === 'beauty' || filterId === 'hearts' || filterId === 'glam') {
        this.applyBeautyEffect(ctx, video);
    }

    const faces = await this.detector.estimateFaces(video);
    if (!faces || faces.length === 0) {
        // Still draw "static" filters like TV even if no face is detected
        if (filterId === 'tv') this.drawTVFilter(ctx);
        return;
    }

    const face = faces[0];
    const keypoints = face.keypoints;

    // Apply specific AR filters
    switch (filterId) {
      case 'dog':
        this.drawDogFilter(ctx, keypoints);
        break;
      case 'neo':
        this.drawNeoFilter(ctx, keypoints);
        break;
      case 'bloom':
        this.drawBloomFilter(ctx, keypoints);
        break;
      case 'hearts': // Pink Panther
        this.drawHeartsFilter(ctx, keypoints);
        break;
      case 'freckles':
        this.drawFrecklesFilter(ctx, keypoints);
        break;
      case 'tv':
        this.drawTVFilter(ctx);
        break;
      case 'glam':
        this.applyGlamEffect(ctx, video);
        break;
      case 'neon':
        this.drawNeonLens(ctx, keypoints);
        break;
      case 'fire':
        this.drawFireLens(ctx, keypoints);
        break;
      case 'gold':
        this.drawGoldLens(ctx, keypoints);
        break;
      default:
        break;
    }
  }

  drawNeonLens(ctx, kp) {
      const time = Date.now() * 0.005;
      const hue = (Math.sin(time) * 30 + 300) % 360; // Pulsing Pink/Purple
      
      ctx.save();
      ctx.strokeStyle = `hsla(${hue}, 100%, 60%, 0.8)`;
      ctx.lineWidth = 3;
      ctx.lineJoin = 'round';
      ctx.shadowBlur = 15;
      ctx.shadowColor = `hsla(${hue}, 100%, 60%, 1)`;

      const drawPath = (indices) => {
          ctx.beginPath();
          indices.forEach((idx, i) => {
              const p = kp[idx];
              if (i === 0) ctx.moveTo(p.x, p.y);
              else ctx.lineTo(p.x, p.y);
          });
          ctx.closePath();
          ctx.stroke();
      };

      drawPath(LANDMARKS.FACE_OUTLINE);
      drawPath(LANDMARKS.L_EYE_PATH);
      drawPath(LANDMARKS.R_EYE_PATH);
      drawPath(LANDMARKS.LIPS_OUTLINE);
      
      ctx.restore();
  }

  drawFireLens(ctx, kp) {
      const asset = this.assets['fire'];
      if (!asset) return;

      const LEye = kp[LANDMARKS.LEFT_EYE];
      const REye = kp[LANDMARKS.RIGHT_EYE];
      
      // Update/Emit particles
      if (this.particles.length < 40) {
          this.particles.push({
              x: (Math.random() > 0.5 ? LEye.x : REye.x) + (Math.random() - 0.5) * 20,
              y: (Math.random() > 0.5 ? LEye.y : REye.y),
              vx: (Math.random() - 0.5) * 2,
              vy: -Math.random() * 5 - 2,
              life: 1.0,
              size: Math.random() * 40 + 20
          });
      }

      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      this.particles = this.particles.filter(p => {
          p.x += p.vx;
          p.y += p.vy;
          p.life -= 0.03;
          ctx.globalAlpha = p.life;
          ctx.drawImage(asset, p.x - p.size/2, p.y - p.size/2, p.size, p.size);
          return p.life > 0;
      });
      ctx.restore();
  }

  drawGoldLens(ctx, kp) {
      const asset = this.assets['gold'];
      if (!asset) return;

      const forehead = kp[LANDMARKS.FOREHEAD] || { x: ctx.canvas.width/2, y: 0 };
      
      // Drifting Gold particles
      if (this.particles.length < 60) {
          this.particles.push({
              x: Math.random() * ctx.canvas.width,
              y: -50,
              vx: (Math.random() - 0.5) * 1,
              vy: Math.random() * 2 + 1,
              rot: Math.random() * Math.PI * 2,
              vr: (Math.random() - 0.5) * 0.1,
              life: 1.0,
              size: Math.random() * 15 + 5
          });
      }

      ctx.save();
      this.particles = this.particles.filter(p => {
          p.x += p.vx;
          p.y += p.vy;
          p.rot += p.vr;
          
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.globalAlpha = Math.min(1, p.y / 100); // fade in at top
          ctx.drawImage(asset, -p.size/2, -p.size/2, p.size, p.size);
          ctx.restore();
          
          return p.y < ctx.canvas.height;
      });
      ctx.restore();
  }

  applyBeautyEffect(ctx, video) {
    // Advanced skin smoothing: 
    // We use a high-pass / low-pass blend approach simulated in 2D Canvas
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.filter = 'blur(4px) brightness(1.05) saturate(1.1)';
    ctx.drawImage(video, 0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.restore();
  }

  drawHeartsFilter(ctx, kp) {
    const asset = this.assets['hearts'];
    if (!asset) return;

    const forehead = kp[LANDMARKS.FOREHEAD];
    const time = Date.now() * 0.002;

    // Create a few "floating" hearts around the head
    for (let i = 0; i < 6; i++) {
        const offX = Math.sin(time + i) * 60;
        const offY = Math.cos(time * 0.8 + i) * 40 - 50;
        const size = 30 + Math.sin(time + i) * 10;
        
        ctx.globalAlpha = 0.8 + Math.sin(time + i) * 0.2;
        ctx.drawImage(asset, forehead.x + offX - size/2, forehead.y + offY - size/2, size, size);
    }
    ctx.globalAlpha = 1.0;
  }

  drawFrecklesFilter(ctx, kp) {
    const asset = this.assets['freckles'];
    if (!asset) return;

    const nose = kp[LANDMARKS.NOSE_TIP];
    const LCheek = kp[LANDMARKS.LEFT_CHEEK];
    const RCheek = kp[LANDMARKS.RIGHT_CHEEK];

    const faceWidth = Math.sqrt(Math.pow(RCheek.x - LCheek.x, 2) + Math.pow(RCheek.y - LCheek.y, 2));
    const freckleWidth = faceWidth * 0.8;
    const freckleHeight = freckleWidth * 0.4;

    ctx.save();
    ctx.globalAlpha = 0.6;
    ctx.drawImage(asset, nose.x - freckleWidth / 2, nose.y - freckleHeight * 0.4, freckleWidth, freckleHeight);
    ctx.restore();
  }

  drawTVFilter(ctx) {
    const asset = this.assets['tv'];
    if (!asset) return;

    ctx.save();
    ctx.globalAlpha = 0.9;
    // Draw full-screen border
    ctx.drawImage(asset, 0, 0, ctx.canvas.width, ctx.canvas.height);
    
    // Add custom scanline text
    ctx.fillStyle = '#ff00ff';
    ctx.font = '12px Courier New';
    ctx.fillText('REC 90s VIBE', 20, 30);
    ctx.restore();
  }

  drawDogFilter(ctx, kp) {
    const asset = this.assets['dog'];
    if (!asset) return;

    // Landmarks
    const nose = kp[LANDMARKS.NOSE_TIP];
    const forehead = kp[LANDMARKS.FOREHEAD];
    const LCheek = kp[LANDMARKS.LEFT_CHEEK];
    const RCheek = kp[LANDMARKS.RIGHT_CHEEK];

    const faceWidth = Math.sqrt(Math.pow(RCheek.x - LCheek.x, 2) + Math.pow(RCheek.y - LCheek.y, 2));
    
    // Draw Ears (Above forehead)
    const earWidth = faceWidth * 1.4;
    const earHeight = earWidth * 0.6;
    ctx.drawImage(
      asset,
      0, 0, asset.width, asset.height / 2, // Top half for ears
      forehead.x - earWidth / 2, forehead.y - earHeight * 0.8,
      earWidth, earHeight
    );

    // Draw Nose (On nose tip)
    const noseWidth = faceWidth * 0.4;
    const noseHeight = noseWidth * 0.6;
    ctx.drawImage(
      asset,
      0, asset.height / 2, asset.width, asset.height / 2, // Bottom half for nose
      nose.x - noseWidth / 2, nose.y - noseHeight / 2,
      noseWidth, noseHeight
    );
  }

  drawNeoFilter(ctx, kp) {
    const asset = this.assets['neo'];
    if (!asset) return;

    const LEx = kp[LANDMARKS.LEFT_EYE];
    const REx = kp[LANDMARKS.RIGHT_EYE];
    const nose = kp[LANDMARKS.NOSE_TIP];

    const eyeDist = Math.sqrt(Math.pow(REx.x - LEx.x, 2) + Math.pow(REx.y - LEx.y, 2));
    const angle = Math.atan2(REx.y - LEx.y, REx.x - LEx.x);

    const glassWidth = eyeDist * 2.8;
    const glassHeight = glassWidth * 0.5;

    ctx.save();
    ctx.translate(nose.x, nose.y - glassHeight * 0.2);
    ctx.rotate(angle);
    ctx.globalAlpha = 0.9;
    ctx.drawImage(asset, -glassWidth/2, -glassHeight/2, glassWidth, glassHeight);
    ctx.restore();
  }

  drawBloomFilter(ctx, kp) {
    const asset = this.assets['bloom'];
    if (!asset) return;

    const forehead = kp[LANDMARKS.FOREHEAD];
    const LCheek = kp[LANDMARKS.LEFT_CHEEK];
    const RCheek = kp[LANDMARKS.RIGHT_CHEEK];
    const faceWidth = Math.sqrt(Math.pow(RCheek.x - LCheek.x, 2) + Math.pow(RCheek.y - LCheek.y, 2));

    const cloudWidth = faceWidth * 1.5;
    const cloudHeight = cloudWidth * 0.4;

    ctx.drawImage(asset, forehead.x - cloudWidth/2, forehead.y - cloudHeight * 0.8, cloudWidth, cloudHeight);
  }

  applyGlamEffect(ctx, video) {
    // Skin smoothing: High-pass / Low-pass blend shortcut
    // In Canvas 2D, we can do a subtle blur overlay
    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.filter = 'blur(10px) brightness(1.1) saturate(1.2)';
    ctx.drawImage(video, 0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.restore();
    
    // Add some "sparkles" randomly
    for (let i = 0; i < 5; i++) {
      const x = Math.random() * ctx.canvas.width;
      const y = Math.random() * ctx.canvas.height;
      const size = Math.random() * 3 + 1;
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
