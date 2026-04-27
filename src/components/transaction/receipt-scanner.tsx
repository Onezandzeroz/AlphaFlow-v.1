'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Camera,
  RotateCcw,
  Check,
  X,
  Zap,
  ScanLine,
  Sun,
  Contrast,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────

interface Point { x: number; y: number; }
interface DetectedQuad { corners: Point[]; confidence: number; stability: number; }

type ScannerStep = 'camera' | 'confirm' | 'result';
type FilterMode = 'original' | 'grayscale' | 'high-contrast' | 'sharpen';

interface ReceiptScannerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCapture: (file: File, previewUrl: string) => void;
}

// ─── Edge Detection Engine ───────────────────────────────────────────

function toGrayscale(data: Uint8ClampedArray, width: number, height: number): Uint8Array {
  const gray = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const idx = i * 4;
    gray[i] = Math.round(data[idx] * 0.299 + data[idx + 1] * 0.587 + data[idx + 2] * 0.114);
  }
  return gray;
}

function gaussianBlur(gray: Uint8Array, w: number, h: number, radius: number = 1): Uint8Array {
  const kernel = radius === 1
    ? [1, 2, 1, 2, 4, 2, 1, 2, 1]
    : [1, 4, 7, 4, 1, 4, 16, 26, 16, 4, 7, 26, 41, 26, 7, 4, 16, 26, 16, 4, 1, 4, 7, 4, 1];
  const kSize = radius === 1 ? 3 : 5;
  const kHalf = Math.floor(kSize / 2);
  const kSum = kernel.reduce((a, b) => a + b, 0);
  const out = new Uint8Array(w * h);
  for (let y = kHalf; y < h - kHalf; y++) {
    for (let x = kHalf; x < w - kHalf; x++) {
      let sum = 0;
      for (let ky = 0; ky < kSize; ky++) {
        for (let kx = 0; kx < kSize; kx++) {
          const px = x + kx - kHalf;
          const py = y + ky - kHalf;
          sum += gray[py * w + px] * kernel[ky * kSize + kx];
        }
      }
      out[y * w + x] = Math.round(sum / kSum);
    }
  }
  return out;
}

function sobelEdges(gray: Uint8Array, w: number, h: number): { mag: Float32Array; dir: Float32Array } {
  const mag = new Float32Array(w * h);
  const dir = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const tl = gray[(y - 1) * w + (x - 1)];
      const tc = gray[(y - 1) * w + x];
      const tr = gray[(y - 1) * w + (x + 1)];
      const ml = gray[y * w + (x - 1)];
      const mr = gray[y * w + (x + 1)];
      const bl = gray[(y + 1) * w + (x - 1)];
      const bc = gray[(y + 1) * w + x];
      const br = gray[(y + 1) * w + (x + 1)];
      const gx = -tl + tr - 2 * ml + 2 * mr - bl + br;
      const gy = -tl - 2 * tc - tr + bl + 2 * bc + br;
      const idx = y * w + x;
      mag[idx] = Math.sqrt(gx * gx + gy * gy);
      dir[idx] = Math.atan2(gy, gx);
    }
  }
  return { mag, dir };
}

function nonMaxSuppression(mag: Float32Array, dir: Float32Array, w: number, h: number): Float32Array {
  const out = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = y * w + x;
      const m = mag[idx];
      let angle = (dir[idx] * 180) / Math.PI;
      if (angle < 0) angle += 180;
      let n1 = 0, n2 = 0;
      if ((angle >= 0 && angle < 22.5) || (angle >= 157.5 && angle <= 180)) {
        n1 = mag[y * w + (x + 1)]; n2 = mag[y * w + (x - 1)];
      } else if (angle >= 22.5 && angle < 67.5) {
        n1 = mag[(y - 1) * w + (x + 1)]; n2 = mag[(y + 1) * w + (x - 1)];
      } else if (angle >= 67.5 && angle < 112.5) {
        n1 = mag[(y - 1) * w + x]; n2 = mag[(y + 1) * w + x];
      } else {
        n1 = mag[(y - 1) * w + (x - 1)]; n2 = mag[(y + 1) * w + (x + 1)];
      }
      out[idx] = m >= n1 && m >= n2 ? m : 0;
    }
  }
  return out;
}

