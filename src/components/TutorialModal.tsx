import React, { useState } from 'react';
import {
  CheckCircle,
  Crosshair,
  Shield,
  Zap,
  Play,
  X,
  AlertTriangle,
  ArrowRight,
  Hand,
  Sparkles,
} from 'lucide-react';
import { HandDetectionResult } from '../types/game';

interface TutorialModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStartGame: () => void;
  handResult: HandDetectionResult;
}

export const TutorialModal: React.FC<TutorialModalProps> = ({
  isOpen,
  onClose,
  onStartGame,
  handResult,
}) => {
  const [activeTab, setActiveTab] = useState<'gestures' | 'twist' | 'rules'>('gestures');

  if (!isOpen) return null;

  const gestures = [
    {
      id: 'aim',
      name: ' Прицеливание (Laser Aim)',
      desc: 'Выпрями указательный палец вперед, направив его на экран. Кончик пальца перемещает неоновый лазерный прицел.',
      active: handResult.isAiming || handResult.gesture === 'AIMING',
      icon: Crosshair,
      color: 'text-cyan-400 border-cyan-500/40 bg-cyan-950/30',
      activeBadge: '✅ АКТИВНО: ПРИЦЕЛ АКТИВЕН',
    },
    {
      id: 'pinch',
      name: ' Выстрел (Pinch Trigger)',
      desc: 'Быстро сомкни кончик большого и указательного пальцев (жест щипка / спуска курка) — произойдет мгновенный лазерный выстрел.',
      active: handResult.gesture === 'PINCH_SHOOT' || handResult.isPinch,
      icon: Sparkles,
      color: 'text-pink-400 border-pink-500/40 bg-pink-950/30',
      activeBadge: '✅ АКТИВНО: ВЫСТРЕЛ!',
    },
    {
      id: 'shield',
      name: ' Силовой Щит (Open Palm)',
      desc: 'Раскрой всю ладонь всеми 5 пальцами к камере. Активируется силовой барьер, отражающий вражеские снаряды обратно в дронов.',
      active: handResult.isOpenPalm || handResult.gesture === 'SHIELD_PALM',
      icon: Shield,
      color: 'text-emerald-400 border-emerald-500/40 bg-emerald-950/30',
      activeBadge: '✅ АКТИВНО: ЩИТ ПОДНЯТ!',
    },
    {
      id: 'fist',
      name: ' EMP Взрыв / Очистка (Power Fist)',
      desc: 'Сожми ладонь в плотный кулак на 0.8 сек — вызовет импульсный EMP взрыв, уничтожающий всех врагов на экране.',
      active: handResult.isFist || handResult.gesture === 'POWER_FIST',
      icon: Zap,
      color: 'text-amber-400 border-amber-500/40 bg-amber-950/30',
      activeBadge: '✅ АКТИВНО: EMP ЗАРЯЖАЕТСЯ!',
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-3xl rounded-2xl bg-slate-900/95 border border-cyan-500/40 p-6 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Top Glow Accents */}
        <div className="absolute top-0 left-1/4 right-1/4 h-[2px] bg-gradient-to-r from-transparent via-cyan-400 to-transparent" />

        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-cyan-500/20 border border-cyan-500/40 text-cyan-400">
              <Hand className="w-6 h-6" />
            </div>
            <div>
              <h2 className="font-display text-xl font-bold text-white tracking-wide">
                Калибровка и Управление Жестами
              </h2>
              <p className="text-xs text-slate-400 font-cyber mt-0.5">
                Инструкция участника Admit Hackathon · Кейс «Motion: Камера вместо джойстика»
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 mt-4 border-b border-slate-800 pb-3">
          <button
            onClick={() => setActiveTab('gestures')}
            className={`px-3 py-1.5 rounded-lg text-xs font-cyber font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 ${
              activeTab === 'gestures'
                ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20'
                : 'text-slate-400 hover:text-cyan-300 hover:bg-slate-800/60'
            }`}
          >
            <Hand className="w-3.5 h-3.5" /> 4 Жеста управления
          </button>

          <button
            onClick={() => setActiveTab('twist')}
            className={`px-3 py-1.5 rounded-lg text-xs font-cyber font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 ${
              activeTab === 'twist'
                ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                : 'text-slate-400 hover:text-amber-300 hover:bg-slate-800/60'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" /> Твист: Режим «Ошибка»
          </button>

          <button
            onClick={() => setActiveTab('rules')}
            className={`px-3 py-1.5 rounded-lg text-xs font-cyber font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 ${
              activeTab === 'rules'
                ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                : 'text-slate-400 hover:text-emerald-300 hover:bg-slate-800/60'
            }`}
          >
            <Crosshair className="w-3.5 h-3.5" /> Правила и Мишени
          </button>
        </div>

        {/* Tab Contents */}
        <div className="flex-1 overflow-y-auto py-4 space-y-3 pr-1">
          {activeTab === 'gestures' && (
            <>
              <div className="p-3 rounded-xl bg-cyan-950/40 border border-cyan-500/30 text-xs text-cyan-200 flex items-center justify-between">
                <span>
                   <strong>Интерактивный тест:</strong> Покажите жест перед камерой прямо сейчас — блок подсветится зеленым!
                </span>
                <span className="font-mono font-bold text-cyan-400">
                  {handResult.detected ? 'Камера: Рука найдена' : 'Камера: Поднесите руку'}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {gestures.map((g) => {
                  const Icon = g.icon;
                  return (
                    <div
                      key={g.id}
                      className={`p-4 rounded-xl border transition-all duration-300 relative overflow-hidden ${
                        g.active
                          ? 'border-emerald-400 bg-emerald-950/40 shadow-lg shadow-emerald-950/50'
                          : g.color
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <Icon className={`w-5 h-5 ${g.active ? 'text-emerald-400' : ''}`} />
                          <h3 className="font-cyber font-bold text-sm text-white">{g.name}</h3>
                        </div>
                        {g.active && (
                          <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0 animate-pulse" />
                        )}
                      </div>

                      <p className="text-xs text-slate-300 mt-2 leading-relaxed">{g.desc}</p>

                      {g.active && (
                        <div className="mt-3 text-[11px] font-cyber font-bold text-emerald-300 bg-emerald-900/50 px-2 py-1 rounded border border-emerald-500/40 inline-block">
                          {g.activeBadge}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {activeTab === 'twist' && (
            <div className="space-y-3">
              <div className="p-4 rounded-xl bg-amber-950/30 border border-amber-500/40 text-amber-200">
                <div className="flex items-center gap-2 font-display text-sm font-bold text-amber-300">
                  <AlertTriangle className="w-5 h-5 text-amber-400" />
                  Как работает обязательный твист (Режим «Ошибка»):
                </div>
                <p className="text-xs text-slate-300 mt-2 leading-relaxed">
                  Приложение непрерывно вычисляет углы сочленений 21 точки руки. При неточных движениях система
                  не молчит, а даёт <strong>мгновенный точный совет</strong>, как скорректировать позу:
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800">
                  <span className="font-bold text-rose-400 block">⚠️ Изгиб указательного пальца</span>
                  <p className="text-slate-300 mt-1">
                    «Выпрями указательный палец жестче — палец согнут на 35°, лазерный прицел сбивается».
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800">
                  <span className="font-bold text-rose-400 block">⚠️ Неполное сжатие выстрела</span>
                  <p className="text-slate-300 mt-1">
                    «Соедини подушечки большого и указательного пальцев ближе (щелчок/щипок) для выстрела».
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800">
                  <span className="font-bold text-rose-400 block">⚠️ Неполный силовой щит</span>
                  <p className="text-slate-300 mt-1">
                    «Раскрой все 5 пальцев шире и направь ладонь в камеру, чтобы активировать барьер».
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800">
                  <span className="font-bold text-rose-400 block">⚠️ Рука у границы кадра / резкость</span>
                  <p className="text-slate-300 mt-1">
                    «Смести руку ближе к центру экрана / двигай рукой плавнее для стабильного захвата».
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'rules' && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-cyan-950/30 border border-cyan-500/30 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full border-2 border-cyan-400 bg-cyan-500/20 flex items-center justify-center font-bold text-cyan-300">
                    +100
                  </div>
                  <div>
                    <strong className="text-cyan-300 block">Стандартная мишень</strong>
                    <span className="text-slate-300">Обычный синий дрон, 1 попадание</span>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-pink-950/30 border border-pink-500/30 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-md border-2 border-pink-400 bg-pink-500/20 flex items-center justify-center font-bold text-pink-300">
                    +250
                  </div>
                  <div>
                    <strong className="text-pink-300 block">Скоростной дрон</strong>
                    <span className="text-slate-300">Быстро перемещается по диагонали</span>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-red-950/30 border border-red-500/30 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-md border-2 border-red-500 bg-red-500/20 flex items-center justify-center font-bold text-red-300">
                    +300
                  </div>
                  <div>
                    <strong className="text-red-300 block">Дрон-турель (Стрелок)</strong>
                    <span className="text-slate-300">Запускает огненные шары! Отражай их ЩИТОМ ✋</span>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-500/30 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full border-2 border-amber-400 bg-amber-500/20 flex items-center justify-center font-bold text-amber-300">
                    +500
                  </div>
                  <div>
                    <strong className="text-amber-300 block">Золотое яйцо</strong>
                    <span className="text-slate-300">Редкий бонус, мгновенный буст очков</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between border-t border-slate-800 pt-4 mt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-cyber text-slate-400 hover:text-white transition-colors"
          >
            Закрыть
          </button>

          <button
            onClick={() => {
              onClose();
              onStartGame();
            }}
            className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-display font-extrabold text-xs md:text-sm tracking-wider uppercase transition-all shadow-lg shadow-cyan-500/30 hover:scale-105 active:scale-95 flex items-center gap-2"
          >
            <Play className="w-4 h-4 fill-current" /> В бой! Начать игру
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
