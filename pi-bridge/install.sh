#!/usr/bin/env bash
# PiPOS bridge installer. Safe to re-run: it updates the code, keeps your
# printer settings and restarts the service.
#
# Normally run through the command from Admin -> Printer, which sets
# PIPOS_API_BASE, PIPOS_PRINTER_KEY, PIPOS_NTFY_URL, PIPOS_NTFY_TOPIC and
# PIPOS_REPO. Without them it reuses the values already in pi-bridge/.env.
set -euo pipefail

# Everything is inside main so that, when piped from curl, nothing below can
# read the rest of the script from stdin.
main() {
  local DIR="${PIPOS_DIR:-$HOME/pi-pos}"
  local BRIDGE="$DIR/pi-bridge"
  local SERVICE=pipos-bridge
  local RUN_USER
  RUN_USER="$(id -un)"
  local SUDO=""
  [ "$(id -u)" -eq 0 ] || SUDO="sudo"

  step() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
  note() { printf '    %s\n' "$*"; }
  die()  { printf '\nError: %s\n' "$*" >&2; exit 1; }

  step "Checking the system"
  [ "$(uname -s)" = "Linux" ] || die "this installer is for Linux (Raspberry Pi OS)."
  if ! grep -qi raspberry /proc/device-tree/model 2>/dev/null; then
    note "This doesn't look like a Raspberry Pi. Carrying on anyway."
  fi
  if [ "$(uname -m)" = "armv6l" ]; then
    note "This is an armv6 Pi (Zero / Zero W / 1). NodeSource has no Node 20 for it;"
    note "install Node 20 from the unofficial armv6 builds first if the next step fails."
  fi

  step "Installing Node.js 20 and git"
  local node_major=0
  if command -v node >/dev/null 2>&1; then
    node_major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
  fi
  if [ "$node_major" -lt 20 ]; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | ${SUDO:+$SUDO -E} bash - >/dev/null
    $SUDO apt-get install -y nodejs >/dev/null </dev/null
  fi
  if ! command -v git >/dev/null 2>&1; then
    $SUDO apt-get update -qq </dev/null
    $SUDO apt-get install -y git >/dev/null </dev/null
  fi
  note "node $(node --version), $(git --version)"

  step "Getting the code into $DIR"
  if [ -d "$DIR/.git" ]; then
    git -C "$DIR" pull --ff-only --quiet </dev/null
  else
    [ -n "${PIPOS_REPO:-}" ] || die "PIPOS_REPO is not set and $DIR doesn't exist yet."
    git clone --depth 1 --quiet "$PIPOS_REPO" "$DIR" </dev/null
  fi
  (cd "$BRIDGE" && npm install --omit=dev --no-audit --no-fund --loglevel=error </dev/null)

  step "Writing $BRIDGE/.env"
  local ENV_FILE="$BRIDGE/.env"
  old() { [ -f "$ENV_FILE" ] && sed -n "s/^$1=//p" "$ENV_FILE" | tail -n 1 || true; }
  local api key ntfy topic printer encoding cut poll
  api="${PIPOS_API_BASE:-$(old API_BASE)}"
  key="${PIPOS_PRINTER_KEY:-$(old PRINTER_KEY)}"
  ntfy="${PIPOS_NTFY_URL:-$(old NTFY_URL)}"
  topic="${PIPOS_NTFY_TOPIC:-$(old NTFY_TOPIC)}"
  printer="$(old PRINTER)"
  encoding="$(old ENCODING)"
  cut="$(old CUT)"
  poll="$(old FALLBACK_POLL_MS)"
  [ -n "$api" ] || die "no site address. Run the command from Admin -> Printer."
  if [ -z "$printer" ]; then
    printer="$(ls /dev/usb/lp* 2>/dev/null | head -n 1 || true)"
    if [ -n "$printer" ]; then
      note "Found a USB printer at $printer"
    else
      printer=/dev/usb/lp0
      note "No USB printer found yet; using /dev/usb/lp0."
      note "For a network printer, set PRINTER=tcp://<printer ip>:9100 in $ENV_FILE"
    fi
  fi
  ( umask 077
    cat >"$ENV_FILE" <<EOF
API_BASE=${api%/}
PRINTER_KEY=$key
NTFY_URL=${ntfy:-https://ntfy.sh}
NTFY_TOPIC=$topic
PRINTER=$printer
ENCODING=$encoding
CUT=${cut:-partial}
FALLBACK_POLL_MS=${poll:-300000}
EOF
  )

  step "Giving $RUN_USER access to the printer"
  $SUDO usermod -a -G lp "$RUN_USER" || true
  # The group change needs a new login; the udev rule works straight away.
  echo 'SUBSYSTEM=="usbmisc", KERNEL=="lp[0-9]*", MODE="0666"' | $SUDO tee /etc/udev/rules.d/99-pipos-printer.rules >/dev/null
  $SUDO udevadm control --reload-rules || true
  $SUDO udevadm trigger --subsystem-match=usbmisc || true
  for dev in /dev/usb/lp*; do
    if [ -e "$dev" ]; then $SUDO chmod 666 "$dev"; fi
  done

  step "Setting up the $SERVICE service"
  $SUDO tee "/etc/systemd/system/$SERVICE.service" >/dev/null <<EOF
[Unit]
Description=PiPOS printer bridge
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$RUN_USER
WorkingDirectory=$BRIDGE
EnvironmentFile=$ENV_FILE
ExecStart=$(command -v node) $BRIDGE/index.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
  $SUDO systemctl daemon-reload
  $SUDO systemctl enable --now "$SERVICE" >/dev/null 2>&1
  $SUDO systemctl restart "$SERVICE"

  step "Printing a test page"
  if (cd "$BRIDGE" && node index.js --test </dev/null); then
    note "Check the printer for a test page."
  else
    note "The test page didn't print. Check the printer is on and plugged in, then run:"
    note "  cd $BRIDGE && node index.js --test"
  fi

  printf '\nThe printer bridge is running as the %s service and starts on boot.\n' "$SERVICE"
  printf 'Logs: journalctl -u %s -f\n' "$SERVICE"
  printf 'Update: re-run the same command, or git -C %s pull && sudo systemctl restart %s\n' "$DIR" "$SERVICE"
}

main "$@"
