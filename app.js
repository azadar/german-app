"use strict";

const elements = {
  navigation: document.querySelector("#nav"),
  progressFill: document.querySelector("#progressFill"),
  progressBar: document.querySelector("#progressBar"),
  statistics: document.querySelector("#stats"),
  view: document.querySelector("#view"),
  voiceRate: document.querySelector("#voiceRate"),
  voiceRateValue: document.querySelector("#voiceRateValue"),
  audioToggle: document.querySelector("#audioToggle"),
};

const defaultAppState = {
  learned: {},
  days: {},
  today: null,
  mode: "core",
  wordsPerDay: 5,
  phrases: {},
  wordDataVersion: 1,
  audioEnabled: true,
};

let appState = loadAppState();
let vocabularyWords = [];
let practicePhrases = [];
let activeTab = "today";
let flashcardSession = null;
let phraseSession = null;
let phraseLoadError = false;

function loadAppState() {
  try {
    const savedState = localStorage.getItem("dw1");
    const parsedState = savedState ? JSON.parse(savedState) : {};
    return {
      ...defaultAppState,
      ...parsedState,
      phrases: parsedState.phrases || {},
    };
  } catch (error) {
    console.error("Could not read saved learning progress.", error);
    return { ...defaultAppState };
  }
}

function saveAppState() {
  try {
    localStorage.setItem("dw1", JSON.stringify(appState));
  } catch (error) {
    console.error("Could not save learning progress.", error);
  }
}

function updateAudioToggle() {
  const audioEnabled = appState.audioEnabled !== false;

  document.documentElement.dataset.audio = audioEnabled ? "on" : "off";
  elements.audioToggle.setAttribute("aria-pressed", String(audioEnabled));
  elements.audioToggle.textContent = audioEnabled
    ? "Mute speech"
    : "Enable speech";
}

updateAudioToggle();

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function migrateWordProgress(words) {
  if ((appState.wordDataVersion || 1) >= 2) {
    return;
  }

  // Older progress used array positions; map those positions to German headwords.
  const wordBySavedId = new Map(
    words.map((word, index) => [String(word.id ?? index), word.de]),
  );
  const migratedProgress = {};

  for (const [savedId, learnedDate] of Object.entries(appState.learned)) {
    const germanWord = /^\d+$/.test(savedId)
      ? wordBySavedId.get(savedId)
      : savedId;

    if (germanWord) {
      migratedProgress[germanWord] = learnedDate;
    }
  }

  appState.learned = migratedProgress;
  appState.today = null;
  appState.wordDataVersion = 2;
  saveAppState();
}

