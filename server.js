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

// Increased timeout for large uploads/processing
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

// --- Helper Functions ---

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

function normalizeBibleRef(raw) {
  try {
    return decodeURIComponent(String(raw || "")).trim().replace(/\s+/g, " ");
  } catch (_e) {
    return String(raw || "").trim().replace(/\s+/g, " ");
  }
}

// --- Bible Logic (Bilingual) ---

/**
 * Fetches both English (KJV) and Hindi translations concurrently
 */
async function fetchBilingualBible(ref) {
  const clean = normalizeBibleRef(ref);
  if (!clean) throw new Error("Reference is required");

  // Fetch both English and Hindi concurrently
  const [enRes, hiRes] = await Promise.all([
    fetch(`https://bible-api.com/${encodeURIComponent(clean)}?translation=kjv`),
    fetch(`https://bible-api.com/${encodeURIComponent(clean)}?translation=hindi`),
  ]);

  if (!enRes.ok) throw new Error("Verse not found (English lookup failed)");

  const enData = await enRes.json();
  let hiText = "";

  // Graceful fallback if Hindi translation fails or is missing
  if (hiRes.ok) {
    const hiData = await hiRes.json();
    hiText = hiData.text || "";
  }

  return {
    reference: enData.reference,
    enText: enData.text.trim(),
    hiText: hiText.trim(),
  };
}

// --- Document Processing ---

async function getPdfPageCount(filePath) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(fs.readFileSync(filePath));
  const pdf = await pdfjs.getDocument({ data }).promise;
  return pdf.numPages;
}

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

function broadcastPage() {
  io.emit("change-page", {
    page: presentation.currentPage,
    totalPages: presentation.totalPages,
    type: presentation.type,
    filename: presentation.filename,
    slideImages: presentation.slideImages,
    documentUrl: presentation.storedPath ? "/api/document/file" : null,
  });
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
 * NEW: Bilingual Bible Endpoint
 * Fetches English and Hindi text for a given reference.
 */
app.get("/api/bible/bilingual/:ref(*)", async (req, res) => {
  try {
    const data = await fetchBilingualBible(req.params.ref);
    return res.json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message || "Bible lookup failed" });
  }
});

app.get("/api/bible/:ref(*)", async (req, res) => {
  // Kept for backwards compatibility
  try {
    const clean = normalizeBibleRef(req.params.ref);
    const response = await fetch(`https://bible-api.com/${encodeURIComponent(clean)}?translation=kjv`);
    if (!response.ok) throw new Error("Verse not found");
    const data = await response.json();
    return res.json({
      reference: data.reference,
      text: data.text,
      verses: data.verses,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
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

    // Cleanup old file
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
      presentation.totalPages = await getPdfPageCount(req.file.path);
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
    broadcastPage();
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
    const backgroundUrl = data?.backgroundUrl || "/backgrounds/nature-1.jpg";
    io.emit("show-verse", {
      reference: data?.reference || "",
      enText: data?.enText || "",
      hiText: data?.hiText || "",
      theme: data?.theme || "nature-1",
      backgroundUrl,
    });
  });

  socket.on("video-control", (data) => {
    io.emit("video-control", {
      action: data?.action || "play",
      time: typeof data?.time === "number" ? data.time : undefined,
    });
  });

  socket.on("change-page", (data) => {
    const page = Number(data?.page);
    if (!Number.isFinite(page) || page < 1) return;
    const max = Math.max(1, presentation.totalPages);
    presentation.currentPage = Math.min(Math.max(1, page), max);
    broadcastPage();
  });

  socket.on("upload-document", (data) => {
    if (!data || !data.filename) return;
    io.emit("upload-document", {
      id: data.id || presentation.id,
      filename: data.filename,
      type: data.type || presentation.type,
      totalPages: data.totalPages || presentation.totalPages,
      currentPage: data.currentPage || 1,
      documentUrl: data.documentUrl || "/api/document/file",
      slideImages: data.slideImages || presentation.slideImages,
    });
    broadcastPage();
  });
});

server.listen(PORT, "0.0.0.0", () => {
  const ip = getLanIp();
  console.log(`Cast server running: http://${ip}:${PORT}`);
});