function houghLines(edges: Float32Array, w: number, h: number, threshold: number): { rho: number; theta: number; score: number }[] {
  const diag = Math.ceil(Math.sqrt(w * w + h * h));
  const rhoMax = diag;
  const thetaSteps = 180;
  const acc = new Int32Array(rhoMax * thetaSteps);
  const cosLUT = new Float32Array(thetaSteps);
  const sinLUT = new Float32Array(thetaSteps);
  for (let t = 0; t < thetaSteps; t++) {
    const rad = (t * Math.PI) / thetaSteps;
    cosLUT[t] = Math.cos(rad);
    sinLUT[t] = Math.sin(rad);
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (edges[y * w + x] > threshold) {
        for (let t = 0; t < thetaSteps; t++) {
          const rho = Math.round(x * cosLUT[t] + y * sinLUT[t]);
          if (rho >= 0 && rho < rhoMax) {
            acc[rho * thetaSteps + t]++;
          }
        }
      }
    }
  }
  const lines: { rho: number; theta: number; score: number }[] = [];
  const minVotes = Math.max(30, Math.min(w, h) * 0.1);
  for (let r = 0; r < rhoMax; r++) {
    for (let t = 0; t < thetaSteps; t++) {
      if (acc[r * thetaSteps + t] >= minVotes) {
        lines.push({ rho: r, theta: (t * Math.PI) / thetaSteps, score: acc[r * thetaSteps + t] });
      }
    }
  }
  lines.sort((a, b) => b.score - a.score);
  return lines.slice(0, 40);
}

function lineIntersection(l1: { rho: number; theta: number }, l2: { rho: number; theta: number }): Point | null {
  const ct1 = Math.cos(l1.theta), st1 = Math.sin(l1.theta);
  const ct2 = Math.cos(l2.theta), st2 = Math.sin(l2.theta);
  const det = ct1 * st2 - st1 * ct2;
  if (Math.abs(det) < 1e-6) return null;
  const x = (st2 * l1.rho - st1 * l2.rho) / det;
  const y = (ct1 * l2.rho - ct2 * l1.rho) / det;
  return { x, y };
}

function dist(a: Point, b: Point): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

function quadArea(corners: Point[]): number {
  const [a, b, c, d] = corners;
  return Math.abs(
    0.5 * ((a.x * b.y - b.x * a.y) + (b.x * c.y - c.x * b.y) + (c.x * d.y - d.x * c.y) + (d.x * a.y - a.x * d.y))
  );
}

function isConvexQuad(corners: Point[]): boolean {
  if (corners.length !== 4) return false;
  const cross: number[] = [];
  for (let i = 0; i < 4; i++) {
    const a = corners[i];
    const b = corners[(i + 1) % 4];
    const c = corners[(i + 2) % 4];
    cross.push((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x));
  }
  return cross.every(v => v > 0) || cross.every(v => v < 0);
}

function findBestQuad(lines: { rho: number; theta: number; score: number }[], w: number, h: number, minArea: number): Point[] | null {
  const margin = Math.min(w, h) * 0.05;
  const topLines = lines.slice(0, 20);
  let bestQuad: Point[] | null = null;
  let bestScore = 0;
  for (let i = 0; i < topLines.length; i++) {
    for (let j = i + 1; j < topLines.length; j++) {
      for (let k = j + 1; k < topLines.length; k++) {
        for (let l = k + 1; l < topLines.length; l++) {
          const combo = [topLines[i], topLines[j], topLines[k], topLines[l]];
          // Check we have roughly 2 horizontal + 2 vertical lines
          let hCount = 0, vCount = 0;
          for (const line of combo) {
            const deg = (line.theta * 180) / Math.PI;
            if (deg < 30 || deg > 150) hCount++;
            else if (deg > 60 && deg < 120) vCount++;
          }
          if (hCount < 1 || vCount < 1) continue;
          const pts: Point[] = [];
          for (let a = 0; a < 4; a++) {
            for (let b = a + 1; b < 4; b++) {
              const p = lineIntersection(combo[a], combo[b]);
              if (p && p.x > -margin && p.x < w + margin && p.y > -margin && p.y < h + margin) {
                pts.push(p);
              }
            }
          }
          if (pts.length !== 4) continue;
          // Order corners: sort by angle from centroid
          const cx = pts.reduce((s, p) => s + p.x, 0) / 4;
          const cy = pts.reduce((s, p) => s + p.y, 0) / 4;
          const ordered = pts.sort((a, b) =>
            Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx)
          );
          if (!isConvexQuad(ordered)) continue;
          const area = quadArea(ordered);
          if (area < minArea) continue;
          const lineScore = combo.reduce((s, l) => s + l.score, 0);
          if (lineScore > bestScore) {
            bestScore = lineScore;
            bestQuad = ordered;
          }
        }
      }
    }
  }
  return bestQuad;
}

