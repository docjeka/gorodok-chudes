# Стек — 2026-11-14
Источники: ТЗ пользователя (раздел 2), установленный пакет pixi.js (node_modules, типы — источник правды по API), ответ пользователя.
- Платформа задана ТЗ: PWA для iPad Safari и Android Chrome, офлайн.
- Движок: пользователь выбрал PixiJS 8 (альтернатива SVG+DOM отклонена).
- Следствия: SVG-иллюстрации растеризуются в canvas → Texture; свой hit-test по альфа-маске; HTML-панели поверх canvas.
- Сборка: Vite 6, тесты Vitest, e2e Playwright + Chrome for Testing (WebGL через SwiftShader — это эмуляция, не iPad).
