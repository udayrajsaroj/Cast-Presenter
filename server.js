const express = require("express");
const http = require("http");
const path = require("path");
const fs = require("fs");
const os = require("os");
const cors = require("cors");
const multer = require("multer");
const { Server } = require("socket.io");
const JSZip = require("jszip");

const PORT = Number(process.env.PORT) || 3000;
const UPLOAD_DIR = path.join(__dirname, "uploads");
const PUBLIC_DIR = path.join(__dirname, "public");

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const app = express();
const server = http.createServer(app);

server.timeout = 300000;
server.keepAliveTimeout = 300000;

const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.static(PUBLIC_DIR));

// Multer Configuration
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    cb(null, `${Date.now()}_${safe}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 200 * 1024 * 1024 } });

// Global Presentation State
let presentation = {
  id: null,
  filename: null,
  storedPath: null,
  mimeType: null,
  type: null,
  totalPages: 0,
  currentPage: 1,
  slideImages: [],
};

const BIBLE_THEMES = [
  { id: "nature-1", label: "Nature", image: "/backgrounds/nature-1.jpg" },
  { id: "sky-1", label: "Sky", image: "/backgrounds/sky-1.jpg" },
  { id: "forest-1", label: "Forest", image: "/backgrounds/forest-1.jpg" },
  { id: "clouds-1", label: "Clouds", image: "/backgrounds/clouds-1.jpg" },
];

// --- Load Local Bible Databases ---
let bibleEnglish = {};
let bibleHindi = {};

try {
  bibleEnglish = JSON.parse(fs.readFileSync(path.join(__dirname, "bible_en.json"), "utf8"));
  bibleHindi = JSON.parse(fs.readFileSync(path.join(__dirname, "bible_hi.json"), "utf8"));
  console.log("Local Bible databases loaded successfully!");
} catch (err) {
  console.error("Error loading local Bible JSON files. Make sure bible_en.json and bible_hi.json exist.", err);
}

// Comprehensive Book Name Resolver for Abbreviations
const BOOK_MAP = {
  "gen": "Genesis", "ex": "Exodus", "exo": "Exodus", "lev": "Leviticus", "num": "Numbers", "deut": "Deuteronomy",
  "josh": "Joshua", "judg": "Judges", "ruth": "Ruth", "1sam": "1 Samuel", "2sam": "2 Samuel", "1kgs": "1 Kings",
  "2kgs": "2 Kings", "1chr": "1 Chronicles", "2chr": "2 Chronicles", "ezra": "Ezra", "neh": "Nehemiah", "esth": "Esther",
  "job": "Job", "ps": "Psalms", "psa": "Psalms", "prov": "Proverbs", "ecc": "Ecclesiastes", "song": "Song of Solomon",
  "isa": "Isaiah", "jer": "Jeremiah", "lam": "Lamentations", "ezek": "Ezekiel", "dan": "Daniel", "hos": "Hosea",
  "joel": "Joel", "amos": "Amos", "obad": "Obadiah", "jonah": "Jonah", "mic": "Micah", "nah": "Nahum", "hab": "Habakkuk",
  "zeph": "Zephaniah", "hag": "Haggai", "zech": "Zechariah", "mal": "Malachi", "matt": "Matthew", "mt": "Matthew",
  "mark": "Mark", "mk": "Mark", "luke": "Luke", "lk": "Luke", "john": "John", "jn": "John", "acts": "Acts",
  "rom": "Romans", "1cor": "1 Corinthians", "2cor": "2 Corinthians", "gal": "Galatians", "eph": "Ephesians",
  "phil": "Philippians", "col": "Colossians", "1thess": "1 Thessalonians", "2thess": "2 Thessalonians",
  "1tim": "1 Timothy", "2tim": "2 Timothy", "titus": "Titus", "phlm": "Philemon", "heb": "Hebrews", "jas": "James",
  "1pet": "1 Peter", "2pet": "2 Peter", "1jn": "1 John", "2jn": "2 John", "3jn": "3 John", "jude": "Jude", "rev": "Revelation"
};

function getStandardBookName(inputName) {
  const clean = inputName.toLowerCase().replace(/\s+/g, "");
  if (BOOK_MAP[clean]) return BOOK_MAP[clean];
  
  for (const standardName of Object.keys(bibleEnglish)) {
    if (standardName.toLowerCase() === inputName.toLowerCase().trim()) {
      return standardName;
    }
  }
  return inputName;
}

function localParseReference(input) {
  const s = (input || "").trim();
  if (!s) return null;
  const m = s.match(/^((?:\d\s*)?[a-zA-Z]+(?:\s+[a-zA-Z]+)?)\s+(\d+)(?:\s+|:)(\d+)/i);
  if (!m) return null;
  return {
    book: m[1].trim(),
    chapter: m[2],
    verse: m[3]
  };
}

function getLanIp() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === "IPv4" && !net.internal) {
        return net.address;
      }
    }
  }
  return "127.0.0.1";
}

// --- PPTX Slide Extractor Function ---
async function extractPptxSlides(filePath) {
  const buffer = fs.readFileSync(filePath);
  const zip = await JSZip.loadAsync(buffer);

  const slidePaths = Object.keys(zip.files)
    .filter((p) => /^ppt\/slides\/slide\d+\.xml$/i.test(p))
    .sort((a, b) => {
      const na = Number(a.match(/slide(\d+)\.xml/i)[1]);
      const nb = Number(b.match(/slide(\d+)\.xml/i)[1]);
      return na - nb;
    });

  const mediaFiles = {};
  for (const [entryPath, entry] of Object.entries(zip.files)) {
    if (/^ppt\/media\/.+\.(png|jpe?g|gif|webp)$/i.test(entryPath) && !entry.dir) {
      const base = path.basename(entryPath);
      const ext = path.extname(base).slice(1).toLowerCase();
      const mime = ext === "jpg" ? "jpeg" : ext;
      const buf = await entry.async("nodebuffer");
      mediaFiles[base] = `data:image/${mime};base64,${buf.toString("base64")}`;
    }
  }

  const slides = [];
  for (let i = 0; i < slidePaths.length; i += 1) {
    const slidePath = slidePaths[i];
    const xml = await zip.file(slidePath).async("string");
    const relPath = slidePath
      .replace("slides/", "slides/_rels/")
      .replace(".xml", ".xml.rels");
    let relXml = "";
    if (zip.file(relPath)) {
      relXml = await zip.file(relPath).async("string");
    }

    const targets = [...relXml.matchAll(/Target="([^"]+)"/g)].map((m) => m[1]);
    const images = [];
    for (const target of targets) {
      if (!/media\//i.test(target)) continue;
      const mediaName = path.basename(target);
      if (mediaFiles[mediaName]) images.push(mediaFiles[mediaName]);
    }

    if (images.length === 0) {
      const textBits = [...xml.matchAll(/<a:t[^>]*>([^<]*)<\/a:t>/g)]
        .map((m) => m[1])
        .filter(Boolean)
        .slice(0, 12)
        .join(" ");
      slides.push({
        index: i + 1,
        images: [],
        placeholder: textBits || `Slide ${i + 1}`,
      });
    } else {
      slides.push({ index: i + 1, images, placeholder: null });
    }
  }

  if (slides.length === 0) {
    Object.values(mediaFiles).forEach((img, idx) => {
      slides.push({ index: idx + 1, images: [img], placeholder: null });
    });
  }

  return slides;
}

// --- API Routes ---

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.get("/api/info", (_req, res) => {
  const ip = getLanIp();
  res.json({
    ip,
    port: PORT,
    displayUrl: `http://${ip}:${PORT}`,
    currentPage: presentation.currentPage,
    totalPages: presentation.totalPages,
    filename: presentation.filename,
    type: presentation.type,
  });
});

