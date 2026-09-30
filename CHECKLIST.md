# 📋 PewPew Aim — Production & Hackathon Submission Checklist

Данный документ фиксирует статус проверки продакшн-готовности проекта перед сдачей на **Admit Hackathon** (Кейс «Motion: Камера вместо джойстика»).

---

## 1. 🚀 Production Build & Deployment

| Критерий | Конфигурация | Статус | Примечание |
|---|---|---|---|
| **Build Command** | `npm install && npm run build` (`tsc && vite build`) | ✅ PASS | 0 ошибок TypeScript, чистый бандл |
| **Output Directory** | `./dist` | ✅ PASS | Статические ассеты корректно генерируются Vite |
| **SPA Client Routing** | `rewrite: /* -> /index.html` | ✅ PASS | Сконфигурировано в `render.yaml` |
| **Permissions-Policy** | `camera=(self)` | ✅ PASS | Заголовок разрешает доступ к камере на HTTPS-домене |
| **HTTPS Security** | HTTPS обязателен для `getUserMedia` | ✅ PASS | Продакшн развёрнут с действующим SSL-сертификатом |
| **PWA & UI Chrome** | `<meta name="theme-color" content="#020617">` + `color-scheme: dark;` | ✅ PASS | Нет белых полос системного браузера при светлой теме ОС |

---

## 2. 🤖 Computer Vision & ML Pipeline Reliability

| Компонент | Спецификация | Поведение при сбое / Fallback | Статус |
|---|---|---|---|
| **MediaPipe Hands** | CDN JS/WASM (`@mediapipe/hands@0.4.1675469240`) | Динамическая загрузка скрипта через `ensureMediaPipeLoaded` с промисом | ✅ PASS |
| **Адаптивная модель** | `modelComplexity: 0` для mobile / `1` для desktop | Автоопределение по touch-pointer (`(pointer: coarse)`) или ширине `< 768px` | ✅ PASS |
| **MediaPipe FaceLandmarker** | `@mediapipe/tasks-vision@0.10.14` + `face_landmarker.task` | **Двухуровневый fallback:** `GPU delegate` → при сбое `CPU delegate` → при недоступности работа только на жестах руки | ✅ PASS |
| **Дросселирование лица** | Частота ~10–12 кадров/сек (`>= 85ms` интервал) | Исключает перегрузку потока при одновременной работе руки и лица | ✅ PASS |
| **Watchdog трекинга** | Таймаут 6000 мс после активации камеры | Если `hands.onResults` ни разу не сработал — отображается баннер с рекомендацией Chrome/Safari и кнопкой «Обновить» | ✅ PASS |
| **Отказ в доступе к камере** | `NotAllowedError` / отсутствие веб-камеры | Дружелюбный экран с предложением включить «Виртуальный режим (Мышь)» | ✅ PASS |

---

## 3. 🎯 Механика, Твист и UX для жюри

| Элемент | Реализация | Статус |
|---|---|---|
| **4 жеста управления** | 👉 Pointing (прицел), 😮 Open Mouth (выстрел), 🖐️ Palm (щит), ✊ Fist (EMP очистка) | ✅ PASS |
| **Обязательный твист: Режим «Ошибка»** | 5 типов нарушений биомеханики в реальном времени с начислением бонусных очков за исправление | ✅ PASS |
| **Твист-отчёт в GameOver** | Подробный журнал: сколько случаев зафиксировано, сколько исправлено (с бонусами) и сколько осталось неисправлено | ✅ PASS |
| **Быстрый Onboarding** | Автоматический компактный оверлей на 4 карточки при первом входе (`pewpew_onboarded`), закрывается в 1 клик | ✅ PASS |
| **Секция «Архитектура»** | Интерактивная вкладка в `TutorialModal` + быстрая кнопка в главном меню для жюри | ✅ PASS |
| **Локальный зал славы** | Сохранение рекордов в `localStorage` с фильтрацией топ-10 результатов | ✅ PASS |

---

## 4. 💻 Матрица тестирования окружений

* **Chrome Desktop (macOS / Windows / Linux):** Все жесты, GPU delegate для Face, 60 FPS Canvas — работает штатно.
* **Safari Desktop (macOS):** Трекинг руки и лица через WebGL/CPU fallback — работает штатно.
* **Firefox Desktop:** WebGL контекст и Hands — работает штатно.
* **Mobile Chrome / Safari (iOS / Android):** Активация `modelComplexity: 0`, стабильный FPS без перегрева устройства.
* **Машины без аппаратного WebGL (виртуальные машины / старые чипы):** Срабатывание `catch (gpuErr) -> CPU delegate` без падения интерфейса.

---

## 5. ⚠️ Риски и рекомендации пользователям

1. **Встроенные браузеры мессенджеров (Telegram / WhatsApp / Instagram In-App Browser):**
   * *Риск:* Некоторые встроенные webview блокируют `getUserMedia` или WASM memory allocation.
   * *Решение в коде:* Watchdog-баннер через 6 секунд подсказывает открыть сайт напрямую в Chrome или Safari.
2. **Освещение и дистанция:**
   * *Рекомендация:* Рекомендуемое расстояние от камеры: 40–90 см, ладонь и лицо должны быть хорошо освещены.