function createSeededRandom(seed) {
  let currentSeed = seed | 0;

  return function nextRandomValue() {
    currentSeed = (currentSeed + 0x6d2b79f5) | 0;
    let value = Math.imul(
      currentSeed ^ (currentSeed >>> 15),
      1 | currentSeed,
    );
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleArray(items, random = Math.random) {
  const shuffledItems = items.slice();

  for (let index = shuffledItems.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffledItems[index], shuffledItems[swapIndex]] = [
      shuffledItems[swapIndex],
      shuffledItems[index],
    ];
  }

  return shuffledItems;
}

function getDailyWordPlan(forceRefresh = false) {
  const currentDate = todayKey();
  const savedPlan = appState.today;

  if (
    !forceRefresh &&
    savedPlan &&
    savedPlan.date === currentDate &&
    savedPlan.mode === appState.mode &&
    savedPlan.wordsPerDay === appState.wordsPerDay
  ) {
    return savedPlan.wordIds;
  }

  const unlearnedWords = vocabularyWords.filter(
    (word) => !appState.learned[word.de],
  );
  const learnedWords = vocabularyWords.filter(
    (word) => appState.learned[word.de],
  );
  const dateSeed = Number(currentDate.replaceAll("-", ""));
  const seededRandom = createSeededRandom(dateSeed);
  let wordIds;

  if (appState.mode === "core") {
    wordIds = unlearnedWords
      .slice(0, appState.wordsPerDay)
      .map((word) => word.i);
  } else if (appState.mode === "random") {
    wordIds = shuffleArray(unlearnedWords, seededRandom)
      .slice(0, appState.wordsPerDay)
      .map((word) => word.i);
  } else {
    const reviewWords = learnedWords.length ? learnedWords : unlearnedWords;
    wordIds = shuffleArray(reviewWords, seededRandom)
      .slice(0, appState.wordsPerDay)
      .map((word) => word.i);
  }

  appState.today = {
    date: currentDate,
    mode: appState.mode,
    wordsPerDay: appState.wordsPerDay,
    wordIds,
  };
  saveAppState();
  return wordIds;
}

function getLearningStreak() {
  let streakLength = 0;
  const currentDate = new Date();

  while (appState.days[currentDate.toISOString().slice(0, 10)]) {
    streakLength += 1;
    currentDate.setDate(currentDate.getDate() - 1);
  }

  return streakLength;
}

// Edge lists both a robotic local "Katja" and "Katja Online (Natural)", so rank rather than take the first match.
function scoreGermanVoice(voice) {
  const name = voice.name.toLowerCase();
  const isNatural = /natural|neural|online/.test(name);
  const isKatja = name.includes("katja");

  return (isKatja ? 2 : 0) + (isNatural ? 4 : 0);
}

function pickGermanVoice() {
  const germanVoices = speechSynthesis
    .getVoices()
    .filter((voice) => voice.lang?.toLowerCase().replace("_", "-").startsWith("de"));

  return germanVoices.reduce(
    (best, voice) =>
      !best || scoreGermanVoice(voice) > scoreGermanVoice(best) ? voice : best,
    null,
  );
}

function speakGerman(text) {
  if (
    document.documentElement.dataset.audio === "off" ||
    !("speechSynthesis" in window)
  ) {
    return;
  }

  const utterance = new SpeechSynthesisUtterance(text.replaceAll("’", "'"));
  utterance.lang = "de-DE";
  utterance.rate = Number(elements.voiceRate.value);

  const germanVoice = pickGermanVoice();

  if (germanVoice) {
    utterance.voice = germanVoice;
  }

  speechSynthesis.cancel();
  speechSynthesis.speak(utterance);
}

function normalizeSpokenText(text) {
  return text.toLowerCase().replace(/[^a-zäöüß ]/g, "").trim();
}

function recognizeGermanWord(wordId, feedbackElement) {
  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    feedbackElement.textContent =
      "Speech recognition is not supported in this browser. Try Chrome or Edge.";
    return;
  }

  const recognition = new SpeechRecognition();
  recognition.lang = "de-DE";
  feedbackElement.textContent = "Listening…";

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    const heardText = normalizeSpokenText(transcript);
    const expectedWord = normalizeSpokenText(vocabularyWords[wordId].de);
    const expectedWordWithoutArticle = expectedWord.replace(
      /^(der|die|das) /,
      "",
    );
    const isCorrect =
      heardText === expectedWord ||
      heardText === expectedWordWithoutArticle;

    feedbackElement.textContent = `${isCorrect ? "Great!" : "Try again."} I heard: ${transcript}`;
  };

  recognition.onerror = () => {
    feedbackElement.textContent =
      "Could not hear you. Check microphone permission and try again.";
  };

  try {
    recognition.start();
  } catch (error) {
    console.error("Could not start speech recognition.", error);
    feedbackElement.textContent =
      "Could not start the microphone. Check its permission and try again.";
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => {
    const htmlEntities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return htmlEntities[character];
  });
}

function renderWordCard(word) {
  const isLearned = Boolean(appState.learned[word.de]);
  const escapedGermanWord = escapeHtml(word.de);

  return `
    <article class="card word-card">
      <div class="word-header">
        <div class="de">${escapedGermanWord}</div>
        <div class="word-audio">
          <button type="button" data-action="speak-word" data-word-id="${word.i}"
            aria-label="Listen to ${escapedGermanWord}" title="Listen">🔊</button>
          <button type="button" data-action="recognize-word" data-word-id="${word.i}"
            aria-label="Practise saying ${escapedGermanWord}" title="Say it">🎤</button>
        </div>
      </div>
      ${word.p ? `<div class="pr">[ ${escapeHtml(word.p)} ]</div>` : ""}
      <div class="tr">
        ${escapeHtml(word.en)} ·
        <span class="ur" dir="rtl" lang="ur">${escapeHtml(word.ur)}</span>
      </div>
      <div class="fb" id="feedback-${word.i}" aria-live="polite"></div>
      <div class="word-footer">
        <button type="button" data-action="toggle-learned" data-word-id="${word.i}"
          aria-pressed="${isLearned}" class="${isLearned ? "done" : ""}">
          ${isLearned ? "✓ Learned" : "Mark learned"}
        </button>
      </div>
    </article>
  `;
}