app.get("/api/themes", (_req, res) => res.json({ themes: BIBLE_THEMES }));

/**
 * 100% Local Offline Bilingual Bible Endpoint
 */
app.get("/api/bible/bilingual/:ref(*)", (req, res) => {
  try {
    const rawRef = decodeURIComponent(req.params.ref).trim();
    const parsed = localParseReference(rawRef);
    
    if (!parsed) {
      return res.status(400).json({ error: "Invalid reference format. Use e.g., 'Joshua 3:16'" });
    }

    const standardBook = getStandardBookName(parsed.book);
    const ch = parsed.chapter;
    const v = parsed.verse;

    let enText = "";
    if (bibleEnglish[standardBook] && bibleEnglish[standardBook][ch] && bibleEnglish[standardBook][ch][v]) {
      enText = bibleEnglish[standardBook][ch][v];
    } else {
      return res.status(404).json({ error: `Verse not found in English Database (${standardBook} ${ch}:${v})` });
    }

    let hiText = "";
    if (bibleHindi[standardBook] && bibleHindi[standardBook][ch] && bibleHindi[standardBook][ch][v]) {
      hiText = bibleHindi[standardBook][ch][v];
    } else {
      console.warn(`Hindi text missing locally for ${standardBook} ${ch}:${v}`);
      hiText = ""; 
    }

    return res.json({
      reference: `${standardBook} ${ch}:${v}`,
      enText: enText.trim(),
      hiText: hiText.trim(),
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Local Lookup failed" });
  }
});

app.get("/api/bible/chapter/:ref(*)", (req, res) => {
  try {
    const rawRef = decodeURIComponent(req.params.ref).trim();
    const parts = rawRef.split(" ");
    const chapter = parts.pop();
    const bookInput = parts.join(" ");
    const standardBook = getStandardBookName(bookInput);

    if (bibleEnglish[standardBook] && bibleEnglish[standardBook][chapter]) {
      const verseCount = Object.keys(bibleEnglish[standardBook][chapter]).length;
      return res.json({ verseCount });
    }
    return res.json({ verseCount: 0 });
  } catch (_e) {
    return res.json({ verseCount: 0 });
  }
});

app.get("/api/document/file", (_req, res) => {
  if (!presentation.storedPath || !fs.existsSync(presentation.storedPath)) {
    return res.status(404).json({ error: "No document loaded" });
  }
  return res.sendFile(presentation.storedPath);
});

app.post("/api/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const ext = path.extname(req.file.originalname).toLowerCase();
    const isPdf = ext === ".pdf" || req.file.mimetype === "application/pdf";
    const isPptx = ext === ".pptx" || req.file.mimetype === "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    const isVideo = /^video\//i.test(req.file.mimetype || "") || [".mp4", ".mov", ".webm", ".m4v"].includes(ext);

    if (!isPdf && !isPptx && !isVideo) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: "Only PDF, PPTX, and video are supported" });
    }

    if (presentation.storedPath && fs.existsSync(presentation.storedPath)) {
      try { fs.unlinkSync(presentation.storedPath); } catch (_e) {}
    }

    presentation.id = String(Date.now());
    presentation.filename = req.file.originalname;
    presentation.storedPath = req.file.path;
    presentation.mimeType = req.file.mimetype;
    presentation.currentPage = 1;
    presentation.slideImages = [];

    if (isPdf) {
      presentation.type = "pdf";
      const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
      const data = new Uint8Array(fs.readFileSync(req.file.path));
      const pdf = await pdfjs.getDocument({ data }).promise;
      presentation.totalPages = pdf.numPages;
    } else if (isPptx) {
      presentation.type = "pptx";
      const slides = await extractPptxSlides(req.file.path);
      presentation.slideImages = slides; 
      presentation.totalPages = Math.max(1, slides.length);
    } else {
      presentation.type = "video";
      presentation.totalPages = 1;
      presentation.slideImages = [];
    }

    const payload = {
      id: presentation.id,
      filename: presentation.filename,
      type: presentation.type,
      totalPages: presentation.totalPages,
      currentPage: presentation.currentPage,
      documentUrl: "/api/document/file",
      slideImages: presentation.slideImages,
      mimeType: presentation.mimeType,
    };

    io.emit("upload-document", payload);
    io.emit("change-page", { page: presentation.currentPage, totalPages: presentation.totalPages, type: presentation.type, filename: presentation.filename, slideImages: presentation.slideImages, documentUrl: "/api/document/file" });
    return res.json(payload);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message || "Upload failed" });
  }
});

