# Assets — Маленький город чудес

<!-- Phase 5 (references/assets.md). -->

## Inventory
<!-- one line per asset card (references/assets.md): name · category · style · budget · source · status -->
| asset | category | style | budget | source | status |
|---|---|---|---|---|---|

## Strategy by category
| category | source (pack / Blender / procedural / generation / user) | why | status |
|---|---|---|---|
| <category> | <source> | <why> | plan |

## Conventions
<units, up axis, pivot, naming, formats, textures, poly count, collisions, import>

## Requests to the user
- none

## License registry
| asset / pack | source (URL) | license | author | path | attribution |
|---|---|---|---|---|---|

## Реестр сторонних ресурсов (обновлено 2026-11-14)
| ресурс | откуда | лицензия | где используется |
|---|---|---|---|
| Картинки героев, предметов, мебели, питомцев, фонов | сделаны пользователем через GPT по эталонным листам проекта | принадлежат пользователю; условия сервиса генерации проверяет пользователь | public/assets/{chars,items,furn,pets,rooms} |
| Голос реплик (12 mp3) | синтез Piper 1.8 (MIT), модель ru_RU-irina-medium (huggingface.co/rhasspy/piper-voices) | у набора данных модели лицензия «Unknown» (основа — голос RHVoice) — годится для домашнего использования, **перед любым распространением заменить** своими записями с теми же именами файлов | public/assets/voice |
| PixiJS 8 | npm | MIT | движок сцены |
| Музыка и звуки | синтезируются кодом (Web Audio) | свои | src/audio/audio.ts |
| public/assets/voice/girl, boy | 24 реплики, сгенерированы пользователем в ElevenLabs | права по тарифу пользователя |
| public/assets/map/town-front.webp, town-back.webp | рисунки планеты от пользователя (world-map-v2-front/back.png) | авторские, от пользователя |
| public/assets/rooms/{park,park_games,cafe,cafe_bakery,toys,toys_workshop,beach,beach_boats,club}.webp | фоны локаций от пользователя | авторские, от пользователя |
| public/assets/furn/carousel.png, djconsole.png | реквизит от пользователя (prop-carousel, prop-dj-console) | авторские, от пользователя |
| public/assets/music/town.mp3 (Wandering the Clay Path), club.mp3 (The Toybox Groove) | музыка от пользователя | права у пользователя; источник и лицензию не проверял |
