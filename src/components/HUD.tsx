import React from 'react';
import {
  Shield,
  Crosshair,
  Zap,
  Volume2,
  VolumeX,
  RotateCcw,
  HelpCircle,
  Flame,
  Heart,
  Clock,
} from 'lucide-react';
import { GameStats, HandDetectionResult, GameMode } from '../types/game';

interface HUDProps {
  stats: GameStats;
  handResult: HandDetectionResult;
  timeLeft: number;
  gameMode: GameMode;
  isMuted: boolean;
  onToggleMute: () => void;
  onOpenTutorial: () => void;
  onRestart: () => void;
}

export const HUD: React.FC<HUDProps> = ({
  stats,
  handResult,
  timeLeft,
  gameMode,
  isMuted,
  onToggleMute,
  onOpenTutorial,
  onRestart,
}) => {
  const getGestureBadge = () => {
    if (!handResult.detected) {
      return {
        label: 'ПОИСК РУКИ...',
        color: 'border-slate-700 bg-slate-900/80 text-slate-400',
        icon: Crosshair,
      };
    }

    switch (handResult.gesture) {
      case 'PINCH_SHOOT':
        return {
          label: '💥 ВЫСТРЕЛ (TRIGGER)',
          color: 'border-pink-500 bg-pink-950/80 text-pink-300 glow-magenta animate-pulse',
          icon: Crosshair,
        };
      case 'SHIELD_PALM':
        return {
          label: '🛡️ СИЛОВОЙ ЩИТ',
          color: 'border-emerald-500 bg-emerald-950/80 text-emerald-300 glow-emerald',
          icon: Shield,
        };
      case 'POWER_FIST':
        return {
          label: '⚡ EMP ЗАРЯД (КУЛАК)',
          color: 'border-amber-500 bg-amber-950/80 text-amber-300 glow-amber',
          icon: Zap,
        };
      case 'PEACE_SIGN':
        return {
          label: '✌️ МНОЖИТЕЛЬ ОЧКОВ',
          color: 'border-purple-500 bg-purple-950/80 text-purple-300',
          icon: Flame,
        };
      case 'AIMING':
        return {
          label: '🎯 ПРИЦЕЛИВАНИЕ',
          color: 'border-cyan-500 bg-cyan-950/80 text-cyan-300 glow-cyan',
          icon: Crosshair,
        };
      default:
        return {
          label: '🖐️ РУКА ГОТОВА',
          color: 'border-cyan-500/40 bg-slate-900/80 text-cyan-200',
          icon: Crosshair,
        };
    }
  };

  const badge = getGestureBadge();
  const IconComponent = badge.icon;

  return (
    <header className="absolute top-0 left-0 right-0 p-4 md:p-6 pointer-events-none z-20">
      <div className="max-w-7xl mx-auto flex items-start justify-between gap-4">
        {/* Left: Score & Combo */}
        <div className="flex flex-col gap-2">
          <div className="px-4 py-2.5 rounded-xl bg-slate-900/90 border border-cyan-500/40 backdrop-blur-md shadow-2xl flex items-center gap-4">
            <div>
              <span className="text-[10px] font-cyber text-cyan-400 font-bold uppercase tracking-widest block">
                Счёт Очков
              </span>
              <span className="font-display text-2xl md:text-3xl font-black text-cyan-100 text-glow-cyan">
                {stats.score.toLocaleString()}
              </span>
            </div>

            {/* Combo Multiplier */}
            {stats.currentCombo > 1 && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/20 border border-amber-500/50 text-amber-300 animate-bounce">
                <Flame className="w-4 h-4 text-amber-400" />
                <span className="font-display font-extrabold text-sm md:text-base">
                  x{stats.currentCombo} COMBO
                </span>
              </div>
            )}
          </div>

          {/* Quick Stat Pills */}
          <div className="flex items-center gap-2 text-xs font-cyber">
            <span className="px-2.5 py-1 rounded-md bg-slate-900/80 border border-slate-800 text-slate-300">
              Меткость: <strong className="text-cyan-400 font-mono">{stats.accuracy}%</strong>
            </span>
            <span className="px-2.5 py-1 rounded-md bg-slate-900/80 border border-slate-800 text-slate-300">
              Целей сбито: <strong className="text-emerald-400 font-mono">{stats.targetsDestroyed}</strong>
            </span>
          </div>
        </div>

        {/* Center: Active Gesture Badge & Mode & Timer */}
        <div className="flex flex-col items-center gap-2">
          {/* Active Gesture HUD Indicator */}
          <div
            className={`px-4 py-1.5 rounded-full border text-xs md:text-sm font-cyber font-bold tracking-wider backdrop-blur-md shadow-lg flex items-center gap-2 transition-all duration-200 ${badge.color}`}
          >
            <IconComponent className="w-4 h-4" />
            <span>{badge.label}</span>
          </div>

          {/* Round Timer & Health */}
          <div className="flex items-center gap-3 bg-slate-900/90 border border-slate-800 px-4 py-1.5 rounded-xl backdrop-blur-md">
            {/* Timer */}
            <div className="flex items-center gap-1.5 font-display text-sm md:text-base font-bold text-white">
              <Clock className="w-4 h-4 text-cyan-400" />
              <span className={timeLeft <= 10 ? 'text-rose-400 animate-pulse' : 'text-slate-100'}>
                {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}
              </span>
            </div>

            <div className="w-px h-4 bg-slate-700" />

            {/* Health Bar */}
            <div className="flex items-center gap-1.5">
              <Heart className="w-4 h-4 text-rose-500 fill-rose-500" />
              <div className="w-20 md:w-28 h-2.5 bg-slate-800 rounded-full overflow-hidden border border-slate-700">
                <div
                  className="h-full bg-gradient-to-r from-rose-600 to-emerald-400 transition-all duration-300"
                  style={{ width: `${(stats.health / stats.maxHealth) * 100}%` }}
                />
              </div>
            </div>

            <span className="text-[11px] font-cyber text-slate-400 uppercase tracking-wider hidden sm:inline">
              {gameMode === 'DRONE_DEFENSE' ? 'Дроны-атакующие' : 'Скоростной тир'}
            </span>
          </div>
        </div>

        {/* Right: Quick Action Controls */}
        <div className="flex items-center gap-2 pointer-events-auto">
          <button
            onClick={onToggleMute}
            className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-700 hover:border-cyan-400 text-slate-300 hover:text-cyan-300 backdrop-blur-md transition-all active:scale-95 shadow-lg"
            title={isMuted ? 'Включить звук' : 'Выключить звук'}
          >
            {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4 text-cyan-400" />}
          </button>

          <button
            onClick={onOpenTutorial}
            className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-700 hover:border-cyan-400 text-slate-300 hover:text-cyan-300 backdrop-blur-md transition-all active:scale-95 shadow-lg flex items-center gap-1.5 text-xs font-cyber font-semibold"
            title="Обучение жестам и калибровка"
          >
            <HelpCircle className="w-4 h-4 text-cyan-400" />
            <span className="hidden sm:inline">Жесты</span>
          </button>

          <button
            onClick={onRestart}
            className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-700 hover:border-rose-500 text-slate-300 hover:text-rose-400 backdrop-blur-md transition-all active:scale-95 shadow-lg"
            title="Перезапустить раунд"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
