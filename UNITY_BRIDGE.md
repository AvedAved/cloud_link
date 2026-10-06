# Unity WebView bridge

Recommended opening URL parameters:

- `tutorialCompleted=1|0`
- `lang=ru|en|ar|hi`
- `eventDays=0..7`
- optional `completedDays=1,2,3`
- optional `playerName=Павел` — pre-fills the editable result-name field after a track

Example:

`index.html?tutorialCompleted=1&lang=ru&eventDays=4&completedDays=1,2,3&playerName=%D0%9F%D0%B0%D0%B2%D0%B5%D0%BB`

`playerName` is read during initial page bootstrap. It becomes the default text in the existing editable name input. The current UI limit is 12 characters, so the supplied value is trimmed and truncated to 12 characters.

JS -> Unity raw messages through `Unity.call(...)`:

- `tutorial_complete`
- `track_complete:X` where X is 1..7
- `event_complete` after all seven days are completed sequentially and day 7 finishes
- `close` when the top-right menu close button is pressed

Runtime API (optional fallback after page load):

```js
initializeRhythmWithDino({
  tutorialCompleted: true,
  language: 'ru',
  eventDays: 4,
  completedDays: [1,2,3],
  playerName: 'Павел'
});
```

Legacy helpers exposed:
- `setLanguage(...)`
- `setEventDays(...)`
- `setTutorialCompleted(...)`
- `setPlayerName(...)`
