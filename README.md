# v7.0.16 — Unity player name

- Added `playerName` URL/bootstrap parameter.
- Unity-provided name pre-fills the existing editable result field.
- Local cached name is used only when Unity did not provide a name.
- Existing tutorial/layout code was not changed.

# Neon Lanes Kids Web v7.0.13 — Tutorial Overlay Fix

- Исправлен диагональный слой затемнения: псевдоэлемент туториала больше не наследует поворот декоративной ноты меню.
- Скрыт системный вертикальный scrollbar меню, при этом прокрутка на коротких экранах сохранена.

# Neon Lanes Kids Web v7.0.7 — Tutorial Interaction Fix

Исправления поверх v7.0.6:

- экран завершения трека: обучающий затемняющий слой теперь находится внутри `#gameover`; поле имени и кнопка «Сохранить» подняты над ним и остаются полностью интерактивными;
- первый шаг обучения в геймплее больше не использует несколько перекрывающихся spotlight-теней; вместо этого используется один общий вырез для двух дорожек, поэтому экран не становится почти чёрным;
- HUD (название трека, очки, выход) на первом шаге поднимается над затемнением целиком через родительский `#hud`;
- при скрытии обучения временный слой подсветки HUD корректно очищается.

# Neon Lanes Kids Web v7.0.5 — Full Guided Tutorial

- Real Play button is above the dim layer during menu onboarding.
- Added 6-step gameplay onboarding after Play.
- Gameplay pauses on a moving chip at lane midpoint, then teaches timing.
- First successful hit pauses the game and explains PERFECT / GOOD / OK scoring.
- Tutorial overlay is session-only; after the final step normal gameplay continues.
- Tutorial initialization is isolated so it cannot block track loading.

# Neon Lanes Kids Web v7.0.4 — Guided Tutorial Fix

Исправлена ошибка v7.0.3, из-за которой при запуске возникал ReferenceError:
`menuTutorialVisible is not defined`.

Из-за этого boot останавливался до `loadStaticTracks()`, поэтому:
- оставалось «Загрузка трека…»;
- кнопка «Играть» сообщала, что конфигурация не загружена;
- таблица лидеров не успевала загрузиться.

Теперь локализация использует актуальное состояние `menuTutorialState`, а
инициализация обучения дополнительно изолирована от основного boot-процесса:
ошибка в onboarding UI больше не может остановить загрузку треков.

# Neon Lanes Kids Web v7.0.1 — Leaderboard Fixes

Changes on top of the provided v7.0 build:

1. Day 4 and day 5 swapped:
   - Day 4: Clap Your Hands
   - Day 5: Baby Shark

2. The menu "Total score" is now the sum of this player's best/current
   server score across all seven day game IDs for the selected language/region.
   It no longer mirrors the currently selected song.

3. If multiple players have the same server rank and score, the current
   device/player is rendered first inside that tied group. current_player is
   merged into the client-side ranking before the top-10 slice.

4. Runtime JS cache busting is enabled in index.html. Each page refresh loads
   config-v89.js and game-v89.js with a fresh ?v=<timestamp> query.

# Neon Lanes Kids Web v5.3.3 — Performance Clean

Исправления производительности:

- удалён неиспользуемый `assets/sounds/miss.wav` и вся папка `assets/sounds`;
- удалены неиспользуемые `miss` / `missVolume` из config;
- отменён эксперимент v5.3.2 с перекодированием всех MP3 и добавлением
  0.5 секунды тишины; возвращены исходные MP3/config из v5.3.1;
- перед countdown браузер ждёт `canplaythrough` / достаточную буферизацию;
- MP3-декодер и аудиовывод прогреваются на всех платформах до countdown;
- непосредственно перед первым слышимым битом больше нет повторного prime/seek;
- Canvas DPR ограничен 1.5 на мобильных и 1.75 на ПК;
- правые дети и Dino теперь используют кэш уменьшенного спрайта;
- уменьшены дорогие `shadowBlur` в игровом Canvas;
- добавлено 90 мс технического grace-window только на случай пропущенного
  браузером кадра. Времена нот и музыка при этом не сдвигаются.

Аудиофайлы проверены `ffmpeg`: ошибок декодирования и разрывов MP3-пакетов
не обнаружено.
