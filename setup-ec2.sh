#!/usr/bin/env bash
# One-time bootstrap for an Ubuntu 22.04 EC2 instance.
# Usage on a fresh box (run as ubuntu user):
#   curl -sSL https://raw.githubusercontent.com/<USER>/<REPO>/main/setup-ec2.sh | bash
# OR after cloning the repo:
#   bash setup-ec2.sh
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/Imranpasha30/portfolio.git}"  # change to your repo
APP_DIR="$HOME/portfolio"

echo "==> Updating apt"
sudo apt-get update -y
sudo apt-get install -y curl gnupg debian-keyring debian-archive-keyring apt-transport-https git

echo "==> Installing Node.js 20 (NodeSource)"
if ! command -v node >/dev/null || [ "$(node -v | cut -dv -f2 | cut -d. -f1)" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

echo "==> Installing PM2 (global)"
sudo npm install -g pm2

echo "==> Installing Caddy (reverse proxy + auto-HTTPS)"
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    | sudo tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
  sudo apt-get update -y
  sudo apt-get install -y caddy
fi

echo "==> Cloning / updating repo to $APP_DIR"
if [ ! -d "$APP_DIR/.git" ]; then
  git clone "$REPO_URL" "$APP_DIR"
fi
cd "$APP_DIR"
git pull

echo "==> Installing npm dependencies"
npm ci --omit=dev || npm install --omit=dev

echo "==> Setting up logs dir"
mkdir -p "$APP_DIR/logs"

echo "==> Linking Caddyfile to /etc/caddy/Caddyfile"
sudo cp "$APP_DIR/Caddyfile" /etc/caddy/Caddyfile
sudo systemctl restart caddy
sudo systemctl enable caddy

echo "==> Starting PM2 apps"
# GEMINI_KEY must be exported in your shell or set via the GitHub Action before this runs.
pm2 start "$APP_DIR/pm2.config.cjs" --update-env
pm2 save

echo "==> Configuring PM2 to start at boot"
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u "$USER" --hp "$HOME"
pm2 save

echo ""
echo "✅ Bootstrap complete!"
echo "   Web app:        http://$(curl -s ifconfig.me)/"
echo "   PM2 status:     pm2 status"
echo "   PM2 logs:       pm2 logs"
echo "   Caddy logs:     sudo journalctl -u caddy -f"
echo ""
echo "Next: set up GitHub Actions secrets and push to main to enable auto-deploy."