function renderStatistics() {
  const learnedCount = Object.keys(appState.learned).length;
  const totalWords = vocabularyWords.length;
  const completionPercent = totalWords
    ? Math.round((learnedCount / totalWords) * 100)
    : 0;

  elements.statistics.innerHTML = `
    <div><b>${learnedCount}/${totalWords}</b>learned</div>
    <div><b>${getLearningStreak()}🔥</b>day streak</div>
    <div><b>${totalWords - learnedCount}</b>left</div>
  `;
  elements.progressFill.style.width = `${completionPercent}%`;
  elements.progressBar.setAttribute("aria-valuenow", String(completionPercent));
}

function renderApp() {
  updateAudioToggle();
  renderStatistics();
  elements.navigation.querySelectorAll("button").forEach((button) => {
    const isActive = button.dataset.tab === activeTab;
    button.classList.toggle("on", isActive);
    button.setAttribute("aria-current", isActive ? "page" : "false");
  });

  if (activeTab === "today") {
    renderTodayView();
  } else if (activeTab === "speak") {
    renderPhrasePractice();
  } else if (activeTab === "all") {
    renderWordList();
  } else {
    renderFlashcards();
  }

  elements.view.setAttribute("aria-busy", "false");
}

function renderTodayView() {
  const plannedWordIds = getDailyWordPlan();
  const learnedTodayCount = plannedWordIds.filter(
    (wordId) => appState.learned[vocabularyWords[wordId].de],
  ).length;

  elements.view.innerHTML = `
    <section class="card setup-card">
      <h2>Your daily words</h2>
      <div class="form-grid daily-controls">
        <label for="learningMode">
          Mode
          <select id="learningMode">
            <option value="core">Most used first (80/20)</option>
            <option value="random">Random new words</option>
            <option value="review">Review learned</option>
          </select>
        </label>
        <label for="wordsPerDay">
          Words/day
          <select id="wordsPerDay">
            ${[3, 5, 10, 15]
              .map((count) => `<option value="${count}">${count}</option>`)
              .join("")}
          </select>
        </label>
        <button type="button" data-action="refresh-plan">New set</button>
      </div>
      <div class="fb" role="status">
        Today: ${learnedTodayCount}/${plannedWordIds.length} done. Words are
        ranked by everyday frequency, so a few hundred cover many conversations.
      </div>
    </section>
    <div class="word-grid">
      ${plannedWordIds.map((wordId) => renderWordCard(vocabularyWords[wordId])).join("")}
    </div>
  `;

  document.querySelector("#learningMode").value = appState.mode;
  document.querySelector("#wordsPerDay").value = String(appState.wordsPerDay);
}

function renderPhrasePractice() {
  if (phraseLoadError) {
    elements.view.innerHTML =
      '<p class="sub">Could not load phrases.json. Check that the file is available, then reload.</p>';
    return;
  }

  if (!practicePhrases.length) {
    elements.view.innerHTML =
      '<p class="sub">Loading speaking practice…</p>';
    return;
  }

  if (!phraseSession) {
    renderPhrasePracticeSetup();
    return;
  }

  if (phraseSession.currentIndex >= phraseSession.phraseIds.length) {
    elements.view.innerHTML = `
      <section class="card setup-card">
        <h2 class="de">Practice complete</h2>
        <p>You marked ${phraseSession.completedCount} phrase${phraseSession.completedCount === 1 ? "" : "s"} as comfortable in this round.</p>
        <p>Try saying the difficult phrases once more, then use one in a real conversation today.</p>
        <button type="button" class="primary" data-action="end-phrase-practice">
          Choose another set
        </button>
      </section>
    `;
    return;
  }

  renderCurrentPracticePhrase();
}

