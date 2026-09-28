import { useState, useEffect, useCallback } from 'react';
import {
  Crosshair,
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
  GameStats,
  GameMode,
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
  const [gameMode, setGameMode] = useState<GameMode>('DRONE_DEFENSE');
  const [stats, setStats] = useState<GameStats>(INITIAL_STATS);
  const [timeLeft, setTimeLeft] = useState<number>(60);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [showTutorial, setShowTutorial] = useState<boolean>(false);
  const [showSkeleton, setShowSkeleton] = useState<boolean>(true);
  const [isMirrored, setIsMirrored] = useState<boolean>(true);

  // Hand tracking state
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
    isPeace: false,
    indexFingerStraightness: 0,
    confidence: 0,
  });

  const [currentErrors, setCurrentErrors] = useState<GestureErrorFeedback[]>([]);
  const [totalErrorsCount, setTotalErrorsCount] = useState<number>(0);
  const [totalCorrectedCount, setTotalCorrectedCount] = useState<number>(0);

  // Hand update callback
  const handleHandUpdate = useCallback(
    (result: HandDetectionResult, errors: GestureErrorFeedback[]) => {
      setHandResult(result);
      setCurrentErrors(errors);

      if (errors.length > 0) {
        setTotalErrorsCount((prev) => prev + errors.length);
        soundManager.playErrorWarning();
      } else if (result.detected && result.isAiming) {
        setTotalCorrectedCount((prev) => prev + 1);
      }
    },
    []
  );

  // Start game round
  const startGame = (mode: GameMode = gameMode) => {
    setGameMode(mode);
    setStats({ ...INITIAL_STATS });
    setTimeLeft(mode === 'DRONE_DEFENSE' ? 60 : 45);
    setGameState('PLAYING');
    soundManager.playComboUp();
  };

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

  // Handle Game Over
  const handleGameOver = useCallback(() => {
    setGameState('GAMEOVER');
  }, []);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-slate-950 text-slate-100 cyber-grid select-none">
      {/* Background Ambience / Glows */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-pink-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Interactive Game Canvas */}
      <GameCanvas
        handResult={handResult}
        gameActive={gameState === 'PLAYING'}
        gameMode={gameMode}
        onStatsUpdate={setStats}
        onGameOver={handleGameOver}
      />

      {/* Main HUD overlay during game */}
      {gameState === 'PLAYING' && (
        <HUD
          stats={stats}
          handResult={handResult}
          timeLeft={timeLeft}
          gameMode={gameMode}
          isMuted={isMuted}
          onToggleMute={() => setIsMuted(soundManager.toggleMute())}
          onOpenTutorial={() => setShowTutorial(true)}
          onRestart={() => startGame(gameMode)}
        />
      )}

      {/* MAIN MENU */}
      {gameState === 'MENU' && (
        <div className="relative z-30 flex flex-col items-center justify-center h-full max-w-4xl mx-auto px-4 text-center">
          {/* Hackathon Badge */}
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-cyan-950/60 border border-cyan-500/40 text-cyan-300 text-xs font-cyber font-bold uppercase tracking-wider mb-4 animate-bounce">
            <Sparkles className="w-4 h-4 text-cyan-400" /> Admit Hackathon · Кейс «Motion: Камера вместо джойстика»
          </div>

          {/* Title */}
          <h1 className="font-display text-4xl sm:text-6xl md:text-7xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-teal-200 to-pink-500 tracking-wider">
            PEWPEW AIM FX
          </h1>
          <p className="font-cyber text-sm sm:text-lg text-slate-300 max-w-xl mt-2 leading-relaxed">
            Бесконтактный шутер с компьютерным зрением. Управляй прицелом кончиком пальца 👉, стреляй щипком 💥, выставляй силовой щит ладонью ✋.
          </p>

          {/* Key Gesture Badges */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 my-6 w-full max-w-2xl text-xs font-cyber">
            <div className="p-2.5 rounded-xl bg-slate-900/80 border border-cyan-500/30 text-cyan-300">
              <span className="block font-bold text-sm">🎯 👉 Point</span>
              <span className="text-slate-400 text-[11px]">Прицел кончиком пальца</span>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-900/80 border border-pink-500/30 text-pink-300">
              <span className="block font-bold text-sm">💥 👌 Pinch</span>
              <span className="text-slate-400 text-[11px]">Лазерный выстрел</span>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-900/80 border border-emerald-500/30 text-emerald-300">
              <span className="block font-bold text-sm">🛡️ ✋ Palm</span>
              <span className="text-slate-400 text-[11px]">Силовой щит от пуль</span>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-900/80 border border-amber-500/30 text-amber-300">
              <span className="block font-bold text-sm">⚡ ✊ Fist</span>
              <span className="text-slate-400 text-[11px]">EMP очистка экрана</span>
            </div>
          </div>

          {/* Mode Selection & Start Buttons */}
          <div className="flex flex-col sm:flex-row items-center gap-3 w-full max-w-md">
            <button
              onClick={() => startGame('DRONE_DEFENSE')}
              className="w-full sm:flex-1 py-3.5 px-6 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-display font-black text-sm uppercase tracking-wider transition-all shadow-xl shadow-cyan-500/30 hover:scale-105 active:scale-95 flex items-center justify-center gap-2"
            >
              <Shield className="w-5 h-5" /> Оборона от дронов
            </button>

            <button
              onClick={() => startGame('TARGET_RUSH')}
              className="w-full sm:flex-1 py-3.5 px-6 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-cyan-500/40 text-cyan-200 font-display font-bold text-sm uppercase tracking-wider transition-all hover:scale-105 active:scale-95 flex items-center justify-center gap-2"
            >
              <Crosshair className="w-5 h-5" /> Скоростной тир
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

      {/* Bottom Left Real-time Error Feedback Assist (Hackathon Twist) */}
      <div className="absolute bottom-4 left-4 z-40">
        <ErrorFeedbackToast
          currentErrors={currentErrors}
          totalErrorsCount={totalErrorsCount}
          totalCorrectedCount={totalCorrectedCount}
        />
      </div>

      {/* Interactive Calibration & Tutorial Modal */}
      <TutorialModal
        isOpen={showTutorial}
        onClose={() => setShowTutorial(false)}
        onStartGame={() => startGame(gameMode)}
        handResult={handResult}
      />

      {/* Game Over Results Modal */}
      <GameOverModal
        isOpen={gameState === 'GAMEOVER'}
        stats={stats}
        gameMode={gameMode}
        onRestart={() => startGame(gameMode)}
        onOpenTutorial={() => setShowTutorial(true)}
      />
    </div>
  );
}

export default App;
