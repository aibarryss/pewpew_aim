import React, { useState, useEffect } from 'react';
import confetti from 'canvas-confetti';
import {
  Trophy,
  RotateCcw,
  Activity,
  CheckCircle2,
} from 'lucide-react';
import { GameStats, GameMode, LeaderboardEntry } from '../types/game';

interface GameOverModalProps {
  isOpen: boolean;
  stats: GameStats;
  gameMode: GameMode;
  onRestart: () => void;
  onOpenTutorial: () => void;
}

const LEADERBOARD_STORAGE_KEY = 'pewpew_aim_leaderboard_v1';

export const GameOverModal: React.FC<GameOverModalProps> = ({
  isOpen,
  stats,
  gameMode,
  onRestart,
  onOpenTutorial,
}) => {
  const [playerName, setPlayerName] = useState<string>('');
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [saved, setSaved] = useState<boolean>(false);

  // Load leaderboard from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LEADERBOARD_STORAGE_KEY);
      if (raw) {
        setLeaderboard(JSON.parse(raw));
      } else {
        // Initial mock leaderboard for competition feel
        const defaults: LeaderboardEntry[] = [
          { id: '1', playerName: 'CyberSniper', score: 8400, mode: 'DRONE_DEFENSE', accuracy: 88, maxCombo: 14, date: '28.09' },
          { id: '2', playerName: 'AimGod_KZ', score: 6200, mode: 'TARGET_RUSH', accuracy: 82, maxCombo: 9, date: '28.09' },
          { id: '3', playerName: 'NeonHunter', score: 4950, mode: 'DRONE_DEFENSE', accuracy: 75, maxCombo: 7, date: '28.09' },
        ];
        setLeaderboard(defaults);
        localStorage.setItem(LEADERBOARD_STORAGE_KEY, JSON.stringify(defaults));
      }
    } catch {
      // fallback
    }
  }, []);

  // Trigger confetti on high performance
  useEffect(() => {
    if (isOpen) {
      setSaved(false);
      try {
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#06b6d4', '#ec4899', '#facc15', '#10b981'],
        });
      } catch {
        // ignore
      }
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Calculate Rank
  let rank = 'C';
  let rankColor = 'text-slate-400 border-slate-500';
  if (stats.score >= 6000 || (stats.score >= 4000 && stats.accuracy >= 80)) {
    rank = 'S';
    rankColor = 'text-yellow-400 border-yellow-400 glow-amber';
  } else if (stats.score >= 3500) {
    rank = 'A';
    rankColor = 'text-pink-400 border-pink-400 glow-magenta';
  } else if (stats.score >= 1800) {
    rank = 'B';
    rankColor = 'text-cyan-400 border-cyan-400 glow-cyan';
  }

  const handleSaveScore = (e: React.FormEvent) => {
    e.preventDefault();
    if (!playerName.trim() || saved) return;

    const newEntry: LeaderboardEntry = {
      id: Math.random().toString(36).substring(2, 9),
      playerName: playerName.trim(),
      score: stats.score,
      mode: gameMode,
      accuracy: stats.accuracy,
      maxCombo: stats.maxCombo,
      date: new Date().toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }),
    };

    const updated = [...leaderboard, newEntry].sort((a, b) => b.score - a.score).slice(0, 10);
    setLeaderboard(updated);
    try {
      localStorage.setItem(LEADERBOARD_STORAGE_KEY, JSON.stringify(updated));
    } catch {
      // ignore
    }
    setSaved(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-lg animate-in fade-in duration-300">
      <div className="relative w-full max-w-2xl rounded-2xl bg-slate-900/95 border border-cyan-500/50 p-6 md:p-8 shadow-2xl overflow-hidden max-h-[95vh] flex flex-col">
        {/* Glow Header */}
        <div className="text-center pb-4 border-b border-slate-800">
          <span className="text-xs font-cyber text-cyan-400 tracking-widest uppercase font-bold">
            Раунд Завершён · Admit Hackathon
          </span>
          <h2 className="font-display text-3xl md:text-4xl font-black text-white mt-1 tracking-wider">
            РЕЗУЛЬТАТЫ БОЯ
          </h2>
        </div>

        <div className="flex-1 overflow-y-auto py-4 space-y-4">
          {/* Main Score & Rank Card */}
          <div className="grid grid-cols-3 gap-3 items-center p-4 rounded-xl bg-slate-950/80 border border-slate-800">
            {/* Rank */}
            <div className="flex flex-col items-center justify-center border-r border-slate-800 pr-2">
              <span className="text-[10px] font-cyber text-slate-400 uppercase tracking-wider">Ранг</span>
              <div
                className={`w-14 h-14 rounded-full border-2 flex items-center justify-center font-display text-3xl font-black mt-1 ${rankColor}`}
              >
                {rank}
              </div>
            </div>

            {/* Score */}
            <div className="flex flex-col items-center justify-center col-span-2">
              <span className="text-xs font-cyber text-cyan-400 uppercase tracking-widest font-bold">
                Итоговый Счёт
              </span>
              <span className="font-display text-3xl md:text-4xl font-black text-cyan-200 text-glow-cyan">
                {stats.score.toLocaleString()}
              </span>
            </div>
          </div>

          {/* Stats Breakdown Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-center">
            <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
              <span className="text-[11px] font-cyber text-slate-400 uppercase block">Меткость</span>
              <span className="font-display text-xl font-bold text-cyan-400">{stats.accuracy}%</span>
            </div>

            <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
              <span className="text-[11px] font-cyber text-slate-400 uppercase block">Уничтожено</span>
              <span className="font-display text-xl font-bold text-pink-400">{stats.targetsDestroyed}</span>
            </div>

            <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
              <span className="text-[11px] font-cyber text-slate-400 uppercase block">Отражено щитом</span>
              <span className="font-display text-xl font-bold text-emerald-400">{stats.projectilesBlocked}</span>
            </div>

            <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
              <span className="text-[11px] font-cyber text-slate-400 uppercase block">Макс. комбо</span>
              <span className="font-display text-xl font-bold text-amber-400">x{stats.maxCombo}</span>
            </div>
          </div>

          {/* Error Mode Biometrics Report for Hackathon Twist */}
          <div className="p-3.5 rounded-xl bg-cyan-950/30 border border-cyan-500/30 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 text-cyan-300">
              <Activity className="w-4 h-4 text-cyan-400" />
              <span>
                <strong>Отчёт режима «Ошибка»:</strong> распознано и скорректировано отклонений позы
              </span>
            </div>
            <span className="font-mono font-bold text-emerald-400 text-sm">
              +{stats.errorsCorrected || stats.targetsDestroyed} исправлений
            </span>
          </div>

          {/* Save Record Input */}
          {!saved ? (
            <form onSubmit={handleSaveScore} className="flex gap-2">
              <input
                type="text"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder="Введи никнейм для таблицы рекордов..."
                maxLength={16}
                className="flex-1 px-4 py-2 rounded-xl bg-slate-950 border border-slate-700 text-sm text-white focus:outline-none focus:border-cyan-400 placeholder:text-slate-500"
              />
              <button
                type="submit"
                disabled={!playerName.trim()}
                className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-950 font-cyber font-bold text-xs uppercase tracking-wider transition-colors"
              >
                Сохранить
              </button>
            </form>
          ) : (
            <div className="p-2.5 rounded-xl bg-emerald-950/40 border border-emerald-500/30 text-xs text-emerald-300 flex items-center justify-center gap-1.5">
              <CheckCircle2 className="w-4 h-4" /> Результат добавлен в таблицу лидеров!
            </div>
          )}

          {/* Top Leaderboard */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px] font-cyber text-slate-400 uppercase tracking-wider px-2">
              <span className="flex items-center gap-1">
                <Trophy className="w-3.5 h-3.5 text-amber-400" /> Таблица рекордов
              </span>
              <span>Очки</span>
            </div>

            <div className="divide-y divide-slate-800/80 rounded-xl bg-slate-950/80 border border-slate-800 overflow-hidden">
              {leaderboard.slice(0, 4).map((entry, idx) => (
                <div key={entry.id} className="flex items-center justify-between px-3 py-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-slate-500 w-4">{idx + 1}.</span>
                    <span className="font-semibold text-slate-200">{entry.playerName}</span>
                    <span className="text-[10px] text-slate-500 font-cyber">({entry.accuracy}%)</span>
                  </div>
                  <span className="font-mono font-bold text-cyan-400">{entry.score.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between border-t border-slate-800 pt-4 mt-2 gap-3">
          <button
            onClick={onOpenTutorial}
            className="px-4 py-2.5 rounded-xl border border-slate-700 hover:border-slate-500 text-slate-300 text-xs font-cyber font-semibold uppercase tracking-wider transition-colors"
          >
            Инструкция жестов
          </button>

          <button
            onClick={onRestart}
            className="flex-1 px-6 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-display font-extrabold text-xs md:text-sm tracking-wider uppercase transition-all shadow-lg shadow-cyan-500/30 flex items-center justify-center gap-2 hover:scale-102 active:scale-98"
          >
            <RotateCcw className="w-4 h-4" /> Играть Снова
          </button>
        </div>
      </div>
    </div>
  );
};
