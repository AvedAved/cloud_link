
const CONFIG = window.NEON_LANES_CONFIG || {};
CONFIG.assets = CONFIG.assets || {};
CONFIG.assets.images = CONFIG.assets.images || {};
CONFIG.assets.audio = CONFIG.assets.audio || {};

const HostBridge = (() => {
  const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;

  function updateViewport(){
    const height = tg?.viewportStableHeight || tg?.viewportHeight || window.innerHeight;
    document.documentElement.style.setProperty("--app-viewport-height", `${height}px`);

    const safe = tg?.contentSafeAreaInset || tg?.safeAreaInset;
    if (safe){
      document.documentElement.style.setProperty("--app-safe-top", `${safe.top || 0}px`);
      document.documentElement.style.setProperty("--app-safe-right", `${safe.right || 0}px`);
      document.documentElement.style.setProperty("--app-safe-bottom", `${safe.bottom || 0}px`);
      document.documentElement.style.setProperty("--app-safe-left", `${safe.left || 0}px`);
    }
  }

  function sendUnityMessage(message){
    const value=String(message??"");
    if(!value)return;
    try{
      // gree/unity-webview injects Unity.call and routes the raw string to Init(cb: ...).
      if(window.Unity&&typeof window.Unity.call==="function"){
        window.Unity.call(value);
        return true;
      }
      // Optional fallbacks for other Unity/WebView hosts.
      if(window.webkit?.messageHandlers?.neonLanes){
        window.webkit.messageHandlers.neonLanes.postMessage(value);
        return true;
      }
      const unity=window.unityInstance;
      const unityCfg=CONFIG.host?.unity||{};
      if(unity&&typeof unity.SendMessage==="function"){
        unity.SendMessage(
          unityCfg.receiverObject||"WebViewBridge",
          unityCfg.receiverMethod||"OnWebGameEvent",
          value
        );
        return true;
      }
    }catch(error){
      console.warn("Unity raw bridge error",error);
    }
    return false;
  }

  function send(type, payload = {}){
    const message = { type, payload, timestamp: Date.now() };
    const serialized = JSON.stringify(message);

    try {
      const unity = window.unityInstance;
      const unityCfg = CONFIG.host?.unity || {};
      if (unity && typeof unity.SendMessage === "function"){
        unity.SendMessage(
          unityCfg.receiverObject || "WebViewBridge",
          unityCfg.receiverMethod || "OnWebGameEvent",
          serialized
        );
      } else if (window.Unity && typeof window.Unity.call === "function"){
        window.Unity.call(serialized);
      } else if (window.webkit?.messageHandlers?.neonLanes){
        window.webkit.messageHandlers.neonLanes.postMessage(message);
      }
    } catch (error) {
      console.warn("Unity bridge error", error);
    }

    try {
      if (tg && CONFIG.host?.telegram?.sendGameEvents === true){
        tg.sendData(serialized);
      }
    } catch (error) {
      console.warn("Telegram sendData error", error);
    }

    window.dispatchEvent(new CustomEvent("neon-lanes-event", { detail: message }));
  }

  function init(){
    updateViewport();
    window.addEventListener("resize", updateViewport);

    if (tg){
      tg.ready();
      if (CONFIG.host?.telegram?.expand !== false) tg.expand();
      tg.onEvent("viewportChanged", updateViewport);
      tg.onEvent("safeAreaChanged", updateViewport);
      tg.onEvent("contentSafeAreaChanged", updateViewport);
    }
  }

  return { init, send, sendUnityMessage, telegram: tg };
})();

const UNITY_EVENT_REWARD_URL="https://bogg.art/?ysclid=muqw3l4qsk598840384";
const UNITY_RUNTIME={
  tutorialCompleted:null,
  language:null,
  eventDays:7,
  completedDays:null,
  playerName:null,
  initialized:false
};

function parseHostBoolean(value){
  if(value===true||value===1)return true;
  if(value===false||value===0)return false;
  const text=String(value??"").trim().toLowerCase();
  if(["1","true","yes","y"].includes(text))return true;
  if(["0","false","no","n"].includes(text))return false;
  return null;
}
function clampEventDays(value){
  const number=Math.floor(Number(value));
  if(!Number.isFinite(number))return 7;
  return Math.max(0,Math.min(7,number));
}
function normalizeHostLanguage(value){
  const raw=String(value??"").trim().toLowerCase().replace(/_/g,"-");
  if(!raw)return null;
  const first=raw.split("-")[0];
  if(["ru","russian","русский"].includes(raw)||first==="ru")return"ru";
  if(["en","english"].includes(raw)||first==="en")return"en";
  if(["ar","arabic","العربية"].includes(raw)||first==="ar")return"ar";
  if(["hi","hindi","हिन्दी","हिंदी"].includes(raw)||first==="hi")return"hi";
  return null;
}
function parseCompletedDays(value){
  if(Array.isArray(value))return value.map(Number).filter(Number.isInteger);
  if(typeof value==="string"){
    if(!value.trim())return[];
    return value.split(",").map(item=>Number(item.trim())).filter(Number.isInteger);
  }
  return null;
}
function normalizeHostPlayerName(value){
  if(value===null||value===undefined)return null;
  const name=String(value).trim().slice(0,12);
  return name||null;
}
function readUnityBootstrapFromUrl(){
  try{
    const params=new URLSearchParams(window.location.search||"");
    if(params.has("tutorialCompleted"))UNITY_RUNTIME.tutorialCompleted=parseHostBoolean(params.get("tutorialCompleted"));
    if(params.has("lang"))UNITY_RUNTIME.language=normalizeHostLanguage(params.get("lang"));
    if(params.has("language"))UNITY_RUNTIME.language=normalizeHostLanguage(params.get("language"));
    if(params.has("eventDays"))UNITY_RUNTIME.eventDays=clampEventDays(params.get("eventDays"));
    if(params.has("completedDays"))UNITY_RUNTIME.completedDays=parseCompletedDays(params.get("completedDays"));
    if(params.has("playerName"))UNITY_RUNTIME.playerName=normalizeHostPlayerName(params.get("playerName"));
    UNITY_RUNTIME.initialized=params.has("tutorialCompleted")||params.has("lang")||params.has("language")||params.has("eventDays")||params.has("completedDays")||params.has("playerName");
  }catch(error){
    console.warn("Unity bootstrap query parse failed",error);
  }
}
readUnityBootstrapFromUrl();

function applyRuntimeConfig(){
  applyLanguage();
}

"use strict";

/* ---------- iOS Canvas compatibility ---------- */
(function installRoundRectPolyfill(){
  if(typeof CanvasRenderingContext2D==="undefined")return;
  if(typeof CanvasRenderingContext2D.prototype.roundRect==="function")return;

  CanvasRenderingContext2D.prototype.roundRect=function(x,y,width,height,radii){
    let values=Array.isArray(radii)?radii:[radii??0];
    values=values.map(value=>Math.max(0,Number(value)||0));

    let topLeft=values[0]||0;
    let topRight=values.length>1?values[1]:topLeft;
    let bottomRight=values.length>2?values[2]:topLeft;
    let bottomLeft=values.length>3?values[3]:topRight;

    const maxRadius=Math.min(Math.abs(width)/2,Math.abs(height)/2);
    topLeft=Math.min(topLeft,maxRadius);
    topRight=Math.min(topRight,maxRadius);
    bottomRight=Math.min(bottomRight,maxRadius);
    bottomLeft=Math.min(bottomLeft,maxRadius);

    const right=x+width;
    const bottom=y+height;

    this.moveTo(x+topLeft,y);
    this.lineTo(right-topRight,y);
    this.quadraticCurveTo(right,y,right,y+topRight);
    this.lineTo(right,bottom-bottomRight);
    this.quadraticCurveTo(right,bottom,right-bottomRight,bottom);
    this.lineTo(x+bottomLeft,bottom);
    this.quadraticCurveTo(x,bottom,x,bottom-bottomLeft);
    this.lineTo(x,y+topLeft);
    this.quadraticCurveTo(x,y,x+topLeft,y);
    this.closePath();
    return this;
  };
})();


function safeStorageGet(key){
  try{return window.localStorage?.getItem(key)??null;}
  catch(error){return null;}
}
function safeStorageSet(key,value){
  try{window.localStorage?.setItem(key,value);return true;}
  catch(error){return false;}
}


/* ---------- Languages ---------- */
const LANGUAGE_STORAGE_KEY="neonlanes_language_v1";
const SUPPORTED_LANGUAGES=["ru","en","ar","hi"];

