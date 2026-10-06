# Формат статических треков

Каждый трек находится в отдельной папке:

```text
assets/tracks/имя_папки/
├── track.mp3
└── config.json
```

Папка должна быть перечислена в `assets/tracks/manifest.json`.

Пример:

```json
{
  "tracks": [
    { "folder": "twinkle_twinkle_little_star" },
    { "folder": "clap_your_hands" }
  ]
}
```

Дополнительные поля `config.json`:

```json
{
  "schemaVersion": 1,
  "type": "neon-lanes-track",
  "day": 1,
  "title": "Название трека",
  "audioFile": "track.mp3",
  "bpm": 90,
  "travelBeats": 4,
  "notes": [
    { "time": 1.2, "lane": 0 }
  ]
}
```

- `day` — день от 1 до 7;
- `title` — название в меню и HUD;
- `audioFile` — имя аудиофайла;
- `notes` — секвенция фишек;
- `lane` — линия 0 или 1.

Если несколько треков назначены на один день, игра выбирает самый свежий по
`Last-Modified`. Если хостинг не передаёт этот заголовок, побеждает последняя
папка в `manifest.json`.
