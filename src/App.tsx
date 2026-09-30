import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Shield,
  HelpCircle,
  Sparkles,
} from 'lucide-react';
import { WebcamView } from './components/WebcamView';
import { GameCanvas } from './components/GameCanvas';
import { HUD } from './components/HUD';
import { TutorialModal } from './components/TutorialModal';
import { GameOverModal } from './components/GameOverModal';
import { ErrorFeedbackToast } from './components/ErrorFeedbackToast';
import {
  HandDetectionResult,
  GestureErrorFeedback,
  GestureCorrectionEvent,
  GameStats,
  ErrorLogEntry,
} from './types/game';
import { soundManager } from './utils/audio';

const INITIAL_STATS: GameStats = {
  score: 0,
  shotsFired: 0,
  shotsHit: 0,
  accuracy: 100,
  targetsDestroyed: 0,
  projectilesBlocked: 0,
  bombHits: 0,
  maxCombo: 0,
  currentCombo: 0,
  errorsDetected: 0,
  errorsCorrected: 0,
  shieldActiveTime: 0,
  health: 100,
  maxHealth: 100,
};

export function App() {
  const [gameState, setGameState] = useState<'MENU' | 'PLAYING' | 'GAMEOVER'>('MENU');
  const [stats, setStats] = useState<GameStats>(INITIAL_STATS);
  const [timeLeft, setTimeLeft] = useState<number>(60);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [showTutorial, setShowTutorial] = useState<boolean>(false);
  const [showSkeleton, setShowSkeleton] = useState<boolean>(true);
  const [isMirrored, setIsMirrored] = useState<boolean>(true);

  // Hand & Face tracking state
  const [handResult, setHandResult] = useState<HandDetectionResult>({
    detected: false,
    landmarks: null,
    cursor: null,
    gesture: 'IDLE',
    pinchDistance: 1,
    isOpenPalm: false,
    isFist: false,
    isAiming: false,
    isPinch: false,
    openFingersCount: 0,
    indexFingerStraightness: 0,
    confidence: 0,
    isMouthOpen: false,
    mouthRatio: 0,
    triggerShoot: false,
  });

  const [currentErrors, setCurrentErrors] = useState<GestureErrorFeedback[]>([]);
  const [lastCorrection, setLastCorrection] = useState<GestureCorrectionEvent | null>(null);
  const [totalErrorsCount, setTotalErrorsCount] = useState<number>(0);
  const [totalCorrectedCount, setTotalCorrectedCount] = useState<number>(0);
  const [errorLog, setErrorLog] = useState<ErrorLogEntry[]>([]);

  const prevActiveErrorTypeRef = useRef<string | null>(null);

  // State-Machine Error & Correction Callback
  const handleHandUpdate = useCallback(
    (
      result: HandDetectionResult,
      errors: GestureErrorFeedback[],
      correction: GestureCorrectionEvent | null
    ) => {
      setHandResult(result);
      setCurrentErrors(errors);

      // 1. Error detection transition
      if (errors.length > 0) {
        const activeType = errors[0].type;
        if (prevActiveErrorTypeRef.current !== activeType) {
          prevActiveErrorTypeRef.current = activeType;
          setTotalErrorsCount((prev) => prev + 1);
          setErrorLog((prev) => [
            ...prev,
            {
              id: errors[0].id + '_' + Date.now(),
              type: errors[0].type,
              message: errors[0].message,
              detectedAt: Date.now(),
              resolved: false,
            },
          ]);
          setStats((prev) => ({
            ...prev,
            errorsDetected: prev.errorsDetected + 1,
          }));
          soundManager.playErrorWarning();
        }
      } else {
        prevActiveErrorTypeRef.current = null;
      }

      // 2. Correction resolution transition
      if (correction) {
        prevActiveErrorTypeRef.current = null;
        setLastCorrection(correction);
        setTotalCorrectedCount((prev) => prev + 1);
        setErrorLog((prev) => {
          const idx = prev.findIndex((e) => e.type === correction.type && !e.resolved);
          if (idx === -1) return prev;
          const updated = [...prev];
          updated[idx] = {
            ...updated[idx],
            resolved: true,
            resolvedMessage: correction.resolvedMessage,
            scoreBonus: correction.scoreBonus,
            resolvedAt: Date.now(),
          };
          return updated;
        });
        soundManager.playComboUp();

        setStats((prev) => ({
          ...prev,
          score: prev.score + correction.scoreBonus,
          errorsCorrected: prev.errorsCorrected + 1,
        }));

        setTimeout(() => {
          setLastCorrection((current) => (current?.id === correction.id ? null : current));
        }, 2500);
      }
    },
    []
  );

  // Start game round
  const startGame = () => {
    setStats({ ...INITIAL_STATS });
    setTimeLeft(60);
    setErrorLog([]);
    setGameState('PLAYING');
    soundManager.playComboUp();
  };

  const exitToMenu = () => setGameState('MENU');

  // Game timer countdown
  useEffect(() => {
    if (gameState !== 'PLAYING') return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setGameState('GAMEOVER');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [gameState]);

  useEffect(() => {
    if (gameState === 'PLAYING' && stats.health <= 0) {
      setGameState('GAMEOVER');
    }
  }, [gameState, stats.health]);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-slate-950 text-slate-100 cyber-grid select-none">
      {/* Background Ambience / Glows */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-pink-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Interactive Game Canvas */}
      <GameCanvas
        handResult={handResult}
        gameActive={gameState === 'PLAYING'}
        onStatsUpdate={setStats}
      />

      {/* Main HUD overlay during game */}
      {gameState === 'PLAYING' && (
        <HUD
          stats={stats}
          handResult={handResult}
          timeLeft={timeLeft}
          isMuted={isMuted}
          onToggleMute={() => setIsMuted(soundManager.toggleMute())}
          onOpenTutorial={() => setShowTutorial(true)}
          onRestart={() => startGame()}
          onExitToMenu={exitToMenu}
        />
      )}

      {/* MAIN MENU */}
      {gameState === 'MENU' && (
        <div className="relative z-30 flex flex-col items-center justify-center h-full max-w-4xl mx-auto px-4 text-center">
          {/* Hackathon Badge */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-cyan-950/60 border border-cyan-500/40 text-cyan-300 text-xs font-cyber font-bold uppercase tracking-wider mb-4 animate-float-smooth">
            <Sparkles className="w-4 h-4 text-cyan-400" /> Admit Hackathon · Кейс «Motion: Камера вместо джойстика»
          </div>

          {/* Title */}
          <h1 className="font-display text-4xl sm:text-6xl md:text-7xl font-black text-cyan-400 tracking-wider">
            PEWPEW AIM FX
          </h1>
          <p
            className="font-cyber text-sm sm:text-lg text-slate-300 max-w-xl mt-2 leading-relaxed"
            style={{ textShadow: '0 0 8px rgba(0, 255, 255, 0.5)' }}
          >
            Бесконтактный шутер с компьютерным зрением. Управляй прицелом кончиком пальца, стреляй открытием рта, выставляй силовой щит ладонью.
          </p>

          {/* Key Gesture Badges */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 my-6 w-full max-w-2xl text-xs font-cyber">
            <div className="p-2.5 rounded-xl bg-slate-900/80 border border-cyan-500/30 text-cyan-300">
              <span className="block font-bold text-sm">🎯 Point</span>
              <span className="text-slate-400 text-[11px]">Прицел указательным пальцем</span>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-900/80 border border-pink-500/30 text-pink-300">
              <span className="block font-bold text-sm">😮 Mouth</span>
              <span className="text-slate-400 text-[11px]">Лазерный выстрел (открой рот)</span>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-900/80 border border-emerald-500/30 text-emerald-300">
              <span className="block font-bold text-sm">🛡️ Palm</span>
              <span className="text-slate-400 text-[11px]">Силовой щит (5 пальцев)</span>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-900/80 border border-amber-500/30 text-amber-300">
              <span className="block font-bold text-sm">⚡ Fist</span>
              <span className="text-slate-400 text-[11px]">EMP взрыв (кулак)</span>
            </div>
          </div>

          {/* Start Game Button */}
          <div className="w-full max-w-sm mx-auto">
            <button
              onClick={() => startGame()}
              className="w-full py-3.5 px-6 rounded-xl bg-gradient-to-r from-blue-600 to-red-700 hover:from-cyan-400 hover:to-blue-500 text-white font-display font-black text-sm uppercase tracking-wider transition-all shadow-xl shadow-gray-600/30 hover:scale-105 active:scale-95 flex items-center justify-center gap-2"
            >
              <Shield className="w-5 h-5" /> В бой · Оборона от дронов
            </button>
          </div>

          {/* Secondary Actions */}
          <div className="flex items-center gap-4 mt-5">
            <button
              onClick={() => setShowTutorial(true)}
              className="text-xs font-cyber font-semibold text-slate-400 hover:text-cyan-300 flex items-center gap-1.5 transition-colors"
            >
              <HelpCircle className="w-4 h-4 text-cyan-400" /> Интерактивная калибровка и правила
            </button>
          </div>
        </div>
      )}

      {/* Bottom Right Floating Camera Widget */}
      <div className="absolute bottom-4 right-4 z-40">
        <WebcamView
          onHandUpdate={handleHandUpdate}
          showSkeleton={showSkeleton}
          isMirrored={isMirrored}
          onToggleMirror={() => setIsMirrored(!isMirrored)}
          onToggleSkeleton={() => setShowSkeleton(!showSkeleton)}
          compact={true}
        />
      </div>

      {/* Bottom Left Real-time Error Feedback Assist */}
      <div className="absolute bottom-4 left-4 z-40">
        <ErrorFeedbackToast
          currentErrors={currentErrors}
          lastCorrection={lastCorrection}
          totalErrorsCount={totalErrorsCount}
          totalCorrectedCount={totalCorrectedCount}
        />
      </div>

      {/* Interactive Calibration & Tutorial Modal */}
      <TutorialModal
        isOpen={showTutorial}
        onClose={() => setShowTutorial(false)}
        onStartGame={() => startGame()}
        handResult={handResult}
      />

      {/* Game Over Results Modal */}
      <GameOverModal
        isOpen={gameState === 'GAMEOVER'}
        stats={stats}
        errorLog={errorLog}
        onRestart={() => startGame()}
        onOpenTutorial={() => setShowTutorial(true)}
        onExitToMenu={exitToMenu}
      />
    </div>
  );
}

export default App;