function detectDocument(video: HTMLVideoElement, canvas: HTMLCanvasElement): DetectedQuad | null {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return null;
  // Scale down for performance
  const scale = Math.min(1, 320 / Math.max(vw, vh));
  const sw = Math.round(vw * scale);
  const sh = Math.round(vh * scale);
  canvas.width = sw;
  canvas.height = sh;
  ctx.drawImage(video, 0, 0, sw, sh);
  const imageData = ctx.getImageData(0, 0, sw, sh);
  const gray = toGrayscale(imageData.data, sw, sh);
  const blurred = gaussianBlur(gray, sw, sh, 1);
  const { mag, dir } = sobelEdges(blurred, sw, sh);
  const nms = nonMaxSuppression(mag, dir, sw, sh);
  const threshold = 50;
  const lines = houghLines(nms, sw, sh, threshold);
  if (lines.length < 4) return null;
  const minArea = (sw * sh) * 0.1;
  const quad = findBestQuad(lines, sw, sh, minArea);
  if (!quad) return null;
  // Scale corners back to video coordinates
  const corners = quad.map(p => ({ x: p.x / scale, y: p.y / scale }));
  // Score based on how close to a rectangle (aspect ratio + right angles)
  const sides = [
    dist(corners[0], corners[1]),
    dist(corners[1], corners[2]),
    dist(corners[2], corners[3]),
    dist(corners[3], corners[0]),
  ];
  const avgSide = sides.reduce((a, b) => a + b, 0) / 4;
  const sideVariance = sides.reduce((s, d) => s + Math.abs(d - avgSide), 0) / (4 * avgSide);
  const rectScore = Math.max(0, 1 - sideVariance);
  const areaRatio = quadArea(corners) / (vw * vh);
  const confidence = Math.min(1, rectScore * 0.5 + areaRatio * 1.5);
  return { corners, confidence, stability: rectScore };
}

// ─── Perspective Warp ────────────────────────────────────────────────

function perspectiveWarp(
  sourceCanvas: HTMLCanvasElement,
  corners: Point[],
  outW: number,
  outH: number
): HTMLCanvasElement {
  const srcCtx = sourceCanvas.getContext('2d', { willReadFrequently: true });
  if (!srcCtx) return sourceCanvas;
  const srcData = srcCtx.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
  const src = srcData.data;
  const sw = sourceCanvas.width;
  const sh = sourceCanvas.height;

  const outCanvas = document.createElement('canvas');
  outCanvas.width = outW;
  outCanvas.height = outH;
  const outCtx = outCanvas.getContext('2d')!;
  const outImgData = outCtx.createImageData(outW, outH);
  const out = outImgData.data;

  // Source corners: TL, TR, BR, BL (ordered)
  const [tl, tr, br, bl] = corners;

  for (let v = 0; v < outH; v++) {
    for (let u = 0; u < outW; u++) {
      const x = u / outW;
      const y = v / outH;

      // Bilinear interpolation in the source quadrilateral
      const topX = tl.x + (tr.x - tl.x) * x;
      const topY = tl.y + (tr.y - tl.y) * x;
      const botX = bl.x + (br.x - bl.x) * x;
      const botY = bl.y + (br.y - bl.y) * x;
      const srcXf = topX + (botX - topX) * y;
      const srcYf = topY + (botY - topY) * y;

      const srcX = Math.round(srcXf);
      const srcY = Math.round(srcYf);

      if (srcX >= 0 && srcX < sw && srcY >= 0 && srcY < sh) {
        const srcIdx = (srcY * sw + srcX) * 4;
        const dstIdx = (v * outW + u) * 4;
        out[dstIdx] = src[srcIdx];
        out[dstIdx + 1] = src[srcIdx + 1];
        out[dstIdx + 2] = src[srcIdx + 2];
        out[dstIdx + 3] = src[srcIdx + 3];
      }
    }
  }

  outCtx.putImageData(outImgData, 0, 0);
  return outCanvas;
}

// ─── Post-Processing Filters ─────────────────────────────────────────

