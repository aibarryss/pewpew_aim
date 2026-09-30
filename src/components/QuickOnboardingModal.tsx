import React from 'react';
import { Crosshair, Sparkles, Shield, Zap, X, Play } from 'lucide-react';

interface QuickOnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStartGame: () => void;
}

export const QuickOnboardingModal: React.FC<QuickOnboardingModalProps> = ({
  isOpen,
  onClose,
  onStartGame,
}) => {
  if (!isOpen) return null;

  const handleStart = () => {
    onClose();
    onStartGame();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-xl rounded-2xl bg-slate-900/95 border border-cyan-500/40 p-5 md:p-6 shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Glow Accent */}
        <div className="absolute top-0 left-1/4 right-1/4 h-[2px] bg-gradient-to-r from-transparent via-cyan-400 to-transparent" />

        {/* Header with Close Button */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div>
            <span className="text-[10px] font-cyber text-cyan-400 font-bold uppercase tracking-widest block">
              Быстрый старт · 10 секунд
            </span>
            <h3 className="font-display text-xl md:text-2xl font-black text-white mt-0.5">
              4 ЖЕСТА УПРАВЛЕНИЯ
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            title="Закрыть"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 4 Compact Gesture Cards */}
        <div className="grid grid-cols-2 gap-2.5 my-4">
          <div className="p-3 rounded-xl bg-slate-950/70 border border-cyan-500/30">
            <div className="flex items-center gap-2 text-cyan-400 font-cyber font-bold text-xs uppercase">
              <Crosshair className="w-4 h-4 shrink-0" />
              <span>1. Прицел</span>
            </div>
            <p className="text-slate-300 text-xs mt-1 leading-snug">
              Вытяни указательный палец — наводи лазерный луч на дронов.
            </p>
          </div>

          <div className="p-3 rounded-xl bg-slate-950/70 border border-pink-500/30">
            <div className="flex items-center gap-2 text-pink-400 font-cyber font-bold text-xs uppercase">
              <Sparkles className="w-4 h-4 shrink-0" />
              <span>2. Выстрел</span>
            </div>
            <p className="text-slate-300 text-xs mt-1 leading-snug">
              Открой рот — мгновенный лазерный выстрел в точку прицела.
            </p>
          </div>

          <div className="p-3 rounded-xl bg-slate-950/70 border border-emerald-500/30">
            <div className="flex items-center gap-2 text-emerald-400 font-cyber font-bold text-xs uppercase">
              <Shield className="w-4 h-4 shrink-0" />
              <span>3. Силовой щит</span>
            </div>
            <p className="text-slate-300 text-xs mt-1 leading-snug">
              Раскрой всю ладонь (5 пальцев) — отражает вражеские пули.
            </p>
          </div>

          <div className="p-3 rounded-xl bg-slate-950/70 border border-amber-500/30">
            <div className="flex items-center gap-2 text-amber-400 font-cyber font-bold text-xs uppercase">
              <Zap className="w-4 h-4 shrink-0" />
              <span>4. EMP Взрыв</span>
            </div>
            <p className="text-slate-300 text-xs mt-1 leading-snug">
              Сожми кулак и удерживай — ударная волна очистит экран.
            </p>
          </div>
        </div>

        {/* Twist Hint */}
        <div className="px-3 py-2 rounded-xl bg-cyan-950/40 border border-cyan-500/20 text-[11px] font-cyber text-cyan-200/90 leading-tight mb-4 flex items-start gap-2">
          <span className="text-sm shrink-0">💡</span>
          <span>
            <strong>Твист «Режим Ошибка»:</strong> Держи палец прямо и открывай рот увереннее.
            Система распознает неточности позы и начисляет бонусные очки за исправления!
          </span>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-cyber font-bold text-xs uppercase tracking-wider transition-colors text-center"
          >
            Понятно
          </button>
          <button
            onClick={handleStart}
            className="flex-[1.5] py-2.5 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-red-700 hover:from-cyan-400 hover:to-blue-500 text-white font-display font-black text-xs uppercase tracking-wider transition-all shadow-lg shadow-gray-600/30 flex items-center justify-center gap-1.5"
          >
            <Play className="w-4 h-4" /> В бой!
          </button>
        </div>
      </div>
    </div>
  );
};
