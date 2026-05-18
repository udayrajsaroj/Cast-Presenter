import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import * as Network from "expo-network";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { io } from "socket.io-client";
import { WebView } from "react-native-webview";

const STORAGE_KEY = "CAST_SERVER_URL";

function normalizeBaseUrl(url) {
  const trimmed = (url || "").trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `http://${trimmed}`;
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
    canvas, img { max-width:100%; max-height:100%; object-fit:contain; }
    #label { position:fixed; bottom:8px; right:12px; color:#94a3b8; font:14px sans-serif; }
    #text { color:#e2e8f0; font:18px sans-serif; text-align:center; padding:16px; }
  </style>
</head>
<body>
  <div id="wrap">
    <canvas id="c" style="display:none"></canvas>
    <img id="img" style="display:none" />
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

    if (!docType) {
      text.style.display = "block";
      text.textContent = "No document";
    } else if (docType === "pdf") {
      showPdf().catch(() => {
        text.style.display = "block";
        text.textContent = "PDF preview error";
      });
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
  }, []);

  const saveAndConnect = useCallback(async () => {
    const base = normalizeBaseUrl(serverInput);
    if (!base) {
      Alert.alert("Server URL required", "Example: http://192.168.1.50:3000");
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
        ],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets || !result.assets[0]) return;

      const asset = result.assets[0];
      setUploading(true);

      const formData = new FormData();
      formData.append("file", {
        uri: asset.uri,
        name: asset.name || "document",
        type:
          asset.mimeType ||
          (asset.name && asset.name.toLowerCase().endsWith(".pptx")
            ? "application/vnd.openxmlformats-officedocument.presentationml.presentation"
            : "application/pdf"),
      });

      const response = await fetch(`${serverUrl}/api/upload`, {
        method: "POST",
        body: formData,
        headers: { Accept: "application/json" },
      });
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error || "Upload failed");
      }

      setFilename(json.filename || asset.name || "");
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

  const topCastLine = castUrl || (serverUrl ? serverUrl : `http://${phoneIp}:3000`);

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.topBar}>
          <Text style={styles.topTitle}>Open on your TV</Text>
          <Text style={styles.topUrl} selectable>
            {topCastLine}
          </Text>
          <Text style={styles.topHint}>
            Phone IP: {phoneIp} · Connection: {connected ? "Connected" : "Disconnected"}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Cast server URL (same Wi‑Fi)</Text>
          <TextInput
            style={styles.input}
            placeholder="http://192.168.1.50:3000"
            placeholderTextColor="#64748b"
            autoCapitalize="none"
            value={serverInput}
            onChangeText={setServerInput}
          />
          <TouchableOpacity style={styles.secondaryBtn} onPress={saveAndConnect}>
            <Text style={styles.secondaryBtnText}>Connect</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[styles.primaryBtn, uploading && styles.disabled]}
          onPress={pickDocument}
          disabled={uploading}
        >
          {uploading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryBtnText}>Pick PDF or PPTX</Text>
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
    fontSize: 18,
    fontWeight: "700",
    minWidth: 72,
    textAlign: "center",
  },
});