const I18N={
  ru:{
    appTitle:"Ритм с Дино",track:"Трек",score:"Очки",exitMenu:"Выйти в меню",
    totalScore:"Общие очки",tutorialLanguage:"Здесь можно сменить язык.",tutorialTotalScore:"Это общий счет, который Вы набрали за все уровни.",tutorialDays:"Здесь отображаются уровни (дни). В начале доступен только первый. Они открываются последовательно, один за другим, после прохождения предыдущего.",tutorialLeaderboard:"Это таблица лидеров. Здесь показываются лучшие игроки, а также ваш личный счет.",tutorialPlay:"Нажмите на кнопку «Играть», чтобы запустить первый уровень.",tutorialPlayNext:"Нажмите на кнопку «Играть», чтобы запустить следующий уровень.",tutorialDayUnlocked:"После прохождения уровня Вам открывается следующий, если он уже доступен. Выберите его из списка.",tutorialFinishBoard:"После завершения мелодии перед Вами появится таблица лидеров.",tutorialFinishName:"Введите имя или никнейм, чтобы привязать к нему свой результат.",tutorialFinishSave:"Нажмите кнопку «Сохранить», чтобы записать свой результат в таблицу лидеров.",gameTutorialHud:"Здесь находится общая информация о текущей игре: играющая мелодия (трек) и количество набранных очков.",gameTutorialExit:"Кнопка возврата в меню.",gameTutorialLanes:"В игре есть две «нотные» дорожки. По ним двигаются ноты выбранной мелодии, которые представлены фишками.",gameTutorialTargets:"В самом низу каждой линии есть место, которое отображает идеальную позицию фишки для воспроизведения её ноты. Назовем это кнопкой.",gameTutorialChip:"Это те самые фишки, которые представляют собой ноты мелодии.",gameTutorialTiming:"Когда фишка соединяется с кнопкой, настает идеальный момент для того, чтобы сыграть ноту! Нажмите на кнопку линии или на саму линию, чтобы попасть в ритм мелодии.",gameTutorialRating:"В зависимости от того, насколько близко были фишка и кнопка друг к другу в момент нажатия, вы получите результат «идеально», «хорошо» или «ок».",gameTutorialResults:"Продолжайте играть, пытаясь набрать как можно больше очков!\n\n«Идеально» дает 3 очка, «хорошо» — 2 очка, «ок» — 1 очко.\n\nЗа промах не дают очков, но и не отнимают.",chooseDay:"Выбери день",todayPlays:"Сегодня играет",
    loadingTrack:"Загрузка трека…",campaignProgram:"Программа на 7 дней",
    onDevice:"На этом устройстве",top10:"Топ 10",play:"Играть",settings:"Настройки",
    fullscreen:"Раскрыть на весь экран",gameKeys:"Игровые клавиши",lane1:"Линия 1",lane2:"Линия 2",
    keyHint:"Нажмите на кнопку, затем нажмите новую клавишу.",pressNow:"Нажмите…",
    hideHotkeys:"Скрыть отображения горячих клавиш на кнопках",
    resetProgress:"Стереть прогресс по дням",done:"Готово",roundFinished:"Раунд завершён",
    points:"очков",yourName:"Твоё имя",save:"Сохранить",returnWithoutSaving:"Вернуться без сохранения",
    maxScore:"Максимум: {max} очков",noTrackForOpenDay:"Для открытого дня нет трека.",
    noResults:"На этом устройстве пока нет результатов.",playFirst:"Сыграй первым!",
    dayAria:"День {day}",dayTrack:"{title} · день {day}",missingDay:"Для дня {day} трек не загружен",
    lockedDay:"День {day} пока закрыт",unloadedDay:"День {day}: трек не загружен",
    resetHas:"Стереть весь прогресс по дням? Снова будет открыт только первый день.",
    resetEmpty:"Прогресс по дням уже пуст. Сбросить его ещё раз?",
    trackConfigMissing:"Конфигурация трека ещё не загружена.",
    browserAudioBlocked:"Браузер не разрешил запустить музыкальный трек.",
    enterName:"Введите имя",enterAndSave:"Введите имя и сохраните результат",
    exitConfirm:"Выйти в главное меню? Текущий результат не сохранится.",
    trackFinished:"Трек завершён!",dayCompleted:"День {day} пройден! Открыт следующий день.",
    weekReward:"7/7 дней! Ты получил награду за серию.",
    alreadyCounted:"Сегодня прогресс уже засчитан: {streak}/{days}",
    dayCounted:"День засчитан! Серия: {streak}/{days}",
    keyDuplicate:"Клавиша {key} уже назначена линии {lane}.",space:"Пробел",
    musicTrack:"Музыкальный трек",perfect:"ИДЕАЛЬНО",good:"ХОРОШО",ok:"ОК",
    configObject:"Конфигурация должна быть JSON-объектом.",
    configType:"Это не конфигурация трека Neon Lanes версии 1.",
    invalidDay:"В config.json поле day должно быть от 1 до 7.",
    missingTitle:"Не указано название трека.",invalidBpm:"bpm должен быть от 40 до 240.",
    invalidTravelBeats:"travelBeats должен быть от 1 до 8.",missingNotes:"В конфигурации нет секвенции notes.",
    invalidNoteTime:"Неверное время у ноты {index}.",invalidLane:"lane у ноты {index} должен быть от 0 до 3.",
    notesSorted:"Ноты должны быть отсортированы по времени.",
    noWorkingTracks:"Не найдено ни одного рабочего трека.",manifestLoad:"Не удалось загрузить список треков: {status}.",
    manifestInvalid:"Файл manifest.json содержит неверный список треков.",
    noAudioForDay:"Для открытого дня нет аудиотрека.",audioLoadFailed:"Аудиотрек не загрузился.",
    audioUnsupported:"Формат аудиотрека не поддерживается на этом устройстве.",
    audioMissing:"Аудиотрек не загружен.",trackNotFound:"Трек не найден в статическом каталоге.",
    loadTrackError:"Не удалось загрузить трек.",loadCatalogError:"Не удалось загрузить статический каталог треков.",
    resetError:"Не удалось стереть прогресс.",
    leaderboardLoading:"Загрузка таблицы лидеров…",leaderboardError:"Не удалось загрузить таблицу лидеров.",
    saving:"Сохранение…",saveError:"Не удалось сохранить результат.",language:"Язык",eventCompleted:"Событие завершено!",allDaysDone:"Все дни пройдены!",getReward:"Получить награду"
  },
  en:{
    appTitle:"Rhythm with Dino",track:"Track",score:"Score",exitMenu:"Exit to menu",
    totalScore:"Total score",tutorialLanguage:"You can change the language here.",tutorialTotalScore:"This is your total score from all levels.",tutorialDays:"The level buttons are shown here. At first only the first day is available. New days open one by one after you complete the previous one.",tutorialLeaderboard:"This is the leaderboard. It shows the best players and also your own score.",tutorialPlay:"Press the Play button to start the first level.",tutorialPlayNext:"Press the Play button to start the next level.",tutorialDayUnlocked:"After you complete a level, the next one opens if it is available. Select it from the list.",tutorialFinishBoard:"After the melody ends, a leaderboard will appear in front of you.",tutorialFinishName:"Enter a name or nickname to attach your result to it.",tutorialFinishSave:"Press Save to write your result into the leaderboard.",gameTutorialHud:"This area shows the main information about the current game: the song (track) and the points you have scored.",gameTutorialExit:"This button returns you to the menu.",gameTutorialLanes:"The game has two note lanes. Notes from the selected melody move along them as colored chips.",gameTutorialTargets:"At the bottom of each lane is the target that shows the ideal chip position for playing its note. We will call it the button.",gameTutorialChip:"These chips represent the notes of the melody.",gameTutorialTiming:"When a chip meets the button, it is the ideal moment to play the note. Tap the lane button or the lane itself to stay in rhythm.",gameTutorialRating:"Depending on how closely the chip and button matched when you tapped, you will get PERFECT, GOOD, or OK.",gameTutorialResults:"Keep playing and try to score as many points as you can!\n\nPERFECT gives 3 points, GOOD gives 2, and OK gives 1.\n\nA miss gives no points, but no points are taken away.",chooseDay:"Choose a day",todayPlays:"Playing today",
    loadingTrack:"Loading track…",campaignProgram:"7-day program",
    onDevice:"On this device",top10:"Top 10",play:"Play",settings:"Settings",
    fullscreen:"Full screen",gameKeys:"Game keys",lane1:"Lane 1",lane2:"Lane 2",
    keyHint:"Tap a button, then press the new key.",pressNow:"Press…",
    hideHotkeys:"Hide keyboard labels on the buttons",
    resetProgress:"Clear day progress",done:"Done",roundFinished:"Round finished",
    points:"points",yourName:"Your name",save:"Save",returnWithoutSaving:"Return without saving",
    maxScore:"Maximum: {max} points",noTrackForOpenDay:"There is no track for the open day.",
    noResults:"There are no results on this device yet.",playFirst:"Be the first to play!",
    dayAria:"Day {day}",dayTrack:"{title} · day {day}",missingDay:"No track is assigned to day {day}",
    lockedDay:"Day {day} is locked",unloadedDay:"Day {day}: no track assigned",
    resetHas:"Clear all day progress? Only day 1 will be open again.",
    resetEmpty:"Day progress is already empty. Reset it again?",
    trackConfigMissing:"The track configuration has not loaded yet.",
    browserAudioBlocked:"The browser did not allow the music track to start.",
    enterName:"Enter a name",enterAndSave:"Enter your name and save the result",
    exitConfirm:"Exit to the main menu? The current result will not be saved.",
    trackFinished:"Track completed!",dayCompleted:"Day {day} completed! The next day is open.",
    weekReward:"7/7 days! You earned the streak reward.",
    alreadyCounted:"Today's progress is already counted: {streak}/{days}",
    dayCounted:"Day counted! Streak: {streak}/{days}",
    keyDuplicate:"Key {key} is already assigned to lane {lane}.",space:"Space",
    musicTrack:"Music track",perfect:"PERFECT",good:"GOOD",ok:"OK",
    configObject:"The configuration must be a JSON object.",
    configType:"This is not a Neon Lanes track configuration version 1.",
    invalidDay:"The day field in config.json must be from 1 to 7.",
    missingTitle:"The track title is missing.",invalidBpm:"bpm must be from 40 to 240.",
    invalidTravelBeats:"travelBeats must be from 1 to 8.",missingNotes:"The configuration has no notes sequence.",
    invalidNoteTime:"Invalid time for note {index}.",invalidLane:"lane for note {index} must be from 0 to 3.",
    notesSorted:"Notes must be sorted by time.",
    noWorkingTracks:"No working tracks were found.",manifestLoad:"Could not load the track list: {status}.",
    manifestInvalid:"manifest.json contains an invalid track list.",
    noAudioForDay:"There is no audio track for the open day.",audioLoadFailed:"The audio track did not load.",
    audioUnsupported:"This device does not support the audio format.",
    audioMissing:"The audio track is not loaded.",trackNotFound:"The track was not found in the static catalog.",
    loadTrackError:"Could not load the track.",loadCatalogError:"Could not load the static track catalog.",
    resetError:"Could not clear day progress.",
    leaderboardLoading:"Loading leaderboard…",leaderboardError:"Could not load the leaderboard.",
    saving:"Saving…",saveError:"Could not save the result.",language:"Language",eventCompleted:"Event complete!",allDaysDone:"All days are completed!",getReward:"Get reward"
  },
  ar:{
    appTitle:"الإيقاع مع دينو",track:"المقطوعة",score:"النقاط",exitMenu:"الخروج إلى القائمة",
    totalScore:"إجمالي النقاط",tutorialLanguage:"يمكنك تغيير اللغة هنا.",tutorialTotalScore:"هذا هو مجموع نقاطك من جميع المستويات.",tutorialDays:"هنا تظهر المراحل (الأيام). في البداية يتوفر اليوم الأول فقط. تفتح الأيام التالية بالتتابع بعد إكمال اليوم السابق.",tutorialLeaderboard:"هذه هي لوحة المتصدرين. هنا تظهر أفضل النتائج وكذلك نتيجتك الشخصية.",tutorialPlay:"اضغط على زر التشغيل لبدء المستوى الأول.",tutorialPlayNext:"اضغط على زر التشغيل لبدء المستوى التالي.",tutorialDayUnlocked:"بعد إكمال المستوى يفتح المستوى التالي إذا كان متاحًا. اختره من القائمة.",tutorialFinishBoard:"بعد انتهاء اللحن ستظهر أمامك لوحة المتصدرين.",tutorialFinishName:"أدخل اسمًا أو لقبًا لربط نتيجتك به.",tutorialFinishSave:"اضغط على زر الحفظ لتسجيل نتيجتك في لوحة المتصدرين.",gameTutorialHud:"هنا تظهر المعلومات الأساسية عن اللعبة الحالية: المقطوعة الموسيقية والنقاط التي جمعتها.",gameTutorialExit:"هذا الزر يعيدك إلى القائمة.",gameTutorialLanes:"توجد في اللعبة مساران للنغمات. تتحرك عليهما نغمات اللحن المختار على شكل قطع ملونة.",gameTutorialTargets:"في أسفل كل مسار توجد منطقة توضح الموضع المثالي للقطعة عند عزف النغمة. سنسميها الزر.",gameTutorialChip:"هذه القطع تمثل نغمات اللحن.",gameTutorialTiming:"عندما تتطابق القطعة مع الزر يكون هذا هو الوقت المثالي لعزف النغمة. اضغط على زر المسار أو على المسار نفسه لمتابعة الإيقاع.",gameTutorialRating:"بحسب مدى تطابق القطعة والزر لحظة الضغط ستحصل على نتيجة: مثالي أو جيد أو حسنًا.",gameTutorialResults:"واصل اللعب وحاول جمع أكبر عدد ممكن من النقاط!\n\nمثالي = 3 نقاط، جيد = نقطتان، حسنًا = نقطة واحدة.\n\nعند الإخفاق لا تحصل على نقاط، ولا تُخصم منك نقاط.",chooseDay:"اختر اليوم",todayPlays:"يعمل اليوم",
    loadingTrack:"جارٍ تحميل المقطوعة…",campaignProgram:"برنامج 7 أيام",
    onDevice:"على هذا الجهاز",top10:"أفضل 10",play:"العب",settings:"الإعدادات",
    fullscreen:"ملء الشاشة",gameKeys:"مفاتيح اللعب",lane1:"المسار 1",lane2:"المسار 2",
    keyHint:"اضغط على الزر ثم اضغط المفتاح الجديد.",pressNow:"اضغط…",
    hideHotkeys:"إخفاء أسماء مفاتيح لوحة المفاتيح على الأزرار",
    resetProgress:"مسح تقدم الأيام",done:"تم",roundFinished:"انتهت الجولة",
    points:"نقاط",yourName:"اسمك",save:"حفظ",returnWithoutSaving:"العودة دون حفظ",
    maxScore:"الحد الأقصى: {max} نقطة",noTrackForOpenDay:"لا توجد مقطوعة لليوم المفتوح.",
    noResults:"لا توجد نتائج على هذا الجهاز حتى الآن.",playFirst:"كن أول من يلعب!",
    dayAria:"اليوم {day}",dayTrack:"{title} · اليوم {day}",missingDay:"لا توجد مقطوعة مرتبطة باليوم {day}",
    lockedDay:"اليوم {day} مغلق",unloadedDay:"اليوم {day}: لا توجد مقطوعة",
    resetHas:"مسح كل تقدم الأيام؟ سيعود اليوم الأول فقط متاحًا.",
    resetEmpty:"تقدم الأيام فارغ بالفعل. هل تريد إعادة ضبطه؟",
    trackConfigMissing:"لم يتم تحميل إعدادات المقطوعة بعد.",
    browserAudioBlocked:"لم يسمح المتصفح بتشغيل المقطوعة الموسيقية.",
    enterName:"أدخل الاسم",enterAndSave:"أدخل اسمك واحفظ النتيجة",
    exitConfirm:"الخروج إلى القائمة الرئيسية؟ لن يتم حفظ النتيجة الحالية.",
    trackFinished:"اكتملت المقطوعة!",dayCompleted:"اكتمل اليوم {day}! تم فتح اليوم التالي.",
    weekReward:"7/7 أيام! حصلت على مكافأة الاستمرار.",
    alreadyCounted:"تم احتساب تقدم اليوم بالفعل: {streak}/{days}",
    dayCounted:"تم احتساب اليوم! السلسلة: {streak}/{days}",
    keyDuplicate:"المفتاح {key} مستخدم بالفعل للمسار {lane}.",space:"مسافة",
    musicTrack:"مقطوعة موسيقية",perfect:"مثالي",good:"جيد",ok:"حسنًا",
    configObject:"يجب أن يكون الإعداد كائن JSON.",
    configType:"هذا ليس ملف إعداد Neon Lanes من الإصدار 1.",
    invalidDay:"يجب أن تكون قيمة day في config.json من 1 إلى 7.",
    missingTitle:"اسم المقطوعة غير موجود.",invalidBpm:"يجب أن تكون bpm بين 40 و240.",
    invalidTravelBeats:"يجب أن تكون travelBeats بين 1 و8.",missingNotes:"لا توجد سلسلة notes في الإعداد.",
    invalidNoteTime:"وقت غير صالح للنغمة {index}.",invalidLane:"يجب أن تكون lane للنغمة {index} من 0 إلى 3.",
    notesSorted:"يجب ترتيب النغمات حسب الوقت.",
    noWorkingTracks:"لم يتم العثور على مقطوعات صالحة.",manifestLoad:"تعذر تحميل قائمة المقطوعات: {status}.",
    manifestInvalid:"يحتوي manifest.json على قائمة مقطوعات غير صالحة.",
    noAudioForDay:"لا توجد مقطوعة صوتية لليوم المفتوح.",audioLoadFailed:"لم يتم تحميل الملف الصوتي.",
    audioUnsupported:"تنسيق الصوت غير مدعوم على هذا الجهاز.",
    audioMissing:"لم يتم تحميل الملف الصوتي.",trackNotFound:"لم يتم العثور على المقطوعة في الكتالوج الثابت.",
    loadTrackError:"تعذر تحميل المقطوعة.",loadCatalogError:"تعذر تحميل كتالوج المقطوعات.",
    resetError:"تعذر مسح تقدم الأيام.",
    leaderboardLoading:"جارٍ تحميل لوحة المتصدرين…",leaderboardError:"تعذر تحميل لوحة المتصدرين.",
    saving:"جارٍ الحفظ…",saveError:"تعذر حفظ النتيجة.",language:"اللغة",eventCompleted:"اكتمل الحدث!",allDaysDone:"تم إكمال جميع الأيام!",getReward:"احصل على المكافأة"
  },
  hi:{
    appTitle:"डिनो के साथ रिदम",track:"ट्रैक",score:"अंक",exitMenu:"मेनू पर जाएँ",
    totalScore:"कुल अंक",tutorialLanguage:"यहाँ भाषा बदली जा सकती है।",tutorialTotalScore:"यह सभी स्तरों में आपके कुल अंक हैं।",tutorialDays:"यहाँ स्तर (दिन) दिखाए जाते हैं। शुरुआत में केवल पहला दिन खुला होता है। पिछले दिन को पूरा करने के बाद अगले दिन क्रम से खुलते हैं।",tutorialLeaderboard:"यह लीडरबोर्ड है। यहाँ सबसे अच्छे खिलाड़ियों के साथ आपका अपना स्कोर भी दिखता है।",tutorialPlay:"पहला स्तर शुरू करने के लिए ‘Play’ बटन दबाएँ।",tutorialPlayNext:"अगला स्तर शुरू करने के लिए ‘Play’ बटन दबाएँ।",tutorialDayUnlocked:"स्तर पूरा करने के बाद अगला दिन, यदि उपलब्ध हो, खुल जाता है। उसे सूची से चुनें।",tutorialFinishBoard:"धुन समाप्त होने के बाद आपके सामने लीडरबोर्ड दिखाई देगा।",tutorialFinishName:"अपने परिणाम को उससे जोड़ने के लिए कोई नाम या निकनेम दर्ज करें।",tutorialFinishSave:"अपना परिणाम लीडरबोर्ड में दर्ज करने के लिए Save बटन दबाएँ।",gameTutorialHud:"यहाँ मौजूदा खेल की मुख्य जानकारी दिखाई जाती है: चल रहा गाना (ट्रैक) और आपके अंक।",gameTutorialExit:"यह बटन आपको मेनू पर वापस ले जाता है।",gameTutorialLanes:"खेल में दो नोट लेन हैं। चुनी गई धुन के नोट रंगीन चिप्स के रूप में इन पर चलते हैं।",gameTutorialTargets:"हर लेन के सबसे नीचे एक लक्ष्य होता है, जो नोट बजाने के लिए चिप की सही स्थिति दिखाता है। इसे हम बटन कहेंगे।",gameTutorialChip:"ये चिप्स धुन के नोट दर्शाते हैं।",gameTutorialTiming:"जब चिप बटन से मिलती है, तब नोट बजाने का सही समय होता है। ताल में रहने के लिए लेन के बटन या लेन पर टैप करें।",gameTutorialRating:"आपके टैप के समय चिप और बटन कितने पास थे, उसके अनुसार PERFECT, GOOD या OK परिणाम मिलेगा।",gameTutorialResults:"खेलते रहें और जितने हो सकें उतने अंक पाने की कोशिश करें!\n\nPERFECT = 3 अंक, GOOD = 2 अंक, OK = 1 अंक।\n\nचूकने पर अंक नहीं मिलते, लेकिन अंक काटे भी नहीं जाते।",chooseDay:"दिन चुनें",todayPlays:"आज का ट्रैक",
    loadingTrack:"ट्रैक लोड हो रहा है…",campaignProgram:"7-दिन का कार्यक्रम",
    onDevice:"इस डिवाइस पर",top10:"टॉप 10",play:"खेलें",settings:"सेटिंग्स",
    fullscreen:"फ़ुल स्क्रीन",gameKeys:"गेम कीज़",lane1:"लेन 1",lane2:"लेन 2",
    keyHint:"बटन पर टैप करें, फिर नई कुंजी दबाएँ।",pressNow:"दबाएँ…",
    hideHotkeys:"बटनों पर कीबोर्ड लेबल छिपाएँ",
    resetProgress:"दिनों की प्रगति मिटाएँ",done:"हो गया",roundFinished:"राउंड पूरा",
    points:"अंक",yourName:"आपका नाम",save:"सेव करें",returnWithoutSaving:"बिना सेव किए लौटें",
    maxScore:"अधिकतम: {max} अंक",noTrackForOpenDay:"खुले दिन के लिए कोई ट्रैक नहीं है।",
    noResults:"इस डिवाइस पर अभी कोई परिणाम नहीं है।",playFirst:"सबसे पहले खेलें!",
    dayAria:"दिन {day}",dayTrack:"{title} · दिन {day}",missingDay:"दिन {day} के लिए कोई ट्रैक नहीं है",
    lockedDay:"दिन {day} अभी बंद है",unloadedDay:"दिन {day}: कोई ट्रैक नहीं",
    resetHas:"सभी दिनों की प्रगति मिटाएँ? फिर केवल पहला दिन खुला रहेगा।",
    resetEmpty:"दिनों की प्रगति पहले से खाली है। फिर से रीसेट करें?",
    trackConfigMissing:"ट्रैक कॉन्फ़िगरेशन अभी लोड नहीं हुआ है।",
    browserAudioBlocked:"ब्राउज़र ने संगीत ट्रैक शुरू करने की अनुमति नहीं दी।",
    enterName:"नाम दर्ज करें",enterAndSave:"अपना नाम दर्ज करके परिणाम सेव करें",
    exitConfirm:"मुख्य मेनू पर जाएँ? मौजूदा परिणाम सेव नहीं होगा।",
    trackFinished:"ट्रैक पूरा हुआ!",dayCompleted:"दिन {day} पूरा हुआ! अगला दिन खुल गया है।",
    weekReward:"7/7 दिन! आपको स्ट्रीक इनाम मिला।",
    alreadyCounted:"आज की प्रगति पहले ही गिनी जा चुकी है: {streak}/{days}",
    dayCounted:"दिन गिना गया! स्ट्रीक: {streak}/{days}",
    keyDuplicate:"कुंजी {key} पहले से लेन {lane} को दी गई है।",space:"स्पेस",
    musicTrack:"संगीत ट्रैक",perfect:"परफेक्ट",good:"अच्छा",ok:"ठीक",
    configObject:"कॉन्फ़िगरेशन एक JSON ऑब्जेक्ट होना चाहिए।",
    configType:"यह Neon Lanes ट्रैक कॉन्फ़िगरेशन संस्करण 1 नहीं है।",
    invalidDay:"config.json में day का मान 1 से 7 होना चाहिए।",
    missingTitle:"ट्रैक का नाम नहीं दिया गया है।",invalidBpm:"bpm 40 से 240 के बीच होना चाहिए।",
    invalidTravelBeats:"travelBeats 1 से 8 के बीच होना चाहिए।",missingNotes:"कॉन्फ़िगरेशन में notes क्रम नहीं है।",
    invalidNoteTime:"नोट {index} का समय गलत है।",invalidLane:"नोट {index} की lane 0 से 3 के बीच होनी चाहिए।",
    notesSorted:"नोट समय के अनुसार क्रम में होने चाहिए।",
    noWorkingTracks:"कोई काम करने वाला ट्रैक नहीं मिला।",manifestLoad:"ट्रैक सूची लोड नहीं हुई: {status}.",
    manifestInvalid:"manifest.json में ट्रैक सूची गलत है।",
    noAudioForDay:"खुले दिन के लिए ऑडियो ट्रैक नहीं है।",audioLoadFailed:"ऑडियो ट्रैक लोड नहीं हुआ।",
    audioUnsupported:"यह डिवाइस इस ऑडियो फ़ॉर्मैट को सपोर्ट नहीं करता।",
    audioMissing:"ऑडियो ट्रैक लोड नहीं है।",trackNotFound:"स्टैटिक कैटलॉग में ट्रैक नहीं मिला।",
    loadTrackError:"ट्रैक लोड नहीं हुआ।",loadCatalogError:"स्टैटिक ट्रैक कैटलॉग लोड नहीं हुआ।",
    resetError:"दिनों की प्रगति मिटाई नहीं जा सकी।",
    leaderboardLoading:"लीडरबोर्ड लोड हो रहा है…",leaderboardError:"लीडरबोर्ड लोड नहीं हो सका।",
    saving:"सहेजा जा रहा है…",saveError:"परिणाम सहेजा नहीं जा सका।",language:"भाषा",eventCompleted:"इवेंट पूरा हुआ!",allDaysDone:"सभी दिन पूरे हो गए!",getReward:"इनाम पाएं"
  }
};

function loadLanguage(){
  try{
    const value=window.localStorage?.getItem(LANGUAGE_STORAGE_KEY);
    return SUPPORTED_LANGUAGES.includes(value)?value:"ru";
  }catch(error){
    return"ru";
  }
}

let currentLanguage=loadLanguage();

function t(key,vars={}){
  const dictionary=I18N[currentLanguage]||I18N.ru;
  const fallback=I18N.ru;
  let value=dictionary[key]??fallback[key]??key;
  return String(value).replace(/\{(\w+)\}/g,(_,name)=>vars[name]??`{${name}}`);
}

