const LANG = {
  th: { code: "th", label: "Thai", speech: "th-TH", placeholder: "พิมพ์ภาษาไทยที่นี่ หรือกดไมโครโฟนเพื่อพูด..." },
  en: { code: "en", label: "English", speech: "en-US", placeholder: "Type English here or tap the microphone to speak..." },
};

const PHRASES = [
  { en: "I don't understand.", th: "ฉันไม่เข้าใจ" },
  { en: "Can you repeat that, please?", th: "ช่วยพูดซ้ำได้ไหมคะ/ครับ?" },
  { en: "May I go to the restroom?", th: "ขออนุญาตไปห้องน้ำได้ไหมคะ/ครับ?" },
  { en: "I need help with this assignment.", th: "ฉันต้องการความช่วยเหลือกับงานนี้" },
  { en: "What page are we on?", th: "เราอยู่หน้าไหนคะ/ครับ?" },
  { en: "Thank you, teacher.", th: "ขอบคุณคุณครูค่ะ/ครับ" },
  { en: "I'm new here and still learning English.", th: "ฉันเพิ่งมาใหม่และยังเรียนภาษาอังกฤษอยู่" },
  { en: "Could you speak more slowly?", th: "ช่วยพูดช้าๆ หน่อยได้ไหมคะ/ครับ?" },
];

const state = {
  direction: "th-en",
  sourceLang: "th",
  targetLang: "en",
  isListening: false,
  recognition: null,
  voicesReady: null,
  currentAudio: null,
};

const els = {
  directionBtns: document.querySelectorAll(".direction-btn"),
  sourceText: document.getElementById("source-text"),
  targetText: document.getElementById("target-text"),
  sourceLangBadge: document.getElementById("source-lang-badge"),
  targetLangBadge: document.getElementById("target-lang-badge"),
  micSource: document.getElementById("mic-source"),
  speakTarget: document.getElementById("speak-target"),
  clearSource: document.getElementById("clear-source"),
  copySource: document.getElementById("copy-source"),
  copyTarget: document.getElementById("copy-target"),
  swapBtn: document.getElementById("swap-btn"),
  translateBtn: document.getElementById("translate-btn"),
  speechStatus: document.getElementById("speech-status"),
  translateStatus: document.getElementById("translate-status"),
  phraseGrid: document.getElementById("phrase-grid"),
};

function hasThaiCharacters(text) {
  return /[\u0E00-\u0E7F]/.test(text);
}

function detectLanguage(text) {
  if (!text.trim()) return null;
  return hasThaiCharacters(text) ? "th" : "en";
}

function resolveLanguages() {
  const text = els.sourceText.value.trim();

  if (state.direction === "auto" && text) {
    const detected = detectLanguage(text);
    return detected === "th" ? { from: "th", to: "en" } : { from: "en", to: "th" };
  }

  if (state.direction === "en-th") {
    return { from: "en", to: "th" };
  }

  return { from: "th", to: "en" };
}

function updateLanguageUI() {
  const { from, to } = resolveLanguages();
  state.sourceLang = from;
  state.targetLang = to;

  els.sourceLangBadge.textContent = LANG[from].label;
  els.targetLangBadge.textContent = LANG[to].label;

  els.sourceLangBadge.classList.toggle("accent", from === "en");
  els.targetLangBadge.classList.toggle("accent", to === "en");

  if (state.direction !== "auto") {
    els.sourceText.placeholder = LANG[from].placeholder;
  } else {
    els.sourceText.placeholder = "Type or speak in Thai or English...";
  }
}

function setDirection(direction) {
  state.direction = direction;
  els.directionBtns.forEach((btn) => {
    const active = btn.dataset.direction === direction;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-pressed", String(active));
  });
  updateLanguageUI();
}

function swapLanguages() {
  if (state.direction === "auto") {
    setDirection("th-en");
  } else if (state.direction === "th-en") {
    setDirection("en-th");
  } else {
    setDirection("th-en");
  }

  const sourceValue = els.sourceText.value;
  const targetValue = els.targetText.value;
  els.sourceText.value = targetValue;
  els.targetText.value = sourceValue;
  updateLanguageUI();
  els.translateStatus.textContent = "";
}

function setSpeechStatus(message, type = "") {
  els.speechStatus.textContent = message;
  els.speechStatus.className = `status-line${type ? ` ${type}` : ""}`;
}

function setTranslateStatus(message, type = "") {
  els.translateStatus.textContent = message;
  els.translateStatus.className = `status-line${type ? ` ${type}` : ""}`;
}

