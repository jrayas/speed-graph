// Shared helpers for the real-Obsidian scripts (Chrome DevTools Protocol over Node's built-in WebSocket).
import { inflateSync } from 'node:zlib';
export async function connect(match = (t) => t.type === 'page' && t.url.startsWith('app://')) {
  const targets = await (await fetch('http://127.0.0.1:9222/json')).json();
  const page = targets.find(match);
  if (!page) throw new Error('No matching page: ' + targets.map((t) => t.type + ':' + t.title).join(' | '));
  const ws = new WebSocket(page.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
  let id = 0; const pending = new Map();
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } };
  const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.error) throw new Error('CDP error: ' + JSON.stringify(r.error) + ' for ' + String(expr).slice(0, 80)); if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text); return r.result.result.value; };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  return { send, ev, sleep, close: () => ws.close() };
}
// Minimal PNG decoder (8-bit RGB/RGBA, non-interlaced) -> { width, height, channels, data }
export function decodePng(buf) {
  let p = 8; let width = 0, height = 0, colour = 0; const idat = [];
  while (p < buf.length) { const len = buf.readUInt32BE(p); const type = buf.toString('latin1', p + 4, p + 8); const data = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') { width = data.readUInt32BE(0); height = data.readUInt32BE(4); colour = data[9]; } else if (type === 'IDAT') idat.push(data); p += 12 + len; }
  const channels = colour === 6 ? 4 : colour === 2 ? 3 : 1; const raw = inflateSync(Buffer.concat(idat)); const stride = width * channels; const out = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) { const f = raw[y * (stride + 1)]; for (let x = 0; x < stride; x++) { const v = raw[y * (stride + 1) + 1 + x]; const a = x >= channels ? out[y * stride + x - channels] : 0; const b = y > 0 ? out[(y - 1) * stride + x] : 0; const c = x >= channels && y > 0 ? out[(y - 1) * stride + x - channels] : 0;
      let r; if (f === 0) r = v; else if (f === 1) r = v + a; else if (f === 2) r = v + b; else if (f === 3) r = v + ((a + b) >> 1); else { const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c); r = v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c); }
      out[y * stride + x] = r & 255; } }
  return { width, height, channels, data: out };
}
// Average luma on a 48x48 grid of a decoded image.
export function lumaGrid(img, n = 48) {
  const grid = new Float32Array(n * n); const cw = img.width / n, ch = img.height / n;
  for (let gy = 0; gy < n; gy++) for (let gx = 0; gx < n; gx++) { let sum = 0, cnt = 0;
    for (let y = Math.floor(gy * ch); y < Math.floor((gy + 1) * ch); y += 2) for (let x = Math.floor(gx * cw); x < Math.floor((gx + 1) * cw); x += 2) { const i = (y * img.width + x) * img.channels; sum += 0.299 * img.data[i] + 0.587 * img.data[i + 1] + 0.114 * img.data[i + 2]; cnt++; }
    grid[gy * n + gx] = cnt ? sum / cnt : 0; }
  return grid;
}