function renderPhrasePracticeSetup() {
  const categories = [...new Set(practicePhrases.map((phrase) => phrase.category))];

  elements.view.innerHTML = `
    <section class="card setup-card">
      <h2 class="de">Practise speaking from memory</h2>
      <p>
        Read the meaning, say the German out loud, then reveal and listen.
        Repeat the phrase until it feels easier to say without planning every word.
      </p>
      <div class="form-grid">
        <label for="phraseCategory">
          Situation
          <select id="phraseCategory">
            <option value="">All situations</option>
            ${categories.map((category) => `<option>${escapeHtml(category)}</option>`).join("")}
          </select>
        </label>
        <label for="phraseCount">
          Phrases
          <select id="phraseCount">
            <option value="5">5</option>
            <option value="10">10</option>
            <option value="20">20</option>
            <option value="all">All</option>
          </select>
        </label>
        <label for="phraseOrder">
          Order
          <select id="phraseOrder">
            <option value="new">Not practised first</option>
            <option value="all">All phrases</option>
            <option value="random">Random</option>
          </select>
        </label>
      </div>
      <div class="fb" role="status">
        ${Object.keys(appState.phrases).length}/${practicePhrases.length}
        phrases marked as comfortable. This tracks your practice, not a fluency score.
      </div>
      <p>
        <button type="button" class="primary" data-action="start-phrase-practice">
          Start speaking
        </button>
      </p>
    </section>
  `;
}

function renderCurrentPracticePhrase() {
  const phrase = practicePhrases[
    phraseSession.phraseIds[phraseSession.currentIndex]
  ];

  elements.view.innerHTML = `
    <div class="row">
      <span>${phraseSession.currentIndex + 1} / ${phraseSession.phraseIds.length}</span>
      <span class="sp"></span>
      <span>${escapeHtml(phrase.category)}</span>
      <button type="button" data-action="end-phrase-practice">End practice</button>
    </div>
    <section class="card">
      <div class="fb">Say this in German before revealing the phrase:</div>
      <div class="de">${escapeHtml(phrase.en)}</div>
      <div class="ur" dir="rtl" lang="ur">${escapeHtml(phrase.ur)}</div>
      <div class="row">
        <button type="button" class="primary" data-action="reveal-phrase">
          Show German
        </button>
      </div>
      ${
        phraseSession.isRevealed
          ? `
            <hr>
            <div class="de">${escapeHtml(phrase.de)}</div>
            <div class="row">
              <button type="button" data-action="speak-phrase">🔊 Listen</button>
              <button type="button" data-action="speak-phrase">↻ Listen again</button>
            </div>
            <div class="fb">
              Say it aloud once or twice. Aim to get your meaning across; you do not need perfect grammar.
            </div>
            <div class="row">
              <button type="button" data-action="skip-phrase">Try later</button>
              <button type="button" class="primary" data-action="mark-phrase-comfortable">
                ✓ I can say this
              </button>
            </div>
          `
          : ""
      }
    </section>
  `;
}

function renderWordList() {
  elements.view.innerHTML = `
    <div class="browse-controls">
      <input
        id="wordSearch"
        class="word-search"
        type="search"
        aria-label="Search German, English, or Urdu"
        placeholder="Search German, English or Urdu"
      >
      <label for="wordFilter">
        Learning status
        <select id="wordFilter">
          <option value="">All</option>
          <option value="learned">Learned</option>
          <option value="unlearned">Not yet</option>
        </select>
      </label>
    </div>
    <div id="wordList" class="word-grid"></div>
  `;

  renderFilteredWordList();
}

function renderFilteredWordList() {
  const searchQuery = document
    .querySelector("#wordSearch")
    .value.toLowerCase();
  const learningFilter = document.querySelector("#wordFilter").value;
  const filteredWords = vocabularyWords.filter((word) => {
    const isLearned = Boolean(appState.learned[word.de]);
    const matchesLearningStatus =
      !learningFilter ||
      (learningFilter === "learned" ? isLearned : !isLearned);
    const searchableText = `${word.de}${word.en}${word.ur}`.toLowerCase();
    return matchesLearningStatus && searchableText.includes(searchQuery);
  });

  document.querySelector("#wordList").innerHTML =
    filteredWords.map(renderWordCard).join("") ||
    '<p class="sub">No matching words. Try another search.</p>';
}