function applyLanguage(){
  document.documentElement.lang=currentLanguage;
  document.documentElement.dir=currentLanguage==="ar"?"rtl":"ltr";
  document.body?.setAttribute("data-language",currentLanguage);
  document.title=t("appTitle");

  document.querySelectorAll("[data-i18n]").forEach(element=>{
    element.textContent=t(element.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach(element=>{
    element.setAttribute("placeholder",t(element.dataset.i18nPlaceholder));
  });
  document.querySelectorAll("[data-i18n-aria-label]").forEach(element=>{
    element.setAttribute("aria-label",t(element.dataset.i18nAriaLabel));
  });
  document.querySelectorAll("[data-i18n-title]").forEach(element=>{
    element.setAttribute("title",t(element.dataset.i18nTitle));
  });

  const languageButton=document.getElementById("languageBtn");
  if(languageButton){
    languageButton.textContent=`[${currentLanguage.toUpperCase()}]`;
    languageButton.setAttribute("aria-label",t("language"));
    languageButton.setAttribute("title",t("language"));
  }

  const title=document.getElementById("campaignTrackTitle");
  if(title&&!activeTrack&&title.dataset.i18nLoading){
    title.textContent=t(title.dataset.i18nLoading);
  }

  if(typeof menuTutorialState!=="undefined" &&
     menuTutorialState!==MENU_TUTORIAL_STATE.hidden){
    requestAnimationFrame(positionMenuTutorial);
  }
}

function cycleLanguage(){
  const index=SUPPORTED_LANGUAGES.indexOf(currentLanguage);
  currentLanguage=SUPPORTED_LANGUAGES[(index+1)%SUPPORTED_LANGUAGES.length];
  try{window.localStorage?.setItem(LANGUAGE_STORAGE_KEY,currentLanguage);}catch(error){}
  myEntryId=null;
  applyLanguage();
  renderCampaignWeek();
  renderHUD();
  renderKeyBindings();
  syncHotkeysToggle();
  // Region is derived from the selected language, so reload both the
  // current-song leaderboard and the aggregate seven-song score.
  refreshLeaderboard().catch(error=>console.error("Не удалось обновить таблицу лидеров:",error));
  refreshTotalScore(true).catch(error=>console.error("Не удалось обновить общий счет:",error));
}



/* ---------- First-screen menu tutorial ---------- */
const MENU_TUTORIAL_STATE={hidden:"hidden",intro:"intro",play:"play",followup:"followup"};
let menuTutorialState=MENU_TUTORIAL_STATE.hidden;
let postSaveMenuTutorialPending=false;
let postSaveMenuTutorialShown=false;
let initialMenuTutorialPending=true;
let initialMenuTutorialShown=false;
let initialMenuTutorialCanStart=false;

function clampNumber(value,min,max){
  return Math.max(min,Math.min(max,value));
}

function setTutorialHidden(element,hidden){
  if(!element)return;
  element.classList.toggle("hidden",hidden);
}

function setMenuTutorialHighlights(state){
  const scoreBox=document.querySelector("#menu .menu-total-score");
  const languageButton=document.getElementById("languageBtn");
  const campaignWeek=document.getElementById("campaignWeek");
  const leaderboard=document.querySelector("#menu .board");
  const playButton=document.getElementById("playBtn");

  [scoreBox,languageButton,campaignWeek,leaderboard,playButton].forEach(element=>{
    element?.classList.remove("menu-tutorial-highlight");
  });

  if(state===MENU_TUTORIAL_STATE.intro){
    scoreBox?.classList.add("menu-tutorial-highlight");
    languageButton?.classList.add("menu-tutorial-highlight");
    campaignWeek?.classList.add("menu-tutorial-highlight");
    leaderboard?.classList.add("menu-tutorial-highlight");
  }else if(state===MENU_TUTORIAL_STATE.followup){
    campaignWeek?.classList.add("menu-tutorial-highlight");
    playButton?.classList.add("menu-tutorial-highlight");
  }
}

function positionMenuTutorial(){
  const tutorial=document.getElementById("menuTutorial");
  const menu=document.getElementById("menu");
  if(!tutorial||!menu||menuTutorialState===MENU_TUTORIAL_STATE.hidden)return;

  const menuRect=menu.getBoundingClientRect();
  const edge=10;
  const gap=12;
  const menuWidth=menuRect.width;
  const menuHeight=menuRect.height;

  const scoreBox=document.querySelector("#menu .menu-total-score");
  const languageButton=document.getElementById("languageBtn");
  const campaignWeek=document.getElementById("campaignWeek");
  const leaderboard=document.querySelector("#menu .board");
  const playButton=document.getElementById("playBtn");

  const languageBubble=document.getElementById("menuTutorialLanguage");
  const scoreBubble=document.getElementById("menuTutorialScore");
  const daysBubble=document.getElementById("menuTutorialDays");
  const leaderboardBubble=document.getElementById("menuTutorialLeaderboard");
  const playBubble=document.getElementById("menuTutorialPlay");
  const replayBubble=document.getElementById("menuTutorialReplayPlay");
  const playStep=document.getElementById("menuTutorialPlayStep");

  if(menuTutorialState===MENU_TUTORIAL_STATE.intro){
    tutorial.classList.add("is-intro-step");
    tutorial.classList.remove("is-play-step","is-followup-step");

    if(scoreBox&&scoreBubble){
      const scoreRect=scoreBox.getBoundingClientRect();
      const scoreWidth=Math.min(276,Math.max(220,menuWidth*0.70));
      scoreBubble.style.width=`${scoreWidth}px`;
      const scoreTop=scoreRect.bottom-menuRect.top+14;
      const scoreAnchorX=scoreRect.left-menuRect.left+scoreRect.width*0.46;
      const scoreLeft=clampNumber(scoreAnchorX-scoreWidth*0.18,edge,menuWidth-edge-scoreWidth);
      scoreBubble.style.left=`${scoreLeft}px`;
      scoreBubble.style.top=`${scoreTop}px`;
      scoreBubble.style.setProperty("--tutorial-arrow-x",`${clampNumber(scoreAnchorX-scoreLeft,18,scoreWidth-18)}px`);
    }

    if(languageButton&&languageBubble){
      const rect=languageButton.getBoundingClientRect();
      const width=Math.min(174,Math.max(136,menuWidth*0.42));
      languageBubble.style.width=`${width}px`;
      let left=rect.right-menuRect.left+gap;
      if(left+width>menuWidth-edge)left=menuWidth-edge-width;
      left=Math.max(edge,left);
      const bubbleHeight=languageBubble.offsetHeight||56;
      const top=clampNumber(rect.top-menuRect.top-2,edge,Math.max(edge,menuHeight-bubbleHeight-edge));
      languageBubble.style.left=`${left}px`;
      languageBubble.style.top=`${top}px`;
      const arrowY=clampNumber((rect.top-menuRect.top+rect.height*0.52)-top,13,bubbleHeight-13);
      languageBubble.style.setProperty("--tutorial-arrow-y",`${arrowY}px`);
    }

    if(campaignWeek&&daysBubble){
      const rect=campaignWeek.getBoundingClientRect();
      const width=Math.min(270,Math.max(240,menuWidth*0.84));
      daysBubble.style.width=`${width}px`;
      const height=daysBubble.offsetHeight||88;
      let left=rect.left-menuRect.left+(rect.width-width)/2;
      left=clampNumber(left,edge,menuWidth-edge-width);
      const minTop=(scoreBubble ? (parseFloat(scoreBubble.style.top)||0)+(scoreBubble.offsetHeight||0)+18 : edge+56);
      let top=rect.top-menuRect.top-height-78;
      top=Math.max(minTop,top);
      top=Math.min(top,Math.max(edge,rect.top-menuRect.top-height-48));
      daysBubble.style.left=`${left}px`;
      daysBubble.style.top=`${top}px`;
      daysBubble.classList.add('arrow-down');
      const arrowX=clampNumber((rect.left-menuRect.left+rect.width*0.50)-left,18,width-18);
      daysBubble.style.setProperty("--tutorial-arrow-x",`${arrowX}px`);
    }

    if(leaderboard&&leaderboardBubble){
      const rect=leaderboard.getBoundingClientRect();
      const playRect=playButton?.getBoundingClientRect?.()||null;
      const width=Math.min(270,Math.max(232,menuWidth*0.80));
      leaderboardBubble.style.width=`${width}px`;
      const bubbleHeight=leaderboardBubble.offsetHeight||64;
      const anchorX=rect.left-menuRect.left+rect.width*0.50;
      const left=clampNumber(anchorX-width*0.50,edge,menuWidth-edge-width);
      let top=rect.bottom-menuRect.top+14;
      top=Math.min(top,menuHeight-bubbleHeight-edge);
      leaderboardBubble.style.left=`${left}px`;
      leaderboardBubble.style.top=`${top}px`;
      leaderboardBubble.style.setProperty("--tutorial-arrow-x",`${clampNumber(anchorX-left,18,width-18)}px`);
    }
  }

  if(menuTutorialState===MENU_TUTORIAL_STATE.play){
    tutorial.classList.remove("is-intro-step","is-followup-step");
    tutorial.classList.add("is-play-step");
    menu.classList.add("tutorial-play-active");
    if(playButton&&playBubble&&playStep){
      const rect=playButton.getBoundingClientRect();
      const left=rect.left-menuRect.left;
      const top=rect.top-menuRect.top;
      const width=rect.width;
      const height=rect.height;

      const bubbleWidth=Math.min(252,Math.max(220,menuWidth*0.70));
      playBubble.style.width=`${bubbleWidth}px`;
      const bubbleHeight=playBubble.offsetHeight||62;
      const bubbleLeft=clampNumber(left+(width-bubbleWidth)/2,edge,menuWidth-edge-bubbleWidth);
      let bubbleTop=top-bubbleHeight-16;
      if(bubbleTop<edge)bubbleTop=top+height+18;
      playBubble.style.left=`${bubbleLeft}px`;
      playBubble.style.top=`${bubbleTop}px`;
      playBubble.classList.toggle("arrow-down",bubbleTop<top);
      playBubble.classList.toggle("arrow-up",bubbleTop>top);
      playBubble.style.setProperty("--tutorial-arrow-x",`${clampNumber((left+width*0.50)-bubbleLeft,18,bubbleWidth-18)}px`);
    }
  }

  if(menuTutorialState===MENU_TUTORIAL_STATE.followup){
    tutorial.classList.remove("is-intro-step","is-play-step");
    tutorial.classList.add("is-followup-step");
    if(campaignWeek&&daysBubble){
      const rect=campaignWeek.getBoundingClientRect();
      const width=Math.min(272,Math.max(236,menuWidth*0.82));
      daysBubble.style.width=`${width}px`;
      const height=daysBubble.offsetHeight||84;
      let left=rect.left-menuRect.left+(rect.width-width)/2;
      left=clampNumber(left,edge,menuWidth-edge-width);
      let top=rect.top-menuRect.top-height-42;
      top=Math.max(edge+76,top);
      top=Math.min(top,Math.max(edge,rect.top-menuRect.top-height-24));
      daysBubble.style.left=`${left}px`;
      daysBubble.style.top=`${top}px`;
      daysBubble.classList.add('arrow-down');
      const arrowX=clampNumber((rect.left-menuRect.left+rect.width*0.50)-left,18,width-18);
      daysBubble.style.setProperty("--tutorial-arrow-x",`${arrowX}px`);
    }
    if(playButton&&replayBubble){
      const rect=playButton.getBoundingClientRect();
      const width=Math.min(260,Math.max(228,menuWidth*0.72));
      replayBubble.style.width=`${width}px`;
      const bubbleHeight=replayBubble.offsetHeight||64;
      const left=clampNumber(rect.left-menuRect.left+(rect.width-width)/2,edge,menuWidth-edge-width);
      let top=rect.top-menuRect.top-bubbleHeight-16;
      if(top<edge)top=rect.bottom-menuRect.top+18;
      replayBubble.style.left=`${left}px`;
      replayBubble.style.top=`${top}px`;
      replayBubble.classList.toggle("arrow-down",top<rect.top-menuRect.top);
      replayBubble.classList.toggle("arrow-up",top>rect.top-menuRect.top);
      replayBubble.style.setProperty("--tutorial-arrow-x",`${clampNumber((rect.left-menuRect.left+rect.width*0.50)-left,18,width-18)}px`);
    }
  }
}

function setMenuTutorialState(state){
  const tutorial=document.getElementById("menuTutorial");
  const languageBubble=document.getElementById("menuTutorialLanguage");
  const scoreBubble=document.getElementById("menuTutorialScore");
  const daysBubble=document.getElementById("menuTutorialDays");
  const leaderboardBubble=document.getElementById("menuTutorialLeaderboard");
  const playStep=document.getElementById("menuTutorialPlayStep");
  const replayBubble=document.getElementById("menuTutorialReplayPlay");
  if(!tutorial)return;

  menuTutorialState=state;
  const menu=document.getElementById("menu");
  if(menu){
    menu.classList.toggle("tutorial-play-active",state===MENU_TUTORIAL_STATE.play);
    menu.classList.toggle("menu-tutorial-intro",state===MENU_TUTORIAL_STATE.intro);
    menu.classList.toggle("menu-tutorial-followup",state===MENU_TUTORIAL_STATE.followup);
  }
  tutorial.classList.remove("is-intro-step","is-play-step","is-followup-step");
  setMenuTutorialHighlights(state);

  if(state===MENU_TUTORIAL_STATE.hidden){
    tutorial.classList.add("hidden");
    tutorial.setAttribute("aria-hidden","true");
    setTutorialHidden(languageBubble,true);
    setTutorialHidden(scoreBubble,true);
    setTutorialHidden(daysBubble,true);
    setTutorialHidden(leaderboardBubble,true);
    setTutorialHidden(playStep,true);
    setTutorialHidden(replayBubble,true);
    if(playStep)playStep.setAttribute("aria-hidden","true");
    return;
  }

  tutorial.classList.remove("hidden");
  tutorial.setAttribute("aria-hidden","false");

  const intro=state===MENU_TUTORIAL_STATE.intro;
  const play=state===MENU_TUTORIAL_STATE.play;
  const followup=state===MENU_TUTORIAL_STATE.followup;
  setTutorialHidden(languageBubble,!intro);
  setTutorialHidden(scoreBubble,!intro);
  setTutorialHidden(daysBubble,!(intro||followup));
  setTutorialHidden(leaderboardBubble,!intro);
  setTutorialHidden(playStep,!play);
  setTutorialHidden(replayBubble,!followup);
  if(playStep)playStep.setAttribute("aria-hidden",play?"false":"true");

  requestAnimationFrame(()=>{
    positionMenuTutorial();
    requestAnimationFrame(positionMenuTutorial);
  });
}

function showMenuTutorial(){
  initialMenuTutorialPending=false;
  initialMenuTutorialShown=true;
  setMenuTutorialState(MENU_TUTORIAL_STATE.intro);
}

function maybeStartInitialMenuTutorial(){
  if(!initialMenuTutorialCanStart)return;
  if(!initialMenuTutorialPending||initialMenuTutorialShown)return;
  if(postSaveMenuTutorialPending||postSaveMenuTutorialShown)return;
  const menu=document.getElementById("menu");
  if(!menu||menu.classList.contains("hidden"))return;
  if(leaderboardState==="loading")return;
  requestAnimationFrame(()=>{
    requestAnimationFrame(()=>{
      if(initialMenuTutorialPending&&!initialMenuTutorialShown&&leaderboardState!=="loading"){
        showMenuTutorial();
      }
    });
  });
}

function showMenuFollowupTutorial(){
  setMenuTutorialState(MENU_TUTORIAL_STATE.followup);
}

function hideMenuTutorial(){
  setMenuTutorialState(MENU_TUTORIAL_STATE.hidden);
}

function handleMenuTutorialOverlayClick(event){
  if(menuTutorialState===MENU_TUTORIAL_STATE.intro){
    event.preventDefault();
    event.stopPropagation();
    setMenuTutorialState(MENU_TUTORIAL_STATE.play);
    return;
  }
  if(menuTutorialState===MENU_TUTORIAL_STATE.followup){
    event.preventDefault();
    event.stopPropagation();
    hideMenuTutorial();
  }
}

function bindMenuTutorial(){
  const tutorial=document.getElementById("menuTutorial");
  if(!tutorial)return;

  tutorial.addEventListener("click",handleMenuTutorialOverlayClick);
  window.addEventListener("resize",()=>{
    if(menuTutorialState!==MENU_TUTORIAL_STATE.hidden)requestAnimationFrame(positionMenuTutorial);
  });
  window.addEventListener("orientationchange",()=>{
    if(menuTutorialState!==MENU_TUTORIAL_STATE.hidden)setTimeout(positionMenuTutorial,120);
  });

  if("ResizeObserver" in window){
    const observer=new ResizeObserver(()=>{
      if(menuTutorialState!==MENU_TUTORIAL_STATE.hidden){
        requestAnimationFrame(positionMenuTutorial);
      }
    });
    [
      document.querySelector("#menu .menu-status-row"),
      document.getElementById("campaignWeek"),
      document.querySelector("#menu .board"),
      document.getElementById("playBtn")
    ].forEach(element=>{ if(element)observer.observe(element); });
  }
}

/* ---------- Safe mobile fullscreen ---------- */
function isMobileBrowser(){
  return matchMedia("(pointer:coarse)").matches||
    /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

function currentFullscreenElement(){
  return document.fullscreenElement||
    document.webkitFullscreenElement||
    null;
}

async function requestGameFullscreen(){
  const element=document.documentElement;
  try{
    if(currentFullscreenElement())return true;
    if(element.requestFullscreen){
      await element.requestFullscreen({navigationUI:"hide"});
      return true;
    }
    if(element.webkitRequestFullscreen){
      element.webkitRequestFullscreen();
      return true;
    }
  }catch(error){
    console.warn("Fullscreen недоступен:",error);
  }
  return false;
}

function isIPhoneSafari(){
  const ua=navigator.userAgent||"";
  const isIOS=/iPhone|iPod/i.test(ua)||
    (navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1);
  const isSafari=/Safari/i.test(ua)&&!/CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua);
  return isIOS&&isSafari;
}

async function toggleGameFullscreen(){
  // iPhone Safari does not provide reliable element fullscreen.
  // Use an expanded app viewport that fills the visible browser area.
  if(isIPhoneSafari()){
    document.body.classList.toggle("expanded-mobile");
    window.scrollTo(0,0);
    updateMobileViewport();
    setTimeout(updateMobileViewport,120);
    return;
  }

  const supported=Boolean(
    document.documentElement.requestFullscreen||
    document.documentElement.webkitRequestFullscreen
  );

  if(!supported){
    document.body.classList.toggle("expanded-mobile");
    updateMobileViewport();
    return;
  }

  try{
    if(currentFullscreenElement()){
      if(document.exitFullscreen)await document.exitFullscreen();
      else if(document.webkitExitFullscreen)document.webkitExitFullscreen();
    }else{
      const opened=await requestGameFullscreen();
      if(!opened){
        document.body.classList.toggle("expanded-mobile");
        updateMobileViewport();
      }
    }
  }catch(error){
    console.warn("Не удалось изменить полноэкранный режим:",error);
    document.body.classList.toggle("expanded-mobile");
    updateMobileViewport();
  }
}

function updateMobileViewport(){
  const viewport=window.visualViewport;
  const height=Math.max(
    320,
    Math.round(viewport&&viewport.height?viewport.height:window.innerHeight)
  );
  const width=Math.max(
    240,
    Math.round(viewport&&viewport.width?viewport.width:window.innerWidth)
  );
  document.documentElement.style.setProperty("--mobile-vh",`${height}px`);
  document.documentElement.style.setProperty("--mobile-vw",`${width}px`);

  requestAnimationFrame(()=>{
    resize();
    requestAnimationFrame(resize);
  });
}

function initMobileBrowserMode(){
  if(!isMobileBrowser())return;
  document.body.classList.add("mobile-browser");
  updateMobileViewport();

  window.addEventListener("resize",updateMobileViewport);
  window.addEventListener("orientationchange",()=>{
    setTimeout(updateMobileViewport,100);
    setTimeout(updateMobileViewport,350);
  });
  if(window.visualViewport){
    window.visualViewport.addEventListener("resize",updateMobileViewport);
    window.visualViewport.addEventListener("scroll",updateMobileViewport);
  }

  // Fullscreen is requested only from the Play click, where browsers allow it.
  // This does not intercept the first tap and therefore does not break buttons.
}


/* ============================================================
   NEON LANES — endless rhythm prototype
   ============================================================ */


function byId(id){
  return document.getElementById(id);
}

function bindById(id,eventName,handler,options){
  const element=byId(id);
  if(!element){
    console.warn(`Элемент #${id} отсутствует; обработчик ${eventName} не назначен.`);
    return false;
  }
  element.addEventListener(eventName,handler,options);
  return true;
}

/* ---------- Persistent storage (works in Claude artifacts, as a
   downloaded file, or falls back to memory) ---------- */
const Store = (() => {
  const NAMEKEY = "neonlanes_name_v1";
  const STREAKKEY = "neonlanes_progress_v1";
  let mem = {
    name: "",
    progress: { streak:0, lastSuccess:"", rewardCount:0, rewardDate:"" }
  };
  const hasWin = typeof window !== "undefined" && window.storage &&
    typeof window.storage.get === "function";

  async function get(k, fallback){
    if (hasWin){
      try { const r = await window.storage.get(k); return r ? JSON.parse(r.value) : fallback; }
      catch(error){ return fallback; }
    }
    try { const value = safeStorageGet(k); return value ? JSON.parse(value) : fallback; }
    catch(error){ return fallback; }
  }

  async function set(k, value){
    if (hasWin){
      try { await window.storage.set(k, JSON.stringify(value)); return; }
      catch(error){}
    }
    try { safeStorageSet(k, JSON.stringify(value)); }
    catch(error){
      if (k===NAMEKEY) mem.name=value;
      else if (k===STREAKKEY) mem.progress=value;
    }
  }

  return {
    async loadName(){ return await get(NAMEKEY, mem.name); },
    async saveName(name){ return await set(NAMEKEY, name); },
    async loadProgress(){ return await get(STREAKKEY, mem.progress); },
    async saveProgress(data){ return await set(STREAKKEY, data); }
  };
})();

/* ---------- Lanes ---------- */
const LANE_COUNT = 2;
const LANES = [
  { key:"q", color:"#36b7ff", glow:"rgba(54,183,255,", freq:261.63 },
  { key:"w", color:"#ffca2d", glow:"rgba(255,202,45,", freq:329.63 },
];

/* ---------- Hit windows around the lane buttons (normalized travel position t) ---------- */
const HIT_PERFECT_POSITION = 0.24;
const HIT_GOOD_POSITION = 0.52;

const GOAL_SCORE = 50;
const STREAK_DAYS = 7;
let progress = { streak:0, lastSuccess:"", rewardCount:0, rewardDate:"" };

function todayKey(d = new Date()){
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function parseDateKey(key){ return new Date(`${key}T00:00:00`); }
function daysBetweenKeys(fromKey, toKey){
  return Math.round((parseDateKey(toKey) - parseDateKey(fromKey)) / 86400000);
}
function getVisibleProgress(){
  const today = todayKey();
  const streak = Math.max(0, Math.min(STREAK_DAYS, progress.streak || 0));
  if (!progress.lastSuccess) return { streak:0, doneToday:false, rewardToday:false, missed:false };
  const diff = daysBetweenKeys(progress.lastSuccess, today);
  if (diff > 1) return { streak:0, doneToday:false, rewardToday:false, missed:true };
  return {
    streak,
    doneToday: progress.lastSuccess === today && streak > 0,
    rewardToday: progress.rewardDate === today && streak >= STREAK_DAYS,
    missed:false,
  };
}
async function recordDailyGoal(score){
  const today = todayKey();
  const currentView = getVisibleProgress();
  if (score < GOAL_SCORE) return { counted:false, reward:false, streak:currentView.streak, reason:"not_enough" };
  if (progress.lastSuccess === today) return { counted:false, reward:false, streak:Math.min(STREAK_DAYS, progress.streak || 0), reason:"already_counted" };

  let streak = 1;
  if (progress.lastSuccess){
    const diff = daysBetweenKeys(progress.lastSuccess, today);
    if (diff === 1){
      streak = (progress.streak || 0) >= STREAK_DAYS ? 1 : (progress.streak || 0) + 1;
    }
  }

  let reward = false;
  if (streak >= STREAK_DAYS){
    streak = STREAK_DAYS;
    reward = true;
    progress.rewardDate = today;
    progress.rewardCount = (progress.rewardCount || 0) + 1;
  }

  progress.streak = streak;
  progress.lastSuccess = today;
  await Store.saveProgress(progress);
  return { counted:true, reward, streak, reason:"counted" };
}


/* ---------- Seven-day campaign ---------- */
const CAMPAIGN_STORAGE_KEY="neonlanes_campaign_days_v2";
const CAMPAIGN_SELECTED_DAY_KEY="neonlanes_campaign_selected_day_v2";
const CAMPAIGN_DAYS=Array.from({length:7},(_,index)=>({day:index+1}));

function normalizeCompletedDays(days){
  const source=new Set(
    Array.isArray(days)
      ? days.filter(day=>Number.isInteger(day)&&day>=1&&day<=7)
      : []
  );
  const contiguous=[];
  for(let day=1;day<=7;day++){
    if(!source.has(day))break;
    contiguous.push(day);
  }
  return contiguous;
}

function loadCampaignProgress(){
  try{
    const parsed=JSON.parse(safeStorageGet(CAMPAIGN_STORAGE_KEY)||"{}");
    return{completedDays:normalizeCompletedDays(parsed.completedDays)};
  }catch(error){
    return{completedDays:[]};
  }
}

let campaignProgress=loadCampaignProgress();
let selectedCampaignDay=Math.max(
  1,
  Math.min(7,Number(safeStorageGet(CAMPAIGN_SELECTED_DAY_KEY))||1)
);
let selectLatestDayOnMenuReturn=false;
let eventDayLimit=clampEventDays(UNITY_RUNTIME.eventDays);
let pendingEventCompleteScreen=false;
let pendingEventCompleteScore=0;

function completedDaySet(){
  return new Set(normalizeCompletedDays(campaignProgress.completedDays));
}

function nextCampaignDay(){
  const completed=normalizeCompletedDays(campaignProgress.completedDays);
  return completed.length>=7?7:completed.length+1;
}

function unlockedCampaignDay(){
  const next=nextCampaignDay();
  return Math.min(next,eventDayLimit);
}

function campaignAllDaysCompleted(){
  return normalizeCompletedDays(campaignProgress.completedDays).length===7;
}

function campaignDayForTrack(trackId){
  const track=TRACKS_BY_ID.get(trackId);
  return track?{day:track.day,trackId:track.id}:null;
}

function isCampaignDaySelectable(day){
  const completed=completedDaySet();
  const next=nextCampaignDay();
  return Boolean(trackForDay(day))&&day<=eventDayLimit&&(completed.has(day)||day===next);
}

function setCampaignError(message){
  const element=document.getElementById("campaignTrackError");
  if(!element)return;
  element.textContent=message||"";
  element.classList.toggle("hidden",!message);
}

function renderCampaignWeek(){
  const completed=completedDaySet();
  const next=nextCampaignDay();
  const unlocked=unlockedCampaignDay();

  document.querySelectorAll(".campaign-day").forEach(button=>{
    const day=Number(button.dataset.day);
    const track=trackForDay(day);
    const isCompleted=completed.has(day);
    const isUnlocked=day===next&&day<=eventDayLimit&&!isCompleted;
    const isMissing=isUnlocked&&!track;
    const isLocked=day>eventDayLimit||day>next;
    const isSelected=Boolean(track)&&day===selectedCampaignDay&&activeTrack?.id===track.id;
    const selectable=Boolean(track)&&day<=eventDayLimit&&(isCompleted||isUnlocked);

    button.disabled=!selectable;
    button.classList.toggle("is-available",selectable&&!isCompleted);
    button.classList.toggle("is-completed",isCompleted);
    button.classList.toggle("is-missing",isMissing);
    button.classList.toggle("is-locked",isLocked);
    button.classList.toggle("is-selected",isSelected);
    button.setAttribute("aria-pressed",isSelected?"true":"false");
    button.setAttribute("aria-label",t("dayAria",{day}));
    button.title=track
      ? t("dayTrack",{title:track.title,day})
      : (isMissing?t("missingDay",{day}):t("lockedDay",{day}));
  });

  document.querySelectorAll(".campaign-connector").forEach(connector=>{
    const toDay=Number(connector.dataset.toDay);
    connector.classList.toggle("is-completed",completed.has(toDay));
  });

  const title=document.getElementById("campaignTrackTitle");
  const selectedTrack=trackForDay(selectedCampaignDay);
  if(title){
    if(activeTrack?.title) title.textContent=activeTrack.title;
    else if(selectedTrack?.title) title.textContent=selectedTrack.title;
    else if(trackForDay(unlocked)?.title) title.textContent=trackForDay(unlocked).title;
    else title.textContent=t("unloadedDay",{day:unlocked});
  }

  const playButton=document.getElementById("playBtn");
  if(playButton){
    playButton.disabled=!activeChart;
    playButton.setAttribute("aria-disabled",activeChart?"false":"true");
  }
}

async function selectCampaignDay(day){
  if(!isCampaignDaySelectable(day))return;
  const track=trackForDay(day);
  if(!track)return;
  selectedCampaignDay=day;
  safeStorageSet(CAMPAIGN_SELECTED_DAY_KEY,String(day));
  await activateStaticTrack(track.id);
}

async function resetCampaignProgress(){
  const confirmed=window.confirm(
    campaignProgress.completedDays.length?t("resetHas"):t("resetEmpty")
  );
  if(!confirmed)return;

  campaignProgress={completedDays:[]};
  selectedCampaignDay=1;
  safeStorageSet(CAMPAIGN_STORAGE_KEY,JSON.stringify(campaignProgress));
  safeStorageSet(CAMPAIGN_SELECTED_DAY_KEY,"1");
  const firstTrack=trackForDay(1);
  if(firstTrack)await activateStaticTrack(firstTrack.id);
  else{
    Track.stop();
    activeTrack=null;
    activeChart=null;
    board=[];
    currentPlayerEntry=null;
    leaderboardState="ready";
    renderCampaignWeek();
    renderMenuLeaderboard();
    renderHUD();
  }
}

async function markCampaignTrackCompleted(){
  const day=Number(activeTrack?.day);
  if(!Number.isInteger(day)||day!==nextCampaignDay()||day>eventDayLimit)return false;
  if(campaignProgress.completedDays.includes(day))return false;

  campaignProgress.completedDays=normalizeCompletedDays([
    ...campaignProgress.completedDays,
    day
  ]);
  safeStorageSet(CAMPAIGN_STORAGE_KEY,JSON.stringify(campaignProgress));

  // Remember the newly opened, latest available day.
  selectedCampaignDay=unlockedCampaignDay();
  safeStorageSet(CAMPAIGN_SELECTED_DAY_KEY,String(selectedCampaignDay));
  selectLatestDayOnMenuReturn=true;

  renderCampaignWeek();
  return true;
}

document.querySelectorAll(".campaign-day").forEach(button=>{
  button.addEventListener("click",()=>{
    selectCampaignDay(Number(button.dataset.day)).catch(error=>{
      console.error("Не удалось выбрать день:",error);
      setCampaignError(error.message||t("loadTrackError"));
    });
  });
});


/* ---------- Track, chart and static catalog ---------- */
const TRACKS_BY_ID=new Map();
const TRACKS_BY_DAY=new Map();
let activeTrack=null;
let activeChart=null;

const DEFAULT_TRAVEL_BEATS=4;
function travelTimeFromBpm(bpm,travelBeats=DEFAULT_TRAVEL_BEATS){
  return travelBeats*60/bpm;
}

function validateTrackChart(value){
  if(!value||typeof value!=="object"||Array.isArray(value))throw new Error(t("configObject"));
  if(value.type!=="neon-lanes-track"||value.schemaVersion!==1)throw new Error(t("configType"));
  if(!Number.isInteger(value.day)||value.day<1||value.day>7)throw new Error(t("invalidDay"));
  if(typeof value.title!=="string"||!value.title.trim())throw new Error(t("missingTitle"));
  if(!Number.isFinite(value.bpm)||value.bpm<40||value.bpm>240)throw new Error(t("invalidBpm"));
  const travelBeats=Number.isFinite(value.travelBeats)?Number(value.travelBeats):DEFAULT_TRAVEL_BEATS;
  if(travelBeats<1||travelBeats>8)throw new Error(t("invalidTravelBeats"));
  const travelTime=travelTimeFromBpm(Number(value.bpm),travelBeats);
  if(!Array.isArray(value.notes)||value.notes.length===0)throw new Error(t("missingNotes"));
  let previous=-Infinity;
  value.notes.forEach((note,index)=>{
    if(!note||!Number.isFinite(note.time)||note.time<0)throw new Error(t("invalidNoteTime",{index:index+1}));
    if(!Number.isInteger(note.lane)||note.lane<0||note.lane>3)throw new Error(t("invalidLane",{index:index+1}));
    if(note.time<previous)throw new Error(t("notesSorted"));
    previous=note.time;
  });
  return{
    ...value,
    day:Number(value.day),
    title:value.title.trim(),
    bpm:Number(value.bpm),
    travelBeats,
    travelTime,
    duration:Number.isFinite(value.duration)?Number(value.duration):0,
    notes:value.notes.map(note=>({time:Number(note.time),lane:Number(note.lane)}))
  };
}

function normalizeChartForTwoLanes(chart){
  const copy=typeof structuredClone==="function"?structuredClone(chart):JSON.parse(JSON.stringify(chart));
  const grouped=new Map();
  for(const note of copy.notes||[]){
    const time=Number(Number(note.time).toFixed(3));
    const list=grouped.get(time)||[];
    list.push(Number(note.lane)||0);
    grouped.set(time,list);
  }
  const normalized=[];
  for(const [time,list] of Array.from(grouped.entries()).sort((a,b)=>a[0]-b[0])){
    const assigned=[];
    for(const lane of list){
      let mapped=((lane%LANE_COUNT)+LANE_COUNT)%LANE_COUNT;
      if(assigned.includes(mapped))mapped=1-mapped;
      if(assigned.includes(mapped))continue;
      assigned.push(mapped);
    }
    for(const lane of assigned.slice(0,LANE_COUNT))normalized.push({time:Number(time),lane});
  }
  copy.notes=normalized;
  return copy;
}

function trackForDay(day){
  return TRACKS_BY_DAY.get(Number(day))||null;
}

function installTrackCandidates(candidates){
  TRACKS_BY_ID.clear();
  TRACKS_BY_DAY.clear();

  candidates
    .sort((a,b)=>a.modifiedAt-b.modifiedAt||a.manifestOrder-b.manifestOrder)
    .forEach(track=>{
      TRACKS_BY_ID.set(track.id,track);
      TRACKS_BY_DAY.set(track.day,track);
    });

  if(TRACKS_BY_ID.size===0)throw new Error(t("noWorkingTracks"));
  setCampaignError("");
}

function embeddedTrackCandidates(){
  const entries=Array.isArray(CONFIG.staticTracks)?CONFIG.staticTracks:[];
  return entries.map((entry,index)=>{
    const folder=String(entry.folder||"").trim();
    const chart=validateTrackChart(normalizeChartForTwoLanes(
      typeof structuredClone==="function"
        ? structuredClone(entry.chart)
        : JSON.parse(JSON.stringify(entry.chart))
    ));
    const audioFile=String(chart.audioFile||"track.mp3").replace(/^\/+/,"");
    return{
      id:folder,
      leaderboardId:folder,
      title:chart.title,
      day:chart.day,
      audioUrl:`assets/tracks/${folder}/${audioFile}`,
      modifiedAt:Number(entry.modifiedAt)||index+1,
      manifestOrder:index,
      chart
    };
  });
}

async function fetchHostedTrackCandidates(){
  const loadVersion=Date.now();
  const manifestUrl=`assets/tracks/manifest.json?v=${loadVersion}`;
  const response=await fetch(manifestUrl,{
    cache:"no-store",
    headers:{Accept:"application/json"}
  });
  if(!response.ok)throw new Error(t("manifestLoad",{status:response.status}));

  const payload=await response.json();
  const entries=Array.isArray(payload)?payload:payload?.tracks;
  if(!Array.isArray(entries))throw new Error(t("manifestInvalid"));

  const candidates=[];
  for(let index=0;index<entries.length;index++){
    const entry=typeof entries[index]==="string"
      ? {folder:entries[index]}
      : entries[index];
    const folder=String(entry?.folder||"").trim().replace(/^\/+|\/+$/g,"");
    if(!folder||folder.includes(".."))continue;

    const configUrl=`assets/tracks/${folder}/config.json?v=${loadVersion}`;
    const configResponse=await fetch(configUrl,{
      cache:"no-store",
      headers:{Accept:"application/json"}
    });
    if(!configResponse.ok){
      console.warn(`Пропущен трек ${folder}: config.json вернул ${configResponse.status}.`);
      continue;
    }

    const rawChart=await configResponse.json();
    const chart=validateTrackChart(normalizeChartForTwoLanes(rawChart));
    const lastModified=Date.parse(configResponse.headers.get("last-modified")||"")||0;
    const modifiedAt=Number(entry?.modifiedAt)||lastModified||index+1;
    const audioFile=String(chart.audioFile||"track.mp3").replace(/^\/+/,"");
    candidates.push({
      id:folder,
      leaderboardId:folder,
      title:chart.title,
      day:chart.day,
      audioUrl:`assets/tracks/${folder}/${audioFile}?v=${loadVersion}`,
      modifiedAt,
      manifestOrder:index,
      chart
    });
  }
  return candidates;
}

async function loadStaticTracks(){
  // Opening index.html directly uses file://, where browsers block fetch().
  // In that mode use the bundled embedded configs and plain relative MP3 paths.
  if(location.protocol==="file:"){
    installTrackCandidates(embeddedTrackCandidates());
    return;
  }

  try{
    installTrackCandidates(await fetchHostedTrackCandidates());
  }catch(error){
    console.warn("Не удалось прочитать статический манифест, использован встроенный набор:",error);
    installTrackCandidates(embeddedTrackCandidates());
  }
}

const Track=(()=>{
  let audio=null;
  let primedUrl=null;

  function createAudio(url){
    const element=document.createElement("audio");
    element.preload="auto";
    element.playsInline=true;
    element.volume=CONFIG.assets.audio.musicVolume??0.72;
    element.src=url;
    return element;
  }

  function load(url){
    if(audio){
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
    audio=createAudio(url);
    primedUrl=null;
    audio.addEventListener("ended",()=>{
      if(S.screen==="playing")endGame(true);
    });
    audio.addEventListener("error",()=>{
      console.error("Не удалось загрузить аудиотрек:",url,audio.error);
    });
    audio.load();
  }

  function init(){
    if(!audio&&activeTrack?.audioUrl)load(activeTrack.audioUrl);
  }

  function prepare(){
    init();
    return new Promise((resolve,reject)=>{
      if(!audio){reject(new Error(t("noAudioForDay")));return;}

      // readyState 4 = HAVE_ENOUGH_DATA. The tracks are small, so wait for
      // the browser to buffer the whole playable stream before countdown.
      if(audio.readyState>=4){resolve();return;}

      const timeout=setTimeout(()=>{
        cleanup();
        // Some browsers never emit canplaythrough for local/static media.
        // HAVE_FUTURE_DATA is still safe after the warm-up below.
        if(audio.readyState>=3)resolve();
        else reject(new Error(t("audioLoadFailed")));
      },12000);

      const onReady=()=>{cleanup();resolve();};
      const onError=()=>{cleanup();reject(new Error(t("audioUnsupported")));};
      const cleanup=()=>{
        clearTimeout(timeout);
        audio.removeEventListener("canplaythrough",onReady);
        audio.removeEventListener("error",onError);
      };

      audio.addEventListener("canplaythrough",onReady,{once:true});
      audio.addEventListener("error",onError,{once:true});
    });
  }

  async function prime(){
    init();
    if(!audio||primedUrl===audio.src)return;

    const originalVolume=audio.volume;
    try{
      audio.volume=0;
      audio.pause();
      audio.currentTime=0;

      // Warm HTMLMediaElement + MP3 decoder + output route while the user is
      // still waiting for the game to start, never on the first audible beat.
      await audio.play();
      const startedAt=performance.now();
      while(audio.currentTime<0.24&&performance.now()-startedAt<850){
        await new Promise(resolve=>setTimeout(resolve,16));
      }

      audio.pause();
      audio.currentTime=0;

      // Let the seek settle before countdown begins.
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      primedUrl=audio.src;
    }finally{
      audio.volume=originalVolume;
    }
  }

  async function play(){
    init();
    if(!audio)throw new Error(t("audioMissing"));
    audio.currentTime=0;
    await audio.play();
  }

  function pause(){
    if(audio)audio.pause();
  }

  function seek(seconds){
    if(!audio)return;
    try{audio.currentTime=Math.max(0,Number(seconds)||0);}catch(error){}
  }

  function stop(){
    if(audio){
      audio.pause();
      try{audio.currentTime=0;}catch(error){}
    }
  }

  async function resume(){
    if(audio&&audio.paused)await audio.play();
  }

  function time(){return audio?.currentTime||0;}
  return{prepare,load,prime,play,pause,seek,stop,resume,time};
})();

async function activateStaticTrack(trackId){
  const track=TRACKS_BY_ID.get(String(trackId));
  if(!track)throw new Error(t("trackNotFound"));
  Track.stop();
  activeTrack={...track};
  activeChart=validateTrackChart(normalizeChartForTwoLanes(track.chart));
  selectedCampaignDay=track.day;
  safeStorageSet(CAMPAIGN_SELECTED_DAY_KEY,String(track.day));
  Track.load(track.audioUrl);
  await updateTrackInfo();
}

async function selectInitialCampaignTrack(){
  const completed=completedDaySet();
  const unlocked=unlockedCampaignDay();

  // On every fresh launch choose the newest currently available day.
  const newestTrack=trackForDay(unlocked);
  if(newestTrack){
    selectedCampaignDay=unlocked;
    safeStorageSet(CAMPAIGN_SELECTED_DAY_KEY,String(unlocked));
    await activateStaticTrack(newestTrack.id);
    return;
  }

  for(let day=unlocked-1;day>=1;day--){
    const track=trackForDay(day);
    if(completed.has(day)&&track){
      selectedCampaignDay=day;
      safeStorageSet(CAMPAIGN_SELECTED_DAY_KEY,String(day));
      await activateStaticTrack(track.id);
      return;
    }
  }

  activeTrack=null;
  activeChart=null;
  board=[];
  currentPlayerEntry=null;
  leaderboardState="ready";
  renderCampaignWeek();
  renderMenuLeaderboard();
  renderHUD();
}

async function updateTrackInfo(){
  renderCampaignWeek();
  await refreshLeaderboard();
  renderHUD();
}

function showSettingsError(message){
  const hint=document.querySelector(".key-bind-hint");
  if(!hint)return;
  const defaultText=t("keyHint");
  hint.textContent=message||defaultText;
  hint.classList.toggle("has-error",Boolean(message));
}


/* ---------- Canvas & geometry ---------- */
const canvas=document.getElementById("game");
if(!canvas)throw new Error("Canvas #game не найден.");
const ctx=canvas.getContext("2d");
if(!ctx)throw new Error("Устройство не поддерживает Canvas 2D.");
const podiumLeftImg = new Image();
try{podiumLeftImg.decoding="async";}catch(error){}
podiumLeftImg.src = CONFIG.assets.images.left;
const podiumDinoImg = new Image();
try{podiumDinoImg.decoding="async";}catch(error){}
podiumDinoImg.src = CONFIG.assets.images.center;
const forestBackdropImg = new Image();
try{forestBackdropImg.decoding="async";}catch(error){}
forestBackdropImg.src = CONFIG.assets.images.forestBackdrop || "assets/images/forest-backdrop.png";
const stagePlatformImg = new Image();
try{stagePlatformImg.decoding="async";}catch(error){}
stagePlatformImg.src = CONFIG.assets.images.stagePlatform || "assets/images/stage-platform.png";
const lanesSpaceImg = new Image();
try{lanesSpaceImg.decoding="async";}catch(error){}
lanesSpaceImg.src = CONFIG.assets.images.lanesSpace || "assets/images/lanes-space.png";
const podiumRightImg = new Image();
try{podiumRightImg.decoding="async";}catch(error){}
podiumRightImg.src = CONFIG.assets.images.right;

async function preloadVisualAssets(){
  const images=[forestBackdropImg,stagePlatformImg,lanesSpaceImg,podiumLeftImg,podiumDinoImg,podiumRightImg];
  await Promise.all(images.map(async image=>{
    if(image.complete&&image.naturalWidth>0){
      try{await image.decode();}catch(error){}
      return;
    }
    await new Promise(resolve=>{
      image.addEventListener("load",resolve,{once:true});
      image.addEventListener("error",resolve,{once:true});
    });
    try{await image.decode();}catch(error){}
  }));
}

for(const image of [forestBackdropImg,stagePlatformImg,lanesSpaceImg,podiumLeftImg,podiumDinoImg,podiumRightImg]){
  image.addEventListener("load",()=>requestAnimationFrame(()=>render(performance.now())),{once:true});
  image.addEventListener("error",()=>console.error("Не удалось загрузить изображение:",image.src),{once:true});
}
let DPR = Math.min(window.devicePixelRatio || 1, isMobileBrowser()?1.5:1.75);
function resize(){
  DPR = Math.min(window.devicePixelRatio || 1, isMobileBrowser()?1.5:1.75);
  if(typeof spriteRenderCache!=="undefined")spriteRenderCache.clear();
  const r = canvas.getBoundingClientRect();
  canvas.width  = Math.round(r.width  * DPR);
  canvas.height = Math.round(r.height * DPR);
  ctx.setTransform(DPR,0,0,DPR,0,0);
}
window.addEventListener("resize", resize);

function geom(){
  const W = canvas.clientWidth, H = canvas.clientHeight;
  const topBarH = H*0.11;

  // Longer visual lanes: only the top Y coordinate changes.
  // Note timing/travelTime and the t=0..1 movement model are untouched.
  const iphonePortrait=isIPhoneSafari()&&H/Math.max(1,W)>1.75;
  const yTop = H*(iphonePortrait?0.455:0.475);
  const yBtn = H*0.89;

  // On iPhone, cap scene vertical metrics by width so the platform and
  // characters keep proportions closer to the desktop composition.
  const sceneMetricH=iphonePortrait?Math.min(H,W*1.82):H;

  const gapTop = W*0.035, gapBottom = W*0.035;
  const totalTopW = W*0.66, totalBotW = W*0.96;
  const topL = (W-totalTopW-gapTop)/2;
  const botL = (W-totalBotW-gapBottom)/2;
  const topW = totalTopW/2, botW = totalBotW/2;
  return {
    W,H,topBarH,yTop,yBtn,topL,botL,topW,botW,sceneMetricH,
    laneGapTop: gapTop, laneGapBottom: gapBottom,
    tMarker:1,
    stageCX: W*0.50,
    stageCY: yTop-sceneMetricH*0.085,
    stageW: W*1.30,
    stageH: sceneMetricH*0.19,
    progressX: W*0.10,
    progressY: H*0.068,
    progressW: W*0.46,
    progressH: H*0.012,
  };
}
const lerp = (a,b,f)=>a+(b-a)*f;
const clamp = (v,a,b)=>v<a?a:v>b?b:v;
function laneY(g,t){ return lerp(g.yTop, g.yBtn, t); }
function laneCX(g,i,t){
  const topC = g.topL + i*(g.topW+g.laneGapTop) + g.topW/2;
  const botC = g.botL + i*(g.botW+g.laneGapBottom) + g.botW/2;
  return lerp(topC, botC, clamp(t,0,1.3));
}
function laneW(g,t){ return lerp(g.topW, g.botW, clamp(t,0,1.3)); }
function laneLeftX(g,i,t){
  return lerp(g.topL+i*(g.topW+g.laneGapTop), g.botL+i*(g.botW+g.laneGapBottom), clamp(t,0,1.3));
}
function laneRightX(g,i,t){
  return lerp(g.topL+i*(g.topW+g.laneGapTop)+g.topW, g.botL+i*(g.botW+g.laneGapBottom)+g.botW, clamp(t,0,1.3));
}

/* ---------- Game state ---------- */
const S={screen:"menu",score:0,lights:[],popups:[],flash:Array(LANE_COUNT).fill(0),pressed:Array(LANE_COUNT).fill(false),seq:0,ended:false,trackTime:0,preRollStart:0,preRollDuration:0};
let gameRunToken=0;
let board=[],myEntryId=null;
const scoreEl=document.getElementById("score");
const trackTitleDisplay=document.getElementById("trackTitleDisplay");
const trackProgressFill=document.getElementById("trackProgressFill");
function syncGameplayHUDVisibility(){
  const leaderboard = document.getElementById("leaderboardOverlay");
  const leaderboardOpen = leaderboard && !leaderboard.classList.contains("hidden");
  const visibleStates = new Set(["preroll","playing","tutorialPaused","tutorialPlaying","game","paused","ending","finished"]);
  const visible = visibleStates.has(S.screen) && !leaderboardOpen;
  document.body.classList.toggle("gameplay-active", visible);
}
function renderHUD(){
  syncGameplayHUDVisibility();
  if(scoreEl)scoreEl.textContent=String(S.score);
  if(trackTitleDisplay)trackTitleDisplay.textContent=activeChart?.title||t("musicTrack");
}
function sleep(ms){return new Promise(resolve=>setTimeout(resolve,ms));}
async function runCountdown(runToken){
  const overlay=document.getElementById("countdownOverlay");
  const value=document.getElementById("countdownValue");
  overlay.classList.remove("hidden");

  for(const step of ["3","2","1"]){
    if(runToken!==gameRunToken||S.screen!=="countdown")return false;
    value.textContent=step;
    value.style.animation="none";
    void value.offsetWidth;
    value.style.animation="";
    await sleep(760);
  }

  if(runToken!==gameRunToken||S.screen!=="countdown")return false;
  overlay.classList.add("hidden");
  return true;
}

async function runVisualPreRoll(travelTime,runToken){
  if(runToken!==gameRunToken)return false;
  S.screen="preroll";
  S.preRollStart=performance.now();
  S.preRollDuration=Math.max(1,Number(travelTime)*1000);
  S.trackTime=-Number(travelTime);
  renderHUD();

  await sleep(S.preRollDuration);
  return runToken===gameRunToken&&S.screen==="preroll";
}

/* ---------- Guided gameplay tutorial ---------- */
const GAME_TUTORIAL_PHASE={
  idle:"idle",
  overview:"overview",
  targets:"targets",
  motionToChip:"motionToChip",
  chip:"chip",
  timing:"timing",
  awaitHit:"awaitHit",
  rating:"rating",
  results:"results",
  done:"done"
};
let gameplayTutorialPhase=GAME_TUTORIAL_PHASE.idle;
let gameplayTutorialCompleted=false;
let gameplayTutorialFocusLightId=null;
let gameplayTutorialFocusLane=0;
let gameplayTutorialAudioStarted=false;
let gameplayTutorialAudioStarting=false;
let gameplayTutorialVirtualStartTime=0;
let gameplayTutorialVirtualStartedAt=0;
let gameplayTutorialFrozenPopup=null;

function gameplayTutorialOverlay(){return document.getElementById("gameplayTutorial");}
function gameplayTutorialStepElement(phase){
  const map={
    overview:"gameTutorialOverview",
    targets:"gameTutorialTargets",
    chip:"gameTutorialChip",
    timing:"gameTutorialTiming",
    rating:"gameTutorialRating",
    results:"gameTutorialResults"
  };
  return document.getElementById(map[phase]||"");
}
function hideAllGameplayTutorialSteps(){
  document.querySelectorAll("#gameplayTutorial .game-tutorial-step").forEach(el=>el.classList.add("hidden"));
}
function gameplayTutorialSpotlights(){
  return [1,2,3,4,5].map(index=>document.getElementById(index===1?"gameTutorialSpotlight":`gameTutorialSpotlight${index}`)).filter(Boolean);
}
function applySpotlightRect(spot,rect,shape="round"){
  if(!spot)return;
  if(!rect){spot.classList.add("hidden");return;}
  spot.classList.remove("hidden","is-circle","is-pill");
  if(shape==="circle")spot.classList.add("is-circle");
  if(shape==="pill")spot.classList.add("is-pill");
  spot.style.left=`${rect.x}px`;
  spot.style.top=`${rect.y}px`;
  spot.style.width=`${rect.width}px`;
  spot.style.height=`${rect.height}px`;
}
function setGameplayTutorialSpotlights(defs=[]){
  const spots=gameplayTutorialSpotlights();
  spots.forEach((spot,index)=>{
    const def=defs[index]||null;
    if(!def||!def.rect){
      spot.classList.add("hidden");
      return;
    }
    applySpotlightRect(spot,def.rect,def.shape||"round");
  });
}
function setGameplayTutorialSpotlight(rect,shape="round"){
  setGameplayTutorialSpotlights(rect?[{rect,shape}]:[]);
}
function setGameplayTutorialHighlights(elements=[]){
  [document.querySelector("#topBar .hud-track"),document.querySelector("#topBar .hud-score"),document.getElementById("exitGameBtn")].forEach(el=>el?.classList.remove("gameplay-tutorial-highlight"));
  elements.forEach(el=>el?.classList.add("gameplay-tutorial-highlight"));
}
function showGameplayTutorialOverlay(phase,{dim=false}={}){
  const overlay=gameplayTutorialOverlay();
  if(!overlay)return;
  gameplayTutorialPhase=phase;
  hideAllGameplayTutorialSteps();
  const step=gameplayTutorialStepElement(phase);
  if(step)step.classList.remove("hidden");
  overlay.classList.remove("hidden");
  overlay.classList.toggle("is-dimmed",dim);
  overlay.setAttribute("aria-hidden","false");
  requestAnimationFrame(()=>{
    positionGameplayTutorial();
    requestAnimationFrame(positionGameplayTutorial);
  });
}
function hideGameplayTutorialOverlay(){
  const overlay=gameplayTutorialOverlay();
  if(!overlay)return;
  overlay.classList.add("hidden");
  overlay.classList.remove("is-dimmed");
  overlay.setAttribute("aria-hidden","true");
  setGameplayTutorialSpotlights([]);
  setGameplayTutorialHighlights([]);
  document.body.classList.remove("gameplay-tutorial-overview");
}
function tutorialButtonRect(lane,padding=8){
  const g=geom();
  const disc=projectedDiscMetrics(g,g.tMarker);
  const cx=laneCX(g,lane,g.tMarker);
  return{x:cx-disc.width/2-padding,y:g.yBtn-disc.height/2-padding,width:disc.width+padding*2,height:disc.height+padding*2};
}
function tutorialBothButtonsRect(){
  const a=tutorialButtonRect(0,9),b=tutorialButtonRect(1,9);
  return{x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),width:Math.max(a.x+a.width,b.x+b.width)-Math.min(a.x,b.x),height:Math.max(a.y+a.height,b.y+b.height)-Math.min(a.y,b.y)};
}
function tutorialFocusedLight(){
  return S.lights.find(light=>light.id===gameplayTutorialFocusLightId)||null;
}
function tutorialChipRect(light,padding=9){
  if(!light)return null;
  const g=geom();
  const t=clamp(noteProgressAt(light,S.trackTime),0,1.3);
  const disc=projectedDiscMetrics(g,t);
  const cx=laneCX(g,light.lane,t),cy=laneY(g,t);
  return{x:cx-disc.width/2-padding,y:cy-disc.height/2-padding,width:disc.width+padding*2,height:disc.height+padding*2,cx,cy};
}
function positionGameplayTutorial(){
  const overlay=gameplayTutorialOverlay();
  const device=document.getElementById("device");
  if(!overlay||!device||overlay.classList.contains("hidden"))return;
  const rect=device.getBoundingClientRect();
  const W=rect.width,H=rect.height,edge=12;
  const g=geom();

  document.body.classList.toggle("gameplay-tutorial-overview",gameplayTutorialPhase===GAME_TUTORIAL_PHASE.overview);

  if(gameplayTutorialPhase===GAME_TUTORIAL_PHASE.overview){
    const hudBubble=document.getElementById("gameTutorialHud");
    const exitBubble=document.getElementById("gameTutorialExit");
    const lanesBubble=document.getElementById("gameTutorialLanes");
    const trackHud=document.querySelector("#topBar .hud-track");
    const scoreHud=document.querySelector("#topBar .hud-score");
    const exitHud=document.getElementById("exitGameBtn");
    setGameplayTutorialHighlights([trackHud,scoreHud,exitHud]);

    // One combined cutout for both lanes. Using several spotlights with
    // 9999px shadows made their dimming shadows overlap and turn the whole
    // first tutorial step almost black.
    const laneDisc=projectedDiscMetrics(g,g.tMarker);
    const laneTopY=g.yTop+4;
    const laneBottomY=g.yBtn+laneDisc.height*0.62;
    const leftCx=laneCX(g,0,g.tMarker);
    const rightCx=laneCX(g,1,g.tMarker);
    const lanePadding=Math.max(14,laneDisc.width*0.16);
    const combinedLaneRect={
      x:leftCx-laneDisc.width/2-lanePadding,
      y:laneTopY,
      width:(rightCx-leftCx)+laneDisc.width+lanePadding*2,
      height:laneBottomY-laneTopY
    };
    setGameplayTutorialSpotlight(combinedLaneRect,"round");

    if(hudBubble&&trackHud&&scoreHud){
      const a=trackHud.getBoundingClientRect(),b=scoreHud.getBoundingClientRect();
      const width=Math.min(270,Math.max(220,W*0.64));
      hudBubble.style.width=`${width}px`;
      const anchorX=((a.left+b.right)/2)-rect.left;
      const left=clampNumber(anchorX-width/2,edge,W-edge-width);
      const top=Math.max(a.bottom,b.bottom)-rect.top+12;
      hudBubble.style.left=`${left}px`; hudBubble.style.top=`${top}px`;
      hudBubble.style.setProperty("--tutorial-arrow-x",`${clampNumber(anchorX-left,20,width-20)}px`);
    }
    if(exitBubble&&exitHud){
      const e=exitHud.getBoundingClientRect();
      const width=Math.min(126,Math.max(102,W*0.27));
      exitBubble.style.width=`${width}px`;
      const anchorX=e.left-rect.left+e.width/2;
      const left=clampNumber(anchorX-width/2,edge,W-edge-width);
      const top=e.bottom-rect.top+12;
      exitBubble.style.left=`${left}px`; exitBubble.style.top=`${top}px`;
      exitBubble.style.setProperty("--tutorial-arrow-x",`${clampNumber(anchorX-left,16,width-16)}px`);
    }
    if(lanesBubble){
      const width=Math.min(286,Math.max(238,W*0.78));
      lanesBubble.style.width=`${width}px`;
      const height=lanesBubble.offsetHeight||78;
      const left=(W-width)/2;
      const top=clampNumber(g.yTop-height+28,H*0.30,g.yTop+8);
      lanesBubble.style.left=`${left}px`; lanesBubble.style.top=`${top}px`;
      const x0=laneCX(g,0,0.32)-left,x1=laneCX(g,1,0.32)-left;
      lanesBubble.style.setProperty("--tutorial-arrow-left",`${clampNumber(x0,24,width-24)}px`);
      lanesBubble.style.setProperty("--tutorial-arrow-right",`${clampNumber(x1,24,width-24)}px`);
    }
  }

  if(gameplayTutorialPhase===GAME_TUTORIAL_PHASE.targets){
    setGameplayTutorialHighlights([]);
    const focus=tutorialBothButtonsRect();
    setGameplayTutorialSpotlight(focus,"pill");
    const bubble=document.getElementById("gameTutorialTargetsText");
    if(bubble){
      const width=Math.min(280,Math.max(238,W*0.78));
      bubble.style.width=`${width}px`;
      const height=bubble.offsetHeight||90;
      const left=(W-width)/2;
      const top=Math.max(edge,focus.y-height-18);
      bubble.style.left=`${left}px`; bubble.style.top=`${top}px`;
      bubble.style.setProperty("--tutorial-arrow-left",`${clampNumber(laneCX(g,0,g.tMarker)-left,24,width-24)}px`);
      bubble.style.setProperty("--tutorial-arrow-right",`${clampNumber(laneCX(g,1,g.tMarker)-left,24,width-24)}px`);
    }
  }

  if(gameplayTutorialPhase===GAME_TUTORIAL_PHASE.chip){
    const chip=tutorialChipRect(tutorialFocusedLight());
    if(chip){
      setGameplayTutorialSpotlight(chip,"circle");
      const bubble=document.getElementById("gameTutorialChipText");
      if(bubble){
        const width=Math.min(142,Math.max(126,W*0.34));
        bubble.style.width=`${width}px`;
        const height=bubble.offsetHeight||104;
        const placeRight=chip.cx<W*0.52;
        const left=placeRight?Math.min(W-edge-width,chip.x+chip.width+14):Math.max(edge,chip.x-width-14);
        const top=clampNumber(chip.cy-height*0.48,edge,H-edge-height);
        bubble.style.left=`${left}px`; bubble.style.top=`${top}px`;
        bubble.classList.toggle("arrow-left",placeRight);
        bubble.classList.toggle("arrow-right",!placeRight);
        bubble.style.setProperty("--tutorial-arrow-y",`${clampNumber(chip.cy-top,18,height-18)}px`);
      }
    }
  }

  if(gameplayTutorialPhase===GAME_TUTORIAL_PHASE.timing){
    const focus=tutorialButtonRect(gameplayTutorialFocusLane,11);
    setGameplayTutorialSpotlight(focus,"pill");
    const bubble=document.getElementById("gameTutorialTimingText");
    if(bubble){
      const width=Math.min(292,Math.max(246,W*0.82));
      bubble.style.width=`${width}px`;
      const height=bubble.offsetHeight||108;
      const anchorX=focus.x+focus.width/2;
      const left=clampNumber(anchorX-width/2,edge,W-edge-width);
      const top=Math.max(edge,focus.y-height-20);
      bubble.style.left=`${left}px`; bubble.style.top=`${top}px`;
      bubble.style.setProperty("--tutorial-arrow-x",`${clampNumber(anchorX-left,22,width-22)}px`);
    }
  }

  if(gameplayTutorialPhase===GAME_TUTORIAL_PHASE.rating || gameplayTutorialPhase===GAME_TUTORIAL_PHASE.results){
    const button=tutorialButtonRect(gameplayTutorialFocusLane,12);
    const popup=gameplayTutorialFrozenPopup;
    let focus=button;
    if(popup){
      const px=popup.x,py=popup.y;
      const popupRect={x:px-76,y:py-30,width:152,height:58};
      const x=Math.min(button.x,popupRect.x),y=Math.min(button.y,popupRect.y);
      focus={x,y,width:Math.max(button.x+button.width,popupRect.x+popupRect.width)-x,height:Math.max(button.y+button.height,popupRect.y+popupRect.height)-y};
    }
    setGameplayTutorialSpotlight(focus,"round");
    const id=gameplayTutorialPhase===GAME_TUTORIAL_PHASE.rating?"gameTutorialRatingText":"gameTutorialResultsText";
    const bubble=document.getElementById(id);
    if(bubble){
      const width=gameplayTutorialPhase===GAME_TUTORIAL_PHASE.results?Math.min(300,Math.max(250,W*0.82)):Math.min(286,Math.max(240,W*0.78));
      bubble.style.width=`${width}px`;
      const height=bubble.offsetHeight||(gameplayTutorialPhase===GAME_TUTORIAL_PHASE.results?160:100);
      const left=(W-width)/2;
      const top=gameplayTutorialPhase===GAME_TUTORIAL_PHASE.results?clampNumber(H*0.27,edge,H-height-edge):clampNumber(g.yTop+g.H*0.04,edge,H-height-edge);
      bubble.style.left=`${left}px`; bubble.style.top=`${top}px`;
    }
  }
}

function startGameplayTutorial(){
  gameplayTutorialAudioStarted=false;
  gameplayTutorialAudioStarting=false;
  gameplayTutorialFocusLightId=null;
  gameplayTutorialFocusLane=0;
  gameplayTutorialFrozenPopup=null;
  S.screen="tutorialPaused";
  S.trackTime=-Number(activeChart.travelTime);
  renderHUD();
  showGameplayTutorialOverlay(GAME_TUTORIAL_PHASE.overview,{dim:true});
}

function beginTutorialMotion(phase){
  gameplayTutorialPhase=phase;
  hideGameplayTutorialOverlay();
  S.screen="tutorialPlaying";
  if(gameplayTutorialAudioStarted && S.trackTime>=0){
    Track.seek(S.trackTime);
    Track.resume().catch(error=>console.warn(error));
  }else{
    gameplayTutorialVirtualStartTime=S.trackTime;
    gameplayTutorialVirtualStartedAt=performance.now();
  }
  renderHUD();
}

function startTutorialAudioAtZero(){
  if(gameplayTutorialAudioStarted||gameplayTutorialAudioStarting)return;
  gameplayTutorialAudioStarting=true;
  S.trackTime=0;
  Track.play().then(()=>{
    gameplayTutorialAudioStarting=false;
    gameplayTutorialAudioStarted=true;
  }).catch(error=>{
    gameplayTutorialAudioStarting=false;
    console.warn(error);
  });
}

function updateTutorialPlayingClock(now){
  if(gameplayTutorialAudioStarted){
    S.trackTime=Track.time();
    return;
  }
  if(gameplayTutorialAudioStarting){
    S.trackTime=0;
    return;
  }
  const elapsed=(now-gameplayTutorialVirtualStartedAt)/1000;
  S.trackTime=gameplayTutorialVirtualStartTime+elapsed;
  if(S.trackTime>=0)startTutorialAudioAtZero();
}

function pauseGameplayTutorialForChip(light){
  if(!light)return;
  if(gameplayTutorialAudioStarted)Track.pause();
  S.screen="tutorialPaused";
  gameplayTutorialFocusLightId=light.id;
  gameplayTutorialFocusLane=light.lane;
  showGameplayTutorialOverlay(GAME_TUTORIAL_PHASE.chip,{dim:true});
  renderHUD();
}

function pauseGameplayTutorialForRating(lane,popup){
  if(gameplayTutorialAudioStarted){
    S.trackTime=Track.time();
    Track.pause();
  }
  S.screen="tutorialPaused";
  gameplayTutorialFocusLane=lane;
  gameplayTutorialFrozenPopup=popup||null;
  if(gameplayTutorialFrozenPopup)gameplayTutorialFrozenPopup.frozen=true;
  showGameplayTutorialOverlay(GAME_TUTORIAL_PHASE.rating,{dim:true});
  renderHUD();
}

function finishGameplayTutorial(){
  gameplayTutorialCompleted=true;
  gameplayTutorialPhase=GAME_TUTORIAL_PHASE.done;
  hideGameplayTutorialOverlay();
  if(gameplayTutorialFrozenPopup){
    gameplayTutorialFrozenPopup.frozen=false;
    gameplayTutorialFrozenPopup.born=performance.now();
  }
  gameplayTutorialFrozenPopup=null;
  S.screen="playing";
  if(gameplayTutorialAudioStarted){
    Track.seek(S.trackTime);
    Track.resume().catch(error=>console.warn(error));
  }else{
    Track.seek(Math.max(0,S.trackTime));
    Track.resume().then(()=>{gameplayTutorialAudioStarted=true;}).catch(error=>console.warn(error));
  }
  renderHUD();
}

function advanceGameplayTutorial(event){
  if(event){event.preventDefault();event.stopPropagation();}
  if(gameplayTutorialPhase===GAME_TUTORIAL_PHASE.overview){
    S.screen="tutorialPaused";
    showGameplayTutorialOverlay(GAME_TUTORIAL_PHASE.targets,{dim:true});
    return;
  }
  if(gameplayTutorialPhase===GAME_TUTORIAL_PHASE.targets){
    beginTutorialMotion(GAME_TUTORIAL_PHASE.motionToChip);
    return;
  }
  if(gameplayTutorialPhase===GAME_TUTORIAL_PHASE.chip){
    S.screen="tutorialPaused";
    showGameplayTutorialOverlay(GAME_TUTORIAL_PHASE.timing,{dim:true});
    return;
  }
  if(gameplayTutorialPhase===GAME_TUTORIAL_PHASE.timing){
    beginTutorialMotion(GAME_TUTORIAL_PHASE.awaitHit);
    return;
  }
  if(gameplayTutorialPhase===GAME_TUTORIAL_PHASE.rating){
    showGameplayTutorialOverlay(GAME_TUTORIAL_PHASE.results,{dim:true});
    return;
  }
  if(gameplayTutorialPhase===GAME_TUTORIAL_PHASE.results){
    finishGameplayTutorial();
  }
}

function updateGameplayTutorialRuntime(now){
  if(S.screen!=="tutorialPlaying")return;
  updateTutorialPlayingClock(now);
  if(gameplayTutorialPhase===GAME_TUTORIAL_PHASE.motionToChip){
    const candidates=S.lights
      .filter(light=>!light.hit&&!light.missed)
      .map(light=>({light,t:noteProgressAt(light,S.trackTime)}))
      .filter(item=>item.t>=0.50&&item.t<=1.05)
      .sort((a,b)=>a.light.targetTime-b.light.targetTime);
    if(candidates.length){
      pauseGameplayTutorialForChip(candidates[0].light);
    }
  }
}

function resetGameplayTutorialForMenu(){
  hideGameplayTutorialOverlay();
  gameplayTutorialPhase=GAME_TUTORIAL_PHASE.idle;
  gameplayTutorialFocusLightId=null;
  gameplayTutorialFrozenPopup=null;
  gameplayTutorialAudioStarted=false;
  gameplayTutorialAudioStarting=false;
}

function bindGameplayTutorial(){
  const overlay=gameplayTutorialOverlay();
  if(!overlay)return;
  overlay.addEventListener("click",advanceGameplayTutorial);
  window.addEventListener("resize",()=>{
    if(!overlay.classList.contains("hidden"))requestAnimationFrame(positionGameplayTutorial);
  });
  window.addEventListener("orientationchange",()=>{
    if(!overlay.classList.contains("hidden"))setTimeout(positionGameplayTutorial,120);
  });
}

const originalFinishGameplayTutorial=finishGameplayTutorial;
finishGameplayTutorial=function(){
  const wasCompleted=gameplayTutorialCompleted;
  const result=originalFinishGameplayTutorial();
  if(!wasCompleted&&gameplayTutorialCompleted){
    UNITY_RUNTIME.tutorialCompleted=true;
    HostBridge.sendUnityMessage("tutorial_complete");
  }
  return result;
};

async function startGame(){
  if(!activeChart){alert(t("trackConfigMissing"));return;}
  hideMenuTutorial();
  if(["countdown","preroll","playing","tutorialPaused","tutorialPlaying"].includes(S.screen))return;

  const runToken=++gameRunToken;
  pendingEventCompleteScreen=false;
  pendingEventCompleteScore=0;

  try{
    await Track.prepare();
    if(runToken!==gameRunToken)return;
    await Track.prime();
    if(runToken!==gameRunToken)return;
  }catch(error){
    if(runToken!==gameRunToken)return;
    console.error(error);
    alert(error.message);
    return;
  }

  HostBridge.send("game_start",{track:activeChart.title});
  S.screen="countdown";
  S.score=0;
  S.ended=false;
  lastProgressPermille=-1;
  trackProgressFill?.style.setProperty("--track-progress","0%");
  S.lights=[];
  S.popups.length=0;
  S.flash=Array(LANE_COUNT).fill(0);
  myEntryId=null;

  document.getElementById("menu").classList.add("hidden");
  updateMobileViewport();
  document.getElementById("gameover").classList.add("hidden");
  renderHUD();

  S.lights=activeChart.notes.map(note=>({
    id:++S.seq,
    lane:note.lane,
    targetTime:Number(note.time),
    startTime:Number(note.time)-Number(activeChart.travelTime),
    travel:Number(activeChart.travelTime),
    hit:false,
    missed:false,
    hitT:0
  }));
  S.trackTime=-Number(activeChart.travelTime);

  if(!gameplayTutorialCompleted){
    startGameplayTutorial();
    return;
  }

  const countdownCompleted=await runCountdown(runToken);
  if(!countdownCompleted)return;

  const prerollCompleted=await runVisualPreRoll(activeChart.travelTime,runToken);
  if(!prerollCompleted)return;

  try{
    if(runToken!==gameRunToken||S.screen!=="preroll")return;

    // Decoder/output were warmed before countdown; real playback starts
    // directly here so no extra seek/decode operation can stall the first beat.
    await Track.play();

    // Exiting to the menu while play() is resolving must not resurrect
    // an old game session.
    if(runToken!==gameRunToken||S.screen!=="preroll"){
      Track.stop();
      return;
    }

    S.screen="playing";
    S.trackTime=Track.time();
    S.playStart=performance.now();
    renderHUD();

  }catch(error){
    if(runToken!==gameRunToken)return;
    console.warn(error);
    S.screen="menu";
    document.getElementById("countdownOverlay")?.classList.add("hidden");
    document.getElementById("menu").classList.remove("hidden");
    alert(t("browserAudioBlocked"));
  }
}
function noteProgressAt(light,trackTime){
  return(trackTime-light.startTime)/light.travel;
}
function noteProgress(light){
  return noteProgressAt(light,S.trackTime);
}
function addPopup(text,color,lane,t){
  const g=geom();
  const popup={text,color,x:laneCX(g,lane,t),y:laneY(g,t),born:performance.now(),frozen:false};
  S.popups.push(popup);
  return popup;
}
function projectedDiscMetrics(g,t){
  const width=laneW(g,t)*0.92;
  const perspective=lerp(0.36,0.50,clamp(t,0,1.3));
  return{width,height:width*perspective};
}
function buttonSize(g){return projectedDiscMetrics(g,g.tMarker).width;}

function chipButtonPosition(g,light,trackTime){
  const t=noteProgressAt(light,trackTime);
  const chipX=laneCX(g,light.lane,t);
  const chipY=laneY(g,t);
  const chip=projectedDiscMetrics(g,t);
  const buttonX=laneCX(g,light.lane,g.tMarker);
  const buttonY=g.yBtn;
  const button=projectedDiscMetrics(g,g.tMarker);
  const halfRangeX=(chip.width+button.width)/2;
  const halfRangeY=(chip.height+button.height)/2;
  const dx=Math.abs(chipX-buttonX);
  const dy=Math.abs(chipY-buttonY);
  return{
    t,
    overlaps:dx<=halfRangeX&&dy<=halfRangeY,
    normalizedDistance:Math.max(dx/Math.max(1,halfRangeX),dy/Math.max(1,halfRangeY))
  };
}

function press(lane){
  const tutorialHitWindow=S.screen==="tutorialPlaying"&&gameplayTutorialPhase===GAME_TUTORIAL_PHASE.awaitHit;
  if(S.screen!=="playing"&&!tutorialHitWindow)return;

  const g=geom();
  const now=performance.now();
  const trackTime=S.trackTime;
  S.flash[lane]=160;

  let best=null;
  let bestPosition=null;

  for(const light of S.lights){
    if(light.lane!==lane||light.hit||light.missed)continue;
    const position=chipButtonPosition(g,light,trackTime);
    const lateBy=trackTime-light.targetTime;
    const inFrameDropGrace=lateBy>=0&&lateBy<=0.09;
    if(!position.overlaps&&!inFrameDropGrace)continue;

    const effectivePosition=inFrameDropGrace&&!position.overlaps
      ? {...position,normalizedDistance:1}
      : position;

    if(!bestPosition||effectivePosition.normalizedDistance<bestPosition.normalizedDistance){
      best=light;
      bestPosition=effectivePosition;
    }
  }

  if(best){
    let points=1;
    let label=t("ok");
    if(bestPosition.normalizedDistance<=HIT_PERFECT_POSITION){
      points=3;
      label=t("perfect");
    }else if(bestPosition.normalizedDistance<=HIT_GOOD_POSITION){
      points=2;
      label=t("good");
    }

    best.hit=true;
    best.hitT=now;
    S.score+=points;
    const popup=addPopup(label,LANES[lane].color,lane,g.tMarker-.06);
    renderHUD();
    if(tutorialHitWindow){
      pauseGameplayTutorialForRating(lane,popup);
    }
    return;
  }

  return;
}


function update(now){
  if(S.screen==="playing"){
    const g=geom();
    const trackTime=S.trackTime;

    for(let k=S.lights.length-1;k>=0;k--){
      const light=S.lights[k];

      if(light.hit){
        if(now-light.hitT>170)S.lights.splice(k,1);
        continue;
      }

      const position=chipButtonPosition(g,light,trackTime);

      // Missed notes have no penalty, text, or sound.
      // Keep a tiny 90 ms late grace window so a single dropped browser frame
      // cannot delete a note before the next input event is processed.
      const lateBy=trackTime-light.targetTime;
      if(position.t>g.tMarker&&!position.overlaps&&lateBy>0.09){
        S.lights.splice(k,1);
        continue;
      }

      if(position.t>1.32)S.lights.splice(k,1);
    }
  }

  for(let i=0;i<LANE_COUNT;i++){
    if(S.flash[i]>0)S.flash[i]=Math.max(0,S.flash[i]-16);
  }
  for(let k=S.popups.length-1;k>=0;k--){
    if(S.popups[k].frozen)continue;
    if(now-S.popups[k].born>650)S.popups.splice(k,1);
  }
}

/* ---------- Rendering ---------- */
function roundRectPath(x,y,w,h,r){
  ctx.beginPath();
  ctx.moveTo(x+r,y);
  ctx.arcTo(x+w,y,x+w,y+h,r);
  ctx.arcTo(x+w,y+h,x,y+h,r);
  ctx.arcTo(x,y+h,x,y,r);
  ctx.arcTo(x,y,x+w,y,r);
  ctx.closePath();
}
function fillCircle(x,y,r,color){
  ctx.beginPath();
  ctx.arc(x,y,r,0,Math.PI*2);
  ctx.fillStyle = color;
  ctx.fill();
}
function strokeCircle(x,y,r,color,w=2){
  ctx.beginPath();
  ctx.arc(x,y,r,0,Math.PI*2);
  ctx.lineWidth = w;
  ctx.strokeStyle = color;
  ctx.stroke();
}
function fillProjectedDisc(x,y,width,height,color,alpha=1){
  ctx.save();
  ctx.globalAlpha*=alpha;
  ctx.beginPath();
  ctx.ellipse(x,y,width/2,height/2,0,0,Math.PI*2);
  ctx.fillStyle=color;
  ctx.fill();
  ctx.restore();
}
function strokeProjectedDisc(x,y,width,height,color,lineWidth=2,alpha=1){
  ctx.save();
  ctx.globalAlpha*=alpha;
  ctx.beginPath();
  ctx.ellipse(x,y,width/2,height/2,0,0,Math.PI*2);
  ctx.lineWidth=lineWidth;
  ctx.strokeStyle=color;
  ctx.stroke();
  ctx.restore();
}
let lastProgressPermille=-1;
function drawProgressBar(g){
  const current=Track.time();
  const duration=activeChart?.duration||0;
  const progressValue=duration>0?clamp(current/duration,0,1):0;
  const permille=Math.round(progressValue*500)*2;
  if(trackProgressFill&&permille!==lastProgressPermille){
    lastProgressPermille=permille;
    trackProgressFill.style.setProperty("--track-progress",`${permille/10}%`);
  }
}
function drawMusicDecor(g){
  const notes = [
    [g.W*0.12, g.H*0.28, 28, -0.15, '#ff79a8'],
    [g.W*0.27, g.H*0.32, 24, 0.05, '#ffd24c'],
    [g.W*0.75, g.H*0.31, 26, 0.1, '#8fd94e'],
    [g.W*0.87, g.H*0.36, 34, 0.04, '#d5efff'],
  ];
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const [x,y,size,rot,col] of notes){
    ctx.save();
    ctx.translate(x,y); ctx.rotate(rot);
    ctx.font = `900 ${size}px "Nunito", sans-serif`;
    ctx.fillStyle = col;
    ctx.fillText('♪', 0, 0);
    ctx.restore();
  }
  ctx.restore();
}
function drawKidWheelchair(x,y,s){
  ctx.save();
  ctx.translate(x,y);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(3, s*0.08);
  ctx.fillStyle = '#6a482e';
  ctx.beginPath(); ctx.arc(0,-s*0.64,s*0.18,0,Math.PI*2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#f7c290';
  ctx.beginPath(); ctx.arc(0,-s*0.60,s*0.16,0,Math.PI*2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#72d53f';
  roundRectPath(-s*0.22,-s*0.34,s*0.46,s*0.32,s*0.10); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = '#174f8b'; ctx.lineWidth = Math.max(3,s*0.08);
  ctx.beginPath(); ctx.arc(-s*0.14,s*0.10,s*0.18,0,Math.PI*2); ctx.stroke();
  ctx.beginPath(); ctx.arc(s*0.16,s*0.12,s*0.09,0,Math.PI*2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-s*0.02,-s*0.05); ctx.lineTo(-s*0.10,s*0.03); ctx.lineTo(s*0.10,s*0.03); ctx.stroke();
  ctx.restore();
}
function drawHeadphoneGirl(x,y,s){
  ctx.save();
  ctx.translate(x,y);
  ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(3, s*0.08); ctx.lineCap='round'; ctx.lineJoin='round';
  ctx.fillStyle = '#151b38';
  ctx.beginPath(); ctx.arc(0,-s*0.58,s*0.20,Math.PI,Math.PI*2); ctx.fill();
  ctx.fillStyle = '#f7c290';
  ctx.beginPath(); ctx.arc(0,-s*0.58,s*0.16,0,Math.PI*2); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = '#ffce2d'; ctx.lineWidth = Math.max(5, s*0.09);
  ctx.beginPath(); ctx.arc(0,-s*0.58,s*0.19,Math.PI*1.1,Math.PI*1.9); ctx.stroke();
  fillCircle(-s*0.16,-s*0.58,s*0.05,'#ffce2d'); fillCircle(s*0.16,-s*0.58,s*0.05,'#ffce2d');
  ctx.fillStyle = '#ffc12c'; ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(3,s*0.08);
  roundRectPath(-s*0.20,-s*0.34,s*0.40,s*0.40,s*0.12); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = '#f7c290'; ctx.lineWidth = Math.max(5,s*0.07);
  ctx.beginPath(); ctx.moveTo(-s*0.10,-s*0.20); ctx.lineTo(-s*0.26,-s*0.02); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(s*0.10,-s*0.20); ctx.lineTo(s*0.24,-s*0.42); ctx.stroke();
  ctx.restore();
}
function drawDrummerBoy(x,y,s){
  ctx.save();
  ctx.translate(x,y);
  ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(3,s*0.08); ctx.lineCap='round'; ctx.lineJoin='round';
  ctx.fillStyle = '#5b2e1b';
  ctx.beginPath(); ctx.arc(0,-s*0.60,s*0.18,0,Math.PI*2); ctx.fill();
  ctx.fillStyle = '#a75f38';
  ctx.beginPath(); ctx.arc(0,-s*0.56,s*0.16,0,Math.PI*2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#8c5cf2';
  roundRectPath(-s*0.22,-s*0.34,s*0.44,s*0.34,s*0.10); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#c97b2a'; ctx.strokeStyle = '#965319'; ctx.lineWidth = Math.max(2,s*0.05);
  roundRectPath(-s*0.18,-s*0.02,s*0.36,s*0.28,s*0.08); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(2,s*0.04);
  ctx.beginPath(); ctx.moveTo(-s*0.12,-s*0.12); ctx.lineTo(-s*0.04,-s*0.24); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(s*0.12,-s*0.12); ctx.lineTo(s*0.20,-s*0.24); ctx.stroke();
  ctx.restore();
}
function drawTambourineGirl(x,y,s){
  ctx.save();
  ctx.translate(x,y);
  ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(3,s*0.08); ctx.lineCap='round'; ctx.lineJoin='round';
  ctx.fillStyle = '#f67625';
  ctx.beginPath(); ctx.arc(0,-s*0.60,s*0.18,0,Math.PI*2); ctx.fill();
  ctx.fillStyle = '#f7c290';
  ctx.beginPath(); ctx.arc(0,-s*0.56,s*0.16,0,Math.PI*2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#ff5da1';
  roundRectPath(-s*0.22,-s*0.34,s*0.44,s*0.38,s*0.10); ctx.fill(); ctx.stroke();
  strokeCircle(s*0.22,-s*0.18,s*0.10,'#ffe08a', Math.max(4,s*0.06));
  fillCircle(s*0.22,-s*0.18,s*0.05,'#ffdf73');
  ctx.restore();
}
function drawDino(x,y,s,tilt){
  ctx.save();
  ctx.translate(x,y);
  ctx.rotate(tilt);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.fillStyle = '#8fd94e';
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = Math.max(4, s*0.07);
  // tail
  ctx.beginPath();
  ctx.moveTo(-s*0.42, s*0.02);
  ctx.quadraticCurveTo(-s*0.70, -s*0.02, -s*0.72, s*0.16);
  ctx.quadraticCurveTo(-s*0.55, s*0.20, -s*0.35, s*0.12);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  // body
  ctx.beginPath(); ctx.ellipse(-s*0.05,0,s*0.33,s*0.26,-0.1,0,Math.PI*2); ctx.fill(); ctx.stroke();
  // neck + head
  ctx.beginPath();
  ctx.moveTo(s*0.10,-s*0.18);
  ctx.quadraticCurveTo(s*0.18,-s*0.34,s*0.32,-s*0.34);
  ctx.quadraticCurveTo(s*0.56,-s*0.36,s*0.56,-s*0.16);
  ctx.quadraticCurveTo(s*0.58,0,s*0.42,s*0.02);
  ctx.quadraticCurveTo(s*0.18,0,s*0.06,-s*0.08);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  // legs
  ctx.beginPath(); ctx.moveTo(-s*0.12,s*0.18); ctx.lineTo(-s*0.18,s*0.42); ctx.lineTo(-s*0.03,s*0.42); ctx.lineTo(s*0.02,s*0.18); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(s*0.12,s*0.16); ctx.lineTo(s*0.17,s*0.44); ctx.lineTo(s*0.31,s*0.44); ctx.lineTo(s*0.24,s*0.14); ctx.closePath(); ctx.fill(); ctx.stroke();
  // arms
  ctx.beginPath(); ctx.moveTo(s*0.22,-s*0.01); ctx.lineTo(s*0.38,s*0.08); ctx.lineTo(s*0.28,s*0.14); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(s*0.04,s*0.00); ctx.lineTo(-s*0.14,s*0.08); ctx.lineTo(-s*0.05,s*0.16); ctx.closePath(); ctx.fill(); ctx.stroke();
  // spikes
  for (let i=0;i<5;i++){
    const sx = -s*0.10 + i*s*0.12;
    const sy = -s*0.18 - i*s*0.01;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx+s*0.05, sy-s*0.10);
    ctx.lineTo(sx+s*0.10, sy+s*0.01);
    ctx.closePath();
    ctx.fillStyle = '#ef5d40'; ctx.fill(); ctx.strokeStyle = '#ffffff'; ctx.stroke();
  }
  // face
  fillCircle(s*0.36,-s*0.20,s*0.06,'#ffffff');
  fillCircle(s*0.38,-s*0.20,s*0.025,'#1d243c');
  ctx.strokeStyle = '#d53a3a'; ctx.lineWidth = Math.max(3,s*0.04);
  ctx.beginPath(); ctx.arc(s*0.36,-s*0.07,s*0.12,0.2,2.5); ctx.stroke();
  ctx.restore();
}
const spriteRenderCache=new Map();
function drawPodiumAndCharacters(g, now){
  const sceneH=g.sceneMetricH||g.H;
  const bob = Math.sin(now/220) * g.stageH*0.020;
  const sway = Math.sin(now/260) * 0.055;

  // Forest fills the whole upper scene while preserving its source proportions.
  if(forestBackdropImg.complete&&forestBackdropImg.naturalWidth>0){
    // Use only the upper 72% of the source image so the forest does not
    // protrude below the wooden stage. The sprite itself is not redrawn.
    const sx=0;
    const sy=0;
    const sw=forestBackdropImg.naturalWidth;
    const sh=Math.round(forestBackdropImg.naturalHeight*0.72);
    const targetH=g.yTop-sceneH*0.035;
    const scale=Math.max(g.W/sw,targetH/sh);
    const w=sw*scale;
    const h=sh*scale;
    ctx.drawImage(
      forestBackdropImg,
      sx,sy,sw,sh,
      (g.W-w)/2,
      g.yTop-h-sceneH*0.020,
      w,h
    );
  }

  // The wooden platform is deliberately oversized. Its lower rim meets the lane origin.
  const laneJoinY=g.yTop+sceneH*0.025;
  if(stagePlatformImg.complete&&stagePlatformImg.naturalWidth>0){
    const sx=0, sy=610, sw=stagePlatformImg.naturalWidth, sh=690;
    // Slightly larger stage, still fitted proportionally.
    // Width intentionally extends beyond the viewport so the visible platform
    // reaches both edges without stretching the source image.
    const maxW=g.W*1.92;
    const maxH=sceneH*0.34;
    const sourceRatio=sw/sh;
    const boxRatio=maxW/maxH;
    const dw=sourceRatio>boxRatio?maxW:maxH*sourceRatio;
    const dh=sourceRatio>boxRatio?maxW/sourceRatio:maxH;
    const dx=g.stageCX-dw/2;
    const dy=laneJoinY-dh*0.72;
    ctx.drawImage(stagePlatformImg,sx,sy,sw,sh,dx,dy,dw,dh);
  }

  const drawCroppedSprite=(img,cx,feetY,maxW,maxH,source,rotation=0,bobY=0,highQuality=false)=>{
    if(!(img.complete&&img.naturalWidth>0))return;
    const [sx,sy,sw,sh]=source;

    // Fit the source crop into the requested box without changing its aspect ratio.
    // This prevents characters and stage art from looking vertically squashed
    // on tall Safari viewports such as iPhone 16.
    const sourceRatio=sw/sh;
    const boxRatio=maxW/maxH;
    let dw,dh;
    if(sourceRatio>boxRatio){
      dw=maxW;
      dh=dw/sourceRatio;
    }else{
      dh=maxH;
      dw=dh*sourceRatio;
    }

    ctx.save();
    ctx.imageSmoothingEnabled=true;
    ctx.imageSmoothingQuality="high";
    ctx.translate(Math.round(cx*DPR)/DPR,Math.round((feetY-dh/2+bobY)*DPR)/DPR);
    if(rotation)ctx.rotate(rotation);

    if(highQuality){
      const cacheScale=Math.max(1,Math.min(2,DPR));
      const cacheW=Math.max(1,Math.round(dw*cacheScale));
      const cacheH=Math.max(1,Math.round(dh*cacheScale));
      const cacheKey=[
        img.src,sx,sy,sw,sh,cacheW,cacheH
      ].join("|");
      let cached=spriteRenderCache.get(cacheKey);
      if(!cached){
        cached=document.createElement("canvas");
        cached.width=cacheW;
        cached.height=cacheH;
        const cacheCtx=cached.getContext("2d",{alpha:true});
        cacheCtx.imageSmoothingEnabled=true;
        cacheCtx.imageSmoothingQuality="high";
        cacheCtx.clearRect(0,0,cacheW,cacheH);
        cacheCtx.drawImage(img,sx,sy,sw,sh,0,0,cacheW,cacheH);
        spriteRenderCache.set(cacheKey,cached);
      }
      ctx.drawImage(cached,-dw/2,-dh/2,dw,dh);
    }else{
      ctx.drawImage(img,sx,sy,sw,sh,-dw/2,-dh/2,dw,dh);
    }
    ctx.restore();
  };

  // Sprites are drawn after the stage. The complete lower parts reach the stage plane.
  const stageFeetY=laneJoinY-sceneH*0.025;
  const childrenDrop=sceneH*0.040;
  drawCroppedSprite(
    podiumLeftImg,
    g.stageCX-g.W*0.31,
    stageFeetY+sceneH*0.024+childrenDrop,
    g.W*0.62,
    sceneH*0.355,
    [0,0,podiumLeftImg.naturalWidth,podiumLeftImg.naturalHeight],
    0,
    0,
    true
  );
  drawCroppedSprite(
    podiumRightImg,
    g.stageCX+g.W*0.31,
    stageFeetY+childrenDrop,
    g.W*0.68,
    sceneH*0.350,
    [0,0,podiumRightImg.naturalWidth,podiumRightImg.naturalHeight],
    0,
    0,
    true
  );
  // Dino moves together with the stage by about one centimetre.
  drawCroppedSprite(
    podiumDinoImg,
    g.stageCX,
    stageFeetY+sceneH*0.090,
    g.W*0.44,
    sceneH*0.325,
    [0,0,podiumDinoImg.naturalWidth,podiumDinoImg.naturalHeight],
    sway,
    bob,
    true
  );
}

function drawGameSceneSprite(g){
  if(!(lanesSpaceImg.complete&&lanesSpaceImg.naturalWidth>0))return;
  const top=g.stageCY-g.stageH*0.95;
  const targetH=g.H-top;
  const scale=Math.max(g.W/lanesSpaceImg.naturalWidth,targetH/lanesSpaceImg.naturalHeight);
  const w=lanesSpaceImg.naturalWidth*scale;
  const h=lanesSpaceImg.naturalHeight*scale;
  ctx.drawImage(lanesSpaceImg,(g.W-w)/2,top,g.W>0?w:0,h);
}

function drawCharacterSprites(g, now){
  drawPodiumAndCharacters(g, now);
}

function safeCanvasLayer(name,draw){
  try{draw();}
  catch(error){console.error(`Ошибка слоя ${name}:`,error);}
}
function render(now){
  syncGameplayHUDVisibility();
  const g = geom();
  const { W,H } = g;
  ctx.clearRect(0,0,W,H);

  // background sky
  const sky = ctx.createLinearGradient(0,0,0,H);
  sky.addColorStop(0,'#1ab4ff');
  sky.addColorStop(0.55,'#1292eb');
  sky.addColorStop(1,'#0a64c6');
  ctx.fillStyle = sky;
  ctx.fillRect(0,0,W,H);

  safeCanvasLayer("music-decor",()=>drawMusicDecor(g));
  safeCanvasLayer("progress",()=>drawProgressBar(g));
  safeCanvasLayer("scene-sprite",()=>drawGameSceneSprite(g));

  // stage floor glow toward player
  const laneEndT = 1.30;
  const laneEndY = laneY(g, laneEndT);
  const grd = ctx.createLinearGradient(0, g.yTop, 0, laneEndY);
  grd.addColorStop(0, 'rgba(255,255,255,0.03)');
  grd.addColorStop(1, 'rgba(20,100,210,0.36)');
  ctx.fillStyle = grd;
  ctx.beginPath();
  ctx.moveTo(laneLeftX(g,0,0), g.yTop); ctx.lineTo(laneRightX(g,LANE_COUNT-1,0), g.yTop);
  ctx.lineTo(laneRightX(g,LANE_COUNT-1,laneEndT), laneEndY); ctx.lineTo(laneLeftX(g,0,laneEndT), laneEndY);
  ctx.closePath(); ctx.fill();

  // faint horizontal frets for depth
  ctx.lineWidth = 1;
  for (let f=1; f<=6; f++){
    const t = f/8;
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath();
    ctx.moveTo(laneLeftX(g,0,t), laneY(g,t));
    ctx.lineTo(laneRightX(g,LANE_COUNT-1,t), laneY(g,t));
    ctx.stroke();
  }

  // lanes
  for (let i=0;i<LANE_COUNT;i++){
    const L = LANES[i];
    const lTx = laneLeftX(g,i,0), rTx = laneRightX(g,i,0);
    const lBx = laneLeftX(g,i,laneEndT), rBx = laneRightX(g,i,laneEndT);
    const laneGrad = ctx.createLinearGradient(0,g.yTop,0,laneEndY);
    laneGrad.addColorStop(0, L.glow + '0.52)');
    laneGrad.addColorStop(1, L.glow + '0.20)');
    ctx.fillStyle = laneGrad;
    ctx.beginPath();
    ctx.moveTo(lTx, g.yTop); ctx.lineTo(rTx, g.yTop);
    ctx.lineTo(rBx, laneEndY); ctx.lineTo(lBx, laneEndY);
    ctx.closePath(); ctx.fill();

    const shine = ctx.createLinearGradient(lTx,0,rTx,0);
    shine.addColorStop(0,'rgba(255,255,255,0.06)');
    shine.addColorStop(0.5,'rgba(255,255,255,0.16)');
    shine.addColorStop(1,'rgba(255,255,255,0.06)');
    ctx.fillStyle = shine;
    ctx.beginPath();
    ctx.moveTo(lerp(lTx,rTx,0.46), g.yTop);
    ctx.lineTo(lerp(lTx,rTx,0.54), g.yTop);
    ctx.lineTo(lerp(lBx,rBx,0.60), laneEndY);
    ctx.lineTo(lerp(lBx,rBx,0.40), laneEndY);
    ctx.closePath(); ctx.fill();

    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(255,255,255,0.62)';
    ctx.beginPath(); ctx.moveTo(lTx, g.yTop); ctx.lineTo(lBx, laneEndY); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(rTx, g.yTop); ctx.lineTo(rBx, laneEndY); ctx.stroke();
  }

  // lights
  for (const Lt of S.lights){
    const L = LANES[Lt.lane];
    let t = noteProgress(Lt);
    if (t < 0) continue;
    if (Lt.hit){
      const age = (now - Lt.hitT)/170;
      const cx = laneCX(g, Lt.lane, g.tMarker), cy = laneY(g, g.tMarker);
      const base=projectedDiscMetrics(g,g.tMarker);
      const scale=1+age*0.65;
      ctx.save();
      ctx.globalAlpha = 1 - age;
      ctx.shadowColor = L.color; ctx.shadowBlur = 8;
      strokeProjectedDisc(cx,cy,base.width*scale,base.height*scale,L.color,3);
      ctx.restore();
      continue;
    }
    t = clamp(t, 0, 1.30);
    const cx = laneCX(g, Lt.lane, t), cy = laneY(g, t);
    const disc=projectedDiscMetrics(g,t);
    const dim = Lt.missed ? 0.35 : 1;
    ctx.save();
    ctx.globalAlpha = dim;
    ctx.shadowColor = L.color; ctx.shadowBlur = 8*Math.min(1,t+0.3);
    fillProjectedDisc(cx,cy,disc.width,disc.height,L.color);
    const highlight=ctx.createLinearGradient(0,cy-disc.height/2,0,cy+disc.height/2);
    highlight.addColorStop(0,'rgba(255,255,255,.34)');
    highlight.addColorStop(.46,'rgba(255,255,255,.08)');
    highlight.addColorStop(1,'rgba(0,0,0,.10)');
    fillProjectedDisc(cx,cy,disc.width*0.90,disc.height*0.72,highlight);
    strokeProjectedDisc(cx,cy,disc.width,disc.height,'rgba(255,255,255,.92)',Math.max(2,disc.height*0.12));
    ctx.restore();
  }

  // Draw the stage and characters above the moving chips.
  // Chips remain visible once they travel past the lower edge of the stage,
  // creating the effect that they emerge from underneath it.
  safeCanvasLayer("scene-characters",()=>drawCharacterSprites(g,now));

  // buttons: projected, semi-transparent targets on the lane surface.
  for (let i=0;i<LANE_COUNT;i++){
    const L = LANES[i];
    const cx = laneCX(g, i, g.tMarker);
    const cy = g.yBtn;
    const disc=projectedDiscMetrics(g,g.tMarker);
    const flash = S.flash[i] / 160;
    ctx.save();
    ctx.shadowColor = L.color; ctx.shadowBlur = 6 + flash*10;
    fillProjectedDisc(cx,cy,disc.width,disc.height,L.color,0.30+flash*0.22);
    fillProjectedDisc(cx,cy-disc.height*0.05,disc.width*0.88,disc.height*0.62,'rgba(255,255,255,.22)',0.55+flash*0.25);
    strokeProjectedDisc(cx,cy,disc.width,disc.height,'rgba(255,255,255,.88)',Math.max(3,disc.height*0.14),0.78+flash*0.18);
    if(showHotkeys){
      ctx.fillStyle = 'rgba(255,255,255,.94)';
      ctx.font = `900 ${Math.round(disc.height*0.72)}px "Nunito", sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(keyLabel(keyBindings[i]),cx,cy+1);
    }
    ctx.restore();
  }

  // hit result popups — large and outlined for every language.
  for (const p of S.popups){
    const age = p.frozen?0:(now - p.born)/650;
    ctx.save();
    ctx.globalAlpha = 1 - age;
    ctx.fillStyle = p.color;
    ctx.font = `1000 ${30 - age*4}px "Nunito", system-ui, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;
    ctx.shadowColor = p.color;
    ctx.shadowBlur = 7;
    const popupY = p.y - age*40;

    // Do not key this by English text: PERFECT / GOOD / OK are translated.
    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(255,255,255,.98)';
    ctx.strokeText(p.text, p.x, popupY);
    ctx.fillText(p.text, p.x, popupY);
    ctx.restore();
  }


}

/* ---------- Main loop ---------- */
let lastTs = 0;
function frame(now){
  requestAnimationFrame(frame);
  if(!lastTs)lastTs=now;
  lastTs=now;

  try{
    if(S.screen==="preroll"){
      const elapsed=(now-S.preRollStart)/1000;
      const duration=Math.max(0.001,S.preRollDuration/1000);
      S.trackTime=Math.min(0,-duration+elapsed);
    }else if(S.screen==="tutorialPlaying"){
      updateGameplayTutorialRuntime(now);
      if(S.screen==="tutorialPlaying")update(now);
    }else if(S.screen==="playing"){
      S.trackTime=Track.time();
      update(now);
    }
    render(now);
  }catch(error){
    console.error("Ошибка отрисовки игрового поля:",error);
  }
}

/* ---------- Input ---------- */
const KEYMAP = { q:0, w:1 };
window.addEventListener("keydown",event=>{
  if(assignKey(event.code)){
    event.preventDefault();
    return;
  }

  // Never hijack typing outside active gameplay.
  const tutorialHitWindow=S.screen==="tutorialPlaying"&&gameplayTutorialPhase===GAME_TUTORIAL_PHASE.awaitHit;
  if((S.screen!=="playing"&&!tutorialHitWindow)||isEditableTarget(event.target))return;

  const lane=keyBindings.indexOf(event.code);
  if(lane===-1)return;

  event.preventDefault();
  if(!event.repeat){
    S.pressed[lane]=true;
    press(lane);
  }
});
window.addEventListener("blur",()=>{S.pressed=Array(LANE_COUNT).fill(false);});
document.addEventListener("visibilitychange",()=>{
  if(document.hidden)S.pressed=Array(LANE_COUNT).fill(false);
});
window.addEventListener("keyup",event=>{
  const tutorialHitWindow=S.screen==="tutorialPlaying"&&gameplayTutorialPhase===GAME_TUTORIAL_PHASE.awaitHit;
  if((S.screen!=="playing"&&!tutorialHitWindow)||isEditableTarget(event.target))return;
  const lane=keyBindings.indexOf(event.code);
  if(lane===-1)return;
  event.preventDefault();
  S.pressed[lane]=false;
});
function laneAtPoint(px, py){
  const g = geom();
  const t = (py - g.yTop) / (g.yBtn - g.yTop);
  if (py < g.yTop || t < 0.25) return -1; // only the near/lower part is tappable
  for (let i=0;i<LANE_COUNT;i++){
    if (px >= laneLeftX(g,i,t) && px <= laneRightX(g,i,t)) return i;
  }
  return -1;
}
canvas.style.touchAction="none";
canvas.addEventListener("pointerdown",e=>{
  const tutorialHitWindow=S.screen==="tutorialPlaying"&&gameplayTutorialPhase===GAME_TUTORIAL_PHASE.awaitHit;
  if(S.screen!=="playing"&&!tutorialHitWindow)return;
  const r=canvas.getBoundingClientRect();
  const lane=laneAtPoint(e.clientX-r.left,e.clientY-r.top);
  if(lane>=0)press(lane);
  e.preventDefault();
},{passive:false});

/* ---------- Local song leaderboard ---------- */
function escapeHTML(value){
  return String(value??"").replace(/[&<>"']/g,char=>({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  })[char]);
}

function normalizedPlayerName(name){
  return String(name||"Player").trim().toLocaleLowerCase();
}

function activeTrackLeaderboardId(){
  return activeTrack?.leaderboardId||activeTrack?.id||"";
}
function activeTrackTitle(){
  return activeChart?.title||activeTrack?.title||t("track");
}
function activeTrackMaxScore(){
  return (activeChart?.notes?.length||0)*3;
}

/* ---------- Server identity + leaderboard API ---------- */
const DEVICE_ID_STORAGE_KEY="neonlanes_device_id_v1";
function getDeviceId(){
  const existing=safeStorageGet(DEVICE_ID_STORAGE_KEY);
  if(existing)return existing;
  let id;
  try{
    id=(window.crypto&&typeof window.crypto.randomUUID==="function")
      ? window.crypto.randomUUID()
      : `dev_${Date.now()}_${Math.random().toString(36).slice(2,12)}`;
  }catch(error){
    id=`dev_${Date.now()}_${Math.random().toString(36).slice(2,12)}`;
  }
  safeStorageSet(DEVICE_ID_STORAGE_KEY,id);
  return id;
}
const deviceId=getDeviceId();

function apiConfig(){return CONFIG.api||{};}
function apiBaseUrl(){return String(apiConfig().baseUrl||"").replace(/\/+$/,"");}

// Region follows the language chosen in the UI (languageBtn), not the OS locale.
// A non-empty config.api.region always overrides.
function detectRegion(){
  const configured=String(apiConfig().region||"").trim();
  if(configured)return configured;
  const lang=String(currentLanguage||"en").split(/[-_]/)[0];
  return lang.charAt(0).toUpperCase()+lang.slice(1).toLowerCase();
}

function gameIdForDay(day){
  const template=String(apiConfig().gameIdTemplate||"DinoRithm_Day_{day}");
  return template.replace("{day}",String(day));
}
function activeGameId(){
  const day=Number(activeTrack?.day)||Number(selectedCampaignDay)||0;
  return day?gameIdForDay(day):"";
}

function mapServerEntry(raw){
  if(!raw||typeof raw!=="object")return null;
  const score=Number(raw.score);
  const playerId=String(raw.player_id||raw.playerId||"");
  return {
    id:playerId||`srv_${Math.random().toString(36).slice(2,10)}`,
    playerId,
    name:String(raw.player_name||raw.name||"Player").slice(0,12),
    score:Number.isFinite(score)?score:0,
    rank:Number(raw.rank)||0,
    region:String(raw.region||"")
  };
}

async function fetchServerLeaderboard(gameId){
  const base=apiBaseUrl();
  if(!base)throw new Error(t("leaderboardError"));
  const url=`${base}/get?game_id=${encodeURIComponent(gameId)}`
    +`&player_id=${encodeURIComponent(deviceId)}`
    +`&region=${encodeURIComponent(detectRegion())}`;
  const response=await fetch(url,{headers:{Accept:"application/json"}});
  if(!response.ok)throw new Error(`HTTP ${response.status}`);
  const payload=await response.json();
  if(!payload||payload.success!==true)throw new Error(payload?.error||t("leaderboardError"));
  const data=payload.data||{};
  const leaderboard=Array.isArray(data.leaderboard)
    ? data.leaderboard.map(mapServerEntry).filter(Boolean)
    : [];
  const currentPlayer=data.current_player?mapServerEntry(data.current_player):null;
  return {leaderboard,currentPlayer};
}

async function submitServerScore({name,gameId,score}){
  const base=apiBaseUrl();
  if(!base)throw new Error(t("saveError"));
  const response=await fetch(`${base}/add`,{
    method:"POST",
    headers:{"Content-Type":"application/json",Accept:"application/json"},
    body:JSON.stringify({
      player_id:deviceId,
      player_name:name,
      game_id:gameId,
      score:Number(score)||0,
      region:detectRegion()
    })
  });
  if(!response.ok)throw new Error(`HTTP ${response.status}`);
  const payload=await response.json();
  if(!payload||payload.success!==true)throw new Error(payload?.error||t("saveError"));
  return payload.data;
}

let leaderboardState="ready";
let leaderboardError="";
let currentPlayerEntry=null;

/*
  Merge current_player into the visible board before sorting. The API may
  return it separately when it is outside the server's top list.
*/
function leaderboardEntriesWithCurrentPlayer(){
  const entries=board.slice();
  if(currentPlayerEntry&&currentPlayerEntry.playerId){
    const index=entries.findIndex(entry=>entry.playerId===currentPlayerEntry.playerId);
    if(index>=0)entries[index]={...entries[index],...currentPlayerEntry};
    else entries.push({...currentPlayerEntry});
  }
  return entries;
}

function rankBoard(){
  return leaderboardEntriesWithCurrentPlayer()
    .sort((a,b)=>{
      const ra=Number(a.rank)||Infinity;
      const rb=Number(b.rank)||Infinity;
      if(ra!==rb)return ra-rb;

      const sa=Number(a.score)||0;
      const sb=Number(b.score)||0;
      if(sa!==sb)return sb-sa;

      // If several players share exactly the same score/place, put this
      // device's player first inside that tied group.
      const aIsMe=Boolean(a.playerId)&&a.playerId===deviceId;
      const bIsMe=Boolean(b.playerId)&&b.playerId===deviceId;
      if(aIsMe!==bIsMe)return aIsMe?-1:1;

      return String(a.name||"").localeCompare(String(b.name||""));
    })
    .map((entry,index)=>({...entry,rank:Number(entry.rank)||index+1}));
}

/* ---------- Aggregate score across all seven songs ---------- */
let totalScoreValue=0;
let totalScoreState="idle";
let totalScoreRegion="";

async function fetchCurrentPlayerTotalScore(){
  const requests=[];
  for(let day=1;day<=7;day++){
    requests.push(fetchServerLeaderboard(gameIdForDay(day)));
  }

  const results=await Promise.all(requests);
  return results.reduce((sum,result)=>{
    return sum+(Number(result.currentPlayer?.score)||0);
  },0);
}

async function refreshTotalScore(force=false){
  const region=detectRegion();

  if(!force&&totalScoreState==="ready"&&totalScoreRegion===region){
    updateMenuTotalScore();
    return totalScoreValue;
  }

  totalScoreRegion=region;
  totalScoreState="loading";
  updateMenuTotalScore();

  try{
    totalScoreValue=await fetchCurrentPlayerTotalScore();
    totalScoreState="ready";
  }catch(error){
    console.error("Не удалось загрузить общий счет:",error);
    totalScoreState="error";
  }

  updateMenuTotalScore();
  return totalScoreValue;
}

function updateMenuTotalScore(){
  const element=document.getElementById("menuTotalScore");
  if(!element)return;

  if(totalScoreState==="loading"){
    element.textContent="…";
    return;
  }
  if(totalScoreState==="error"){
    element.textContent="—";
    return;
  }

  element.textContent=String(totalScoreValue);
}

function rowHTML(entry){
  const me=entry.playerId&&entry.playerId===deviceId?" me":"";
  const top=entry.rank<=3?" top":"";
  return `<div class="row${top}${me}">
    <span class="rank">${entry.rank}</span>
    <span class="nm">${escapeHTML(entry.name||"Player")}</span>
    <span class="pts">${entry.score}/${activeTrackMaxScore()}</span>
  </div>`;
}

function updateLeaderboardHeader(prefix){
  const name=document.getElementById(`${prefix}BoardTrackName`);
  const max=document.getElementById(`${prefix}BoardTrackMax`);
  if(name)name.textContent=activeTrackTitle();
  if(max)max.textContent=t("maxScore",{max:activeTrackMaxScore()});
}

function renderBoardInto(element,includeMe,prefix){
  if(!element)return;
  updateLeaderboardHeader(prefix);

  if(leaderboardState==="loading"){
    element.innerHTML=`<div class="empty">${escapeHTML(t("leaderboardLoading"))}</div>`;
    return;
  }
  if(leaderboardState==="error"){
    element.innerHTML=`<div class="empty">${escapeHTML(leaderboardError||t("leaderboardError"))}</div>`;
    return;
  }
  if(!activeTrack){
    element.innerHTML=`<div class="empty">${escapeHTML(t("noTrackForOpenDay"))}</div>`;
    return;
  }

  const ranked=rankBoard();
  if(ranked.length===0&&!currentPlayerEntry){
    element.innerHTML=`<div class="empty">${escapeHTML(t("noResults"))}<br>${escapeHTML(t("playFirst"))}</div>`;
    return;
  }

  const top=ranked.slice(0,10);
  let html=top.map(rowHTML).join("");
  const selfInTop=top.some(entry=>entry.playerId&&entry.playerId===deviceId);
  if(currentPlayerEntry&&!selfInTop){
    html+=`<div class="divider">· · ·</div>${rowHTML(currentPlayerEntry)}`;
  }
  element.innerHTML=html;
}

function renderAllLeaderboards(){
  renderBoardInto(document.getElementById("menuRows"),false,"menu");
  renderBoardInto(document.getElementById("goRows"),false,"go");
  updateMenuTotalScore();
}

function renderMenuLeaderboard(){
  renderBoardInto(document.getElementById("menuRows"),false,"menu");
  updateMenuTotalScore();
}

async function refreshLeaderboard(){
  const gameId=activeGameId();
  if(!activeTrack||!gameId){
    board=[];
    currentPlayerEntry=null;
    leaderboardState="ready";
    leaderboardError="";
    renderAllLeaderboards();
    return;
  }

  leaderboardState="loading";
  leaderboardError="";
  renderAllLeaderboards();

  try{
    const {leaderboard,currentPlayer}=await fetchServerLeaderboard(gameId);
    board=leaderboard;
    currentPlayerEntry=currentPlayer;
    leaderboardState="ready";
    leaderboardError="";
  }catch(error){
    console.error("Не удалось загрузить таблицу лидеров:",error);
    board=[];
    currentPlayerEntry=null;
    leaderboardState="error";
    leaderboardError=error.message||t("leaderboardError");
  }

  renderAllLeaderboards();
  maybeStartInitialMenuTutorial();
}


/* ---------- Game over ---------- */
let pendingScore=null;
let lastName="";
let finishScreenTutorialCompleted=false;

function gameoverTutorialOverlay(){
  return document.getElementById("gameoverTutorial");
}
function positionGameoverTutorial(){
  const overlay=gameoverTutorialOverlay();
  const device=document.getElementById("device");
  if(!overlay||overlay.classList.contains("hidden")||!device)return;
  const rect=device.getBoundingClientRect();
  const W=rect.width,H=rect.height,edge=12;
  const topBubble=document.getElementById("gameoverTutorialTop");
  const nameBubble=document.getElementById("gameoverTutorialName");
  const saveBubble=document.getElementById("gameoverTutorialSave");
  const input=document.getElementById("nameInput");
  const saveBtn=document.getElementById("saveBtn");

  if(topBubble){
    const width=Math.min(246,Math.max(216,W*0.72));
    topBubble.style.width=`${width}px`;
    topBubble.style.left=`${(W-width)/2}px`;
    topBubble.style.top=`${Math.max(28,H*0.06)}px`;
  }
  if(nameBubble&&input){
    const r=input.getBoundingClientRect();
    const width=Math.min(186,Math.max(158,W*0.44));
    nameBubble.style.width=`${width}px`;
    const anchorX=r.left-rect.left+r.width*0.34;
    const left=clampNumber(anchorX-width*0.48,edge,W-edge-width);
    const height=nameBubble.offsetHeight||70;
    const top=Math.max(edge,r.top-rect.top-height-18);
    nameBubble.style.left=`${left}px`;
    nameBubble.style.top=`${top}px`;
    nameBubble.style.setProperty("--tutorial-arrow-x",`${clampNumber(anchorX-left,18,width-18)}px`);
  }
  if(saveBubble&&saveBtn){
    const r=saveBtn.getBoundingClientRect();
    const width=Math.min(188,Math.max(164,W*0.48));
    saveBubble.style.width=`${width}px`;
    const anchorX=r.left-rect.left+r.width*0.50;
    const left=clampNumber(anchorX-width*0.50,edge,W-edge-width);
    const height=saveBubble.offsetHeight||70;
    const top=Math.max(edge,r.top-rect.top-height-14);
    saveBubble.style.left=`${left}px`;
    saveBubble.style.top=`${top}px`;
    saveBubble.style.setProperty("--tutorial-arrow-x",`${clampNumber(anchorX-left,18,width-18)}px`);
  }
}
function setGameoverTutorialVisible(visible){
  const overlay=gameoverTutorialOverlay();
  if(!overlay)return;
  const input=document.getElementById("nameInput");
  const saveBtn=document.getElementById("saveBtn");
  overlay.classList.toggle("hidden",!visible);
  overlay.classList.toggle("active",visible);
  overlay.setAttribute("aria-hidden",visible?"false":"true");
  document.getElementById("gameover")?.classList.toggle("gameover-tutorial-active",visible);
  input?.classList.toggle("gameover-tutorial-highlight",visible);
  saveBtn?.classList.toggle("gameover-tutorial-highlight",visible);
  if(input)input.disabled=false;
  if(saveBtn)saveBtn.disabled=false;
  if(visible){
    requestAnimationFrame(()=>{
      positionGameoverTutorial();
      requestAnimationFrame(positionGameoverTutorial);
    });
  }
}
function showGameoverTutorial(){
  setGameoverTutorialVisible(true);
}
function hideGameoverTutorial(){
  setGameoverTutorialVisible(false);
}
function bindGameoverTutorial(){
  window.addEventListener("resize",()=>{
    if(!gameoverTutorialOverlay()?.classList.contains("hidden"))requestAnimationFrame(positionGameoverTutorial);
  });
  window.addEventListener("orientationchange",()=>{
    if(!gameoverTutorialOverlay()?.classList.contains("hidden"))setTimeout(positionGameoverTutorial,120);
  });
}

async function returnToMenu(){
  // Cancel every async stage of the previous run before touching the UI.
  ++gameRunToken;
  Track.stop();
  resetGameplayTutorialForMenu();
  hideGameoverTutorial();
  hideEventCompleteScreen();
  S.screen="menu";
  S.ended=false;
  lastProgressPermille=-1;
  trackProgressFill?.style.setProperty("--track-progress","0%");
  S.lights.length=0;
  S.popups.length=0;
  pendingScore=null;
  myEntryId=null;

  if(selectLatestDayOnMenuReturn){
    selectLatestDayOnMenuReturn=false;
    const latestDay=unlockedCampaignDay();
    const latestTrack=trackForDay(latestDay);
    if(latestTrack){
      try{
        selectedCampaignDay=latestDay;
        safeStorageSet(CAMPAIGN_SELECTED_DAY_KEY,String(latestDay));
        await activateStaticTrack(latestTrack.id);
      }catch(error){
        console.error("Не удалось выбрать новый открытый день:",error);
      }
    }
  }

  renderCampaignWeek();
  renderMenuLeaderboard();
  refreshLeaderboard().catch(()=>{});
  document.getElementById("countdownOverlay")?.classList.add("hidden");
  document.getElementById("gameover").classList.add("hidden");
  document.getElementById("settings")?.classList.add("hidden");
  document.getElementById("menu").classList.remove("hidden");
  renderHUD();

  if(postSaveMenuTutorialPending&&!postSaveMenuTutorialShown){
    postSaveMenuTutorialPending=false;
    postSaveMenuTutorialShown=true;
    showMenuFollowupTutorial();
  }
}

function confirmExitToMenu(){
  if(!["countdown","preroll","playing","tutorialPaused","tutorialPlaying"].includes(S.screen))return;
  const confirmed=window.confirm(t("exitConfirm"));
  if(!confirmed)return;
  returnToMenu();
}

async function endGame(trackCompleted=false){
  if(S.ended)return;
  S.ended=true;
  Track.stop();
  HostBridge.send("game_over",{score:S.score,trackCompleted,track:activeTrackTitle()});
  S.screen="gameover";
  renderHUD();

  document.getElementById("finalScore").textContent=S.score;
  const verdict=document.querySelector("#gameover .verdict");
  if(verdict)verdict.textContent=trackCompleted?t("trackFinished"):t("roundFinished");

  const dailyResult=await recordDailyGoal(S.score);
  const completedTrackDay=Number(activeTrack?.day);
  const campaignCompletedNow=trackCompleted
    ? await markCampaignTrackCompleted()
    : false;

  if(trackCompleted&&Number.isInteger(completedTrackDay)&&completedTrackDay>=1&&completedTrackDay<=7){
    HostBridge.sendUnityMessage(`track_complete:${completedTrackDay}`);
  }
  if(trackCompleted&&completedTrackDay===7&&campaignAllDaysCompleted()){
    pendingEventCompleteScreen=true;
    pendingEventCompleteScore=S.score;
    HostBridge.sendUnityMessage("event_complete");
  }else{
    pendingEventCompleteScreen=false;
    pendingEventCompleteScore=0;
  }

  pendingScore={
    trackId:activeTrackLeaderboardId(),
    trackTitle:activeTrackTitle(),
    gameId:activeGameId(),
    score:S.score,
    maxScore:activeTrackMaxScore(),
    date:Date.now()
  };
  myEntryId=null;

  const saveButton=document.getElementById("saveBtn");
  if(saveButton)saveButton.disabled=false;

  const streakLine=document.getElementById("streakLine");
  streakLine.classList.add("hidden");
  streakLine.textContent="";
  if(campaignCompletedNow){
    streakLine.textContent=t("dayCompleted",{day:activeTrack?.day||selectedCampaignDay});
    streakLine.classList.remove("hidden");
  }else if(dailyResult.reward){
    streakLine.textContent=t("weekReward");
    streakLine.classList.remove("hidden");
  }else if(dailyResult.reason==="already_counted"){
    streakLine.textContent=t("alreadyCounted",{streak:dailyResult.streak,days:STREAK_DAYS});
    streakLine.classList.remove("hidden");
  }else if(dailyResult.counted){
    streakLine.textContent=t("dayCounted",{streak:dailyResult.streak,days:STREAK_DAYS});
    streakLine.classList.remove("hidden");
  }

  document.getElementById("placeLine").textContent=t("enterAndSave");
  const input=document.getElementById("nameInput");
  input.value=lastName||"";
  input.focus();

  renderBoardInto(document.getElementById("goRows"),false,"go");
  document.getElementById("gameover").classList.remove("hidden");
  document.getElementById("gameover").classList.add("fadeIn");

  if(!finishScreenTutorialCompleted){
    showGameoverTutorial();
  }else{
    hideGameoverTutorial();
  }
}

async function saveName(){
  if(!pendingScore)return;
  const input=document.getElementById("nameInput");
  const saveButton=document.getElementById("saveBtn");
  const placeLine=document.getElementById("placeLine");
  const name=(input.value||"").trim().slice(0,12);
  if(!name){
    input.focus();
    if(placeLine)placeLine.textContent=t("enterName");
    return;
  }

  lastName=name;
  await Store.saveName(name);

  const gameId=pendingScore.gameId||activeGameId();
  const score=pendingScore.score;

  if(saveButton)saveButton.disabled=true;
  if(placeLine)placeLine.textContent=t("saving");

  try{
    await submitServerScore({name,gameId,score});
  }catch(error){
    console.error("Не удалось сохранить результат:",error);
    if(placeLine)placeLine.textContent=error.message||t("saveError");
    if(saveButton)saveButton.disabled=false;
    return;
  }

  finishScreenTutorialCompleted=true;
  postSaveMenuTutorialPending=true;
  hideGameoverTutorial();
  pendingScore=null;
  await Promise.all([
    refreshLeaderboard(),
    refreshTotalScore(true)
  ]);
  await leaveGameover();
}


/* ---------- Unity WebView integration ---------- */
function applyUnityTutorialState(completed){
  const value=Boolean(completed);
  UNITY_RUNTIME.tutorialCompleted=value;
  if(value){
    initialMenuTutorialPending=false;
    initialMenuTutorialShown=true;
    postSaveMenuTutorialPending=false;
    postSaveMenuTutorialShown=true;
    gameplayTutorialCompleted=true;
    finishScreenTutorialCompleted=true;
    hideMenuTutorial();
    hideGameplayTutorialOverlay();
    hideGameoverTutorial();
  }
}

async function applyUnityRuntimeState(config={},fromBoot=false){
  if(config&&Object.prototype.hasOwnProperty.call(config,"tutorialCompleted")){
    const parsed=parseHostBoolean(config.tutorialCompleted);
    if(parsed!==null)UNITY_RUNTIME.tutorialCompleted=parsed;
  }
  if(config&&Object.prototype.hasOwnProperty.call(config,"language")){
    const language=normalizeHostLanguage(config.language);
    if(language)UNITY_RUNTIME.language=language;
  }
  if(config&&Object.prototype.hasOwnProperty.call(config,"lang")){
    const language=normalizeHostLanguage(config.lang);
    if(language)UNITY_RUNTIME.language=language;
  }
  if(config&&Object.prototype.hasOwnProperty.call(config,"eventDays")){
    UNITY_RUNTIME.eventDays=clampEventDays(config.eventDays);
  }
  if(config&&Object.prototype.hasOwnProperty.call(config,"completedDays")){
    UNITY_RUNTIME.completedDays=parseCompletedDays(config.completedDays);
  }
  if(config&&Object.prototype.hasOwnProperty.call(config,"playerName")){
    UNITY_RUNTIME.playerName=normalizeHostPlayerName(config.playerName);
    if(UNITY_RUNTIME.playerName)lastName=UNITY_RUNTIME.playerName;
  }

  eventDayLimit=clampEventDays(UNITY_RUNTIME.eventDays);
  if(Array.isArray(UNITY_RUNTIME.completedDays)){
    campaignProgress={completedDays:normalizeCompletedDays(UNITY_RUNTIME.completedDays)};
    safeStorageSet(CAMPAIGN_STORAGE_KEY,JSON.stringify(campaignProgress));
  }
  if(UNITY_RUNTIME.language&&SUPPORTED_LANGUAGES.includes(UNITY_RUNTIME.language)){
    currentLanguage=UNITY_RUNTIME.language;
    try{window.localStorage?.setItem(LANGUAGE_STORAGE_KEY,currentLanguage);}catch(error){}
  }
  if(UNITY_RUNTIME.tutorialCompleted===true)applyUnityTutorialState(true);
  UNITY_RUNTIME.initialized=true;

  if(!fromBoot&&document.body){
    applyLanguage();
    renderCampaignWeek();
    renderHUD();
    renderKeyBindings();
    syncHotkeysToggle();
    if(activeTrack&&Number(activeTrack.day)>eventDayLimit){
      try{await selectInitialCampaignTrack();}catch(error){console.error(error);}
    }
    refreshLeaderboard().catch(()=>{});
    refreshTotalScore(true).catch(()=>{});
    if(UNITY_RUNTIME.tutorialCompleted!==true)maybeStartInitialMenuTutorial();
  }
}

window.initializeRhythmWithDino=async function(config){
  try{return await applyUnityRuntimeState(config||{},false);}
  catch(error){console.error("initializeRhythmWithDino failed",error);}
};
window.initializeFromUnity=window.initializeRhythmWithDino;
window.setLanguage=function(language){
  return window.initializeRhythmWithDino({language});
};
window.setEventDays=function(days){
  return window.initializeRhythmWithDino({eventDays:days});
};
window.setTutorialCompleted=function(completed){
  return window.initializeRhythmWithDino({tutorialCompleted:completed});
};
window.setPlayerName=function(playerName){
  return window.initializeRhythmWithDino({playerName});
};

function showEventCompleteScreen(score){
  const overlay=document.getElementById("eventComplete");
  if(!overlay)return;
  hideMenuTutorial();
  hideGameoverTutorial();
  document.getElementById("menu")?.classList.add("hidden");
  document.getElementById("settings")?.classList.add("hidden");
  document.getElementById("gameover")?.classList.add("hidden");
  const scoreElement=document.getElementById("eventCompleteScore");
  if(scoreElement)scoreElement.textContent=String(Math.max(0,Number(score)||0));
  overlay.classList.remove("hidden");
  overlay.setAttribute("aria-hidden","false");
}
function hideEventCompleteScreen(){
  const overlay=document.getElementById("eventComplete");
  if(!overlay)return;
  overlay.classList.add("hidden");
  overlay.setAttribute("aria-hidden","true");
}
async function leaveGameover(){
  hideGameoverTutorial();
  pendingScore=null;
  if(pendingEventCompleteScreen){
    const score=pendingEventCompleteScore;
    pendingEventCompleteScreen=false;
    pendingEventCompleteScore=0;
    showEventCompleteScreen(score);
    return;
  }
  await returnToMenu();
}

/* ---------- Key bindings ---------- */
const KEY_BINDINGS_STORAGE_KEY="neonlanes_key_bindings_v1";
const SHOW_HOTKEYS_STORAGE_KEY="neonlanes_show_hotkeys_v1";
const DEFAULT_SHOW_HOTKEYS=false;
const DEFAULT_KEY_BINDINGS=Array.isArray(CONFIG.keyBindings)?CONFIG.keyBindings:["KeyQ","KeyW"];
let keyBindings=loadKeyBindings();
let bindingLane=null;

function loadKeyBindings(){
  try{
    const parsed=JSON.parse(safeStorageGet(KEY_BINDINGS_STORAGE_KEY));
    if(Array.isArray(parsed)&&parsed.length===LANE_COUNT&&parsed.every(item=>typeof item==="string"&&item)){
      return parsed;
    }
  }catch(error){}
  return [...DEFAULT_KEY_BINDINGS];
}
function saveKeyBindings(){
  safeStorageSet(KEY_BINDINGS_STORAGE_KEY,JSON.stringify(keyBindings));
}
function loadShowHotkeys(){
  const raw=safeStorageGet(SHOW_HOTKEYS_STORAGE_KEY);
  if(raw===null||raw===undefined||raw==="")return DEFAULT_SHOW_HOTKEYS;
  return raw!=="0"&&raw!=="false";
}
function saveShowHotkeys(value){
  safeStorageSet(SHOW_HOTKEYS_STORAGE_KEY,value?"1":"0");
}
let showHotkeys=loadShowHotkeys();
function keyLabel(code){
  if(/^Key[A-Z]$/.test(code))return code.slice(3);
  if(/^Digit[0-9]$/.test(code))return code.slice(5);
  const labels={
    Space:t("space"),ArrowLeft:"←",ArrowRight:"→",ArrowUp:"↑",ArrowDown:"↓",
    ShiftLeft:"Shift",ShiftRight:"Shift",ControlLeft:"Ctrl",ControlRight:"Ctrl",
    AltLeft:"Alt",AltRight:"Alt",Enter:"Enter",Tab:"Tab"
  };
  return labels[code]||code;
}
function renderKeyBindings(){
  document.querySelectorAll(".key-bind-btn").forEach(button=>{
    const lane=Number(button.dataset.lane);
    button.textContent=bindingLane===lane?t("pressNow"):keyLabel(keyBindings[lane]);
    button.classList.toggle("listening",bindingLane===lane);
  });
}
function syncHotkeysToggle(){
  const toggle=document.getElementById("showHotkeysToggle");
  if(toggle)toggle.checked=!showHotkeys;
}
function isEditableTarget(target){
  return !!target?.closest?.("input,textarea,select,[contenteditable='true']");
}
function beginKeyBinding(lane){
  bindingLane=lane;
  renderKeyBindings();
}
function assignKey(code){
  if(bindingLane===null)return false;
  const duplicateLane=keyBindings.findIndex((item,index)=>item===code&&index!==bindingLane);
  if(duplicateLane!==-1){
    showSettingsError(t("keyDuplicate",{key:keyLabel(code),lane:duplicateLane+1}));
    return true;
  }
  keyBindings[bindingLane]=code;
  bindingLane=null;
  saveKeyBindings();
  showSettingsError("");
  renderKeyBindings();
  return true;
}

/* ---------- Settings ---------- */
async function openSettings(){
  showSettingsError("");
  renderKeyBindings();
  syncHotkeysToggle();
  document.getElementById("menu").classList.add("hidden");
  document.getElementById("settings").classList.remove("hidden");
}
function closeSettings(){
  bindingLane=null;
  renderKeyBindings();
  document.getElementById("settings").classList.add("hidden");
  document.getElementById("menu").classList.remove("hidden");
}
bindById("playBtn","click",()=>{startGame();});
bindById("settingsBtn","click",openSettings);
bindById("languageBtn","click",cycleLanguage);
bindById("fullscreenBtn","click",toggleGameFullscreen);
bindById("resetCampaignProgressBtn","click",()=>{
  resetCampaignProgress().catch(error=>{
    console.error(error);
    showSettingsError(error.message||t("resetError"));
  });
});
bindById("settingsCloseBtn","click",closeSettings);
bindById("showHotkeysToggle","change",event=>{
  const hideHotkeys=Boolean(event.target.checked);
  showHotkeys=!hideHotkeys;
  saveShowHotkeys(showHotkeys);
  requestAnimationFrame(()=>render(performance.now()));
});

document.querySelectorAll(".key-bind-btn").forEach(button=>{
  button.addEventListener("click",()=>beginKeyBinding(Number(button.dataset.lane)));
});

bindById("menuBtn","click",()=>{leaveGameover();});
bindById("exitGameBtn","click",confirmExitToMenu);
bindById("saveBtn","click",saveName);
bindById("eventRewardBtn","click",()=>{
  window.location.href=UNITY_EVENT_REWARD_URL;
});
bindById("nameInput","keydown",event=>{
  if(event.key==="Enter"){
    event.preventDefault();
    saveName();
  }
});


/* ---------- Boot ---------- */
(async function boot(){
  initMobileBrowserMode();
  await applyUnityRuntimeState(UNITY_RUNTIME,true);
  applyRuntimeConfig();HostBridge.init();resize();

  try{
    bindMenuTutorial();
    bindGameplayTutorial();
    bindGameoverTutorial();
  }catch(error){
    console.error("Ошибка запуска обучения:",error);
  }

  await preloadVisualAssets();
  requestAnimationFrame(frame);
  try{
    const storedName=await Store.loadName();
    lastName=UNITY_RUNTIME.playerName||storedName||"";
    progress=await Store.loadProgress();
    board=[];
    currentPlayerEntry=null;
    await loadStaticTracks();
    await selectInitialCampaignTrack();
    initialMenuTutorialCanStart=UNITY_RUNTIME.tutorialCompleted!==true;
    if(initialMenuTutorialCanStart)maybeStartInitialMenuTutorial();
    await refreshTotalScore(true);
    renderKeyBindings();
    syncHotkeysToggle();
    renderCampaignWeek();
    renderMenuLeaderboard();
    renderHUD();
  }catch(error){
    console.error("Ошибка запуска игры:",error);
    setCampaignError(error.message||t("loadCatalogError"));
    activeTrack=null;
    activeChart=null;
    board=[];
    currentPlayerEntry=null;
    leaderboardState="ready";
    leaderboardError="";
    totalScoreValue=0;
    totalScoreState="idle";
    renderKeyBindings();
    syncHotkeysToggle();
    renderCampaignWeek();
    renderMenuLeaderboard();
    renderHUD();
    initialMenuTutorialCanStart=UNITY_RUNTIME.tutorialCompleted!==true;
    if(initialMenuTutorialCanStart)maybeStartInitialMenuTutorial();
  }
})();