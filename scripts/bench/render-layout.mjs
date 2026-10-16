import { readFileSync, writeFileSync } from 'node:fs';
import { deflateSync, crc32 } from 'node:zlib';
// Draws settled layouts (points only) to PNG so the shape can be judged by eye, not just by numbers.
// Usage: node bench/render-layout.mjs <10|25> '<json [[name, gravity, repelRange], ...]>' <edges dir> <out dir>
// Needs core/pkg built (wasm-pack) and edges-<n>k.bin files (flat uint32 [source, target, ...] pairs).
import { dirname, resolve } from 'node:path';
const root = resolve(dirname(new URL(import.meta.url).pathname), '..');
const { initSync, Layout } = await import(root + '/core/pkg/fastgraph_core.js');
initSync({ module: readFileSync(root + '/core/pkg/fastgraph_core_bg.wasm') });
const size = process.argv[2] || '25';
const buf = readFileSync(process.argv[4] + '/edges-' + size + 'k.bin');
const edges = new Uint32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4).slice();
const n = size * 1000;
function png(w, h, gray) { const raw = Buffer.alloc((w + 1) * h); for (let y = 0; y < h; y++) { raw[y * (w + 1)] = 0; gray.copy(raw, y * (w + 1) + 1, y * w, (y + 1) * w); }
  const chunk = (type, data) => { const t = Buffer.from(type); const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])) >>> 0); return Buffer.concat([len, t, data, crc]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]); }
const configs = JSON.parse(process.argv[3]);
for (const [name, gravity, range] of configs) {
  const l = new Layout(n, edges, 1); l.set_params(1, -30, 1, 30, 0.9, 0.4, gravity, range); l.tick(10000);
  const p = l.positions(); const xs = [], ys = []; for (let i = 0; i < n; i++) { xs.push(p[2*i]); ys.push(p[2*i+1]); }
  const sx = [...xs].sort((a, b) => a - b), sy = [...ys].sort((a, b) => a - b); const q = (a, f) => a[Math.floor((a.length - 1) * f)];
  const x0 = q(sx, 0.01), x1 = q(sx, 0.99), y0 = q(sy, 0.01), y1 = q(sy, 0.99); const W = 700, H = 700, k = Math.min(W / (x1 - x0), H / (y1 - y0));
  const acc = new Float32Array(W * H);
  for (let i = 0; i < n; i++) { const px = Math.round((xs[i] - x0) * k), py = Math.round((ys[i] - y0) * k); if (px >= 0 && px < W && py >= 0 && py < H) acc[py * W + px]++; }
  const gray = Buffer.alloc(W * H); for (let i = 0; i < acc.length; i++) gray[i] = Math.min(255, Math.round(60 + 70 * acc[i]) * (acc[i] > 0 ? 1 : 0));
  writeFileSync(process.argv[5] + '/layout-' + name + '.png', png(W, H, gray));
  const r = xs.map((x, i) => Math.hypot(x, ys[i])).sort((a, b) => a - b);
  console.log(name.padEnd(28), 'median r', Math.round(q(r, 0.5)), 'p99', Math.round(q(r, 0.99)));
}