function renderFlashcards() {
  if (!flashcardSession) {
    elements.view.innerHTML = `
      <section class="card setup-card">
        <h2>Review at your own pace</h2>
        <p>Recall the meaning, flip the card, and keep building your confidence.</p>
        <div class="form-grid">
          <label for="flashcardCount">
            Cards
            <select id="flashcardCount">
              <option value="5">5</option>
              <option value="10">10</option>
              <option value="20">20</option>
              <option value="50">50</option>
              <option value="all">All</option>
            </select>
          </label>
          <label for="flashcardOrder">
            Order
            <select id="flashcardOrder">
              <option value="ordered">In order</option>
              <option value="random">Random</option>
            </select>
          </label>
          <label for="flashcardLearnedFilter">
            From
            <select id="flashcardLearnedFilter">
              <option value="all">All words</option>
              <option value="unlearned">Not learned</option>
              <option value="learned">Learned</option>
            </select>
          </label>
        </div>
        <p>
          <button type="button" class="primary" data-action="start-flashcards">
            Start
          </button>
        </p>
      </section>
    `;
    return;
  }

  if (flashcardSession.currentIndex >= flashcardSession.wordIds.length) {
    elements.view.innerHTML = `
      <section class="card">
        <h2 class="de">Finished</h2>
        <p>
          Got it: <b>${flashcardSession.correctCount}</b> ·
          Still learning: <b>${flashcardSession.reviewCount}</b>
        </p>
        <button type="button" class="primary" data-action="end-flashcards">Back</button>
      </section>
    `;
    return;
  }

  renderCurrentFlashcard();
}

function renderCurrentFlashcard() {
  const word = vocabularyWords[
    flashcardSession.wordIds[flashcardSession.currentIndex]
  ];
  const revealedTranslation = flashcardSession.isRevealed
    ? `
      ${word.p ? `<div class="pr">[ ${escapeHtml(word.p)} ]</div>` : ""}
      <div>${escapeHtml(word.en)}</div>
      <div class="ur" dir="rtl" lang="ur">${escapeHtml(word.ur)}</div>
    `
    : '<div class="fb">Select this card to reveal its meaning.</div>';

  elements.view.innerHTML = `
    <div class="row">
      <span>
        Card ${flashcardSession.currentIndex + 1}/${flashcardSession.wordIds.length}
      </span>
      <span class="sp"></span>
      <button type="button" data-action="end-flashcards">End flashcards</button>
    </div>
    <div
      class="card fc"
      data-action="flip-flashcard"
      role="button"
      tabindex="0"
      aria-label="Reveal translation for ${escapeHtml(word.de)}"
    >
      <div class="de">${escapeHtml(word.de)}</div>
      ${revealedTranslation}
    </div>
    <div class="row">
      <button type="button" data-action="speak-flashcard">🔊 Listen</button>
      <button type="button" data-action="recognize-flashcard">🎤 Say it</button>
      <span class="sp"></span>
      <button type="button" data-action="review-flashcard">Still learning</button>
      <button type="button" class="primary" data-action="learn-flashcard">
        Got it
      </button>
    </div>
    <div class="fb" id="flashcardFeedback" aria-live="polite"></div>
  `;

}

function startPhrasePractice() {
  const selectedCategory = document.querySelector("#phraseCategory").value;
  const selectedOrder = document.querySelector("#phraseOrder").value;
  const selectedCount = document.querySelector("#phraseCount").value;
  let phraseEntries = practicePhrases
    .map((phrase, index) => ({ phrase, index }))
    .filter(
      ({ phrase }) =>
        !selectedCategory || phrase.category === selectedCategory,
    );

  if (selectedOrder === "new") {
    phraseEntries.sort(
      (first, second) =>
        Number(Boolean(appState.phrases[first.phrase.de])) -
        Number(Boolean(appState.phrases[second.phrase.de])),
    );
  } else if (selectedOrder === "random") {
    phraseEntries = shuffleArray(phraseEntries);
  }

  let phraseIds = phraseEntries.map(({ index }) => index);
  if (selectedCount !== "all") {
    phraseIds = phraseIds.slice(0, Number(selectedCount));
  }

  phraseSession = {
    phraseIds,
    currentIndex: 0,
    completedCount: 0,
    isRevealed: false,
  };
  renderApp();
}

