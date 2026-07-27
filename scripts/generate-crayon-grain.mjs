// Generates assets/images/crayon-grain.png — the paper-tooth texture the
// crayon strokes are masked against (see components/crayon-path.tsx).
//
// Run: node scripts/generate-crayon-grain.mjs
//
// Written by hand rather than pulled off a texture site so the grain is
// seamless by construction, carries no licence question into a store build,
// and can be re-tuned from the knobs below. Output is 8-bit greyscale PNG,
// encoded with nothing but node's own zlib.
//
// The mask reads as: WHITE = wax stays, BLACK = paper tooth eats the wax
// away. Storing it this way round means the strokes are masked directly and
// nothing has to know what colour the paper behind them is — the same asset
// works on the envelope sheet, the obituary card and the map detail.
//
// ONE texture, not four. The falloff from the centre of a stroke outward is
// now a Gaussian blur (see crayon-path.tsx), so the grain no longer has to
// carry it by stacking passes of descending density — it only has to supply
// paper tooth, at one density, everywhere.
//
// The octaves below are deliberately COARSER than they'd be for a texture
// viewed 1:1. The tile is drawn into ~128 canvas units on a 320-unit canvas,
// i.e. roughly 300-400 physical pixels on a phone, so a lattice finer than
// ~150 cells lands at under a pixel per fleck and averages away into flat
// grey. Anything you want to actually see has to be coarse enough to survive
// that downsample.

import zlib from "node:zlib";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ---- TUNING KNOBS -------------------------------------------------------
const SIZE = 512;

//   octaves      — [lattice cells across the tile, weight]. The finest
//                  lattice makes the speckle; coarser ones clump it into
//                  patches so it doesn't read as uniform TV static. Keep the
//                  finest at or below ~150 or it downsamples into mush.
//   edgeLow/High — contrast window. RAISING both leaves more white, i.e.
//                  more wax kept. Widen the gap for cloudier grain, narrow
//                  it for hard speckle.
//
// Target: ~72% wax kept, with enough local contrast that the holes read as
// tooth rather than as a general lightening of the stroke.
const VARIANTS = [
  {
    file: "crayon-grain.png",
    octaves: [
      [14, 0.28],
      [46, 0.38],
      [118, 0.34],
    ],
    edgeLow: 0.44,
    edgeHigh: 0.7,
    seed: 20260728,
  },
];
// -------------------------------------------------------------------------

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const smoothstep = (t) => t * t * (3 - 2 * t);

// Value noise on an n x n lattice that wraps at the edges — sampling with
// (i + 1) % n is the entire trick behind the tile being seamless.
function octave(n, rng) {
  const lattice = new Float32Array(n * n);
  for (let i = 0; i < lattice.length; i++) lattice[i] = rng();

  return (x, y) => {
    const fx = x * n;
    const fy = y * n;
    const x0 = Math.floor(fx) % n;
    const y0 = Math.floor(fy) % n;
    const x1 = (x0 + 1) % n;
    const y1 = (y0 + 1) % n;
    const tx = smoothstep(fx - Math.floor(fx));
    const ty = smoothstep(fy - Math.floor(fy));

    const v00 = lattice[y0 * n + x0];
    const v10 = lattice[y0 * n + x1];
    const v01 = lattice[y1 * n + x0];
    const v11 = lattice[y1 * n + x1];

    return (
      v00 * (1 - tx) * (1 - ty) +
      v10 * tx * (1 - ty) +
      v01 * (1 - tx) * ty +
      v11 * tx * ty
    );
  };
}

function render({ octaves, edgeLow, edgeHigh, seed }) {
  const rng = mulberry32(seed);
  const samplers = octaves.map(([n, weight]) => [octave(n, rng), weight]);
  const totalWeight = octaves.reduce((sum, [, w]) => sum + w, 0);

  // One filter byte (0 = None) per scanline, then one grey byte per pixel.
  const raw = Buffer.alloc(SIZE * SIZE + SIZE);
  let p = 0;
  for (let y = 0; y < SIZE; y++) {
    raw[p++] = 0;
    for (let x = 0; x < SIZE; x++) {
      let v = 0;
      for (const [sample, weight] of samplers) {
        v += sample(x / SIZE, y / SIZE) * weight;
      }
      v /= totalWeight;
      const t = Math.min(1, Math.max(0, (v - edgeLow) / (edgeHigh - edgeLow)));
      // Inverted: the noise's peaks become the gaps the wax skipped over.
      raw[p++] = Math.round((1 - smoothstep(t)) * 255);
    }
  }
  return raw;
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(raw) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(SIZE, 0);
  ihdr.writeUInt32BE(SIZE, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 0; // colour type 0 = greyscale
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const imagesDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "assets",
  "images"
);

for (const variant of VARIANTS) {
  const raw = render(variant);
  const png = encodePng(raw);
  const out = path.join(imagesDir, variant.file);
  fs.writeFileSync(out, png);

  const white = raw.reduce(
    (n, v, i) => (i % (SIZE + 1) === 0 ? n : v > 127 ? n + 1 : n),
    0
  );
  console.log(
    `${variant.file}: ${(png.length / 1024).toFixed(1)} KB, ` +
      `wax kept ${((white / (SIZE * SIZE)) * 100).toFixed(1)}%`
  );
}
