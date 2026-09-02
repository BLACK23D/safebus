/**
 * SafeBus PWA icon generator (Task 8 — PWA layer).
 *
 * Renders the SafeBus mark (white front-view bus glyph on a #1976D2 rounded
 * square with a subtle darker-blue diagonal accent) into real PNG files:
 *
 *   /public/icons/icon-192.png       rounded square, slight padding (opaque bg)
 *   /public/icons/icon-512.png       rounded square, slight padding (opaque bg)
 *   /public/icons/maskable-192.png   FULL-BLEED background, glyph within 80% safe zone
 *   /public/icons/maskable-512.png   FULL-BLEED background, glyph within 80% safe zone
 *   /public/icons/apple-touch-icon.png  180x180 opaque full-bleed square (iOS rounds it)
 *   /public/icons/favicon-32.png     32x32 rounded square
 *
 * Run from the project root:  bun scripts/generate-icons.mjs
 */
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const BRAND = '#1976D2'; // SafeBus primary blue
const ACCENT = '#0F4C99'; // darker blue diagonal accent
const WHEEL = '#0C3B66'; // near-navy wheels
const OUT_DIR = path.resolve(process.cwd(), 'public', 'icons');

/** White front-view bus glyph, drawn in local coords centered on (0,0).
 *  Extent: x −33..33, y −36..39 (max dimension 75 units).
 *  Simple: rounded-rect body, windshield, two headlights, two wheels. */
function busGlyph() {
  return `
  <circle cx="-20" cy="30" r="9" fill="${WHEEL}"/>
  <circle cx="20" cy="30" r="9" fill="${WHEEL}"/>
  <rect x="-33" y="-36" width="66" height="62" rx="13" fill="#FFFFFF"/>
  <rect x="-24" y="-27" width="48" height="20" rx="6" fill="${BRAND}"/>
  <rect x="-24" y="8" width="13" height="8" rx="4" fill="${BRAND}"/>
  <rect x="11" y="8" width="13" height="8" rx="4" fill="${BRAND}"/>`;
}

/** Build the full SVG for one icon.
 *  @param {number} size      output pixel size (square)
 *  @param {object} opts
 *  @param {boolean} opts.rounded  rounded-square bg (false = full bleed)
 *  @param {number}  opts.glyphFrac  glyph max-dimension as fraction of canvas
 */
function iconSvg(size, { rounded, glyphFrac }) {
  // Glyph max dimension is 75 local units → scale to the requested fraction.
  const s = (glyphFrac * 100) / 75;
  const bgRx = rounded ? 22.5 : 0;
  // Glyph vertical midpoint is +1.5 local units → optical center at y=48.5.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">
  <defs>
    <clipPath id="bg">
      <rect x="0" y="0" width="100" height="100" rx="${bgRx}"/>
    </clipPath>
  </defs>
  <rect x="0" y="0" width="100" height="100" rx="${bgRx}" fill="${BRAND}"/>
  <g clip-path="url(#bg)">
    <polygon points="0,66 100,26 100,44 0,84" fill="${ACCENT}" opacity="0.30"/>
    <polygon points="0,56 100,16 100,24 0,64" fill="${ACCENT}" opacity="0.18"/>
  </g>
  <g transform="translate(50 48.5) scale(${s.toFixed(4)})">${busGlyph()}</g>
</svg>`;
}

const TARGETS = [
  // Regular icons: opaque rounded-square background, slight padding around glyph.
  { file: 'icon-192.png', size: 192, rounded: true, glyphFrac: 0.62 },
  { file: 'icon-512.png', size: 512, rounded: true, glyphFrac: 0.62 },
  // Maskable: FULL-BLEED background; glyph ~60% keeps it inside the 80% safe zone.
  { file: 'maskable-192.png', size: 192, rounded: false, glyphFrac: 0.58 },
  { file: 'maskable-512.png', size: 512, rounded: false, glyphFrac: 0.58 },
  // Apple touch: full-bleed opaque square (iOS applies its own mask).
  { file: 'apple-touch-icon.png', size: 180, rounded: false, glyphFrac: 0.62 },
  // Favicon: tiny — nudge the glyph up slightly for legibility.
  { file: 'favicon-32.png', size: 32, rounded: true, glyphFrac: 0.66 },
];

await mkdir(OUT_DIR, { recursive: true });

for (const t of TARGETS) {
  const svg = Buffer.from(iconSvg(t.size, { rounded: t.rounded, glyphFrac: t.glyphFrac }));
  const out = path.join(OUT_DIR, t.file);
  // resize() pins the exact output dimensions (SVG is vector, so this is lossless).
  const info = await sharp(svg).resize(t.size, t.size).png({ compressionLevel: 9 }).toFile(out);
  console.log(`✓ ${t.file} — ${info.width}x${info.height}, ${info.size} bytes`);
}

console.log(`\nDone: ${TARGETS.length} icons written to ${OUT_DIR}`);
