# 📺 Bible Cast Pro

A **React Native (Expo)** mobile app that lets you cast Bible verses and presentations (PDF, PPTX, Video) to any TV or screen on the same network — in real time.

Built for churches, Bible study groups, and worship teams.

---

## ✨ Features

- 📖 **Bible Verse Casting** — Browse all 66 books with dropdown selectors for Book → Chapter → Verse
- 🇬🇧🇮🇳 **English + Hindi** — Displays both English and Hindi translations simultaneously on the preview and TV screen
- 📄 **Document Casting** — Upload and cast PDF slideshows, PowerPoint (PPTX), or MP4 videos to any browser/TV
- 📡 **Real-time Sync** — Powered by Socket.IO; presenter controls the screen from their phone instantly
- 🎨 **Background Themes** — Choose from Nature, Sky, Forest, Clouds backgrounds for verse display
- ⬅️➡️ **Verse Navigation** — Previous/Next buttons to move through verses and chapters seamlessly
- 🔗 **No HDMI needed** — TV just opens a URL in any browser; phone controls everything

---

## 🖼️ Screenshots

| Bible Screen | Present Screen |
|---|---|
| Book/Chapter/Verse dropdowns | PDF/PPTX/Video upload & preview |

---

## 🏗️ Architecture

```
bible_share_app/
├── App.js              # React Native (Expo) mobile controller app
├── server/
│   ├── server.js       # Express + Socket.IO cast server
│   └── public/
│       ├── index.html  # TV/browser display page
│       └── backgrounds/
│           ├── nature-1.jpg
│           ├── sky-1.jpg
│           ├── forest-1.jpg
│           └── clouds-1.jpg
└── README.md
```

**Flow:**
```
Phone (App.js)  ──Socket.IO──▶  server.js  ──Socket.IO──▶  TV Browser (index.html)
     │                               │
     └── REST API (verses, upload) ──┘
```

---

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- Expo CLI (`npm install -g expo-cli`)
- An Android or iOS device (or emulator)

---

### 1. Clone the repo

```bash
git clone https://github.com/udayrajsaroj/Cast-Presenter.git
cd Cast-Presenter
```

---

### 2. Start the Cast Server

```bash
cd server
npm install
node server.js
```

Server starts at `http://YOUR_LOCAL_IP:3000`

> You can also deploy the server to **Render**, **Railway**, or **Fly.io** for remote access.

---

### 3. Start the Mobile App

```bash
# From root folder
npm install
npx expo start
```

Scan the QR code with **Expo Go** on your phone.

---

### 4. Open on TV

On your TV or any device on the same network, open a browser and go to:

```
http://YOUR_SERVER_IP:3000
```

The TV screen will now be controlled by your phone in real time.

---

## 📱 App Usage

1. **Connect** — Enter your cast server URL and tap Connect
2. **Bible tab** — Select Book → Chapter → Verse using the dropdowns
3. Tap **Load Preview** to see the English + Hindi verse on your phone
4. Tap **SHOW ON TV** to cast it to the TV screen
5. Use **PREVIOUS / NEXT** to navigate verse by verse
6. **Present tab** — Pick a PDF, PPTX, or Video to upload and present
7. Use **PREVIOUS / NEXT** to flip through slides from your phone

---

## 🌐 Deploying the Server (Render)

1. Push the `server/` folder to GitHub
2. Create a new **Web Service** on [render.com](https://render.com)
3. Set build command: `npm install`
4. Set start command: `node server.js`
5. Copy the `https://your-app.onrender.com` URL into the app's server URL field

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Mobile App | React Native, Expo |
| Cast Server | Node.js, Express, Socket.IO |
| TV Display | Vanilla HTML/JS |
| PDF Rendering | PDF.js |
| PPTX Parsing | JSZip |
| Bible API | [bible-api.com](https://bible-api.com) |
| File Upload | expo-file-system, multer |
| Storage | AsyncStorage |

---

## 📦 Key Dependencies

**Mobile (package.json)**
```json
"expo": "~51.0.0",
"react-native": "0.74.x",
"socket.io-client": "^4.x",
"react-native-webview": "^13.x",
"expo-document-picker": "^12.x",
"expo-file-system": "^17.x",
"expo-network": "^6.x",
"@react-native-async-storage/async-storage": "^1.x"
```

**Server (server/package.json)**
```json
"express": "^4.x",
"socket.io": "^4.x",
"multer": "^1.x",
"jszip": "^3.x",
"pdfjs-dist": "^4.x",
"cors": "^2.x"
```

---

## 📖 API Reference

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/info` | Server IP and display URL |
| GET | `/api/themes` | List of background themes |
| GET | `/api/bible/:ref` | Fetch a Bible verse (e.g. `John 3:16`) |
| GET | `/api/bible/:ref?translation=hindi` | Fetch Hindi translation |
| GET | `/api/bible/books` | List all Bible books |
| POST | `/api/upload` | Upload PDF, PPTX, or video |
| GET | `/api/document/file` | Serve the uploaded document |

---

## 🔌 Socket Events

| Event | Direction | Description |
|---|---|---|
| `join-room` | Client → Server | Join as presenter or viewer |
| `change-page` | Client ↔ Server | Change the current slide/page |
| `upload-document` | Client ↔ Server | Notify all clients of a new document |
| `show-verse` | Client → Server → TV | Cast a Bible verse to the TV |
| `video-control` | Client → Server → TV | Play/pause video on TV |

---

## 🙏 Acknowledgements

- [bible-api.com](https://bible-api.com) for the free Bible verse API
- [PDF.js](https://mozilla.github.io/pdf.js/) by Mozilla for PDF rendering
- [Socket.IO](https://socket.io/) for real-time communication

---

## 📄 License

MIT License — free to use, modify, and distribute.

---

> Made with ❤️ for the church community