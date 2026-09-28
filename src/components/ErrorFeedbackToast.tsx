import React, { useEffect, useState } from 'react';
import { AlertTriangle, Info, CheckCircle2, ChevronRight, Activity } from 'lucide-react';
import { GestureErrorFeedback } from '../types/game';

interface ErrorFeedbackToastProps {
  currentErrors: GestureErrorFeedback[];
  totalErrorsCount: number;
  totalCorrectedCount: number;
}

export const ErrorFeedbackToast: React.FC<ErrorFeedbackToastProps> = ({
  currentErrors,
  totalErrorsCount,
  totalCorrectedCount,
}) => {
  const [activeError, setActiveError] = useState<GestureErrorFeedback | null>(null);
  const [showResolved, setShowResolved] = useState<boolean>(false);

  useEffect(() => {
    if (currentErrors.length > 0) {
      setActiveError(currentErrors[0]);
      setShowResolved(false);
    } else if (activeError && !showResolved) {
      // Transition to resolved indicator briefly
      setShowResolved(true);
      const timer = setTimeout(() => {
        setActiveError(null);
        setShowResolved(false);
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [currentErrors, activeError, showResolved]);

  return (
    <div className="flex flex-col gap-2 max-w-sm pointer-events-none select-none">
      {/* Active Error / Hint Card */}
      {activeError && !showResolved && (
        <div
          className={`relative overflow-hidden rounded-xl border p-3.5 backdrop-blur-md shadow-2xl transition-all duration-300 animate-in fade-in slide-in-from-top-2 ${
            activeError.severity === 'error'
              ? 'bg-rose-950/80 border-rose-500/60 text-rose-100 shadow-rose-950/50'
              : activeError.severity === 'warning'
              ? 'bg-amber-950/80 border-amber-500/60 text-amber-100 shadow-amber-950/50'
              : 'bg-cyan-950/80 border-cyan-500/60 text-cyan-100 shadow-cyan-950/50'
          }`}
        >
          {/* Glowing indicator stripe */}
          <div
            className={`absolute top-0 left-0 bottom-0 w-1.5 ${
              activeError.severity === 'error'
                ? 'bg-rose-500'
                : activeError.severity === 'warning'
                ? 'bg-amber-400'
                : 'bg-cyan-400'
            }`}
          />

          <div className="flex items-start gap-2.5 pl-2">
            <div
              className={`p-1.5 rounded-lg shrink-0 ${
                activeError.severity === 'error'
                  ? 'bg-rose-500/20 text-rose-400'
                  : activeError.severity === 'warning'
                  ? 'bg-amber-400/20 text-amber-300'
                  : 'bg-cyan-400/20 text-cyan-300'
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
                <span className="font-cyber text-xs uppercase tracking-wider font-bold opacity-80 flex items-center gap-1">
                  <Activity className="w-3.5 h-3.5" /> Режим «Ошибка»: Коррекция жеста
                </span>
              </div>

              <h4 className="font-semibold text-sm mt-0.5 leading-tight">{activeError.message}</h4>

              <div className="mt-1.5 flex items-start gap-1 text-xs text-white/90 bg-black/40 rounded-lg p-2 border border-white/10">
                <ChevronRight className="w-3.5 h-3.5 shrink-0 text-emerald-400 mt-0.5" />
                <span>{activeError.suggestion}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Resolved Confirmation Notification */}
      {showResolved && (
        <div className="relative overflow-hidden rounded-xl border border-emerald-500/60 bg-emerald-950/80 p-3 text-emerald-100 backdrop-blur-md shadow-2xl animate-in fade-in zoom-in-95">
          <div className="flex items-center gap-2.5 pl-1">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <div>
              <p className="font-cyber text-xs uppercase tracking-wider font-bold text-emerald-300">
                Жест скорректирован!
              </p>
              <p className="text-xs text-emerald-100">Идеальное положение руки (+бонус точности)</p>
            </div>
          </div>
        </div>
      )}

      {/* Mini Stat Badge for Hackathon Jury */}
      <div className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-slate-900/80 border border-slate-800 text-[11px] font-cyber text-slate-300 backdrop-blur-sm shadow-md">
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
          AI Motion Assist Active
        </span>
        <span className="text-slate-400">
          Ошибок исправлено: <strong className="text-emerald-400">{totalCorrectedCount}</strong> / {totalErrorsCount}
        </span>
      </div>
    </div>
  );
};