function applyFilter(canvas: HTMLCanvasElement, mode: FilterMode): HTMLCanvasElement {
  if (mode === 'original') return canvas;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return canvas;
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imgData.data;
  const out = new Uint8ClampedArray(data.length);

  if (mode === 'grayscale') {
    for (let i = 0; i < data.length; i += 4) {
      const g = Math.round(data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
      // Boost contrast slightly
      const boosted = Math.min(255, Math.max(0, ((g - 128) * 1.3) + 128));
      out[i] = out[i + 1] = out[i + 2] = boosted;
      out[i + 3] = data[i + 3];
    }
  } else if (mode === 'high-contrast') {
    // B&W document mode - strong contrast + auto threshold
    for (let i = 0; i < data.length; i += 4) {
      const g = Math.round(data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
      // Adaptive: if bright enough, make white; otherwise darken
      const val = g > 140 ? Math.min(255, g + 60) : Math.max(0, g - 30);
      out[i] = out[i + 1] = out[i + 2] = val;
      out[i + 3] = data[i + 3];
    }
  } else if (mode === 'sharpen') {
    // Unsharp mask
    const w = canvas.width;
    const h = canvas.height;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        for (let c = 0; c < 3; c++) {
          const idx = (y * w + x) * 4 + c;
          const center = data[idx] * 5;
          const neighbors =
            data[((y - 1) * w + x) * 4 + c] +
            data[((y + 1) * w + x) * 4 + c] +
            data[(y * w + (x - 1)) * 4 + c] +
            data[(y * w + (x + 1)) * 4 + c];
          out[idx] = Math.min(255, Math.max(0, center - neighbors));
        }
        out[(y * w + x) * 4 + 3] = data[(y * w + x) * 4 + 3];
      }
    }
  }

  const outCanvas = document.createElement('canvas');
  outCanvas.width = canvas.width;
  outCanvas.height = canvas.height;
  const outCtx = outCanvas.getContext('2d')!;
  const outImgData = new ImageData(out, canvas.width, canvas.height);
  outCtx.putImageData(outImgData, 0, 0);
  return outCanvas;
}

// ─── Main Component ──────────────────────────────────────────────────

