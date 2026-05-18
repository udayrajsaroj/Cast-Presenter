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
  const m = s.match(/^((?:\d\s*)?[a-zA-Z]+(?:\s+[a-zA-Z]+)?)\s+(\d+)\s*:\s*(\d+)(?:\s*-\s*(\d+))?$/i);
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

function parsePartialQuery(input) {
  const s = (input || "").trim();
  if (!s) return { bookPart: "", chapter: null, verse: null };
  const m = s.match(/^((?:\d\s*)?[a-zA-Z]+(?:\s+[a-zA-Z]+)?)(?:\s+(\d+))?(?:\s*:\s*(\d+)?)?$/i);
  if (!m) return { bookPart: s, chapter: null, verse: null };
  return {
    bookPart: (m[1] || "").trim(),
    chapter: m[2] ? parseInt(m[2], 10) : null,
    verse: m[3] ? parseInt(m[3], 10) : null,
  };
}

function bookMatchesQuery(book, q) {
  if (!q) return true;
  const lower = q.toLowerCase();
  const name = book.name.toLowerCase();
  const abbr = (book.abbreviation || "").toLowerCase();
  return (
    name.includes(lower) ||
    name.startsWith(lower) ||
    abbr.startsWith(lower) ||
    lower.startsWith(name.slice(0, Math.max(3, lower.length)))
  );
}

function resolveBook(bibleData, bookPart) {
  if (!bibleData?.books?.length || !bookPart) return null;
  const lower = bookPart.toLowerCase().trim();
  let found = bibleData.books.find((b) => b.name.toLowerCase() === lower);
  if (found) return found;
  found = bibleData.books.find((b) => (b.abbreviation || "").toLowerCase() === lower);
  if (found) return found;
  const matches = bibleData.books.filter((b) => bookMatchesQuery(b, bookPart));
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) {
    const exactStart = matches.find((b) => b.name.toLowerCase().startsWith(lower));
    return exactStart || matches[0];
  }
  return null;
}

function getGroupedSuggestions(query, bibleData) {
  const books = [];
  const chapters = [];
  const verses = [];

  if (!bibleData?.books?.length) {
    return { books, chapters, verses };
  }

  const { bookPart, chapter, verse } = parsePartialQuery(query);
  const q = bookPart.toLowerCase();

  const matchedBooks = bibleData.books
    .filter((b) => bookMatchesQuery(b, bookPart))
    .slice(0, 20);

  for (const b of matchedBooks) {
    books.push({ type: "book", label: b.name, value: b.name });
  }

  const activeBook = resolveBook(bibleData, bookPart);

  if (activeBook && activeBook.chapters) {
    let chapterList = activeBook.chapters;
    if (chapter !== null && !Number.isNaN(chapter)) {
      chapterList = chapterList.filter((c) => {
        const n = String(c.chapter);
        return n.startsWith(String(chapter)) || c.chapter === chapter;
      });
      if (chapterList.length === 0) {
        const ch = activeBook.chapters.find((c) => c.chapter === chapter);
        if (ch) chapterList = [ch];
      }
    }
    for (const c of chapterList.slice(0, 40)) {
      chapters.push({
        type: "chapter",
        label: `${activeBook.name} ${c.chapter}`,
        value: `${activeBook.name} ${c.chapter}`,
        book: activeBook.name,
        chapter: c.chapter,
        verseCount: c.verses,
      });
    }

    if (chapter !== null && !Number.isNaN(chapter)) {
      const chData = activeBook.chapters.find((c) => c.chapter === chapter);
      const verseCount = chData ? chData.verses : 0;
      if (verseCount > 0) {
        let start = 1;
        let end = verseCount;
        if (verse !== null && !Number.isNaN(verse)) {
          start = Math.max(1, verse);
          end = Math.min(verseCount, verse + 15);
        } else {
          end = Math.min(verseCount, 30);
        }
        for (let v = start; v <= end; v += 1) {
          verses.push({
            type: "verse",
            label: `${activeBook.name} ${chapter}:${v}`,
            value: `${activeBook.name} ${chapter}:${v}`,
          });
        }
        if (verseCount > end) {
          verses.push({
            type: "verse",
            label: `${activeBook.name} ${chapter}:${end + 1} … ${verseCount}`,
            value: `${activeBook.name} ${chapter}:${end + 1}`,
          });
        }
      }
    }
  }

  return { books, chapters, verses };
}

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
    #text { color:#e2e8f0; font:18px sans-serif; text-align:center; padding:16px; }
  </style>