async function copyText(text, statusEl) {
  if (!text.trim()) return;
  try {
    await navigator.clipboard.writeText(text);
    const original = statusEl.textContent;
    statusEl.textContent = "Copied!";
    statusEl.classList.add("success");
    setTimeout(() => {
      statusEl.textContent = original;
      statusEl.classList.remove("success");
    }, 1200);
  } catch {
    statusEl.textContent = "Could not copy text.";
    statusEl.classList.add("error");
  }
}

async function translateText({ autoSpeak = false } = {}) {
  const text = els.sourceText.value.trim();
  if (!text) {
    setTranslateStatus("Enter or speak something to translate.", "error");
    return;
  }

  updateLanguageUI();
  const { from, to } = resolveLanguages();

  els.translateBtn.disabled = true;
  setTranslateStatus("Translating...");

  try {
    const response = await fetch("/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, from, to }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Translation failed.");
    }

    els.targetText.value = data.translatedText;
    setTranslateStatus(`Translated ${LANG[from].label} → ${LANG[to].label}`, "success");

    if (autoSpeak) {
      speakText(data.translatedText, to);
    }
  } catch (error) {
    setTranslateStatus(error.message, "error");
  } finally {
    els.translateBtn.disabled = false;
  }
}

function getSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return null;
  return new SpeechRecognition();
}

function setupRecognition() {
  const recognition = getSpeechRecognition();
  if (!recognition) {
    setSpeechStatus("Speech recognition is not supported in this browser. Use Chrome or Edge.", "error");
    els.micSource.disabled = true;
    return null;
  }

  recognition.continuous = true;
  recognition.interimResults = true;

  recognition.onstart = () => {
    state.isListening = true;
    els.micSource.classList.add("listening");
    els.micSource.querySelector("span").textContent = "Listening...";
    setSpeechStatus("Listening... speak now.");
  };

  recognition.onend = () => {
    state.isListening = false;
    els.micSource.classList.remove("listening");
    els.micSource.querySelector("span").textContent = "Speak";
    if (els.sourceText.value.trim()) {
      setSpeechStatus("Speech captured. Translating...");
      translateText({ autoSpeak: true });
    } else {
      setSpeechStatus("");
    }
  };

  recognition.onerror = (event) => {
    const messages = {
      "not-allowed": "Microphone access denied. Please allow microphone permission.",
      "no-speech": "No speech detected. Try again.",
      "network": "Network error during speech recognition.",
      "aborted": "",
    };
    const message = messages[event.error] || "Speech recognition error. Try again.";
    setSpeechStatus(message, event.error === "aborted" ? "" : "error");
  };

  recognition.onresult = (event) => {
    let transcript = "";
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      transcript += event.results[i][0].transcript;
    }
    els.sourceText.value = transcript.trim();
    updateLanguageUI();
  };

  return recognition;
}

function toggleListening() {
  if (!state.recognition) {
    state.recognition = setupRecognition();
  }
  if (!state.recognition) return;

  if (state.isListening) {
    state.recognition.stop();
    return;
  }

  updateLanguageUI();
  const { from } = resolveLanguages();
  state.recognition.lang = LANG[from].speech;
  state.recognition.start();
}

function resolveSpeakLang(text) {
  if (hasThaiCharacters(text)) return "th";
  if (/[a-zA-Z]/.test(text)) return "en";
  return state.targetLang;
}

function loadVoices() {
  if (!window.speechSynthesis) return Promise.resolve([]);

  if (state.voicesReady) return state.voicesReady;

  state.voicesReady = new Promise((resolve) => {
    const pickVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      if (voices.length) {
        resolve(voices);
        return true;
      }
      return false;
    };

    if (pickVoices()) return;

    const onVoicesChanged = () => {
      if (pickVoices()) {
        window.speechSynthesis.removeEventListener("voiceschanged", onVoicesChanged);
      }
    };

    window.speechSynthesis.addEventListener("voiceschanged", onVoicesChanged);
    setTimeout(() => resolve(window.speechSynthesis.getVoices()), 500);
  });

  return state.voicesReady;
}

function findBrowserVoice(voices, langCode) {
  const locale = LANG[langCode].speech.toLowerCase();
  const prefix = langCode;

  return (
    voices.find((voice) => voice.lang.toLowerCase() === locale) ||
    voices.find((voice) => voice.lang.toLowerCase().startsWith(`${prefix}-`)) ||
    voices.find((voice) => voice.lang.toLowerCase().startsWith(prefix)) ||
    voices.find((voice) => voice.name.toLowerCase().includes(langCode === "th" ? "thai" : "english"))
  );
}