// --- Socket Logic ---
io.on("connection", (socket) => {
  socket.on("join-room", (data, ack) => {
    const role = data && data.role ? data.role : "viewer";
    socket.join("cast-room");
    const snapshot = {
      ok: true,
      role,
      currentPage: presentation.currentPage,
      totalPages: presentation.totalPages,
      type: presentation.type,
      filename: presentation.filename,
      documentUrl: presentation.storedPath ? "/api/document/file" : null,
      slideImages: presentation.slideImages,
    };
    if (typeof ack === "function") ack(snapshot);
    socket.emit("change-page", snapshot);
  });

  socket.on("show-verse", (data) => {
    io.emit("show-verse", {
      reference: data?.reference || "",
      enText: data?.enText || "",
      hiText: data?.hiText || "",
      theme: data?.theme || "nature-1",
      backgroundUrl: data?.backgroundUrl || "/backgrounds/nature-1.jpg",
    });
  });

  socket.on("change-font-size", (data) => {
    io.emit("change-font-size", { scale: data?.scale || 1.0 });
  });

  socket.on("change-page", (data) => {
    const page = Number(data?.page);
    if (!Number.isFinite(page) || page < 1) return;
    const max = Math.max(1, presentation.totalPages);
    presentation.currentPage = Math.min(Math.max(1, page), max);
    io.emit("change-page", { page: presentation.currentPage, totalPages: presentation.totalPages, type: presentation.type, filename: presentation.filename, slideImages: presentation.slideImages, documentUrl: presentation.storedPath ? "/api/document/file" : null });
  });

  // FIX: Added relay for Video Control
  socket.on("video-control", (data) => {
    io.emit("video-control", data);
  });

  // FIX: Added relay for Video Seek
  socket.on("video-seek", (data) => {
    io.emit("video-seek", data);
  });

  // FIX: Added relay for Open URL
  socket.on("open-url", (data) => {
    io.emit("open-url", data);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  const ip = getLanIp();
  console.log(`Cast server running locally: http://${ip}:${PORT}`);
});