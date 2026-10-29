# PiPOS

A POS for small shops and takeaways: a tablet web app and an admin panel on Netlify, printing to an ESC/POS thermal printer through a Raspberry Pi. The menu, the POS screens and the receipt layout are all edited from `/admin`.

[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/SnakeLuck360GT/pi-pos)

## Quick start

1. Deploy with the button above. Netlify asks you for an admin password (`ADMIN_PASSWORD`).
2. Open `https://<your-site>.netlify.app/admin`, sign in and follow the setup steps.
3. Setup gives you one command. Paste it into a terminal on the Raspberry Pi with the printer plugged in.
4. Open the site on the tablet and enter the admin password once.

The full guide, including setting up the Pi from a blank SD card, is at https://snakeluck360gt.github.io/pi-pos/.

## Local development

```
npm install
echo ADMIN_PASSWORD=dev > .env
npx netlify dev
```

The app runs at http://localhost:8888 (admin at `/admin`), with functions and a local Blobs store. Plain `npm run dev` serves the UI without the API.

`npm test` runs the receipt tests.

## Licence

MIT
