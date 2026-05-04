# 🏎️ imran . — interactive 3D drivable portfolio

A Bruno-Simon-style WebGL portfolio for **Imran Pasha** — full-stack engineer + cybersecurity specialist. Drive a Ferrari around a procedurally-built city, fly above it, chat with an AI version of Imran, race against the clock, and discover his work through interactive zones instead of scrolling pages.

> **No more "scroll-fatigue" portfolios.** Every project, skill, and contact link is somewhere you have to *drive to*.

---

## ✨ Features

### 🌍 The world
- **Procedural city** — 8 districts, 30+ buildings (3 architectural variants), grid road network
- **Sunset palette** — golden-hour lighting, Tron-style purple grid floor, neon accent emissives
- **Day/night cycle** — sun arcs across the sky over 90 sec, lights ramp up at dusk, **stars + meteor shower** at night
- **Live weather** — auto-cycling clear → cloudy → 🌧 rain → ⛈ thunderstorm with **lightning flashes** and procedural thunder
- **River + lake + bridges + observation tower** with sweeping pink beacon
- **Park** with cherry-blossom trees + drifting petals
- **NPCs that wave at you** when you drive close, **pet dog** that follows your car
- **Sky-writing airplane** + **hot-air balloon** drift overhead
- **Hidden hacker bunker** easter egg (CRT terminal scrolling fake nmap exploits)

### 🚗 Driving
- **Ferrari Rosso Corsa** with Scuderia shield, cyan DRL strip, tail-light bar
- **WASD / arrow keys**, mouse-drag orbit camera (Blender-style), scroll-wheel zoom
- **4 camera modes** — chase / top-down / first-person / **drone cinematic**
- **Plane mode** — press `L` and the car sprouts wings, you fly above the city
- **Drift smoke**, dust trails, **nitro boost** (collect coins → press Shift)
- **Time trial mode** — race to visit all 5 zones, personal best in localStorage with 🥇🥈🥉 medals

### 🎯 Interactive zones
- 👋 **About** — bio + photo + downloadable resume
- 📂 **Projects billboard** — single rotating screen, press `N`/`P` to cycle, `E` to open repo
- 💪 **Skills** — 9 knockable icon cubes + full taxonomy panel (35+ techs across 8 categories)
- 📮 **Contact** — mailbox cul-de-sac, mailto link
- 🔗 **Socials** — 4 procedurally-painted brand logos (GitHub octocat, LinkedIn `in`, X, HackTheBox hex)
- 💀 **HTB skull statue** — cybersec easter egg with glowing green eyes
- 🎯 **28 collectible coins** scattered around the city — fireworks on completion

### 🤖 AI Imran chatbot
- Floating button → modal chat interface
- Powered by **Google Gemini 2.5 Flash Lite** via secure server-side proxy
- System-prompted to answer in Imran's voice about projects, hiring, tech stack
- Key never leaves the server (`gemini.key` is gitignored)

### 🎥 Tier 5 features
- 🎤 **Voice commands** — "go to projects", "fly", "honk" (Web Speech API)
- 📱 **AR mode** — view the world on your coffee table via WebXR (Chrome Android)
- 👥 **Local multiplayer** — WebSocket-based ghost cars for visitors on the same network

### 📊 Bonus
- **Side minimap** with click-to-teleport
- **Live GitHub commit graph** as a 3D sculpture (53 weeks × 7 days of cubes, real public data)
- **Achievements panel** — 8 badges with localStorage persistence
- **Photo mode** (F2) — hide HUD + screenshot
- **Visitor counter** (free CountAPI)
- **Share-this-spot** URL — copy a link that spawns visitors at your exact coords
- **Reduce-motion mode** — auto-detected from OS preference
- **Cinematic intro** — 6-sec drone fly-over on first Play click
- **Hire-me banner** — pulsing green dot, opens mailto

---

## 🧰 Tech stack

