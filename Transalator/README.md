# English ↔ Thai Translator

A classroom-friendly translator for foreign students. Speak or type in **Thai** or **English** and get instant translations — with text-to-speech so the student can listen to results.

## Features

- **Thai → English** and **English → Thai** translation
- **Auto-detect** language from typed or spoken text
- **Speech input** (microphone) — say something in Thai or English
- **Listen** button reads the translation aloud
- **Quick phrases** for common classroom situations
- Works in **Chrome** or **Edge** (best speech support)

## Quick start

1. Make sure [Node.js 18+](https://nodejs.org/) is installed.
2. Open a terminal in this folder.
3. Run:

```bash
npm start
```

4. Open **http://localhost:3456** in Chrome or Edge.
5. Allow **microphone access** when prompted (needed for speech input).

## How to use in class

| Goal | Steps |
|------|--------|
| Student speaks Thai → hear English | Select **Thai → English**, tap **Speak**, talk, then tap **Listen** |
| Teacher speaks English → hear Thai | Select **English → Thai**, tap **Speak**, talk, then tap **Listen** |
| Type instead of speak | Type in either language and press **Translate** (or wait for auto-translate) |
| Not sure which language | Use **Auto-detect** — the app picks Thai or English from the text |

## Tips

- Use **Chrome** or **Edge** on a laptop or phone for reliable speech recognition.
- If translation fails briefly, wait a moment and try again (free translation services have rate limits).
- Share the same URL on the classroom network so everyone can open the same page.

## Project structure

```
thai-english-translator/
├── server.js          # Local server + translation API proxy
├── public/
│   ├── index.html
│   ├── styles.css
│   └── app.js
└── package.json
```

No API keys required — translation uses free public services with automatic fallback.
