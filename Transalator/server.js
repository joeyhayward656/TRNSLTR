const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const PORT = process.env.PORT || 3456;
const PUBLIC_DIR = path.join(__dirname, "public");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".mp3": "audio/mpeg",
};

async function translateWithMyMemory(text, from, to) {
  const langpair = `${from}|${to}`;
  const url = new URL("https://api.mymemory.translated.net/get");
  url.searchParams.set("q", text);
  url.searchParams.set("langpair", langpair);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`MyMemory request failed (${response.status})`);
  }

  const data = await response.json();
  const translated = data?.responseData?.translatedText;
  if (!translated || translated === text) {
    const quota = data?.quotaFinished;
    if (quota) {
      throw new Error("Daily translation quota reached. Try again later.");
    }
  }

  if (!translated) {
    throw new Error("No translation returned");
  }

  return translated;
}

async function translateWithLibreTranslate(text, from, to) {
  const response = await fetch("https://libretranslate.com/translate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      q: text,
      source: from,
      target: to,
      format: "text",
    }),
  });

  if (!response.ok) {
    throw new Error(`LibreTranslate request failed (${response.status})`);
  }

  const data = await response.json();
  if (!data?.translatedText) {
    throw new Error("No translation returned");
  }

  return data.translatedText;
}

async function translate(text, from, to) {
  const errors = [];

  try {
    return await translateWithMyMemory(text, from, to);
  } catch (error) {
    errors.push(error.message);
  }

  try {
    return await translateWithLibreTranslate(text, from, to);
  } catch (error) {
    errors.push(error.message);
  }

  throw new Error(errors.join(" | "));
}

const TTS_CHUNK_SIZE = 180;

function chunkTextForTts(text) {
  if (text.length <= TTS_CHUNK_SIZE) return [text];

  const chunks = [];
  let remaining = text;

  while (remaining.length > TTS_CHUNK_SIZE) {
    let splitAt = remaining.lastIndexOf(" ", TTS_CHUNK_SIZE);
    if (splitAt < TTS_CHUNK_SIZE / 2) {
      splitAt = TTS_CHUNK_SIZE;
    }
    chunks.push(remaining.slice(0, splitAt).trim());
    remaining = remaining.slice(splitAt).trim();
  }

  if (remaining) chunks.push(remaining);
  return chunks.filter(Boolean);
}

async function fetchTtsChunk(text, lang) {
  const tl = lang === "th" ? "th" : "en";
  const url = new URL("https://translate.google.com/translate_tts");
  url.searchParams.set("ie", "UTF-8");
  url.searchParams.set("client", "tw-ob");
  url.searchParams.set("tl", tl);
  url.searchParams.set("q", text);

  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Referer: "https://translate.google.com/",
    },
  });

  if (!response.ok) {
    throw new Error(`TTS request failed (${response.status})`);
  }

  return Buffer.from(await response.arrayBuffer());
}

async function synthesizeSpeech(text, lang) {
  const chunks = chunkTextForTts(text);
  const audioParts = [];

  for (const chunk of chunks) {
    audioParts.push(await fetchTtsChunk(chunk, lang));
  }

  return Buffer.concat(audioParts);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function serveStatic(filePath, res) {
  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(err.code === "ENOENT" ? 404 : 500);
      res.end(err.code === "ENOENT" ? "Not found" : "Server error");
      return;
    }

    const ext = path.extname(filePath);
    res.writeHead(200, { "Content-Type": MIME_TYPES[ext] || "application/octet-stream" });
    res.end(content);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (req.method === "POST" && url.pathname === "/api/translate") {
    try {
      const body = JSON.parse(await readBody(req));
      const text = (body.text || "").trim();
      const from = body.from;
      const to = body.to;

      if (!text) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Text is required." }));
        return;
      }

      if (!["en", "th"].includes(from) || !["en", "th"].includes(to) || from === to) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid language pair." }));
        return;
      }

      if (text.length > 5000) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Text is too long (max 5000 characters)." }));
        return;
      }

      const translatedText = await translate(text, from, to);
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ translatedText, from, to }));
    } catch (error) {
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: error.message || "Translation failed." }));
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/tts") {
    try {
      const text = (url.searchParams.get("text") || "").trim();
      const lang = url.searchParams.get("lang");

      if (!text) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Text is required." }));
        return;
      }

      if (!["en", "th"].includes(lang)) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid language." }));
        return;
      }

      if (text.length > 5000) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Text is too long (max 5000 characters)." }));
        return;
      }

      const audio = await synthesizeSpeech(text, lang);
      res.writeHead(200, {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
      });
      res.end(audio);
    } catch (error) {
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: error.message || "Speech synthesis failed." }));
    }
    return;
  }

  let filePath = path.join(PUBLIC_DIR, url.pathname === "/" ? "index.html" : url.pathname);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  serveStatic(filePath, res);
});

server.listen(PORT, () => {
  console.log(`Thai-English Translator running at http://localhost:${PORT}`);
});