| Layer | What |
|---|---|
| **3D engine** | Three.js 0.160 (ESM via importmap) + UnrealBloomPass post-processing |
| **Physics** | Cannon.js 0.6.2 (direct velocity control for arcade feel) |
| **Audio** | Web Audio API (procedural — no asset files) — engine, ambient drone, thunder, horn |
| **Backend** | Node.js 20 — `server.js` (HTTP + chat proxy) + `multiplayer-server.js` (WebSocket) |
| **AI** | Google Gemini 2.5 Flash Lite via REST |
| **Reverse proxy** | Caddy 2 (auto-HTTPS via Let's Encrypt) |
| **CI/CD** | GitHub Actions → Docker build → ghcr.io → SSH to EC2 → docker compose |
| **Hosting** | AWS EC2 t3.micro (free tier) |
| **Container** | Dockerized 3-service stack (web + mp + caddy) |

---

## 🎮 Controls

### Driving
| Key | Action |
|---|---|
| `W` `A` `S` `D` / arrows | drive |
| `Space` | jump (drive) / climb (fly) |
| `Shift` | nitro boost (uses coin charges) |
| `R` | reset car |

### Camera
| Key | Action |
|---|---|
| `C` | cycle camera modes (chase → top → first-person → drone) |
| `F` | toggle drone cinematic |
| Right-mouse drag | orbit camera (Blender-style) |
| Mouse wheel | zoom in/out |

### Interact
| Key | Action |
|---|---|
| `E` / `Enter` | open project / social link |
| `N` / `P` | next / prev project at billboard |
| `H` | honk |
| `M` | mute |
| `L` | toggle plane mode (fly!) |
| `Y` | pause day/night cycle |
| `Z` | start/stop time trial |
| `F2` | photo mode (screenshot) |

---

## 🚀 Quick start (local dev)

Requirements: Node.js 20+, npm

```bash
git clone https://github.com/<you>/portfolio.git
cd portfolio
npm install

# Add your Gemini API key (free at https://aistudio.google.com/apikey)
echo "YOUR_GEMINI_KEY" > gemini.key

# Run both servers in two terminals:
npm start         # static + chat proxy on http://localhost:5181
npm run mp        # multiplayer WebSocket on ws://localhost:5182
```

Open http://localhost:5181/ — the world should load.

---

## 🌐 Deploy to AWS EC2

**Push to `main` → GitHub Action builds Docker image → deploys to your EC2 box automatically.**

See **[DEPLOY.md](DEPLOY.md)** for the complete walkthrough — it covers:
- Provisioning a fresh EC2 instance (5 min)
- Adding 4 GitHub secrets (2 min)
- HTTPS setup with Let's Encrypt + a custom domain
- Security checklist
- Cost breakdown (~$0/month in year 1 of AWS free tier)

---

## 🏗️ Architecture

```
┌──────────── BROWSER ────────────┐
│  Three.js scene · Cannon.js      │
│  WebSocket client · WebXR · Web  │
│  Audio · Web Speech              │
└──┬─────────────────┬─────────────┘
   │ HTTPS           │ WSS
   ↓                 ↓
┌──────── CADDY (port 80/443) ────┐
│   /ws*  → mp:5182                │
│   else  → web:5181               │
└──┬───────────────┬───────────────┘
   ↓               ↓
┌───────────┐  ┌──────────────┐
│ web:5181  │  │  mp:5182     │
│ server.js │  │ multiplayer- │
│ + chat    │  │ server.js    │
│   proxy   │  │              │
└─────┬─────┘  └──────────────┘
      │
      ↓ HTTPS
┌──────────────────┐
│ Google Gemini    │
│ 2.5 Flash Lite   │
└──────────────────┘
```

All three services run as Docker containers on the EC2 box. The `web` and `mp` services share the same Node.js image (different commands).

---

## 📁 Project layout

```
portfolio/
├── Portfolio.html          # main HTML — HUD overlays, modals, scripts
├── world.js                # 3D scene, physics, NPCs, weather, all gameplay
├── world.css               # HUD styling (cream-paper aesthetic)
├── server.js               # Static file server + /api/chat Gemini proxy
├── multiplayer-server.js   # WebSocket server for ghost cars
├── package.json            # npm deps + scripts
├── pm2.config.cjs          # Local dev process manager
├── Dockerfile              # Production container build
├── docker-compose.yml      # 3-service production stack
├── Caddyfile               # Reverse proxy (local dev)
├── Caddyfile.docker        # Reverse proxy (Docker network)
├── setup-ec2.sh            # Optional manual EC2 bootstrap
├── .github/workflows/
│   └── deploy.yml          # CI/CD — push → build → deploy
├── assets/
│   ├── imran.jpeg          # photo (about zone)
│   └── resume.pdf          # downloadable CV
├── DEPLOY.md               # Production deployment walkthrough
└── README.md               # this file
```

---

## 🛡️ Security

- API keys live in `gemini.key` (gitignored) locally, GitHub Secrets in production
- SSH key stays in `~/.ssh/`, never in chat or repo
- `.gitignore` blocks: `*.key`, `*.pem`, `.env*`, `node_modules/`
- Caddy auto-issues + renews TLS certs (no certbot)
- Server-side Gemini proxy means the API key is **never** exposed to the browser
- See `DEPLOY.md` security checklist

---

## 📬 Contact

- **Email** — imranpasha.ahmed@gmail.com
- **GitHub** — [@Imranpasha30](https://github.com/Imranpasha30)
- **LinkedIn** — [imran-pasha-](https://www.linkedin.com/in/imran-pasha-/)
- **HackTheBox** — [profile](https://www.hackthebox.com/)

Built with way too much caffeine in Bangalore. Available for hire **Q2 2026**.

---

## 📜 License

MIT — feel free to fork, remix, build your own drivable portfolio. If you do, send me a link 🚗
