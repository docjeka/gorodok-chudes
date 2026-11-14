# Technology — Маленький город чудес

<!-- Phase 3 (references/stack.md). ENGINE — one of: godot, godot-mono, unity,
unreal, web, defold, bevy (read by studio.py and envcheck.py). DIMENSION — 2D or 3D
(2.5D with 3D models is 3D); envcheck.py recommends Blender for 3D. -->
ENGINE: web
ENGINE VERSION: PixiJS 8 + Vite 6 + TypeScript 5
DIMENSION: 2D
LANGUAGE: TypeScript
PLATFORMS: PWA: iPad Safari, Android Chrome

## Decision
- context: 2D кукольный домик для планшета, офлайн-PWA, графика создаётся кодом
- options: PixiJS — быстрый WebGL, но нужны растровые атласы и свой hit-test по пикселям; SVG+DOM — чёткость на любом DPR, слои героя как группы, hit-test верхнего видимого объекта даёт сам браузер, нет утечек текстур, но тяжелее при сотнях движущихся объектов; Godot/Unity web — тяжёлая загрузка, хуже как PWA
- choice and why: PixiJS 8 — выбор пользователя. Иллюстрации остаются оригинальными SVG-слоями, которые при запуске растеризуются в текстуры с LRU-кэшем; попадание пальцем считается по альфа-маске верхнего видимого спрайта; панели интерфейса — HTML/CSS
- consequences: все ассеты — функции, рисующие SVG → текстуры Pixi; кэш текстур ограничен; ограничение числа предметов в мире (260); Capacitor возможен позже

## Budgets
цель 60 fps, не ниже 30 на среднем планшете; сборка < 1 МБ; старт < 2 с

## Project structure
src/game (правила), src/content (каталоги), src/art (SVG), src/scene (рендер и ввод), src/ui, src/storage, src/i18n, src/audio, tests/unit, tests/e2e
