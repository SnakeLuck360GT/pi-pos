// Browser image -> 1-bit raster for receipt image blocks (GS v 0 format:
// rows of packed bits, MSB first, 1 = black). Width is a multiple of 8.

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not read that image'))
    img.src = src
  })
}

// Resize an image so it is at most `maxWidth` px wide, as a PNG data URL.
// Keeps the stored source small enough to live in the config.
export async function fitImage(dataUrl, maxWidth = 576) {
  const img = await loadImage(dataUrl)
  const scale = Math.min(1, maxWidth / img.naturalWidth)
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(img.naturalWidth * scale))
  c.height = Math.max(1, Math.round(img.naturalHeight * scale))
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
  return c.toDataURL('image/png')
}

const toBase64 = bytes => {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

const fromBase64 = b64 => {
  const s = atob(b64 || '')
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
  return out
}

// -> { width, height, data (base64), preview (PNG data URL) }
export async function imageToRaster(dataUrl, { maxWidthDots = 576, threshold = 128, dither = true } = {}) {
  const img = await loadImage(dataUrl)
  const width = Math.max(8, Math.floor(Math.min(img.naturalWidth, maxWidthDots) / 8) * 8)
  const height = Math.max(1, Math.round(img.naturalHeight * (width / img.naturalWidth)))

  const c = document.createElement('canvas')
  c.width = width
  c.height = height
  const g = c.getContext('2d')
  // Transparent areas print as paper, not black.
  g.fillStyle = '#fff'
  g.fillRect(0, 0, width, height)
  g.drawImage(img, 0, 0, width, height)
  const px = g.getImageData(0, 0, width, height).data

  const lum = new Float32Array(width * height)
  for (let i = 0; i < lum.length; i++) lum[i] = 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2]

  const rowBytes = width / 8
  const bits = new Uint8Array(rowBytes * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x
      const old = lum[i]
      const black = old < threshold
      if (black) bits[y * rowBytes + (x >> 3)] |= 0x80 >> (x & 7)
      if (!dither) continue
      // Floyd–Steinberg: push the error onto unvisited neighbours.
      const err = old - (black ? 0 : 255)
      if (x + 1 < width) lum[i + 1] += err * 7 / 16
      if (y + 1 < height) {
        if (x > 0) lum[i + width - 1] += err * 3 / 16
        lum[i + width] += err * 5 / 16
        if (x + 1 < width) lum[i + width + 1] += err * 1 / 16
      }
    }
  }

  const data = toBase64(bits)
  return { width, height, data, preview: rasterToDataUrl(width, height, data) }
}

// Packed raster (base64) -> PNG data URL, for previews.
export function rasterToDataUrl(width, height, data) {
  if (!width || !height) return ''
  const bits = fromBase64(data)
  const c = document.createElement('canvas')
  c.width = width
  c.height = height
  const g = c.getContext('2d')
  const out = g.createImageData(width, height)
  const rowBytes = Math.ceil(width / 8)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const on = bits[y * rowBytes + (x >> 3)] & (0x80 >> (x & 7))
      const o = (y * width + x) * 4
      const v = on ? 0 : 255
      out.data[o] = out.data[o + 1] = out.data[o + 2] = v
      out.data[o + 3] = 255
    }
  }
  g.putImageData(out, 0, 0)
  return c.toDataURL('image/png')
}
