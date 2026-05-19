import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import * as Network from "expo-network";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { io } from "socket.io-client";
import { WebView } from "react-native-webview";

const STORAGE_KEY = "CAST_SERVER_URL";

// COMPREHENSIVE LIST OF ALL 66 BIBLE BOOKS WITH ABBREVIATIONS
const BIBLE_BOOKS = [
  { name: "Genesis", abbr: ["gen", "ge", "gn"] },
  { name: "Exodus", abbr: ["ex", "exo", "exod"] },
  { name: "Leviticus", abbr: ["lev", "le", "lv"] },
  { name: "Numbers", abbr: ["num", "nu", "nm"] },
  { name: "Deuteronomy", abbr: ["deut", "de", "dt"] },
  { name: "Joshua", abbr: ["josh", "jos", "jsh"] },
  { name: "Judges", abbr: ["judg", "jdg", "jdgs", "jg"] },
  { name: "Ruth", abbr: ["ruth", "ru", "rut"] },
  { name: "1 Samuel", abbr: ["1 sam", "1sa", "1sm"] },
  { name: "2 Samuel", abbr: ["2 sam", "2sa", "2sm"] },
  { name: "1 Kings", abbr: ["1 kgs", "1 ki", "1kgs"] },
  { name: "2 Kings", abbr: ["2 kgs", "2 ki", "2kgs"] },
  { name: "1 Chronicles", abbr: ["1 chr", "1 ch", "1chron"] },
  { name: "2 Chronicles", abbr: ["2 chr", "2 ch", "2chron"] },
  { name: "Ezra", abbr: ["ezra", "ezr"] },
  { name: "Nehemiah", abbr: ["neh", "ne"] },
  { name: "Esther", abbr: ["esth", "est"] },
  { name: "Job", abbr: ["job"] },
  { name: "Psalms", abbr: ["ps", "psa", "psalm"] },
  { name: "Proverbs", abbr: ["prov", "pr", "prv"] },
  { name: "Ecclesiastes", abbr: ["eccles", "ec", "qoheleth"] },
  { name: "Song of Solomon", abbr: ["song", "ss", "cant"] },
  { name: "Isaiah", abbr: ["isa", "is"] },
  { name: "Jeremiah", abbr: ["jer", "je", "jr"] },
  { name: "Lamentations", abbr: ["lam", "la"] },
  { name: "Ezekiel", abbr: ["ezek", "eze", "ez"] },
  { name: "Daniel", abbr: ["dan", "da", "dn"] },
  { name: "Hosea", abbr: ["hos", "ho"] },
  { name: "Joel", abbr: ["joel", "jl"] },
  { name: "Amos", abbr: ["amos", "am"] },
  { name: "Obadiah", abbr: ["obad", "ob"] },
  { name: "Jonah", abbr: ["jonah", "jon", "jh"] },
  { name: "Micah", abbr: ["mic", "mi"] },
  { name: "Nahum", abbr: ["nah", "na"] },
  { name: "Habakkuk", abbr: ["hab", "hk"] },
  { name: "Zephaniah", abbr: ["zeph", "zp"] },
  { name: "Haggai", abbr: ["hag", "hg"] },
  { name: "Zechariah", abbr: ["zech", "zc"] },
  { name: "Malachi", abbr: ["mal", "ml"] },
  { name: "Matthew", abbr: ["matt", "mt", "mat"] },
  { name: "Mark", abbr: ["mark", "mk", "mrk"] },
  { name: "Luke", abbr: ["luke", "lk", "luc"] },
  { name: "John", abbr: ["john", "jn", "joh"] },
  { name: "Acts", abbr: ["acts", "ac", "act"] },
  { name: "Romans", abbr: ["rom", "ro", "rm"] },
  { name: "1 Corinthians", abbr: ["1 cor", "1co", "1cor"] },
  { name: "2 Corinthians", abbr: ["2 cor", "2co", "2cor"] },
  { name: "Galatians", abbr: ["gal", "ga", "gl"] },
  { name: "Ephesians", abbr: ["eph", "ep", "ephes"] },
  { name: "Philippians", abbr: ["phil", "php", "phi"] },
  { name: "Colossians", abbr: ["col", "co"] },
  { name: "1 Thessalonians", abbr: ["1 thess", "1th", "1thess"] },
  { name: "2 Thessalonians", abbr: ["2 thess", "2th", "2thess"] },
  { name: "1 Timothy", abbr: ["1 tim", "1ti", "1tim"] },
  { name: "2 Timothy", abbr: ["2 tim", "2ti", "2tim"] },
  { name: "Titus", abbr: ["titus", "ti", "tit"] },
  { name: "Philemon", abbr: ["phlm", "phm", "pm"] },
  { name: "Hebrews", abbr: ["heb", "he"] },
  { name: "James", abbr: ["jas", "ja", "jm"] },
  { name: "1 Peter", abbr: ["1 pet", "1pe", "1pt"] },
  { name: "2 Peter", abbr: ["2 pet", "2pe", "2pt"] },
  { name: "1 John", abbr: ["1 john", "1jn", "1joh"] },
  { name: "2 John", abbr: ["2 john", "2jn", "2joh"] },
  { name: "3 John", abbr: ["3 john", "3jn", "3joh"] },
  { name: "Jude", abbr: ["jude", "jud", "jd"] },
  { name: "Revelation", abbr: ["rev", "re", "the revelation"] },
];

