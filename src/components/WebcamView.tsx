import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Camera as CameraIcon, VideoOff, RefreshCw, FlipHorizontal, Eye } from 'lucide-react';
import { HandDetectionResult, GestureErrorFeedback, Landmark } from '../types/game';
import { GestureDetector } from '../utils/gestureDetector';

interface WebcamViewProps {
  onHandUpdate: (result: HandDetectionResult, errors: GestureErrorFeedback[]) => void;
  showSkeleton?: boolean;
  isMirrored?: boolean;
  onToggleMirror?: () => void;
  onToggleSkeleton?: () => void;
  compact?: boolean;
}

// MediaPipe connections for 21 hand landmarks
const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4], // Thumb
  [0, 5], [5, 6], [6, 7], [7, 8], // Index
  [5, 9], [9, 10], [10, 11], [11, 12], // Middle
  [9, 13], [13, 14], [14, 15], [15, 16], // Ring
  [13, 17], [17, 18], [18, 19], [19, 20], // Pinky
  [0, 17], // Palm base
];

export const WebcamView: React.FC<WebcamViewProps> = ({
  onHandUpdate,
  showSkeleton = true,
  isMirrored = true,
  onToggleMirror,
  onToggleSkeleton,
  compact = false,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fps, setFps] = useState<number>(0);
  const fpsCountRef = useRef({ frames: 0, lastTime: performance.now() });

  const detectorRef = useRef<GestureDetector>(new GestureDetector());
  const handsInstanceRef = useRef<unknown>(null);
  const cameraInstanceRef = useRef<unknown>(null);

  // Initialize MediaPipe Hands
  const initMediaPipe = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);

    // Wait for MediaPipe scripts on window
    let attempts = 0;
    while ((!(window as unknown as { Hands?: unknown }).Hands || !(window as unknown as { Camera?: unknown }).Camera) && attempts < 30) {
      await new Promise((r) => setTimeout(r, 200));
      attempts++;
    }

    const windowWithMP = window as unknown as {
      Hands?: new (config: { locateFile: (file: string) => string }) => {
        setOptions: (opts: Record<string, unknown>) => void;
        onResults: (cb: (results: { multiHandLandmarks?: Landmark[][] }) => void) => void;
        send: (input: { image: HTMLVideoElement }) => Promise<void>;
        close: () => void;
      };
      Camera?: new (
        video: HTMLVideoElement,
        config: { onFrame: () => Promise<void>; width: number; height: number }
      ) => {
        start: () => Promise<void>;
        stop: () => void;
      };
    };

    if (!windowWithMP.Hands || !windowWithMP.Camera) {
      setErrorMessage('Не удалось загрузить библиотеку MediaPipe. Проверьте интернет-соединение.');
      setLoading(false);
      return;
    }

    try {
      const hands = new windowWithMP.Hands({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/${file}`,
      });

      hands.setOptions({
        maxNumHands: 1,
        modelComplexity: 1,
        minDetectionConfidence: 0.65,
        minTrackingConfidence: 0.65,
      });

      hands.onResults((results) => {
        // FPS calculation
        fpsCountRef.current.frames++;
        const now = performance.now();
        if (now - fpsCountRef.current.lastTime >= 1000) {
          setFps(Math.round((fpsCountRef.current.frames * 1000) / (now - fpsCountRef.current.lastTime)));
          fpsCountRef.current.frames = 0;
          fpsCountRef.current.lastTime = now;
        }

        const rawLandmarks = results.multiHandLandmarks && results.multiHandLandmarks.length > 0
          ? results.multiHandLandmarks[0]
          : null;

        const { result, errors } = detectorRef.current.analyze(rawLandmarks, isMirrored);
        onHandUpdate(result, errors);

        // Draw skeleton overlay
        drawOverlay(result.landmarks, result);
      });

      handsInstanceRef.current = hands;

      if (videoRef.current) {
        const camera = new windowWithMP.Camera(videoRef.current, {
          onFrame: async () => {
            if (videoRef.current && handsInstanceRef.current) {
              await (handsInstanceRef.current as { send: (input: { image: HTMLVideoElement }) => Promise<void> }).send({
                image: videoRef.current,
              });
            }
          },
          width: 640,
          height: 480,
        });

        await camera.start();
        cameraInstanceRef.current = camera;
        setCameraActive(true);
        setLoading(false);
      }
    } catch (err) {
      console.error('Failed to init camera / hands:', err);
      setErrorMessage('Ошибка доступа к веб-камере. Пожалуйста, разрешите доступ к камере в браузере.');
      setLoading(false);
    }
  }, [isMirrored, onHandUpdate]);

  useEffect(() => {
    initMediaPipe();

    return () => {
      if (cameraInstanceRef.current) {
        try {
          (cameraInstanceRef.current as { stop: () => void }).stop();
        } catch {
          // ignore
        }
      }
      if (handsInstanceRef.current) {
        try {
          (handsInstanceRef.current as { close: () => void }).close();
        } catch {
          // ignore
        }
      }
    };
  }, [initMediaPipe]);

  // Render hand skeleton & gesture visualizer
  const drawOverlay = (landmarks: Landmark[] | null, result: HandDetectionResult) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!landmarks || !showSkeleton) return;

    const w = canvas.width;
    const h = canvas.height;

    // Line style depending on active gesture
    let strokeColor = '#06b6d4'; // Cyan default
    let jointColor = '#22d3ee';
    if (result.gesture === 'PINCH_SHOOT') {
      strokeColor = '#ec4899'; // Pink/Magenta for shot
      jointColor = '#f472b6';
    } else if (result.gesture === 'SHIELD_PALM') {
      strokeColor = '#10b981'; // Emerald for shield
      jointColor = '#34d399';
    } else if (result.gesture === 'POWER_FIST') {
      strokeColor = '#f59e0b'; // Amber for fist
      jointColor = '#fbbf24';
    } else if (result.gesture === 'PEACE_SIGN') {
      strokeColor = '#8b5cf6'; // Violet for peace
      jointColor = '#a78bfa';
    }

    // Draw Bones
    ctx.lineWidth = 3;
    ctx.strokeStyle = strokeColor;
    ctx.shadowBlur = 8;
    ctx.shadowColor = strokeColor;

    HAND_CONNECTIONS.forEach(([i, j]) => {
      const p1 = landmarks[i];
      const p2 = landmarks[j];
      ctx.beginPath();
      ctx.moveTo(p1.x * w, p1.y * h);
      ctx.lineTo(p2.x * w, p2.y * h);
      ctx.stroke();
    });

    // Draw Joints
    landmarks.forEach((p, idx) => {
      const px = p.x * w;
      const py = p.y * h;

      ctx.beginPath();
      // Emphasize key tips (Index tip 8, Thumb tip 4)
      if (idx === 8 || idx === 4) {
        ctx.arc(px, py, 6, 0, 2 * Math.PI);
        ctx.fillStyle = idx === 8 ? '#f43f5e' : '#eab308';
      } else {
        ctx.arc(px, py, 3.5, 0, 2 * Math.PI);
        ctx.fillStyle = jointColor;
      }
      ctx.fill();
    });

    // Draw Pinch laser link if aiming / shooting
    if (result.isAiming || result.gesture === 'PINCH_SHOOT') {
      const thumb = landmarks[4];
      const index = landmarks[8];
      ctx.beginPath();
      ctx.setLineDash([4, 4]);
      ctx.moveTo(thumb.x * w, thumb.y * h);
      ctx.lineTo(index.x * w, index.y * h);
      ctx.strokeStyle = result.isPinch ? '#f43f5e' : 'rgba(255, 255, 255, 0.4)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.shadowBlur = 0;
  };

  return (
    <div
      className={`relative overflow-hidden rounded-xl border border-cyan-500/30 bg-slate-900/90 shadow-2xl backdrop-blur-md transition-all ${
        compact ? 'w-48 h-36 md:w-64 md:h-48' : 'w-full h-full'
      }`}
    >
      {/* Video Element */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className={`w-full h-full object-cover ${isMirrored ? 'scale-x-[-1]' : ''}`}
      />

      {/* Skeleton Overlay Canvas */}
      <canvas
        ref={canvasRef}
        width={320}
        height={240}
        className="absolute inset-0 w-full h-full pointer-events-none"
      />

      {/* Loading Spinner */}
      {loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/80 text-cyan-400 p-4 text-center">
          <RefreshCw className="w-8 h-8 animate-spin mb-2 text-cyan-400" />
          <p className="font-cyber text-sm font-semibold tracking-wider uppercase">Инициализация нейросети...</p>
          <p className="text-xs text-slate-400 mt-1">Загрузка MediaPipe Hands (GPU Vision)</p>
        </div>
      )}

      {/* Error State */}
      {errorMessage && !loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-rose-950/90 text-rose-200 p-4 text-center">
          <VideoOff className="w-8 h-8 mb-2 text-rose-400" />
          <p className="text-xs font-semibold">{errorMessage}</p>
          <button
            onClick={initMediaPipe}
            className="mt-3 px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded text-xs font-medium uppercase tracking-wider flex items-center gap-1.5 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Повторить
          </button>
        </div>
      )}

      {/* Top HUD Controls on Camera Widget */}
      <div className="absolute top-2 left-2 right-2 flex items-center justify-between text-[11px] font-cyber text-cyan-300 pointer-events-auto">
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-slate-950/70 border border-cyan-500/20 backdrop-blur-sm">
          <span className={`w-2 h-2 rounded-full ${cameraActive ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'}`} />
          <span>{fps} FPS</span>
        </div>

        <div className="flex items-center gap-1">
          {onToggleSkeleton && (
            <button
              onClick={onToggleSkeleton}
              title="Показать / скрыть скелет руки"
              className={`p-1.5 rounded transition-all ${
                showSkeleton ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40' : 'bg-slate-950/70 text-slate-400 border border-slate-700'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
            </button>
          )}

          {onToggleMirror && (
            <button
              onClick={onToggleMirror}
              title="Зеркалирование камеры"
              className={`p-1.5 rounded transition-all ${
                isMirrored ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40' : 'bg-slate-950/70 text-slate-400 border border-slate-700'
              }`}
            >
              <FlipHorizontal className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Bottom Camera Caption */}
      <div className="absolute bottom-1.5 left-2 right-2 flex justify-between items-center text-[10px] text-slate-400 bg-slate-950/70 px-2 py-0.5 rounded border border-slate-800 pointer-events-none">
        <span className="flex items-center gap-1">
          <CameraIcon className="w-3 h-3 text-cyan-400" /> AI Motion Cam
        </span>
        <span className="font-mono text-cyan-400 font-semibold uppercase">21 Joint Vision</span>
      </div>
    </div>
  );
};
