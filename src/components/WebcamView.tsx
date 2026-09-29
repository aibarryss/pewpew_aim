import React, { useEffect, useRef, useState } from 'react';
import { Camera as CameraIcon, VideoOff, RefreshCw, FlipHorizontal, Eye, MousePointer } from 'lucide-react';
import { HandDetectionResult, GestureErrorFeedback, GestureCorrectionEvent, Landmark } from '../types/game';
import { GestureDetector } from '../utils/gestureDetector';

interface WebcamViewProps {
  onHandUpdate: (
    result: HandDetectionResult,
    errors: GestureErrorFeedback[],
    correction: GestureCorrectionEvent | null
  ) => void;
  showSkeleton?: boolean;
  isMirrored?: boolean;
  onToggleMirror?: () => void;
  onToggleSkeleton?: () => void;
  compact?: boolean;
}

const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
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
  const streamRef = useRef<MediaStream | null>(null);
  const animLoopRef = useRef<number | null>(null);
  const isProcessingRef = useRef<boolean>(false);
  const isMirroredRef = useRef<boolean>(isMirrored);
  const onHandUpdateRef = useRef(onHandUpdate);

  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fps, setFps] = useState<number>(0);
  const [mouseSimMode, setMouseSimMode] = useState<boolean>(false);

  const fpsCountRef = useRef({ frames: 0, lastTime: performance.now() });
  const detectorRef = useRef<GestureDetector>(new GestureDetector());
  const handsInstanceRef = useRef<unknown>(null);
  const mouseCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    isMirroredRef.current = isMirrored;
  }, [isMirrored]);

  useEffect(() => {
    onHandUpdateRef.current = onHandUpdate;
  }, [onHandUpdate]);

  // Load MediaPipe scripts dynamically if missing from index.html
  const ensureMediaPipeLoaded = async (): Promise<boolean> => {
    const checkReady = () => typeof (window as unknown as { Hands?: unknown }).Hands === 'function';
    if (checkReady()) return true;

    if (!document.getElementById('mediapipe-hands-script')) {
      const script = document.createElement('script');
      script.id = 'mediapipe-hands-script';
      script.src = 'https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/hands.js';
      script.crossOrigin = 'anonymous';
      document.head.appendChild(script);
    }

    let attempts = 0;
    while (!checkReady() && attempts < 35) {
      await new Promise((r) => setTimeout(r, 200));
      attempts++;
    }

    return checkReady();
  };

  // Start Camera Stream via getUserMedia (Runs only on mount or retry)
  const startCamera = async () => {
    setLoading(true);
    setErrorMessage(null);

    try {
      const mpReady = await ensureMediaPipeLoaded();
      if (!mpReady) {
        throw new Error('Не удалось загрузить модель MediaPipe. Проверьте соединение.');
      }

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'user',
            width: { ideal: 640 },
            height: { ideal: 480 },
          },
          audio: false,
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
      }

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      const windowWithMP = window as unknown as {
        Hands: new (config: { locateFile: (file: string) => string }) => {
          setOptions: (opts: Record<string, unknown>) => void;
          onResults: (cb: (results: { multiHandLandmarks?: Landmark[][] }) => void) => void;
          send: (input: { image: HTMLVideoElement }) => Promise<void>;
          close: () => void;
        };
      };

      const hands = new windowWithMP.Hands({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/${file}`,
      });

      hands.setOptions({
        maxNumHands: 1,
        modelComplexity: 1,
        minDetectionConfidence: 0.6,
        minTrackingConfidence: 0.6,
      });

      hands.onResults((results) => {
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

        const { result, errors, correction } = detectorRef.current.analyze(rawLandmarks, isMirroredRef.current);
        onHandUpdateRef.current(result, errors, correction);
        drawOverlay(result.landmarks, result);
        isProcessingRef.current = false;
      });

      handsInstanceRef.current = hands;

      const processFrame = async () => {
        if (videoRef.current && videoRef.current.readyState >= 2 && handsInstanceRef.current) {
          if (!isProcessingRef.current) {
            isProcessingRef.current = true;
            try {
              await (handsInstanceRef.current as { send: (input: { image: HTMLVideoElement }) => Promise<void> }).send({
                image: videoRef.current,
              });
            } catch {
              isProcessingRef.current = false;
            }
          }
        }
        animLoopRef.current = requestAnimationFrame(processFrame);
      };

      animLoopRef.current = requestAnimationFrame(processFrame);
      setCameraActive(true);
      setLoading(false);
    } catch (err: unknown) {
      console.error('Camera init error:', err);
      const msg = err instanceof Error ? err.message : 'Ошибка доступа к камере';
      setErrorMessage(`Камера не запущена (${msg}). Разрешите доступ или включите режим мыши.`);
      setLoading(false);
    }
  };

  useEffect(() => {
    startCamera();

    return () => {
      if (animLoopRef.current) cancelAnimationFrame(animLoopRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (handsInstanceRef.current) {
        try {
          (handsInstanceRef.current as { close: () => void }).close();
        } catch {
          // ignore
        }
      }
      if (mouseCleanupRef.current) {
        mouseCleanupRef.current();
      }
    };
  }, []);

  // Mouse Simulation Fallback with strict event listener cleanup
  const enableMouseSimulation = () => {
    if (mouseCleanupRef.current) {
      mouseCleanupRef.current();
    }

    setMouseSimMode(true);
    setErrorMessage(null);
    setLoading(false);

    let isMouseDown = false;
    let isShiftDown = false;
    let isCtrlDown = false;

    const emitUpdate = (x: number, y: number) => {
      onHandUpdateRef.current(
        {
          detected: true,
          landmarks: null,
          cursor: { x, y },
          gesture: isCtrlDown ? 'POWER_FIST' : isShiftDown ? 'SHIELD_PALM' : isMouseDown ? 'PINCH_SHOOT' : 'AIMING',
          pinchDistance: isMouseDown ? 0.1 : 0.8,
          isOpenPalm: isShiftDown,
          isFist: isCtrlDown,
          isAiming: !isShiftDown && !isCtrlDown,
          isPinch: isMouseDown,
          openFingersCount: isShiftDown ? 5 : isCtrlDown ? 0 : 1,
          indexFingerStraightness: 1.0,
          confidence: 1.0,
        },
        [],
        null
      );
    };

    let lastX = 0.5;
    let lastY = 0.5;

    const handleMouseMove = (e: MouseEvent) => {
      lastX = e.clientX / window.innerWidth;
      lastY = e.clientY / window.innerHeight;
      emitUpdate(lastX, lastY);
    };

    const handleMouseDown = () => {
      isMouseDown = true;
      emitUpdate(lastX, lastY);
    };

    const handleMouseUp = () => {
      isMouseDown = false;
      emitUpdate(lastX, lastY);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift') isShiftDown = true;
      if (e.key === 'Control' || e.key === 'Alt') isCtrlDown = true;
      emitUpdate(lastX, lastY);
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') isShiftDown = false;
      if (e.key === 'Control' || e.key === 'Alt') isCtrlDown = false;
      emitUpdate(lastX, lastY);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    mouseCleanupRef.current = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  };

  const drawOverlay = (landmarks: Landmark[] | null, result: HandDetectionResult) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!landmarks || !showSkeleton) return;

    const w = canvas.width;
    const h = canvas.height;

    let strokeColor = '#06b6d4';
    let jointColor = '#22d3ee';
    if (result.gesture === 'PINCH_SHOOT') {
      strokeColor = '#ec4899';
      jointColor = '#f472b6';
    } else if (result.gesture === 'SHIELD_PALM') {
      strokeColor = '#10b981';
      jointColor = '#34d399';
    } else if (result.gesture === 'POWER_FIST') {
      strokeColor = '#f59e0b';
      jointColor = '#fbbf24';
    }

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

    landmarks.forEach((p, idx) => {
      const px = p.x * w;
      const py = p.y * h;
      ctx.beginPath();
      if (idx === 8 || idx === 4) {
        ctx.arc(px, py, 6, 0, 2 * Math.PI);
        ctx.fillStyle = idx === 8 ? '#f43f5e' : '#eab308';
      } else {
        ctx.arc(px, py, 3.5, 0, 2 * Math.PI);
        ctx.fillStyle = jointColor;
      }
      ctx.fill();
    });

    ctx.shadowBlur = 0;
  };

  return (
    <div
      className={`relative overflow-hidden rounded-xl border border-cyan-500/30 bg-slate-900/90 shadow-2xl backdrop-blur-md transition-all ${
        compact ? 'w-48 h-36 md:w-64 md:h-48' : 'w-full h-full'
      }`}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className={`w-full h-full object-cover ${isMirrored ? 'scale-x-[-1]' : ''}`}
      />

      <canvas
        ref={canvasRef}
        width={320}
        height={240}
        className="absolute inset-0 w-full h-full pointer-events-none"
      />

      {loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/85 text-cyan-400 p-3 text-center z-20">
          <RefreshCw className="w-7 h-7 animate-spin mb-2 text-cyan-400" />
          <p className="font-cyber text-xs font-semibold tracking-wider uppercase">Запуск камеры и нейросети...</p>
          <p className="text-[10px] text-slate-400 mt-0.5">Разрешите доступ к камере в браузере</p>
        </div>
      )}

      {errorMessage && !loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/95 text-rose-200 p-3 text-center z-20">
          <VideoOff className="w-6 h-6 mb-1 text-rose-400 shrink-0" />
          <p className="text-[11px] leading-tight text-slate-300 line-clamp-3">{errorMessage}</p>
          <div className="flex items-center gap-1.5 mt-2">
            <button
              onClick={startCamera}
              className="px-2.5 py-1 bg-cyan-600 hover:bg-cyan-500 text-white rounded text-[10px] font-cyber uppercase tracking-wider flex items-center gap-1"
            >
              <RefreshCw className="w-3 h-3" /> Повторить
            </button>
            <button
              onClick={enableMouseSimulation}
              className="px-2.5 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded text-[10px] font-cyber uppercase tracking-wider flex items-center gap-1"
            >
              <MousePointer className="w-3 h-3" /> Режим Мыши
            </button>
          </div>
        </div>
      )}

      {/* Top HUD Controls on Camera Widget */}
      <div className="absolute top-2 left-2 right-2 flex items-center justify-between text-[11px] font-cyber text-cyan-300 pointer-events-auto z-10">
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-slate-950/70 border border-cyan-500/20 backdrop-blur-sm">
          <span className={`w-2 h-2 rounded-full ${cameraActive || mouseSimMode ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'}`} />
          <span>{mouseSimMode ? 'MOUSE' : `${fps} FPS`}</span>
        </div>

        <div className="flex items-center gap-1">
          {onToggleSkeleton && (
            <button
              onClick={onToggleSkeleton}
              title="Показать / скрыть скелет"
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
              title="Зеркалирование"
              className={`p-1.5 rounded transition-all ${
                isMirrored ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40' : 'bg-slate-950/70 text-slate-400 border border-slate-700'
              }`}
            >
              <FlipHorizontal className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="absolute bottom-1.5 left-2 right-2 flex justify-between items-center text-[10px] text-slate-400 bg-slate-950/70 px-2 py-0.5 rounded border border-slate-800 pointer-events-none z-10">
        <span className="flex items-center gap-1">
          <CameraIcon className="w-3 h-3 text-cyan-400" /> AI Motion Cam
        </span>
        <span className="font-mono text-cyan-400 font-semibold uppercase">21 Joint Vision</span>
      </div>
    </div>
  );
};
