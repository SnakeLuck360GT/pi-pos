# PiPOS printer bridge

Runs on a Raspberry Pi next to the receipt printer. It waits for a push from ntfy, fetches pending jobs from your PiPOS site, prints them and marks them done. Receipts are laid out in the browser, so changing the design never needs a Pi update.

Full walkthrough (SD card, SSH, troubleshooting): https://snakeluck360gt.github.io/pi-pos/#raspberry-pi

## Install

Get the command from Admin → Printer and paste it into the Pi's terminal. It looks like:

```bash
curl -fsSL 'https://your-shop.netlify.app/api/pi/install?code=XXXXXX' | bash
```

That installs Node 20 and git, clones the repo to `~/pi-pos`, writes `pi-bridge/.env`, sets up the `pipos-bridge` service and prints a test page. Run it again to update.

## Manual install

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs git
git clone --depth 1 https://github.com/YOU/pi-pos.git ~/pi-pos
cd ~/pi-pos/pi-bridge && npm install --omit=dev
cp .env.example .env && nano .env
node index.js --test
```

`.env`:

| Key | Default | |
|---|---|---|
| `API_BASE` | | Your site, e.g. `https://your-shop.netlify.app` |
| `PRINTER_KEY` | | From Admin → Printer |
| `NTFY_URL` | `https://ntfy.sh` | |
| `NTFY_TOPIC` | | From Admin → Printer |
| `PRINTER` | `/dev/usb/lp0` | Or `tcp://192.168.1.50:9100` for a network printer |
| `ENCODING` | job's setting | `gb2312` if Chinese prints as garbage |
| `CUT` | `partial` | `partial`, `full` or `none` |
| `FALLBACK_POLL_MS` | `300000` | Safety-net poll; `0` turns it off |

Then the service. Edit `User` and the paths in `pipos-bridge.service` if you're not `pi`:

```bash
sudo cp pipos-bridge.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now pipos-bridge
journalctl -u pipos-bridge -f
```

If `/dev/usb/lp0` says permission denied: `sudo usermod -a -G lp $USER` and log in again.