const POPULAR_VERSES = [
  "John 3:16",
  "Psalm 23:1",
  "Romans 8:28",
  "Philippians 4:13",
  "Matthew 6:9",
  "Genesis 1:1",
  "Proverbs 3:5",
  "Jeremiah 29:11",
  "Isaiah 41:10",
  "Matthew 28:19",
];

// Helpers
function normalizeBaseUrl(url) {
  let trimmed = (url || "").trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  if (!/^https?:\/\//i.test(trimmed)) trimmed = `http://${trimmed}`;
  if (/\.onrender\.com/i.test(trimmed)) {
    trimmed = trimmed.replace(/^http:\/\//i, "https://");
  }
  return trimmed;
}

function parseReference(input) {
  const s = (input || "").trim();
  if (!s) return null;
  const m = s.match(
    /^((?:\d\s*)?[a-zA-Z]+(?:\s+[a-zA-Z]+)?)\s+(\d+)\s*:\s*(\d+)(?:\s*-\s*(\d+))?$/i
  );
  if (!m) return null;
  return {
    book: m[1].trim(),
    chapter: parseInt(m[2], 10),
    verse: parseInt(m[3], 10),
    endVerse: m[4] ? parseInt(m[4], 10) : null,
  };
}

function formatReference({ book, chapter, verse }) {
  return `${book} ${chapter}:${verse}`;
}

function getSuggestions(query) {
  const q = (query || "").trim().toLowerCase();
  if (!q) return [];

  const out = [];
  const parsed = parseReference(query);

  if (parsed) {
    out.push(formatReference(parsed));
    if (!parsed.endVerse) {
      out.push(formatReference({ ...parsed, verse: parsed.verse + 1 }));
      if (parsed.verse > 1) {
        out.push(formatReference({ ...parsed, verse: parsed.verse - 1 }));
      }
    }
    return [...new Set(out)].slice(0, 8);
  }

  for (const b of BIBLE_BOOKS) {
    const name = b.name.toLowerCase();
    if (
      name.startsWith(q) ||
      b.abbr.some((a) => a.startsWith(q) || q.startsWith(a))
    ) {
      out.push(`${b.name} 1:1`);
      out.push(`${b.name} 3:16`);
    }
  }

  for (const p of POPULAR_VERSES) {
    if (p.toLowerCase().includes(q)) out.push(p);
  }

  return [...new Set(out)].slice(0, 8);
}

// Cleaned up HTML Generator
function buildPreviewHtml({ baseUrl, docType, page, totalPages, slideImages }) {
  const safeBase = JSON.stringify(baseUrl);
  const safeType = JSON.stringify(docType || "");
  const safeSlides = JSON.stringify(slideImages || []);
  const pageNum = Number(page) || 1;
  const total = Number(totalPages) || 1;

  return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    html, body { margin:0; padding:0; background:#111; height:100%; overflow:hidden; }
    #wrap { width:100%; height:100%; display:flex; align-items:center; justify-content:center; }
    canvas, img, video { max-width:100%; max-height:100%; object-fit:contain; }
    #label { position:fixed; bottom:8px; right:12px; color:#94a3b8; font:14px sans-serif; }
    #text { color:#e2e8f0; font:16px sans-serif; text-align:center; padding:16px; }
  </style>
</head>
<body>
  <div id="wrap">
    <canvas id="c" style="display:none"></canvas>
    <img id="img" style="display:none" />
    <video id="vid" style="display:none" controls playsinline></video>
    <div id="text" style="display:none"></div>
  </div>
  <div id="label"></div>
  <script type="module">
    import * as pdfjsLib from "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs";
    pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs";
    const baseUrl = ${safeBase};
    const docType = ${safeType};
    const slideImages = ${safeSlides};
    const page = ${pageNum};
    const total = ${total};
    const label = document.getElementById("label");
    const canvas = document.getElementById("c");
    const img = document.getElementById("img");
    const vid = document.getElementById("vid");
    const text = document.getElementById("text");
    label.textContent = page + " / " + total;
    async function showPdf() {
      const pdf = await pdfjsLib.getDocument(baseUrl + "/api/document/file?t=" + Date.now()).promise;
      const p = await pdf.getPage(page);
      const viewport = p.getViewport({ scale: 1 });
      const scale = Math.min((window.innerWidth - 16) / viewport.width, (window.innerHeight - 40) / viewport.height) * window.devicePixelRatio;
      const vp = p.getViewport({ scale });
      canvas.width = vp.width; canvas.height = vp.height;
      canvas.style.width = (vp.width / window.devicePixelRatio) + "px";
      canvas.style.height = (vp.height / window.devicePixelRatio) + "px";
      await p.render({ canvasContext: canvas.getContext("2d"), viewport: vp }).promise;
      canvas.style.display = "block";
    }
    function showPptx() {
      const slide = slideImages[page - 1];
      if (slide && slide.images && slide.images.length) { img.src = slide.images[0]; img.style.display = "block"; return; }
      text.style.display = "block";
      text.textContent = (slide && slide.placeholder) ? slide.placeholder : ("Slide " + page);
    }
    function showVideo() {
      vid.src = baseUrl + "/api/document/file?t=" + Date.now();
      vid.style.display = "block";
      vid.play().catch(() => {});
    }
    if (!docType) { text.style.display = "block"; text.textContent = "No document"; }
    else if (docType === "pdf") { showPdf().catch(() => { text.style.display = "block"; text.textContent = "PDF preview error"; }); }
    else if (docType === "video") { showVideo(); }
    else { showPptx(); }
  </script>
</body>
</html>`;
}

export default function App() {
  const socketRef = useRef(null);
  const [serverInput, setServerInput] = useState("");
  const [serverUrl, setServerUrl] = useState("");
  const [phoneIp, setPhoneIp] = useState("");
  const [connected, setConnected] = useState(false);

  // Presentation State
  const [uploading, setUploading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [docType, setDocType] = useState(null);
  const [filename, setFilename] = useState("");
  const [slideImages, setSlideImages] = useState([]);
  const [castUrl, setCastUrl] = useState("");

  // Bible State (Bilingual)
  const [screen, setScreen] = useState("present");
  const [verseQuery, setVerseQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [themes, setThemes] = useState([]);
  const [selectedTheme, setSelectedTheme] = useState("nature-1");
  const [loadingVerse, setLoadingVerse] = useState(false);
  const [currentRef, setCurrentRef] = useState(null);
  const [versePreview, setVersePreview] = useState({
    en: "",
    hi: "",
    reference: "",
  });
  const [chapterVerseCount, setChapterVerseCount] = useState(0);

  const previewHtml = useMemo(
    () =>
      buildPreviewHtml({
        baseUrl: serverUrl,
        docType,
        page: currentPage,
        totalPages,
        slideImages,
      }),
    [serverUrl, docType, currentPage, totalPages, slideImages]
  );

  useEffect(() => {
    if (!showSuggestions) {
      setSuggestions([]);
      return;
    }
    setSuggestions(getSuggestions(verseQuery));
  }, [verseQuery, showSuggestions]);

  const connectSocket = useCallback((base) => {
    if (socketRef.current) {
      socketRef.current.removeAllListeners();
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    const socket = io(base, {
      transports: ["websocket", "polling"],
      reconnection: true,
    });
    socketRef.current = socket;
    socket.on("connect", () => {
      setConnected(true);
      socket.emit("join-room", { role: "presenter" }, (ack) => {
        if (!ack) return;
        setCurrentPage(ack.currentPage || 1);
        setTotalPages(ack.totalPages || 0);
        setDocType(ack.type || null);
        setFilename(ack.filename || "");
        setSlideImages(ack.slideImages || []);
      });
    });
    socket.on("disconnect", () => setConnected(false));
    socket.on("connect_error", () => setConnected(false));
    socket.on("change-page", (payload) => {
      if (payload.page) setCurrentPage(payload.page);
      if (payload.totalPages) setTotalPages(payload.totalPages);
      if (payload.type) setDocType(payload.type);
      if (payload.filename) setFilename(payload.filename);
      if (payload.slideImages) setSlideImages(payload.slideImages);
    });
    socket.on("upload-document", (payload) => {
      setCurrentPage(payload.currentPage || 1);
      setTotalPages(payload.totalPages || 0);
      setDocType(payload.type || null);
      setFilename(payload.filename || "");
      setSlideImages(payload.slideImages || []);
    });
  }, []);

  const refreshServerInfo = useCallback(async (base) => {
    try {
      const res = await fetch(`${base}/api/info`);
      const json = await res.json();
      if (json.displayUrl) setCastUrl(json.displayUrl);
    } catch (_e) {
      setCastUrl(`${base}`);
    }
    try {
      const themesRes = await fetch(`${base}/api/themes`);
      if (themesRes.ok) {
        const themesJson = await themesRes.json();
        const list = themesJson.themes || [];
        setThemes(list);
        if (list.length > 0) setSelectedTheme(list[0].id);
      } else {
        setThemes([]);
      }
    } catch (_e) {
      setThemes([]);
    }
  }, []);

  const saveAndConnect = useCallback(async () => {
    const base = normalizeBaseUrl(serverInput);
    if (!base) {
      Alert.alert("Server URL required", "Example: http://192.168.1.5:3000");
      return;
    }
    await AsyncStorage.setItem(STORAGE_KEY, base);
    setServerUrl(base);
    connectSocket(base);
    await refreshServerInfo(base);
  }, [serverInput, connectSocket, refreshServerInfo]);

  useEffect(() => {
    (async () => {
      const ip = await Network.getIpAddressAsync();
      setPhoneIp(ip || "0.0.0.0");
      const saved = await AsyncStorage.getItem(STORAGE_KEY);
      if (saved) {
        setServerInput(saved);
        const base = normalizeBaseUrl(saved);
        setServerUrl(base);
        connectSocket(base);
        await refreshServerInfo(base);
      }
    })();
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, [connectSocket, refreshServerInfo]);

  const sendPageUpdate = useCallback(
    (pageNumber) => {
      if (!socketRef.current || !connected) return;
      const clamped = Math.min(
        Math.max(1, pageNumber),
        Math.max(1, totalPages)
      );
      setCurrentPage(clamped);
      socketRef.current.emit("change-page", { page: clamped });
    },
    [connected, totalPages]
  );

  const fetchChapterVerseCount = useCallback(
    async (book, chapter) => {
      try {
        const ref = encodeURIComponent(`${book} ${chapter}`);
        const res = await fetch(`${serverUrl}/api/bible/chapter/${ref}`);
        if (!res.ok) return 0;
        const json = await res.json();
        return json.verseCount || (json.verses && json.verses.length) || 0;
      } catch (_e) {
        return 0;
      }
    },
    [serverUrl]
  );

  const emitVerseToTv = useCallback(
    (preview) => {
      if (!socketRef.current || !connected || !preview) return;
      const theme =
        themes.find((t) => t.id === selectedTheme) || themes[0];
      const bgPath = theme?.image || "/backgrounds/nature-1.jpg";
      socketRef.current.emit("show-verse", {
        reference: preview.reference,
        enText: preview.en,
        hiText: preview.hi,
        theme: selectedTheme,
        backgroundUrl: `${serverUrl}${bgPath}`,
      });
    },
    [connected, themes, selectedTheme, serverUrl]
  );

  const loadVerse = useCallback(
    async (refText, options = { showOnTv: false }) => {
      if (!serverUrl) {
        Alert.alert(
          "Connect first",
          "Enter server URL and tap Connect."
        );
        return;
      }
      const q = (refText || verseQuery).trim();
      if (!q) return;
      setShowSuggestions(false);
      setLoadingVerse(true);
      try {
        const ref = encodeURIComponent(q);
        const res = await fetch(
          `${serverUrl}/api/bible/bilingual/${ref}`
        );
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Verse not found");

        const parsed = parseReference(json.reference || q);
        if (parsed) {
          setCurrentRef(parsed);
          const count = await fetchChapterVerseCount(
            parsed.book,
            parsed.chapter
          );
          setChapterVerseCount(count);
        }

        let hiText = (json.hiText || "").replace(/\s+/g, " ").trim();
        let enText = (json.enText || "").replace(/\s+/g, " ").trim();

        const preview = {
          reference: json.reference || q,
          en: enText,
          hi: hiText,
        };
        setVersePreview(preview);
        setVerseQuery(json.reference || q);

        if (options.showOnTv) emitVerseToTv(preview);
      } catch (err) {
        Alert.alert("Bible", err.message || String(err));
      } finally {
        setLoadingVerse(false);
      }
    },
    [serverUrl, verseQuery, fetchChapterVerseCount, emitVerseToTv]
  );

  const selectSuggestion = useCallback(
    (text) => {
      setShowSuggestions(false);
      setVerseQuery(text);
      loadVerse(text, { showOnTv: false });
    },
    [loadVerse]
  );

  const showVerseOnTv = useCallback(() => {
    setShowSuggestions(false);
    if (versePreview) {
      emitVerseToTv(versePreview);
    } else {
      loadVerse(verseQuery, { showOnTv: true });
    }
  }, [versePreview, verseQuery, loadVerse, emitVerseToTv]);

  const goVerseNext = useCallback(async () => {
    setShowSuggestions(false);
    if (!currentRef) {
      await loadVerse(verseQuery, { showOnTv: true });
      return;
    }
    let { book, chapter, verse } = currentRef;
    let max = chapterVerseCount;
    if (!max) {
      max = await fetchChapterVerseCount(book, chapter);
      setChapterVerseCount(max);
    }
    if (max && verse >= max) {
      chapter += 1;
      verse = 1;
      const count = await fetchChapterVerseCount(book, chapter);
      setChapterVerseCount(count);
    } else {
      verse += 1;
    }
    await loadVerse(formatReference({ book, chapter, verse }), {
      showOnTv: true,
    });
  }, [currentRef, chapterVerseCount, verseQuery, loadVerse, fetchChapterVerseCount]);

  const goVersePrev = useCallback(async () => {
    setShowSuggestions(false);
    if (!currentRef) return;
    let { book, chapter, verse } = currentRef;
    if (verse <= 1) {
      if (chapter <= 1) {
        Alert.alert("Bible", "Already at the start.");
        return;
      }
      chapter -= 1;
      const count = await fetchChapterVerseCount(book, chapter);
      setChapterVerseCount(count);
      verse = count || 1;
    } else {
      verse -= 1;
    }
    await loadVerse(formatReference({ book, chapter, verse }), {
      showOnTv: true,
    });
  }, [currentRef, loadVerse, fetchChapterVerseCount]);

  const pickDocument = useCallback(async () => {
    if (!serverUrl) {
      Alert.alert("Connect first", "Enter cast server URL.");
      return;
    }
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          "application/pdf",
          "application/vnd.openxmlformats-officedocument.presentationml.presentation",
          "video/mp4",
          "video/quicktime",
          "video/webm",
        ],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets || !result.assets[0]) return;
      const asset = result.assets[0];
      setUploading(true);
      let uploadUri = asset.uri;
      const name = asset.name || "document";
      const mimeType =
        asset.mimeType ||
        (name.toLowerCase().endsWith(".pptx")
          ? "application/vnd.openxmlformats-officedocument.presentationml.presentation"
          : name.toLowerCase().match(/\.(mp4|mov|webm|m4v)$/)
          ? "video/mp4"
          : "application/pdf");
      if (Platform.OS === "android" && uploadUri) {
        const dest = `${FileSystem.cacheDirectory}${name}`;
        await FileSystem.copyAsync({ from: uploadUri, to: dest });
        uploadUri = dest;
      }
      const uploadResult = await FileSystem.uploadAsync(
        `${serverUrl}/api/upload`,
        uploadUri,
        {
          httpMethod: "POST",
          uploadType: FileSystem.UploadType.MULTIPART,
          fieldName: "file",
          mimeType,
          headers: { Accept: "application/json" },
        }
      );
      if (uploadResult.status < 200 || uploadResult.status >= 300) {
        let message = "Upload failed";
        try {
          const errJson = JSON.parse(uploadResult.body);
          message = errJson.error || message;
        } catch (_e) {
          if (uploadResult.body) message = uploadResult.body;
        }
        throw new Error(message);
      }
      const json = JSON.parse(uploadResult.body);
      setFilename(json.filename || name);
      setDocType(json.type || null);
      setTotalPages(json.totalPages || 0);
      setCurrentPage(json.currentPage || 1);
      setSlideImages(json.slideImages || []);
      if (socketRef.current) {
        socketRef.current.emit("upload-document", json);
        socketRef.current.emit("change-page", {
          page: json.currentPage || 1,
        });
      }
    } catch (err) {
      Alert.alert("Upload error", err.message || String(err));
    } finally {
      setUploading(false);
    }
  }, [serverUrl]);

  const goPrev = () => {
    if (currentPage <= 1) return;
    sendPageUpdate(currentPage - 1);
  };
  const goNext = () => {
    if (currentPage >= totalPages) return;
    sendPageUpdate(currentPage + 1);
  };

  const topCastLine =
    castUrl || (serverUrl ? serverUrl : `http://${phoneIp}:3000`);

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        {/* Top Bar */}
        <View style={styles.topBar}>
          <Text style={styles.topTitle}>Open on your TV</Text>
          <Text style={styles.topUrl} selectable>
            {topCastLine}
          </Text>
          <Text style={styles.topHint}>
            Phone IP: {phoneIp} · Connection:{" "}
            {connected ? "Connected" : "Disconnected"}
          </Text>
        </View>

        {/* Server URL Card */}
        <View style={styles.card}>
          <Text style={styles.label}>Cast server URL</Text>
          <TextInput
            style={styles.input}
            placeholder="http://192.168.1.x:3000"
            placeholderTextColor="#64748b"
            autoCapitalize="none"
            value={serverInput}
            onChangeText={setServerInput}
          />
          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={saveAndConnect}
          >
            <Text style={styles.secondaryBtnText}>Connect</Text>
          </TouchableOpacity>
        </View>

        {/* Tab Row */}
        <View style={styles.tabRow}>
          <TouchableOpacity
            style={[styles.tabBtn, screen === "present" && styles.tabBtnActive]}
            onPress={() => setScreen("present")}
          >
            <Text style={styles.tabBtnText}>Present</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabBtn, screen === "bible" && styles.tabBtnActive]}
            onPress={() => setScreen("bible")}
          >
            <Text style={styles.tabBtnText}>Bible</Text>
          </TouchableOpacity>
        </View>

        {/* ========== PRESENT SCREEN ========== */}
        {screen === "present" && (
          <>
            <TouchableOpacity
              style={[styles.primaryBtn, uploading && styles.disabled]}
              onPress={pickDocument}
              disabled={uploading}
            >
              {uploading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryBtnText}>
                  Pick PDF, PPTX, or Video
                </Text>
              )}
            </TouchableOpacity>

            {filename ? (
              <Text style={styles.fileName}>
                {filename} · {docType?.toUpperCase()} · {currentPage}/
                {totalPages || "?"}
              </Text>
            ) : null}

            <View style={styles.previewBox}>
              {docType && totalPages > 0 ? (
                <WebView
                  key={`${docType}-${currentPage}-${filename}`}
                  originWhitelist={["*"]}
                  source={{ html: previewHtml }}
                  style={styles.webview}
                  javaScriptEnabled
                  domStorageEnabled
                  allowsInlineMediaPlayback
                />
              ) : (
                <Text style={styles.previewPlaceholder}>
                  Slide preview appears here
                </Text>
              )}
            </View>

            {docType !== "video" && (
              <View style={styles.controls}>
                <TouchableOpacity
                  style={[
                    styles.navBtn,
                    currentPage <= 1 && styles.disabled,
                  ]}
                  onPress={goPrev}
                  disabled={currentPage <= 1 || totalPages === 0}
                >
                  <Text style={styles.navBtnText}>PREVIOUS</Text>
                </TouchableOpacity>
                <Text style={styles.pageIndicator}>
                  {totalPages > 0
                    ? `${currentPage} / ${totalPages}`
                    : "—"}
                </Text>
                <TouchableOpacity
                  style={[
                    styles.navBtn,
                    currentPage >= totalPages && styles.disabled,
                  ]}
                  onPress={goNext}
                  disabled={currentPage >= totalPages || totalPages === 0}
                >
                  <Text style={styles.navBtnText}>NEXT</Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        )}

        {/* ========== BIBLE SCREEN ========== */}
        {screen === "bible" && (
          <View style={styles.card}>
            <Text style={styles.label}>Search Verse</Text>

            <View style={styles.searchRow}>
              <TextInput
                style={styles.searchInput}
                placeholder="e.g. Jer 29:11"
                placeholderTextColor="#64748b"
                value={verseQuery}
                onChangeText={(text) => {
                  setVerseQuery(text);
                  setShowSuggestions(true);
                }}
                onFocus={() => setShowSuggestions(true)}
                autoCapitalize="words"
                onSubmitEditing={() => {
                  setShowSuggestions(false);
                  loadVerse(verseQuery, { showOnTv: false });
                }}
              />
              {verseQuery.length > 0 && (
                <TouchableOpacity
                  style={styles.clearBtn}
                  onPress={() => {
                    setVerseQuery("");
                    setShowSuggestions(false);
                  }}
                >
                  <Text style={styles.clearBtnText}>✕</Text>
                </TouchableOpacity>
              )}
            </View>

            {showSuggestions &&
              suggestions.length > 0 &&
              verseQuery.trim().length > 0 && (
                <View style={styles.suggestBox}>
                  <ScrollView
                    keyboardShouldPersistTaps="handled"
                    nestedScrollEnabled={true}
                  >
                    {suggestions.map((s) => (
                      <TouchableOpacity
                        key={s}
                        style={styles.suggestItem}
                        onPress={() => selectSuggestion(s)}
                      >
                        <Text style={styles.suggestText}>{s}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              )}

            <TouchableOpacity
              style={[styles.secondaryBtn, { marginBottom: 12 }]}
              onPress={() => {
                setShowSuggestions(false);
                loadVerse(verseQuery, { showOnTv: false });
              }}
              disabled={loadingVerse}
            >
              <Text style={styles.secondaryBtnText}>Load preview</Text>
            </TouchableOpacity>

            {versePreview.reference ? (
              <View style={styles.versePreviewBox}>
                <Text style={styles.versePreviewRef}>
                  {versePreview.reference}
                </Text>

                {/* HINDI SECTION FIRST */}
                <View style={styles.hindiContainer}>
                  <Text
                    style={[styles.versePreviewText, styles.hindiText]}
                  >
                    {versePreview.hi}
                  </Text>
                  <View style={styles.dividerLine} />
                </View>

                {/* ENGLISH SECTION SECOND */}
                <Text style={styles.versePreviewText}>
                  {versePreview.en}
                </Text>
              </View>
            ) : null}

            <Text style={[styles.label, { marginTop: 12 }]}>
              Background Theme
            </Text>

            {themes.length === 0 ? (
              <Text style={styles.themeHint}>
                Connect to load themes.
              </Text>
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.themeScroll}
              >
                {themes.map((t) => (
                  <TouchableOpacity
                    key={t.id}
                    onPress={() => setSelectedTheme(t.id)}
                    style={[
                      styles.themeChip,
                      selectedTheme === t.id && styles.themeChipActive,
                    ]}
                  >
                    <Text style={styles.themeChipText}>
                      {t.label || t.id}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            <TouchableOpacity
              style={[
                styles.primaryBtn,
                (loadingVerse || !connected) && styles.disabled,
              ]}
              onPress={showVerseOnTv}
              disabled={loadingVerse || !connected}
            >
              {loadingVerse ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryBtnText}>SHOW ON TV</Text>
              )}
            </TouchableOpacity>

            <View style={styles.controls}>
              <TouchableOpacity
                style={[
                  styles.navBtn,
                  (!currentRef || loadingVerse) && styles.disabled,
                ]}
                onPress={goVersePrev}
                disabled={!currentRef || loadingVerse}
              >
                <Text style={styles.navBtnText}>PREVIOUS</Text>
              </TouchableOpacity>
              <Text style={styles.pageIndicator}>
                {currentRef ? `v${currentRef.verse}` : "—"}
                {chapterVerseCount > 0
                  ? ` / ${chapterVerseCount}`
                  : ""}
              </Text>
              <TouchableOpacity
                style={[styles.navBtn, loadingVerse && styles.disabled]}
                onPress={goVerseNext}
                disabled={loadingVerse}
              >
                <Text style={styles.navBtnText}>NEXT</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#0f172a" },
  container: { padding: 16, paddingBottom: 40 },
  topBar: {
    backgroundColor: "#1e293b",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  topTitle: { color: "#94a3b8", fontSize: 13, marginBottom: 6 },
  topUrl: { color: "#38bdf8", fontSize: 16, fontWeight: "700" },
  topHint: { color: "#64748b", fontSize: 11, marginTop: 8 },
  card: {
    backgroundColor: "#1e293b",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  label: {
    color: "#cbd5e1",
    marginBottom: 8,
    fontSize: 14,
    fontWeight: "600",
  },
  input: {
    backgroundColor: "#0f172a",
    color: "#f8fafc",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#334155",
    marginBottom: 12,
    fontSize: 15,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    backgroundColor: "#0f172a",
    color: "#f8fafc",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "#38bdf8",
    fontSize: 15,
    marginRight: 8,
  },
  clearBtn: { padding: 10, justifyContent: "center" },
  clearBtnText: { color: "#94a3b8", fontSize: 18, fontWeight: "bold" },
  primaryBtn: {
    backgroundColor: "#2563eb",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 12,
  },
  primaryBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  secondaryBtn: {
    backgroundColor: "#334155",
    borderRadius: 8,
    paddingVertical: 11,
    alignItems: "center",
  },
  secondaryBtnText: {
    color: "#f8fafc",
    fontWeight: "600",
    fontSize: 14,
  },
  disabled: { opacity: 0.45 },
  fileName: { color: "#e2e8f0", marginBottom: 12, fontSize: 13 },
  previewBox: {
    height: 220,
    backgroundColor: "#020617",
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#334155",
  },
  webview: { flex: 1, backgroundColor: "#000" },
  previewPlaceholder: {
    color: "#64748b",
    textAlign: "center",
    marginTop: 90,
    fontSize: 14,
  },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginTop: 8,
  },
  navBtn: {
    flex: 1,
    backgroundColor: "#16a34a",
    borderRadius: 12,
    paddingVertical: 18,
    alignItems: "center",
  },
  navBtnText: { color: "#fff", fontSize: 14, fontWeight: "800" },
  pageIndicator: {
    color: "#f8fafc",
    fontSize: 15,
    fontWeight: "700",
    minWidth: 72,
    textAlign: "center",
  },
  tabRow: { flexDirection: "row", marginBottom: 16, gap: 8 },
  tabBtn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 8,
    backgroundColor: "#334155",
    alignItems: "center",
  },
  tabBtnActive: { backgroundColor: "#2563eb" },
  tabBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  themeScroll: { marginBottom: 12, maxHeight: 48 },
  themeChip: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 20,
    backgroundColor: "#334155",
    marginRight: 8,
    alignSelf: "flex-start",
  },
  themeChipActive: { backgroundColor: "#2563eb" },
  themeChipText: { color: "#fff", fontWeight: "600", fontSize: 13 },
  themeHint: { color: "#94a3b8", fontSize: 12, marginBottom: 12 },
  suggestBox: {
    backgroundColor: "#1e293b",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#38bdf8",
    marginBottom: 12,
    maxHeight: 200,
    zIndex: 10,
    elevation: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  suggestItem: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#334155",
    justifyContent: "center",
  },
  suggestText: { color: "#e2e8f0", fontSize: 15 },
  versePreviewBox: {
    backgroundColor: "#0f172a",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#334155",
    alignItems: "flex-start",
    justifyContent: "flex-start",
    minHeight: 150,
    flexShrink: 1,
  },
  versePreviewRef: {
    color: "#facc15",
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 12,
    textAlign: "center",
    width: "100%",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  versePreviewText: {
    color: "#f1f5f9",
    fontSize: 16,
    lineHeight: 24,
    fontFamily: Platform.OS === "ios" ? "Georgia" : "serif",
    textAlign: "justify",
    width: "100%",
    flexShrink: 1,
  },
  hindiContainer: {
    marginTop: 0,
    width: "100%",
    alignItems: "center",
    marginBottom: 12,
  },
  dividerLine: {
    height: 1,
    width: "50%",
    backgroundColor: "#334155",
    marginTop: 12,
  },
  hindiText: {
    fontFamily:
      Platform.OS === "ios" ? "Devanagari Sangam MN" : "serif",
    color: "#cbd5e1",
    fontStyle: "italic",
    fontSize: 15,
  },
});