function startFlashcards() {
  const learnedFilter = document.querySelector(
    "#flashcardLearnedFilter",
  ).value;
  const selectedOrder = document.querySelector("#flashcardOrder").value;
  const countSelection = document.querySelector("#flashcardCount").value;
  let wordIds = vocabularyWords
    .filter((word) => {
      const isLearned = Boolean(appState.learned[word.de]);
      return (
        learnedFilter === "all" ||
        (learnedFilter === "learned" ? isLearned : !isLearned)
      );
    })
    .map((word) => word.i);

  if (selectedOrder === "random") {
    wordIds = shuffleArray(wordIds);
  }
  if (countSelection !== "all") {
    wordIds = wordIds.slice(0, Number(countSelection));
  }

  if (!wordIds.length) {
    window.alert("No words in that selection.");
    return;
  }

  flashcardSession = {
    wordIds,
    currentIndex: 0,
    isRevealed: false,
    correctCount: 0,
    reviewCount: 0,
  };
  renderApp();
}

function markWordLearned(wordId) {
  const germanWord = vocabularyWords[wordId].de;

  if (appState.learned[germanWord]) {
    delete appState.learned[germanWord];
  } else {
    appState.learned[germanWord] = todayKey();
    appState.days[todayKey()] = true;
  }

  saveAppState();
  activeTab === "all" ? renderStatisticsAndWordList() : renderApp();
}

function renderStatisticsAndWordList() {
  renderStatistics();
  renderFilteredWordList();
}

function handleAppAction(eventTarget) {
  const actionElement = eventTarget.closest("[data-action], #nav button");
  if (!actionElement) {
    return;
  }

  if (actionElement.dataset.tab) {
    activeTab = actionElement.dataset.tab;
    flashcardSession = null;
    phraseSession = null;
    renderApp();
    return;
  }

  const wordId = Number(actionElement.dataset.wordId);
  const currentPhrase = phraseSession
    ? practicePhrases[
        phraseSession.phraseIds[phraseSession.currentIndex]
      ]
    : null;

  switch (actionElement.dataset.action) {
    case "speak-word":
      speakGerman(vocabularyWords[wordId].de);
      break;
    case "toggle-audio":
      appState.audioEnabled = appState.audioEnabled === false;
      saveAppState();
      updateAudioToggle();
      if (!appState.audioEnabled && "speechSynthesis" in window) {
        speechSynthesis.cancel();
      }
      break;
    case "recognize-word":
      recognizeGermanWord(
        wordId,
        document.querySelector(`#feedback-${wordId}`),
      );
      break;
    case "toggle-learned":
      markWordLearned(wordId);
      break;
    case "refresh-plan":
      getDailyWordPlan(true);
      renderApp();
      break;
    case "start-phrase-practice":
      startPhrasePractice();
      break;
    case "reveal-phrase":
      phraseSession.isRevealed = true;
      renderApp();
      speakGerman(currentPhrase.de);
      break;
    case "speak-phrase":
      speakGerman(currentPhrase.de);
      break;
    case "mark-phrase-comfortable":
      appState.phrases[currentPhrase.de] = todayKey();
      phraseSession.completedCount += 1;
      phraseSession.currentIndex += 1;
      phraseSession.isRevealed = false;
      saveAppState();
      renderApp();
      break;
    case "skip-phrase":
      phraseSession.currentIndex += 1;
      phraseSession.isRevealed = false;
      renderApp();
      break;
    case "end-phrase-practice":
      phraseSession = null;
      renderApp();
      break;
    case "start-flashcards":
      startFlashcards();
      break;
    case "flip-flashcard":
      flashcardSession.isRevealed = true;
      renderApp();
      speakGerman(
        vocabularyWords[
          flashcardSession.wordIds[flashcardSession.currentIndex]
        ].de,
      );
      break;
    case "speak-flashcard":
      speakGerman(
        vocabularyWords[
          flashcardSession.wordIds[flashcardSession.currentIndex]
        ].de,
      );
      break;
    case "recognize-flashcard": {
      const currentWordId =
        flashcardSession.wordIds[flashcardSession.currentIndex];
      recognizeGermanWord(
        currentWordId,
        document.querySelector("#flashcardFeedback"),
      );
      break;
    }
    case "learn-flashcard":
    case "review-flashcard": {
      const currentWordId =
        flashcardSession.wordIds[flashcardSession.currentIndex];
      if (actionElement.dataset.action === "learn-flashcard") {
        flashcardSession.correctCount += 1;
        appState.learned[vocabularyWords[currentWordId].de] = todayKey();
        appState.days[todayKey()] = true;
        saveAppState();
      } else {
        flashcardSession.reviewCount += 1;
      }
      flashcardSession.currentIndex += 1;
      flashcardSession.isRevealed = false;
      renderApp();
      break;
    }
    case "end-flashcards":
      flashcardSession = null;
      renderApp();
      break;
    default:
      break;
  }
}