</head>
<body>
  <div id="wrap">
    <canvas id="c" style="display:none"></canvas>
    <img id="img" style="display:none" />
    <video id="vid" style="display:none" controls playsinline></video>
    <motion-disabled>
    <motion-disabled>
    <motion-disabled>
    <div id="text" style="display:none"></div>
  </div>
  <div id="label"></div>
  <script type="module">
    import * as pdfjsLib from "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs";
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs";

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
      const scale = Math.min(
        (window.innerWidth - 16) / viewport.width,
        (window.innerHeight - 40) / viewport.height
      ) * window.devicePixelRatio;
      const vp = p.getViewport({ scale });
      canvas.width = vp.width;
      canvas.height = vp.height;
      canvas.style.width = (vp.width / window.devicePixelRatio) + "px";
      canvas.style.height = (vp.height / window.devicePixelRatio) + "px";
      await p.render({ canvasContext: canvas.getContext("2d"), viewport: vp }).promise;
      canvas.style.display = "block";
    }

    function showPptx() {
      const slide = slideImages[page - 1];
      if (slide && slide.images && slide.images.length) {
        img.src = slide.images[0];
        img.style.display = "block";
        return;
      }
      text.style.display = "block";
      text.textContent = (slide && slide.placeholder) ? slide.placeholder : ("Slide " + page);
    }

    function showVideo() {
      vid.src = baseUrl + "/api/document/file?t=" + Date.now();
      vid.style.display = "block";
      vid.play().catch(() => {});
    }

    if (!docType) {
      text.style.display = "block";
      text.textContent = "No document";
    } else if (docType === "pdf") {
      showPdf().catch(() => {
        text.style.display = "block";
        text.textContent = "PDF preview error";
      });
    } else if (docType === "video") {
      showVideo();
    } else {
      showPptx();
    }
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
  const [uploading, setUploading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [docType, setDocType] = useState(null);
  const [filename, setFilename] = useState("");
  const [slideImages, setSlideImages] = useState([]);
  const [castUrl, setCastUrl] = useState("");

  const [screen, setScreen] = useState("present");
  const [verseQuery, setVerseQuery] = useState("");
  const [bibleData, setBibleData] = useState(null);
  const [groupedSuggestions, setGroupedSuggestions] = useState({
    books: [],
    chapters: [],
    verses: [],
  });
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [themes, setThemes] = useState([]);
  const [selectedTheme, setSelectedTheme] = useState("nature-1");
  const [loadingVerse, setLoadingVerse] = useState(false);
  const [currentRef, setCurrentRef] = useState(null);
  const [versePreview, setVersePreview] = useState(null);
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
      setGroupedSuggestions({ books: [], chapters: [], verses: [] });
      return;
    }
    setGroupedSuggestions(getGroupedSuggestions(verseQuery, bibleData));
  }, [verseQuery, showSuggestions, bibleData]);

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

  const loadBibleBooks = useCallback(async (base) => {
    try {
      const res = await fetch(`${base}/api/bible/books`);
      if (!res.ok) return;
      const data = await res.json();
      const books = Array.isArray(data) ? data : data.books || [];
      setBibleData({ books });
    } catch (_e) {
      setBibleData(null);
    }
  }, []);

  const refreshServerInfo = useCallback(
    async (base) => {
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
      await loadBibleBooks(base);
    },
    [loadBibleBooks]
  );

  const saveAndConnect = useCallback(async () => {
    const base = normalizeBaseUrl(serverInput);
    if (!base) {
      Alert.alert("Server URL required", "Example: https://cast-presenter.onrender.com");
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
      const clamped = Math.min(Math.max(1, pageNumber), Math.max(1, totalPages));
      setCurrentPage(clamped);
      socketRef.current.emit("change-page", { page: clamped });
    },
    [connected, totalPages]
  );

  const fetchChapterVerseCount = useCallback(
    async (book, chapter) => {
      const resolved = resolveBook(bibleData, book);
      if (resolved?.chapters) {
        const ch = resolved.chapters.find((c) => c.chapter === chapter);
        if (ch?.verses) return ch.verses;
      }
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
    [serverUrl, bibleData]
  );

  const emitVerseToTv = useCallback(
    (preview) => {
      if (!socketRef.current || !connected || !preview) return;
      const theme = themes.find((t) => t.id === selectedTheme) || themes[0];
      const bgPath = theme?.image || "/backgrounds/nature-1.jpg";
      socketRef.current.emit("show-verse", {
        reference: preview.reference,
        text: preview.text,
        theme: selectedTheme,
        backgroundUrl: `${serverUrl}${bgPath}`,
      });
    },
    [connected, themes, selectedTheme, serverUrl]
  );

  const loadVerse = useCallback(
    async (refText, options = { showOnTv: false }) => {
      if (!serverUrl) {
        Alert.alert("Connect first", "Enter server URL and tap Connect.");
        return;
      }
      const q = (refText || verseQuery).trim();
      if (!q) return;

      setShowSuggestions(false);
      setLoadingVerse(true);
      try {
        const ref = encodeURIComponent(q);
        const res = await fetch(`${serverUrl}/api/bible/${ref}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Verse not found");

        const parsed = parseReference(json.reference || q);
        if (parsed) {
          setCurrentRef(parsed);
          const count = await fetchChapterVerseCount(parsed.book, parsed.chapter);
          setChapterVerseCount(count);
        }

        const preview = {
          reference: json.reference || q,
          text: (json.text || "").trim(),
        };
        setVersePreview(preview);
        setVerseQuery(json.reference || q);

        if (options.showOnTv) {
          emitVerseToTv(preview);
        }
      } catch (err) {
        Alert.alert("Bible", err.message || String(err));
      } finally {
        setLoadingVerse(false);
      }
    },
    [serverUrl, verseQuery, fetchChapterVerseCount, emitVerseToTv]
  );

  const selectPickerItem = useCallback(
    (item) => {
      if (item.type === "book") {
        setVerseQuery(`${item.label} `);
        setShowSuggestions(true);
        return;
      }
      if (item.type === "chapter") {
        setVerseQuery(`${item.label}:`);
        setShowSuggestions(true);
        return;
      }
      setShowSuggestions(false);
      setVerseQuery(item.label);
      loadVerse(item.label, { showOnTv: false });
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
    await loadVerse(formatReference({ book, chapter, verse }), { showOnTv: true });
  }, [currentRef, chapterVerseCount, verseQuery, loadVerse, fetchChapterVerseCount]);

  const goVersePrev = useCallback(async () => {
    setShowSuggestions(false);
    if (!currentRef) return;
    let { book, chapter, verse } = currentRef;
    if (verse <= 1) {
      if (chapter <= 1) {
        Alert.alert("Bible", "Already at the of this book.");
        return;
      }
      chapter -= 1;
      const count = await fetchChapterVerseCount(book, chapter);
      setChapterVerseCount(count);
      verse = count || 1;
    } else {
      verse -= 1;
    }
    await loadVerse(formatReference({ book, chapter, verse }), { showOnTv: true });
  }, [currentRef, loadVerse, fetchChapterVerseCount]);

  const pickDocument = useCallback(async () => {
    if (!serverUrl) {
      Alert.alert("Connect first", "Enter your cast server URL and tap Connect.");
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
          uploadType: FileSystem.FileSystemUploadType.MULTIPART,
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
        socketRef.current.emit("change-page", { page: json.currentPage || 1 });
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

  const hasSuggestions =
    groupedSuggestions.books.length > 0 ||
    groupedSuggestions.chapters.length > 0 ||
    groupedSuggestions.verses.length > 0;

  const topCastLine = castUrl || (serverUrl ? serverUrl : `http://${phoneIp}:3000`);

  const renderSuggestSection = (title, items) => {
    if (!items.length) return null;
    return (
      <View style={styles.suggestSection}>
        <Text style={styles.suggestSectionTitle}>{title}</Text>
        {items.map((item) => (
          <TouchableOpacity
            key={`${item.type}-${item.label}`}
            style={styles.suggestItem}
            onPress={() => selectPickerItem(item)}
          >
            <Text style={styles.suggestText}>{item.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.topBar}>
          <Text style={styles.topTitle}>Open on your TV</Text>
          <Text style={styles.topUrl} selectable>
            {topCastLine}
          </Text>
          <Text style={styles.topHint}>
            Phone IP: {phoneIp} · Connection: {connected ? "Connected" : "Disconnected"}
            {bibleData?.books?.length ? ` · ${bibleData.books.length} books` : ""}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Cast server URL</Text>
          <TextInput
            style={styles.input}
            placeholder="https://cast-presenter.onrender.com"
            placeholderTextColor="#64748b"
            autoCapitalize="none"
            value={serverInput}
            onChangeText={setServerInput}
          />
          <TouchableOpacity style={styles.secondaryBtn} onPress={saveAndConnect}>
            <Text style={styles.secondaryBtnText}>Connect</Text>
          </TouchableOpacity>
        </View>

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
                <Text style={styles.primaryBtnText}>Pick PDF, PPTX, or Video</Text>
              )}
            </TouchableOpacity>

            {filename ? (
              <Text style={styles.fileName}>
                {filename} · {docType?.toUpperCase()} · {currentPage}/{totalPages || "?"}
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
                <Text style={styles.previewPlaceholder}>Slide preview appears here</Text>
              )}
            </View>

            {docType !== "video" && (
              <View style={styles.controls}>
                <TouchableOpacity
                  style={[styles.navBtn, currentPage <= 1 && styles.disabled]}
                  onPress={goPrev}
                  disabled={currentPage <= 1 || totalPages === 0}
                >
                  <Text style={styles.navBtnText}>PREVIOUS</Text>
                </TouchableOpacity>
                <Text style={styles.pageIndicator}>
                  {totalPages > 0 ? `${currentPage} / ${totalPages}` : "—"}
                </Text>
                <TouchableOpacity
                  style={[styles.navBtn, currentPage >= totalPages && styles.disabled]}
                  onPress={goNext}
                  disabled={currentPage >= totalPages || totalPages === 0}
                >
                  <Text style={styles.navBtnText}>NEXT</Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        )}

        {screen === "bible" && (
          <View style={styles.card}>
            <Text style={styles.label}>Search: Book → Chapter → Verse</Text>
            <TextInput
              style={styles.input}
              placeholder="Type book, e.g. John or John 3:16"
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

            {showSuggestions && verseQuery.trim().length > 0 && (
              <ScrollView style={styles.suggestBox} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                {!bibleData?.books?.length ? (
                  <Text style={styles.suggestHint}>Tap Connect to load all Bible books.</Text>
                ) : !hasSuggestions ? (
                  <Text style={styles.suggestHint}>No matches. Try another book name.</Text>
                ) : (
                  <>
                    {renderSuggestSection("Books", groupedSuggestions.books)}
                    {renderSuggestSection("Chapters", groupedSuggestions.chapters)}
                    {renderSuggestSection("Verses", groupedSuggestions.verses)}
                  </>
                )}
              </ScrollView>
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

            {versePreview && (
              <View style={styles.versePreviewBox}>
                <Text style={styles.versePreviewRef}>{versePreview.reference}</Text>
                <Text style={styles.versePreviewText}>{versePreview.text}</Text>
              </View>
            )}

            <Text style={[styles.label, { marginTop: 8 }]}>Background</Text>
            {themes.length === 0 ? (
              <Text style={styles.themeHint}>Connect to load themes from server.</Text>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.themeScroll}>
                {themes.map((t) => (
                  <TouchableOpacity
                    key={t.id}
                    onPress={() => setSelectedTheme(t.id)}
                    style={[styles.themeChip, selectedTheme === t.id && styles.themeChipActive]}
                  >
                    <Text style={styles.themeChipText}>{t.label || t.id}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            <TouchableOpacity
              style={[styles.primaryBtn, (loadingVerse || !connected) && styles.disabled]}
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
                style={[styles.navBtn, (!currentRef || loadingVerse) && styles.disabled]}
                onPress={goVersePrev}
                disabled={!currentRef || loadingVerse}
              >
                <Text style={styles.navBtnText}>PREVIOUS</Text>
              </TouchableOpacity>
              <Text style={styles.pageIndicator}>
                {currentRef ? `v${currentRef.verse}` : "—"}
                {chapterVerseCount > 0 ? ` / ${chapterVerseCount}` : ""}
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
  topTitle: { color: "#94a3b8", fontSize: 14, marginBottom: 6 },
  topUrl: { color: "#38bdf8", fontSize: 18, fontWeight: "700" },
  topHint: { color: "#64748b", fontSize: 12, marginTop: 8 },
  card: {
    backgroundColor: "#1e293b",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  label: { color: "#cbd5e1", marginBottom: 8, fontSize: 14 },
  input: {
    backgroundColor: "#0f172a",
    color: "#f8fafc",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#334155",
    marginBottom: 12,
  },
  primaryBtn: {
    backgroundColor: "#2563eb",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    marginBottom: 12,
  },
  primaryBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  secondaryBtn: {
    backgroundColor: "#334155",
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
  },
  secondaryBtnText: { color: "#f8fafc", fontWeight: "600" },
  disabled: { opacity: 0.45 },
  fileName: { color: "#e2e8f0", marginBottom: 12, fontSize: 14 },
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
    paddingVertical: 20,
    alignItems: "center",
  },
  navBtnText: { color: "#fff", fontSize: 16, fontWeight: "800" },
  pageIndicator: {
    color: "#f8fafc",
    fontSize: 16,
    fontWeight: "700",
    minWidth: 72,
    textAlign: "center",
  },
  tabRow: { flexDirection: "row", marginBottom: 16, gap: 8 },
  tabBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: "#334155",
    alignItems: "center",
  },
  tabBtnActive: { backgroundColor: "#2563eb" },
  tabBtnText: { color: "#fff", fontWeight: "700" },
  themeScroll: { marginBottom: 12, maxHeight: 48 },
  themeChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: "#334155",
    marginRight: 8,
    alignSelf: "flex-start",
  },
  themeChipActive: { backgroundColor: "#2563eb" },
  themeChipText: { color: "#fff", fontWeight: "600" },
  themeHint: { color: "#94a3b8", fontSize: 13, marginBottom: 12 },
  suggestBox: {
    backgroundColor: "#0f172a",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#334155",
    marginBottom: 12,
    maxHeight: 280,
  },
  suggestSection: { paddingBottom: 4 },
  suggestSectionTitle: {
    color: "#38bdf8",
    fontSize: 12,
    fontWeight: "800",
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 4,
    letterSpacing: 1,
  },
  suggestHint: {
    color: "#94a3b8",
    fontSize: 14,
    padding: 12,
  },
  suggestItem: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#1e293b",
  },
  suggestText: { color: "#e2e8f0", fontSize: 15 },
  versePreviewBox: {
    backgroundColor: "#0f172a",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#334155",
  },
  versePreviewRef: {
    color: "#38bdf8",
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 8,
  },
  versePreviewText: {
    color: "#f1f5f9",
    fontSize: 16,
    lineHeight: 24,
    fontFamily: Platform.OS === "ios" ? "Georgia" : "serif",
  },
});