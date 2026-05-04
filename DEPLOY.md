# Deploying Imran's Portfolio to AWS EC2 — Dockerized & Fully Automated

Push to `main` → GitHub Action builds a Docker image, pushes it to GitHub Container Registry, then SSHs into your EC2 box and runs `docker compose pull && up -d`. Zero downtime. **You never SSH into the box manually.**

---

## What you do (one time, ~10 minutes)

### 1. Provision EC2 (5 min)

In AWS Console → EC2 → Launch instance:

| Setting | Value |
|---|---|
| AMI | **Ubuntu Server 22.04 LTS** (free-tier eligible) |
| Instance type | **t3.micro** (free tier) — or t3.small if you want more RAM headroom |
| Key pair | Create new → `portfolio-prod` → ED25519 → `.pem` → save to `~/.ssh/portfolio-prod.pem` |
| Network → Auto-assign public IP | **Enable** |
| Security group → Inbound rules | **22** (SSH from your IP only), **80** (HTTP from anywhere), **443** (HTTPS from anywhere) |
| Storage | **15 GiB gp3** *(Docker images need a bit more space than bare-metal Node)* |

Launch. Note the **public IPv4** (e.g. `13.234.56.78`).

> ⚠️ The new `.pem` file is your only SSH access. Lock its perms:
> ```powershell
> # Windows PowerShell
> icacls .\portfolio-prod.pem /inheritance:r
> icacls .\portfolio-prod.pem /grant:r "$env:USERNAME:R"
> ```

### 2. Push code to a private GitHub repo (3 min)

```powershell
cd "d:\New folder (4)"
git init -b main
git add .
git status                     # CONFIRM gemini.key, *.pem, node_modules NOT listed
git commit -m "initial commit"
git remote add origin https://github.com/<YOU>/portfolio.git
git push -u origin main
```

(Create the `portfolio` repo on github.com first, **Private**, no README/gitignore checkboxes.)

### 3. Add 4 GitHub Action secrets (2 min)

Repo → **Settings → Secrets and variables → Actions → New repository secret**

| Secret name | Value |
|---|---|
| `EC2_HOST` | New EC2 public IPv4 (e.g. `13.234.56.78`) or your domain |
| `EC2_USER` | `ubuntu` |
| `EC2_SSH_KEY` | Open `portfolio-prod.pem` in **Notepad**, copy entire contents (BEGIN/END lines + newlines), paste here |
| `GEMINI_KEY` | A **fresh** Gemini API key from https://aistudio.google.com/apikey |

`GITHUB_TOKEN` is automatically available — you don't need to add it. It's used to push the Docker image to ghcr.io and pull it on EC2.

### Done

Push any commit (or click "Run workflow" in the Actions tab). The Action does everything:

**First run** (~6 min):
1. Builds Docker image on the GitHub runner
2. Pushes to `ghcr.io/<your-username>/portfolio:latest`
3. SSH into EC2 → installs Docker engine + compose plugin (only first time)
4. EC2 logs in to ghcr.io with the GitHub token
5. Pulls the image
6. Starts 3 containers via docker compose: `web`, `mp`, `caddy`
7. Caddy serves on port 80 → reverse-proxies to web:5181 + mp:5182

**Every later push** (~2 min):
1. Builds image with cached layers (only changed files trigger rebuilds)
2. Pushes new image
3. EC2 pulls new image, `docker compose up -d` recreates containers (zero downtime)

Visit `http://<your-ec2-ip>/` — site is live.

---

## Architecture (Docker stack on the EC2 box)

```
Internet → port 80/443
       ↓
┌─────────────────┐
│  caddy:2-alpine │  reverse proxy + auto-TLS (when domain set)
│  (1 container)  │
└────┬──────┬─────┘
     │      │
     │      └─→ /ws*  →  ┌──────────────┐
     │                   │ portfolio-mp │  multiplayer-server.js
     │                   │ (port 5182)  │
     │                   └──────────────┘
     │
     └─→ everything else → ┌───────────────┐
                           │ portfolio-web │  server.js + chat proxy
                           │ (port 5181)   │
                           └───────────────┘

All 3 containers share an internal Docker network.
Only Caddy exposes ports to the host.
```

**Image:** `ghcr.io/<you>/portfolio:latest` is shared by `web` and `mp` containers — same code, different commands. Single image build.

**Persistent data:** Caddy's TLS certs + state are persisted in named Docker volumes (`caddy_data`, `caddy_config`). Survives `docker compose down`.

---

## (Recommended) Add a domain for HTTPS

Without HTTPS, browsers block AR mode, voice commands, microphone access — and treat the site as "Not Secure".