document.addEventListener("click", (event) => {
  if (event.target instanceof Element) {
    handleAppAction(event.target);
  }
});

document.addEventListener("keydown", (event) => {
  if (
    (event.key === "Enter" || event.key === " ") &&
    event.target instanceof Element &&
    event.target.matches('[data-action="flip-flashcard"]')
  ) {
    event.preventDefault();
    event.target.click();
  }
});

document.addEventListener("change", (event) => {
  if (!(event.target instanceof HTMLSelectElement)) {
    return;
  }

  if (event.target.id === "learningMode") {
    appState.mode = event.target.value;
    saveAppState();
    renderApp();
  } else if (event.target.id === "wordsPerDay") {
    appState.wordsPerDay = Number(event.target.value);
    saveAppState();
    renderApp();
  } else if (event.target.id === "wordFilter") {
    renderFilteredWordList();
  }
});

document.addEventListener("input", (event) => {
  if (event.target.id === "wordSearch") {
    renderFilteredWordList();
  } else if (event.target === elements.voiceRate) {
    elements.voiceRateValue.value = `${Number(elements.voiceRate.value).toFixed(1)}x`;
  }
});

fetch("words.json")
  .then((response) => {
    if (!response.ok) {
      throw new Error(`Could not load words.json (${response.status}).`);
    }
    return response.json();
  })
  .then((words) => {
    migrateWordProgress(words);
    vocabularyWords = words.map((word, index) => ({ i: index, ...word }));
    renderApp();
  })
  .catch((error) => {
    console.error("Could not load vocabulary.", error);
    elements.view.textContent = "Could not load words.json.";
    elements.view.setAttribute("aria-busy", "false");
  });

fetch("phrases.json")
  .then((response) => {
    if (!response.ok) {
      throw new Error(`Could not load phrases.json (${response.status}).`);
    }
    return response.json();
  })
  .then((phrases) => {
    practicePhrases = phrases;
    if (activeTab === "speak") {
      renderPhrasePractice();
    }
  })
  .catch((error) => {
    console.error("Could not load speaking practice phrases.", error);
    phraseLoadError = true;
    if (activeTab === "speak") {
      renderPhrasePractice();
    }
  });

function showUpdateBanner(waitingWorker) {
  if (document.querySelector("#updateBanner")) {
    return;
  }

  const banner = document.createElement("div");
  banner.id = "updateBanner";
  banner.className = "update-banner";
  banner.setAttribute("role", "status");

  const message = document.createElement("span");
  message.textContent = "A new version is available.";

  const reloadButton = document.createElement("button");
  reloadButton.type = "button";
  reloadButton.className = "primary";
  reloadButton.textContent = "Update now";
  reloadButton.addEventListener("click", () => {
    reloadButton.disabled = true;
    waitingWorker.postMessage({ type: "SKIP_WAITING" });
  });

  const dismissButton = document.createElement("button");
  dismissButton.type = "button";
  dismissButton.textContent = "Later";
  dismissButton.addEventListener("click", () => banner.remove());

  banner.append(message, reloadButton, dismissButton);
  document.body.append(banner);
}

if ("serviceWorker" in navigator) {
  const hadController = Boolean(navigator.serviceWorker.controller);
  let isReloading = false;

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    // Skip the first install; only reload when an existing version is replaced.
    if (hadController && !isReloading) {
      isReloading = true;
      window.location.reload();
    }
  });

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("sw.js")
      .then((registration) => {
        if (registration.waiting && navigator.serviceWorker.controller) {
          showUpdateBanner(registration.waiting);
        }

        registration.addEventListener("updatefound", () => {
          const installingWorker = registration.installing;

          installingWorker?.addEventListener("statechange", () => {
            if (
              installingWorker.state === "installed" &&
              navigator.serviceWorker.controller
            ) {
              showUpdateBanner(installingWorker);
            }
          });
        });

        // Installed PWAs stay open for long periods, so check again on return.
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") {
            registration.update().catch(() => {});
          }
        });
      })
      .catch((error) => {
        console.error("Could not register the offline service worker.", error);
      });
  });
}
