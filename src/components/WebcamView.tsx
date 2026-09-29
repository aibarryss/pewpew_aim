import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Camera as CameraIcon, VideoOff, RefreshCw, FlipHorizontal, Eye, MousePointer } from 'lucide-react';
import { FilesetResolver, FaceLandmarker } from '@mediapipe/tasks-vision';
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

// Helper: Calculate scale and offset matching CSS object-cover for video inside container
export function computeCoverTransform(
  videoWidth: number,
  videoHeight: number,
  containerWidth: number,
  containerHeight: number
): { scale: number; offsetX: number; offsetY: number } {
  if (videoWidth <= 0 || videoHeight <= 0 || containerWidth <= 0 || containerHeight <= 0) {
    return { scale: 1, offsetX: 0, offsetY: 0 };
  }
  const scale = Math.max(containerWidth / videoWidth, containerHeight / videoHeight);
  const displayedVideoWidth = videoWidth * scale;
  const displayedVideoHeight = videoHeight * scale;
  const offsetX = (containerWidth - displayedVideoWidth) / 2;
  const offsetY = (containerHeight - displayedVideoHeight) / 2;

  return { scale, offsetX, offsetY };
}

export const WebcamView: React.FC<WebcamViewProps> = ({
  onHandUpdate,
  showSkeleton = true,
  isMirrored = true,
  onToggleMirror,
  onToggleSkeleton,
  compact = false,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animLoopRef = useRef<number | null>(null);

  // Decoupled Processing Locks & Timestamps
  const isProcessingHandsRef = useRef<boolean>(false);
  const isProcessingFaceRef = useRef<boolean>(false);
  const lastHandSendTimeRef = useRef<number>(0);
  const lastFaceDetectionTimeRef = useRef<number>(0);
  const lastFaceTimestampRef = useRef<number>(0);

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
  const faceLandmarkerRef = useRef<FaceLandmarker | null>(null);
  const latestFaceLandmarksRef = useRef<Landmark[] | null>(null);
  const mouseCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    isMirroredRef.current = isMirrored;
  }, [isMirrored]);

  useEffect(() => {
    onHandUpdateRef.current = onHandUpdate;
  }, [onHandUpdate]);

  const updateCanvasDimensions = useCallback(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const width = Math.round(container.clientWidth);
    const height = Math.round(container.clientHeight);

    if (width > 0 && height > 0) {
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
    }
  }, []);

  useEffect(() => {
    updateCanvasDimensions();
    const container = containerRef.current;
    if (!container) return;

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => {
        updateCanvasDimensions();
      });
      ro.observe(container);
    }

    window.addEventListener('resize', updateCanvasDimensions);

    return () => {
      if (ro) ro.disconnect();
      window.removeEventListener('resize', updateCanvasDimensions);
    };
  }, [updateCanvasDimensions]);

  // Load MediaPipe Hands script dynamically if missing
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

  // Start Camera Stream via getUserMedia (Runs on mount or retry)
  const startCamera = async () => {
    setLoading(true);
    setErrorMessage(null);

    try {
      const mpReady = await ensureMediaPipeLoaded();
      if (!mpReady) {
        throw new Error('Не удалось загрузить MediaPipe Hands. Проверьте соединение.');
      }

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'user',
            width: { ideal: 1280 },
            height: { ideal: 720 },
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
        updateCanvasDimensions();
      }

      // Initialize Primary Detector: MediaPipe Hands
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

        const { result, errors, correction } = detectorRef.current.analyze(
          rawLandmarks,
          latestFaceLandmarksRef.current,
          isMirroredRef.current
        );

        onHandUpdateRef.current(result, errors, correction);
        drawOverlay(result.landmarks, result, latestFaceLandmarksRef.current);

        // Guarantees isProcessingHandsRef is freed immediately upon frame completion
        isProcessingHandsRef.current = false;
      });

      handsInstanceRef.current = hands;

      // Initialize Secondary Detector: MediaPipe FaceLandmarker with matching 1.0.1 wasm
      (async () => {
        try {
          const filesetResolver = await FilesetResolver.forVisionTasks(
            'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm'
          );

          let landmarker: FaceLandmarker;
          try {
            landmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
              baseOptions: {
                modelAssetPath:
                  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
                delegate: 'GPU',
              },
              runningMode: 'VIDEO',
              numFaces: 1,
            });
          } catch {
            // Automatic fallback to CPU delegate if GPU is not available
            landmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
              baseOptions: {
                modelAssetPath:
                  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
                delegate: 'CPU',
              },
              runningMode: 'VIDEO',
              numFaces: 1,
            });
          }
          faceLandmarkerRef.current = landmarker;
        } catch (err) {
          console.warn('FaceLandmarker optional loading failed, running with Hands only:', err);
        }
      })();

      // Unified, Non-Blocking Frame Loop
      const processFrame = async () => {
        const now = performance.now();

        if (videoRef.current && videoRef.current.readyState >= 2) {
          // Watchdog: If Hands processing hung for > 400ms, force reset lock
          if (isProcessingHandsRef.current && now - lastHandSendTimeRef.current > 400) {
            isProcessingHandsRef.current = false;
          }

          // 1. Hands: Process on every available animation frame
          if (!isProcessingHandsRef.current && handsInstanceRef.current) {
            isProcessingHandsRef.current = true;
            lastHandSendTimeRef.current = now;
            try {
              await (handsInstanceRef.current as { send: (input: { image: HTMLVideoElement }) => Promise<void> }).send({
                image: videoRef.current,
              });
            } catch {
              // Ignore frame errors
            } finally {
              isProcessingHandsRef.current = false;
            }
          }

          // 2. Face: Secondary throttled detection (10–12 times per second, ~85ms)
          if (
            faceLandmarkerRef.current &&
            !isProcessingFaceRef.current &&
            now - lastFaceDetectionTimeRef.current >= 85
          ) {
            isProcessingFaceRef.current = true;
            lastFaceDetectionTimeRef.current = now;
            try {
              const timestamp = Math.max(Math.round(now), lastFaceTimestampRef.current + 1);
              lastFaceTimestampRef.current = timestamp;
              const faceResult = faceLandmarkerRef.current.detectForVideo(videoRef.current, timestamp);
              if (faceResult.faceLandmarks && faceResult.faceLandmarks.length > 0) {
                latestFaceLandmarksRef.current = faceResult.faceLandmarks[0] as unknown as Landmark[];
              } else {
                latestFaceLandmarksRef.current = null;
              }
            } catch {
              // Face error NEVER locks or disrupts Hands
            } finally {
              isProcessingFaceRef.current = false;
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
      if (faceLandmarkerRef.current) {
        try {
          faceLandmarkerRef.current.close();
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

    let isShiftDown = false;
    let isCtrlDown = false;
    let isMouthSimOpen = false;

    let lastX = 0.5;
    let lastY = 0.5;

    const emitUpdate = (x: number, y: number, triggerOneShot: boolean = false) => {
      onHandUpdateRef.current(
        {
          detected: true,
          landmarks: null,
          cursor: { x, y },
          gesture: isCtrlDown ? 'POWER_FIST' : isShiftDown ? 'SHIELD_PALM' : isMouthSimOpen ? 'MOUTH_SHOOT' : 'AIMING',
          pinchDistance: 1.0,
          isOpenPalm: isShiftDown,
          isFist: isCtrlDown,
          isAiming: !isShiftDown && !isCtrlDown,
          isPinch: false,
          openFingersCount: isShiftDown ? 5 : isCtrlDown ? 0 : 1,
          indexFingerStraightness: 1.0,
          confidence: 1.0,
          isMouthOpen: isMouthSimOpen,
          mouthRatio: isMouthSimOpen ? 0.25 : 0.02,
          triggerShoot: triggerOneShot,
        },
        [],
        null
      );
    };

    const handleMouseMove = (e: MouseEvent) => {
      lastX = e.clientX / window.innerWidth;
      lastY = e.clientY / window.innerHeight;
      emitUpdate(lastX, lastY, false);
    };

    const handleMouseDown = (e: MouseEvent) => {
      if (e.button === 0) {
        isMouthSimOpen = true;
        emitUpdate(lastX, lastY, true);
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (e.button === 0) {
        isMouthSimOpen = false;
        emitUpdate(lastX, lastY, false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        isShiftDown = true;
        emitUpdate(lastX, lastY, false);
      }
      if (e.key === 'Control' || e.key === 'Alt') {
        isCtrlDown = true;
        emitUpdate(lastX, lastY, false);
      }
      if (e.code === 'Space' && !isMouthSimOpen) {
        isMouthSimOpen = true;
        emitUpdate(lastX, lastY, true);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        isShiftDown = false;
        emitUpdate(lastX, lastY, false);
      }
      if (e.key === 'Control' || e.key === 'Alt') {
        isCtrlDown = false;
        emitUpdate(lastX, lastY, false);
      }
      if (e.code === 'Space') {
        isMouthSimOpen = false;
        emitUpdate(lastX, lastY, false);
      }
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

  const drawOverlay = (
    landmarks: Landmark[] | null,
    result: HandDetectionResult,
    faceLandmarks: Landmark[] | null
  ) => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!showSkeleton) return;

    const containerW = canvas.width;
    const containerH = canvas.height;

    // Do not draw until video intrinsic dimensions are ready
    if (!video || !video.videoWidth || !video.videoHeight || containerW <= 0 || containerH <= 0) {
      return;
    }

    const videoW = video.videoWidth;
    const videoH = video.videoHeight;
    const { scale, offsetX, offsetY } = computeCoverTransform(videoW, videoH, containerW, containerH);

    const toScreenX = (normX: number) => normX * videoW * scale + offsetX;
    const toScreenY = (normY: number) => normY * videoH * scale + offsetY;

    // Draw Mouth indicator on face if available
    if (faceLandmarks && faceLandmarks.length >= 292) {
      const upperLip = faceLandmarks[13];
      const lowerLip = faceLandmarks[14];
      const leftCorner = faceLandmarks[61];
      const rightCorner = faceLandmarks[291];

      // Mirror face X if camera preview is mirrored
      const rawLeftX = isMirroredRef.current ? 1.0 - leftCorner.x : leftCorner.x;
      const rawRightX = isMirroredRef.current ? 1.0 - rightCorner.x : rightCorner.x;
      const rawCenterX = (rawLeftX + rawRightX) / 2;
      const rawCenterY = (upperLip.y + lowerLip.y) / 2;

      const mx = toScreenX(rawCenterX);
      const my = toScreenY(rawCenterY);

      const rawMouthWidth = Math.hypot(leftCorner.x - rightCorner.x, leftCorner.y - rightCorner.y);
      const rawMouthHeight = Math.hypot(upperLip.x - lowerLip.x, upperLip.y - lowerLip.y);
      const mouthWidth = rawMouthWidth * videoW * scale;
      const mouthHeight = rawMouthHeight * videoH * scale;

      ctx.save();
      ctx.beginPath();
      ctx.ellipse(mx, my, Math.max(8, mouthWidth / 2), Math.max(4, mouthHeight / 2), 0, 0, Math.PI * 2);
      ctx.strokeStyle = result.isMouthOpen ? '#ec4899' : '#06b6d4';
      ctx.lineWidth = result.isMouthOpen ? 2.5 : 1.5;
      ctx.shadowColor = result.isMouthOpen ? '#ec4899' : '#06b6d4';
      ctx.shadowBlur = result.isMouthOpen ? 12 : 4;
      ctx.fillStyle = result.isMouthOpen ? 'rgba(236, 72, 153, 0.3)' : 'rgba(6, 182, 212, 0.1)';
      ctx.fill();
      ctx.stroke();

      if (result.isMouthOpen) {
        ctx.font = 'bold 9px Orbitron, sans-serif';
        ctx.fillStyle = '#f472b6';
        ctx.textAlign = 'center';
        ctx.fillText('MOUTH OPEN 😮', mx, my - Math.max(4, mouthHeight / 2) - 6);
      }
      ctx.restore();
    }

    if (!landmarks) return;

    let strokeColor = '#06b6d4';
    let jointColor = '#22d3ee';
    if (result.gesture === 'MOUTH_SHOOT' || result.isMouthOpen) {
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
      ctx.moveTo(toScreenX(p1.x), toScreenY(p1.y));
      ctx.lineTo(toScreenX(p2.x), toScreenY(p2.y));
      ctx.stroke();
    });

    landmarks.forEach((p, idx) => {
      const px = toScreenX(p.x);
      const py = toScreenY(p.y);
      ctx.beginPath();
      if (idx === 8) {
        ctx.arc(px, py, 6, 0, 2 * Math.PI);
        ctx.fillStyle = '#06b6d4';
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
      ref={containerRef}
      className={`relative overflow-hidden rounded-xl border border-cyan-500/30 bg-slate-900/90 shadow-2xl backdrop-blur-md transition-all ${
        compact ? 'w-64 h-48 md:w-80 md:h-60' : 'w-full h-full'
      }`}
    >
      <video
        ref={videoRef}
        onLoadedMetadata={updateCanvasDimensions}
        autoPlay
        playsInline
        muted
        className={`w-full h-full object-cover ${isMirrored ? 'scale-x-[-1]' : ''}`}
      />

      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none"
      />

      {loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/85 text-cyan-400 p-3 text-center z-20">
          <RefreshCw className="w-7 h-7 animate-spin mb-2 text-cyan-400" />
          <p className="font-cyber text-xs font-semibold tracking-wider uppercase">Запуск камеры и нейросети...</p>
          <p className="text-[10px] text-slate-400 mt-0.5">MediaPipe Hands Active</p>
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
        <span className="font-mono text-cyan-400 font-semibold uppercase">Hands + Face Vision</span>
      </div>
    </div>
  );
};