function stopSpeaking() {
  window.speechSynthesis?.cancel();

  if (state.currentAudio) {
    state.currentAudio.pause();
    state.currentAudio.currentTime = 0;
    if (state.currentAudio.src.startsWith("blob:")) {
      URL.revokeObjectURL(state.currentAudio.src);
    }
    state.currentAudio = null;
  }
}

function speakWithBrowser(text, langCode) {
  return new Promise((resolve, reject) => {
    if (!window.speechSynthesis) {
      reject(new Error("Speech synthesis not supported."));
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = LANG[langCode].speech;
    utterance.rate = 0.92;

    loadVoices().then((voices) => {
      const voice = findBrowserVoice(voices, langCode);
      if (voice) utterance.voice = voice;

      utterance.onend = () => resolve();
      utterance.onerror = () => reject(new Error("Browser speech failed."));

      window.speechSynthesis.speak(utterance);

      // Chrome sometimes needs a nudge to start speaking.
      setTimeout(() => {
        if (window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
        }
      }, 100);
    });
  });
}

async function speakWithServer(text, langCode) {
  const response = await fetch(
    `/api/tts?text=${encodeURIComponent(text)}&lang=${encodeURIComponent(langCode)}`
  );

  if (!response.ok) {
    let message = "Could not play Thai audio.";
    try {
      const data = await response.json();
      message = data.error || message;
    } catch {
      // Ignore JSON parse errors for non-JSON responses.
    }
    throw new Error(message);
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  state.currentAudio = audio;

  await new Promise((resolve, reject) => {
    audio.onended = () => {
      URL.revokeObjectURL(url);
      if (state.currentAudio === audio) state.currentAudio = null;
      resolve();
    };
    audio.onerror = () => {
      URL.revokeObjectURL(url);
      if (state.currentAudio === audio) state.currentAudio = null;
      reject(new Error("Audio playback failed."));
    };
    audio.play().catch(reject);
  });
}

async function speakText(text, langCode) {
  const trimmed = text.trim();
  if (!trimmed) return;

  stopSpeaking();
  setTranslateStatus("Playing audio...");

  try {
    // Thai voices are often missing in the browser on Windows — use server TTS.
    if (langCode === "th") {
      await speakWithServer(trimmed, "th");
      setTranslateStatus("Playing Thai audio.", "success");
      return;
    }

    const voices = await loadVoices();
    const hasVoice = Boolean(findBrowserVoice(voices, langCode));

    if (hasVoice) {
      await speakWithBrowser(trimmed, langCode);
      setTranslateStatus("Playing English audio.", "success");
      return;
    }

    await speakWithServer(trimmed, langCode);
    setTranslateStatus("Playing English audio.", "success");
  } catch (error) {
    setTranslateStatus(error.message, "error");
  }
}

function renderPhrases() {
  els.phraseGrid.innerHTML = PHRASES.map((phrase, index) => `
    <button type="button" class="phrase-btn" data-index="${index}">
      <span class="phrase-en">${phrase.en}</span>
      <span class="phrase-th">${phrase.th}</span>
    </button>
  `).join("");

  els.phraseGrid.querySelectorAll(".phrase-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const phrase = PHRASES[Number(btn.dataset.index)];
      setDirection("th-en");
      els.sourceText.value = phrase.th;
      updateLanguageUI();
      translateText({ autoSpeak: true });
    });
  });
}

let translateTimer;
function scheduleTranslate() {
  clearTimeout(translateTimer);
  updateLanguageUI();
  translateTimer = setTimeout(() => {
    if (els.sourceText.value.trim()) {
      translateText();
    }
  }, 700);
}

els.directionBtns.forEach((btn) => {
  btn.addEventListener("click", () => setDirection(btn.dataset.direction));
});

els.translateBtn.addEventListener("click", () => translateText());
els.swapBtn.addEventListener("click", swapLanguages);
els.micSource.addEventListener("click", toggleListening);
els.speakTarget.addEventListener("click", () => {
  updateLanguageUI();
  const text = els.targetText.value;
  const lang = resolveSpeakLang(text);
  speakText(text, lang);
});
els.clearSource.addEventListener("click", () => {
  els.sourceText.value = "";
  els.targetText.value = "";
  setSpeechStatus("");
  setTranslateStatus("");
  updateLanguageUI();
});
els.copySource.addEventListener("click", () => copyText(els.sourceText.value, els.speechStatus));
els.copyTarget.addEventListener("click", () => copyText(els.targetText.value, els.translateStatus));
els.sourceText.addEventListener("input", scheduleTranslate);

loadVoices();

setDirection("th-en");
renderPhrases();
updateLanguageUI();
