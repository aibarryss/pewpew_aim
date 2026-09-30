import React from 'react';
import { AlertTriangle, Info, CheckCircle2, ChevronRight, Activity, Sparkles } from 'lucide-react';
import { GestureErrorFeedback, GestureCorrectionEvent } from '../types/game';

interface ErrorFeedbackToastProps {
  currentErrors: GestureErrorFeedback[];
  lastCorrection: GestureCorrectionEvent | null;
  totalErrorsCount: number;
  totalCorrectedCount: number;
}

export const ErrorFeedbackToast: React.FC<ErrorFeedbackToastProps> = ({
  currentErrors,
  lastCorrection,
  totalErrorsCount,
  totalCorrectedCount,
}) => {
  const activeError = currentErrors.length > 0 ? currentErrors[0] : null;

  return (
    <div className="flex flex-col gap-2 max-w-sm pointer-events-none select-none">
      {/* 1. Active Error Hint Card */}
      {activeError && (
        <div
          className={`relative overflow-hidden rounded-xl border p-3.5 backdrop-blur-md shadow-2xl transition-all duration-300 animate-in fade-in slide-in-from-bottom-2 ${
            activeError.severity === 'error'
              ? 'bg-rose-950/90 border-rose-500/70 text-rose-100 shadow-rose-950/60'
              : 'bg-amber-950/90 border-amber-500/70 text-amber-100 shadow-amber-950/60'
          }`}
        >
          <div
            className={`absolute top-0 left-0 bottom-0 w-1.5 ${
              activeError.severity === 'error' ? 'bg-rose-500' : 'bg-amber-400'
            }`}
          />

          <div className="flex items-start gap-2.5 pl-2">
            <div
              className={`p-1.5 rounded-lg shrink-0 ${
                activeError.severity === 'error'
                  ? 'bg-rose-500/20 text-rose-400'
                  : 'bg-amber-400/20 text-amber-300'
              }`}
            >
              {activeError.severity === 'info' ? (
                <Info className="w-5 h-5" />
              ) : (
                <AlertTriangle className="w-5 h-5 animate-pulse" />
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="font-cyber text-xs uppercase tracking-wider font-bold opacity-85 flex items-center gap-1">
                  <Activity className="w-3.5 h-3.5" /> Режим «Ошибка» (Твист)
                </span>
              </div>

              <h4 className="font-semibold text-sm mt-0.5 leading-tight">{activeError.message}</h4>

              <div className="mt-1.5 flex items-start gap-1 text-xs text-white/95 bg-black/50 rounded-lg p-2 border border-white/15">
                <ChevronRight className="w-3.5 h-3.5 shrink-0 text-amber-400 mt-0.5" />
                <span>{activeError.suggestion}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. Resolved Real-time Event Toast (Shows exact reason fixed + score bonus) */}
      {lastCorrection && !activeError && (
        <div className="relative overflow-hidden rounded-xl border border-emerald-500/70 bg-emerald-950/90 p-3 text-emerald-100 backdrop-blur-md shadow-2xl animate-in fade-in zoom-in-95">
          <div className="flex items-center gap-2.5 pl-1">
            <div className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 shrink-0">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-cyber text-xs uppercase tracking-wider font-bold text-emerald-300">
                  Поза исправлена!
                </span>
                <span className="text-[10px] font-mono font-bold px-1.5 py-0.2 rounded bg-emerald-500/30 text-emerald-200">
                  +{lastCorrection.scoreBonus} PTS
                </span>
              </div>
              <p className="text-xs text-emerald-100 mt-0.5 font-medium flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-yellow-300 shrink-0" />
                {lastCorrection.resolvedMessage}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 3. Bottom Stats Badge for Hackathon Jury */}
      <div className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-slate-900/90 border border-slate-800 text-[11px] font-cyber text-slate-300 backdrop-blur-sm shadow-md">
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
          AI Gesture Monitor Active
        </span>
        <span className="text-slate-400">
          Исправлено случаев: <strong className="text-emerald-400 font-mono font-bold">{totalCorrectedCount}</strong> / {totalErrorsCount}
        </span>
      </div>
    </div>
  );
};