export function ReceiptScanner({ open, onOpenChange, onCapture }: ReceiptScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [step, setStep] = useState<ScannerStep>('camera');
  const [detectedQuad, setDetectedQuad] = useState<DetectedQuad | null>(null);
  const [stableCount, setStableCount] = useState(0);
  const [autoCaptured, setAutoCaptured] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [capturedCorners, setCapturedCorners] = useState<Point[] | null>(null);
  const [warpedImage, setWarpedImage] = useState<string | null>(null);
  const [filterMode, setFilterMode] = useState<FilterMode>('high-contrast');
  const [flashEffect, setFlashEffect] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const stableCountRef = useRef(0);
  const lastQuadRef = useRef<DetectedQuad | null>(null);
  const animFrameRef = useRef<number>(0);
  const autoCapturedRef = useRef(false);

  // Start camera — triggers the browser's native permission prompt
  const startCamera = useCallback(async () => {
    setCameraError(null);
    setPermissionDenied(false);

    // On mobile browsers, getUserMedia triggers the native camera permission prompt.
    // We do NOT pre-check with navigator.permissions.query because:
    //   - iOS Safari doesn't support 'camera' in the Permissions API
    //   - On Android, a pre-check of state='prompt' is useless — we should just ask
    //   - On desktop browsers the prompt also works correctly via getUserMedia
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch (err: unknown) {
      const errorName = err instanceof DOMException ? err.name : '';
      if (errorName === 'NotAllowedError' || errorName === 'PermissionDeniedError') {
        setPermissionDenied(true);
        // The browser showed the native prompt and the user denied it.
        // For a web app, the fix is browser-specific site settings, NOT native app settings.
        setCameraError('Kameratilladelse blev afvist. Tryk på "Prøv igen" for at få browserens prompt, eller nulstil websteds-tilladelser i browserens indstillinger.');
      } else if (errorName === 'NotFoundError') {
        setCameraError('Intet kamera fundet på denne enhed.');
      } else if (errorName === 'NotReadableError') {
        setCameraError('Kameraet bruges af en anden app. Luk den anden app og prøv igen.');
      } else if (errorName === 'AbortError') {
        // On some mobile browsers, rapidly re-triggering getUserMedia can cause AbortError
        setCameraError('Kameratilladelse blev afbrudt. Prøv igen.');
      } else {
        setCameraError('Kunne ikke tilgå kameraet. Tjek tilladelser og prøv igen.');
      }
    }
  }, []);

  // Stop camera
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    cancelAnimationFrame(animFrameRef.current);
  }, []);

  // Draw bounding box overlay
  const drawOverlay = useCallback((quad: DetectedQuad | null) => {
    const overlay = overlayCanvasRef.current;
    const video = videoRef.current;
    if (!overlay || !video) return;

    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) return;

    overlay.width = overlay.clientWidth * window.devicePixelRatio;
    overlay.height = overlay.clientHeight * window.devicePixelRatio;
    const ctx = overlay.getContext('2d')!;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    const cw = overlay.clientWidth;
    const ch = overlay.clientHeight;
    ctx.clearRect(0, 0, cw, ch);

    if (!quad || quad.confidence < 0.15) {
      // No document detected - show scanning animation
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.lineWidth = 1;
      ctx.setLineDash([8, 8]);
      const pad = 40;
      ctx.strokeRect(pad, pad, cw - pad * 2, ch - pad * 2);
      ctx.setLineDash([]);

      // Scanning line animation
      const scanY = (Date.now() % 2000) / 2000 * ch;
      const grad = ctx.createLinearGradient(0, scanY - 30, 0, scanY + 30);
      grad.addColorStop(0, 'rgba(13, 148, 136, 0)');
      grad.addColorStop(0.5, 'rgba(13, 148, 136, 0.6)');
      grad.addColorStop(1, 'rgba(13, 148, 136, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(pad, scanY - 30, cw - pad * 2, 60);
      return;
    }

    const scaleX = cw / vw;
    const scaleY = ch / vh;
    const pts = quad.corners.map(p => ({ x: p.x * scaleX, y: p.y * scaleY }));

    // Fill detected area with subtle highlight
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < 4; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
    ctx.fillStyle = 'rgba(13, 148, 136, 0.08)';
    ctx.fill();

    // Draw bounding box
    const isStable = stableCountRef.current >= 5;
    const color = isStable ? 'rgba(13, 148, 136, 0.95)' : 'rgba(255, 255, 255, 0.7)';
    ctx.strokeStyle = color;
    ctx.lineWidth = isStable ? 3 : 2;
    ctx.setLineDash(isStable ? [] : [6, 4]);
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < 4; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
    ctx.stroke();
    ctx.setLineDash([]);

    // Corner dots
    for (const pt of pts) {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, isStable ? 6 : 4, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      if (isStable) {
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 10, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(13, 148, 136, 0.4)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }

    // "Hold steady" text when nearly stable
    if (stableCountRef.current >= 3 && !isStable) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.font = '14px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Hold stil...', cw / 2, ch - 40);
    }

    // Auto-capture countdown indicator
    if (isStable && !autoCapturedRef.current) {
      ctx.fillStyle = 'rgba(13, 148, 136, 0.95)';
      ctx.font = 'bold 16px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('✓ Scannet!', cw / 2, ch - 40);
    }
  }, []);

  // Refs for cross-callback references (avoids forward declaration issues)
  const handleCaptureRef = useRef<(corners?: Point[]) => void>(() => {});
  const handleCloseRef = useRef<() => void>(() => {});
  const detectLoopRef = useRef<() => void>(() => {});

  // Capture handler
  const handleCapture = useCallback((corners?: Point[]) => {
    const video = videoRef.current;
    if (!video) return;

    // Flash effect
    setFlashEffect(true);
    setTimeout(() => setFlashEffect(false), 200);

    // Capture frame to canvas
    const captureCanvas = document.createElement('canvas');
    captureCanvas.width = video.videoWidth;
    captureCanvas.height = video.videoHeight;
    const ctx = captureCanvas.getContext('2d')!;
    ctx.drawImage(video, 0, 0);

    const imageUrl = captureCanvas.toDataURL('image/jpeg', 0.92);
    setCapturedImage(imageUrl);

    if (corners && corners.length === 4) {
      setCapturedCorners(corners);
    } else {
      // No detected corners - use full frame as fallback
      setCapturedCorners([
        { x: 0, y: 0 },
        { x: video.videoWidth, y: 0 },
        { x: video.videoWidth, y: video.videoHeight },
        { x: 0, y: video.videoHeight },
      ]);
    }

    stopCamera();
    setStep('confirm');
  }, [stopCamera]);

  // Keep ref in sync
  useEffect(() => { handleCaptureRef.current = handleCapture; }, [handleCapture]);

  // Reset and close
  const handleClose = useCallback(() => {
    stopCamera();
    setStep('camera');
    setDetectedQuad(null);
    setStableCount(0);
    setAutoCaptured(false);
    setCapturedImage(null);
    setCapturedCorners(null);
    setWarpedImage(null);
    setFilterMode('high-contrast');
    setFlashEffect(false);
    setIsProcessing(false);
    setCameraError(null);
    setPermissionDenied(false);
    stableCountRef.current = 0;
    lastQuadRef.current = null;
    autoCapturedRef.current = false;
    onOpenChange(false);
  }, [stopCamera, onOpenChange]);

  // Keep ref in sync
  useEffect(() => { handleCloseRef.current = handleClose; }, [handleClose]);

  const handleRetry = useCallback(() => {
    stopCamera();
    setStep('camera');
    setDetectedQuad(null);
    setStableCount(0);
    setAutoCaptured(false);
    setCapturedImage(null);
    setCapturedCorners(null);
    setWarpedImage(null);
    setFilterMode('high-contrast');
    setIsProcessing(false);
    setCameraError(null);
    setPermissionDenied(false);
    stableCountRef.current = 0;
    lastQuadRef.current = null;
    autoCapturedRef.current = false;
  }, [stopCamera]);

  // Detection loop - uses handleCaptureRef to avoid forward declaration
  const detectLoop = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || autoCapturedRef.current) return;

    const quad = detectDocument(video, canvas);

    // Stability tracking
    if (quad && quad.confidence > 0.2) {
      const lastQuad = lastQuadRef.current;
      if (lastQuad && lastQuad.corners) {
        const avgShift = quad.corners.reduce((sum, c, i) =>
          sum + dist(c, lastQuad.corners[i]), 0) / 4;
        if (avgShift < 20) {
          stableCountRef.current = Math.min(stableCountRef.current + 1, 15);
        } else {
          stableCountRef.current = Math.max(0, stableCountRef.current - 2);
        }
      } else {
        stableCountRef.current = 1;
      }
      lastQuadRef.current = quad;
      setDetectedQuad({ ...quad, stability: stableCountRef.current });
      setStableCount(stableCountRef.current);

      // Auto-capture when stable for enough frames
      if (stableCountRef.current >= 6 && !autoCapturedRef.current) {
        autoCapturedRef.current = true;
        setAutoCaptured(true);
        handleCaptureRef.current(quad.corners);
        return;
      }
    } else {
      stableCountRef.current = Math.max(0, stableCountRef.current - 1);
      lastQuadRef.current = null;
      setDetectedQuad(null);
      setStableCount(stableCountRef.current);
    }

    drawOverlay(quad);
    animFrameRef.current = requestAnimationFrame(() => detectLoopRef.current());
  }, [drawOverlay]);

  // Keep detectLoop ref in sync
  useEffect(() => { detectLoopRef.current = detectLoop; }, [detectLoop]);

  // Process the captured image with perspective warp
  const processCapture = useCallback(() => {
    if (!capturedImage || !capturedCorners) return;
    setIsProcessing(true);

    // Use requestAnimationFrame to let UI update
    requestAnimationFrame(() => {
      const img = new Image();
      img.onload = () => {
        const srcCanvas = document.createElement('canvas');
        srcCanvas.width = img.width;
        srcCanvas.height = img.height;
        const srcCtx = srcCanvas.getContext('2d')!;
        srcCtx.drawImage(img, 0, 0);

        // Calculate output dimensions from the quad
        const [tl, tr, br, bl] = capturedCorners;
        const topW = dist(tl, tr);
        const botW = dist(bl, br);
        const leftH = dist(tl, bl);
        const rightH = dist(tr, br);
        const outW = Math.round(Math.max(topW, botW));
        const outH = Math.round(Math.max(leftH, rightH));

        // Perform perspective warp
        const warped = perspectiveWarp(srcCanvas, capturedCorners, outW, outH);

        // Apply filter
        const filtered = applyFilter(warped, filterMode);

        const resultUrl = filtered.toDataURL('image/jpeg', 0.92);
        setWarpedImage(resultUrl);
        setIsProcessing(false);
        setStep('result');
      };
      img.src = capturedImage;
    });
  }, [capturedImage, capturedCorners, filterMode]);

  // Re-apply filter without re-warping
  const reapplyFilter = useCallback((mode: FilterMode) => {
    setFilterMode(mode);
    if (!capturedImage || !capturedCorners) return;
    const img = new Image();
    img.onload = () => {
      const srcCanvas = document.createElement('canvas');
      srcCanvas.width = img.width;
      srcCanvas.height = img.height;
      const srcCtx = srcCanvas.getContext('2d')!;
      srcCtx.drawImage(img, 0, 0);

      const [tl, tr, br, bl] = capturedCorners;
      const topW = dist(tl, tr);
      const botW = dist(bl, br);
      const leftH = dist(tl, bl);
      const rightH = dist(tr, br);
      const outW = Math.round(Math.max(topW, botW));
      const outH = Math.round(Math.max(leftH, rightH));

      const warped = perspectiveWarp(srcCanvas, capturedCorners, outW, outH);
      const filtered = applyFilter(warped, mode);
      const resultUrl = filtered.toDataURL('image/jpeg', 0.92);
      setWarpedImage(resultUrl);
    };
    img.src = capturedImage;
  }, [capturedImage, capturedCorners]);

  // Confirm and send result - uses handleCloseRef to avoid forward declaration
  const confirmCapture = useCallback(() => {
    if (!warpedImage) return;
    // Convert data URL to File
    fetch(warpedImage)
      .then(res => res.blob())
      .then(blob => {
        const file = new File([blob], 'receipt-scan.jpg', { type: 'image/jpeg' });
        onCapture(file, warpedImage);
        handleCloseRef.current();
      });
  }, [warpedImage, onCapture]);

  // Start/stop camera on open/close
  useEffect(() => {
    if (open && step === 'camera') {
      // Defer camera start to avoid cascading renders
      const timer = setTimeout(() => startCamera(), 0);
      return () => clearTimeout(timer);
    }
    return () => {
      if (!open) stopCamera();
    };
  }, [open, step, startCamera, stopCamera]);

  // Start detection loop when video is playing
  useEffect(() => {
    if (step !== 'camera') return;
    const video = videoRef.current;
    if (!video) return;

    const checkReady = () => {
      if (video.readyState >= 2 && video.videoWidth > 0) {
        animFrameRef.current = requestAnimationFrame(detectLoop);
        return true;
      }
      return false;
    };

    if (!checkReady()) {
      const interval = setInterval(() => {
        if (checkReady()) clearInterval(interval);
      }, 200);
      return () => clearInterval(interval);
    }
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [step, detectLoop]);

  // Auto-process on confirm step
  useEffect(() => {
    if (step === 'confirm' && capturedImage && capturedCorners) {
      // Defer processing to avoid cascading renders
      const timer = setTimeout(() => processCapture(), 0);
      return () => clearTimeout(timer);
    }
  }, [step, capturedImage, capturedCorners, processCapture]);

  const filterOptions: { id: FilterMode; icon: typeof Sun; label: string }[] = [
    { id: 'original', icon: Sun, label: 'Original' },
    { id: 'grayscale', icon: Contrast, label: 'Gråtoner' },
    { id: 'high-contrast', icon: ScanLine, label: 'Dokument' },
    { id: 'sharpen', icon: Zap, label: 'Skarp' },
  ];

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-lg p-0 gap-0 overflow-hidden bg-black border-white/10">
        <DialogHeader className="sr-only">
          <DialogTitle>Scan kvittering</DialogTitle>
        </DialogHeader>

        {/* ─── Camera Step ─── */}
        {step === 'camera' && (
          <div className="relative w-full aspect-[3/4] bg-black">
            <video
              ref={videoRef}
              className="absolute inset-0 w-full h-full object-cover"
              playsInline
              muted
            />
            <canvas ref={canvasRef} className="hidden" />
            <canvas
              ref={overlayCanvasRef}
              className="absolute inset-0 w-full h-full pointer-events-none"
            />

            {/* Flash effect */}
            {flashEffect && (
              <div className="absolute inset-0 bg-white animate-[flash_200ms_ease-out] pointer-events-none" />
            )}

            {/* Camera error */}
            {cameraError && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 p-6 gap-4">
                <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center">
                  <Camera className="h-8 w-8 text-white/60" />
                </div>
                <p className="text-white text-center text-sm max-w-xs">{cameraError}</p>
                {permissionDenied && (
                  <div className="text-white/50 text-center text-xs max-w-xs space-y-1">
                    <p>
                      {navigator.userAgent.includes('iPhone') || navigator.userAgent.includes('iPad')
                        ? 'Safari: Tryk på aA → Webstedsindstillinger → Kamera → Tillad'
                        : 'Chrome: Lås-ikon → Webstedsindstillinger → Kamera → Tillad'}
                    </p>
                    <p className="text-white/40">eller genindlæs siden for at få en ny prompt</p>
                  </div>
                )}
                <button
                  onClick={startCamera}
                  className="mt-2 px-6 py-2.5 rounded-full text-sm font-medium bg-[#0d9488] hover:bg-[#0f766e] text-white transition-colors"
                >
                  Prøv igen
                </button>
              </div>
            )}

            {/* Top bar */}
            <div className="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/60 to-transparent">
              <div className="flex items-center justify-between">
                <button onClick={handleClose} className="text-white/80 hover:text-white transition-colors">
                  <X className="h-6 w-6" />
                </button>
                <div className="flex items-center gap-2">
                  {detectedQuad && (
                    <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                      stableCount >= 5
                        ? 'bg-[#0d9488] text-white'
                        : 'bg-white/20 text-white/80'
                    }`}>
                      <ScanLine className="h-3 w-3 inline mr-1" />
                      {stableCount >= 5 ? 'Klar' : 'Søger...'}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Bottom controls */}
            <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/60 to-transparent">
              <div className="flex items-center justify-center gap-8">
                <button
                  onClick={handleClose}
                  className="text-white/70 hover:text-white text-xs transition-colors"
                >
                  Annuller
                </button>
                <button
                  onClick={() => handleCapture(detectedQuad?.corners)}
                  className="w-16 h-16 rounded-full border-4 border-white/80 hover:border-white flex items-center justify-center transition-colors"
                >
                  <div className="w-12 h-12 rounded-full bg-white/20 hover:bg-white/30 transition-colors" />
                </button>
                <div className="w-12" /> {/* Spacer for centering */}
              </div>
              <p className="text-center text-white/50 text-xs mt-3">
                Hold kvitteringen i kameraet — automatisk scan
              </p>
            </div>
          </div>
        )}

        {/* ─── Confirm/Processing Step ─── */}
        {step === 'confirm' && (
          <div className="relative w-full aspect-[3/4] bg-neutral-900 flex flex-col items-center justify-center">
            {isProcessing ? (
              <div className="flex flex-col items-center gap-4">
                <div className="relative h-12 w-12">
                  <div className="absolute inset-0 rounded-full animate-spin"
                    style={{ background: 'conic-gradient(from 0deg, #0d9488, #2dd4bf, #0d9488)', animationDuration: '1.5s' }} />
                  <div className="absolute inset-1.5 rounded-full bg-neutral-900" />
                </div>
                <p className="text-white/70 text-sm">Behandler kvittering...</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-4">
                <Check className="h-12 w-12 text-[#0d9488]" />
                <p className="text-white/70 text-sm">Kvittering scannet!</p>
              </div>
            )}
          </div>
        )}

        {/* ─── Result Step ─── */}
        {step === 'result' && warpedImage && (
          <div className="flex flex-col bg-neutral-950">
            {/* Preview */}
            <div className="relative w-full aspect-[3/4] max-h-[60vh]">
              <img
                src={warpedImage}
                alt="Scanned receipt"
                className="absolute inset-0 w-full h-full object-contain"
              />
            </div>

            {/* Filter selector */}
            <div className="px-4 py-3 border-t border-white/10">
              <div className="flex items-center justify-center gap-2">
                {filterOptions.map((opt) => {
                  const Icon = opt.icon;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => reapplyFilter(opt.id)}
                      className={`flex flex-col items-center gap-1 px-3 py-2 rounded-lg transition-colors ${
                        filterMode === opt.id
                          ? 'bg-[#0d9488]/20 text-[#2dd4bf]'
                          : 'text-white/50 hover:text-white/80'
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      <span className="text-[10px] font-medium">{opt.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-3 p-4 border-t border-white/10">
              <Button
                variant="outline"
                size="sm"
                onClick={handleRetry}
                className="flex-1 border-white/20 text-white/70 hover:text-white hover:bg-white/10"
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                Scan igen
              </Button>
              <Button
                size="sm"
                onClick={confirmCapture}
                className="flex-1 bg-[#0d9488] hover:bg-[#0f766e] text-white"
              >
                <Check className="h-4 w-4 mr-2" />
                Brug scan
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