1. Buy a domain (Namecheap, Porkbun, Cloudflare — ~$15/year)
2. Add an **A record** in your DNS pointing `imranpasha.dev` (and optionally `www.`) to your EC2 public IP
3. Edit `Caddyfile.docker` locally:
   - Comment out the `:80 { ... }` block at the bottom
   - Uncomment the `yourdomain.com { ... }` block, replace with your real domain
4. `git commit -am "use real domain" && git push`
5. The Action deploys the new Caddyfile, Caddy auto-fetches a Let's Encrypt cert in ~30 sec
6. `https://yourdomain.com/` → fully secure, AR/voice/mp all work

---

## Useful commands (only if you ever debug)

You normally never SSH in. But for troubleshooting:

```bash
ssh -i ~/.ssh/portfolio-prod.pem ubuntu@<your-ec2-ip>

# Once on the box, in ~/portfolio:
sudo docker compose ps                     # Container status
sudo docker compose logs -f                # Tail all containers' logs
sudo docker compose logs -f web            # Just the web service
sudo docker compose logs -f caddy          # Just Caddy
sudo docker compose restart web            # Restart one service
sudo docker compose down                   # Stop everything
sudo docker compose up -d                  # Start everything
sudo docker stats                          # Live CPU/memory per container
sudo docker image prune -f                 # Clean up old images
df -h                                      # Disk usage
```

---

## When something breaks during deploy

The GitHub Action uses `set -euo pipefail` — any error aborts the deploy. Your previous version keeps running on the server in its containers. Worst case: site is unchanged.

Click into the failing run on the **Actions tab** to see the exact line that broke.

Common issues:
- **"unauthorized: not authorized to push to ghcr.io"** — go to your repo → Settings → Actions → General → Workflow permissions → enable "Read and write permissions"
- **"manifest unknown"** when EC2 pulls — the package on ghcr.io is private, but EC2 can read it because the workflow injects `GITHUB_TOKEN` for the pull. If you've changed the package visibility manually to "Internal" or restricted it, switch back to "Private" (default) so the token can read it.
- **"Permission denied (publickey)"** — `EC2_SSH_KEY` secret is wrong/incomplete. Re-paste the full `.pem` contents.
- **"address already in use" port 80** — another service (nginx, Apache) is squatting port 80 on your EC2. SSH in: `sudo systemctl stop nginx && sudo systemctl disable nginx`

---

## Security checklist before going public

- [ ] SSH inbound rule restricted to **your IP only**, not `0.0.0.0/0`
- [ ] `gemini.key` and `*.pem` in `.gitignore` — verify with `git ls-files | grep -E "(gemini\.key|\.pem)"` shows **nothing**
- [ ] Gemini key is in GitHub Secrets, never in any file you commit
- [ ] On the EC2 box: `sudo apt install -y unattended-upgrades fail2ban` once, for auto-updates + brute-force protection
- [ ] Rotate Gemini key + EC2 SSH key every few months by updating the GitHub secret + re-running the workflow

---

## Files in this project

| File | Role |
|---|---|
| `Dockerfile` | Builds the Node app image (used by both web + mp containers) |
| `.dockerignore` | Excludes secrets/node_modules/git/.env from the image |
| `docker-compose.yml` | 3-service stack: web + mp + caddy |
| `Caddyfile.docker` | Reverse proxy config used INSIDE the Docker network |
| `Caddyfile` | Same idea but for **local** non-Docker dev (uses `localhost:5181`) — kept for `npm start` workflow |
| `pm2.config.cjs` | Local dev process manager — irrelevant in production (Docker handles process lifecycle) |
| `setup-ec2.sh` | **Optional manual fallback** — only if you ever want to bootstrap without GH Actions |
| `.github/workflows/deploy.yml` | GitHub Action — builds image, pushes to ghcr.io, SSHs to EC2, runs compose |
| `server.js` | Static + `/api/chat` Gemini proxy on port 5181 |
| `multiplayer-server.js` | WebSocket multiplayer server on port 5182 |
| `gemini.key` | Local dev only. **Never committed.** Server prefers `GEMINI_KEY` env var (set by docker-compose). |
| `.gitignore` | Protects secrets |

## Cost estimate (AWS free-tier monthly)

- t3.micro (750 hrs/mo first year) → **$0** for 12 months, then ~$8/mo
- 15 GB gp3 → **$0** within free tier (30 GB free)
- Data transfer out → **$0** for first 100 GB/mo (~enough for thousands of visitors)
- Domain → **~$1.25/mo** ($15/year)
- Gemini free tier (1000 req/day) → **$0**

Total: **$0–1.25/month** in year 1. ~$10/month after free tier expires.
