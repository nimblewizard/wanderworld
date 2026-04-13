const { createCanvas, loadImage } = require('canvas');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

// Apple splash screen sizes (portrait) — width x height
const SPLASH_SIZES = [
  { w: 1290, h: 2796, name: 'splash-1290x2796' },  // iPhone 15 Pro Max / 14 Pro Max
  { w: 1179, h: 2556, name: 'splash-1179x2556' },  // iPhone 15 Pro / 14 Pro
  { w: 1170, h: 2532, name: 'splash-1170x2532' },  // iPhone 15 / 14 / 13
  { w: 1080, h: 2340, name: 'splash-1080x2340' },  // iPhone 12 mini
  { w:  828, h: 1792, name: 'splash-828x1792'  },  // iPhone 11 / XR
  { w:  750, h: 1334, name: 'splash-750x1334'  },  // iPhone SE / 8
  { w: 2048, h: 2732, name: 'splash-2048x2732' },  // iPad Pro 12.9"
  { w: 1668, h: 2388, name: 'splash-1668x2388' },  // iPad Pro 11"
  { w: 1536, h: 2048, name: 'splash-1536x2048' },  // iPad Air / Mini
];

function mulberry32(seed) {
  return function() {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function drawSplash(w, h) {
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext('2d');
  const cx = w / 2, cy = h / 2;
  const scale = Math.min(w, h) / 1170; // scale relative to base iPhone 15 size

  // ── Background: deep space gradient ──────────────────────────────────────
  const bgGrad = ctx.createRadialGradient(cx, cy * 0.7, 0, cx, h * 0.5, Math.max(w, h) * 0.85);
  bgGrad.addColorStop(0,    '#0a0f1e');
  bgGrad.addColorStop(0.35, '#060a14');
  bgGrad.addColorStop(0.7,  '#040710');
  bgGrad.addColorStop(1,    '#020408');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, w, h);

  // ── Stars ──────────────────────────────────────────────────────────────────
  const rng = mulberry32(77);
  const starCount = Math.floor(w * h / 3800);
  for (let i = 0; i < starCount; i++) {
    const sx = rng() * w, sy = rng() * h;
    const sr = rng() * 1.1 + 0.2;
    const sa = rng() * 0.5 + 0.15;
    ctx.fillStyle = `rgba(255,255,255,${sa})`;
    ctx.beginPath();
    ctx.arc(sx, sy, sr * scale, 0, Math.PI * 2);
    ctx.fill();
  }

  // ── Globe position: upper-center ──────────────────────────────────────────
  const globeY = cy * 0.68;
  const globeR = Math.min(w * 0.32, h * 0.19);

  // Outer glow
  const outerGlow = ctx.createRadialGradient(cx, globeY, 0, cx, globeY, globeR * 2.2);
  outerGlow.addColorStop(0, 'rgba(14,165,233,0.18)');
  outerGlow.addColorStop(0.4, 'rgba(56,189,248,0.08)');
  outerGlow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = outerGlow;
  ctx.fillRect(0, 0, w, h);

  // ── Globe clip ─────────────────────────────────────────────────────────────
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, globeY, globeR, 0, Math.PI * 2);
  ctx.clip();

  // Globe surface
  const surfGrad = ctx.createRadialGradient(cx - globeR*0.3, globeY - globeR*0.3, 0, cx, globeY, globeR);
  surfGrad.addColorStop(0, '#0d1f35');
  surfGrad.addColorStop(0.6, '#060d1a');
  surfGrad.addColorStop(1, '#020408');
  ctx.fillStyle = surfGrad;
  ctx.fillRect(0, 0, w, h);

  // Latitude lines
  const lw = Math.max(0.5, scale * 1.2);
  ctx.lineWidth = lw;
  for (let lat = -60; lat <= 60; lat += 30) {
    const latR = Math.cos(lat * Math.PI/180) * globeR;
    const latY = globeY + Math.sin(lat * Math.PI/180) * globeR;
    if (latR < 1) continue;
    ctx.strokeStyle = lat === 0 ? 'rgba(56,189,248,0.32)' : 'rgba(56,189,248,0.18)';
    ctx.lineWidth = lat === 0 ? lw * 1.3 : lw;
    ctx.beginPath();
    ctx.ellipse(cx, latY, latR, latR * 0.22, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  // Longitude lines
  ctx.strokeStyle = 'rgba(56,189,248,0.18)';
  ctx.lineWidth = lw;
  for (let lon = 0; lon < 180; lon += 30) {
    const a = lon * Math.PI / 180;
    ctx.beginPath();
    ctx.ellipse(cx, globeY, globeR * Math.abs(Math.cos(a)), globeR, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Continent blobs
  const patches = [
    { x: 0.18, y: -0.05, rx: 0.28, ry: 0.22, a: 0.14 },
    { x: 0.08, y:  0.22, rx: 0.14, ry: 0.20, a: 0.10 },
    { x:-0.08, y: -0.12, rx: 0.22, ry: 0.28, a: 0.13 },
    { x:-0.28, y: -0.08, rx: 0.26, ry: 0.22, a: 0.11 },
    { x:-0.30, y:  0.28, rx: 0.18, ry: 0.12, a: 0.08 },
  ];
  patches.forEach(p => {
    const pg = ctx.createRadialGradient(cx+p.x*globeR, globeY+p.y*globeR, 0, cx+p.x*globeR, globeY+p.y*globeR, globeR*Math.max(p.rx,p.ry));
    pg.addColorStop(0, `rgba(14,165,233,${p.a})`);
    pg.addColorStop(0.5, `rgba(56,189,248,${p.a*0.5})`);
    pg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = pg;
    ctx.beginPath();
    ctx.ellipse(cx+p.x*globeR, globeY+p.y*globeR, globeR*p.rx, globeR*p.ry, 0, 0, Math.PI*2);
    ctx.fill();
  });

  // Fog left half
  const fogEdgeX = cx - globeR * 0.08;
  const fogGrad = ctx.createLinearGradient(cx - globeR, globeY, fogEdgeX + globeR * 0.38, globeY);
  fogGrad.addColorStop(0,    'rgba(3,5,12,0.96)');
  fogGrad.addColorStop(0.55, 'rgba(3,5,12,0.92)');
  fogGrad.addColorStop(0.80, 'rgba(3,5,12,0.72)');
  fogGrad.addColorStop(0.92, 'rgba(3,5,12,0.28)');
  fogGrad.addColorStop(1,    'rgba(3,5,12,0.0)');
  ctx.fillStyle = fogGrad;
  ctx.fillRect(0, 0, w, h);

  // Reveal edge glow
  const edgeW = globeR * 0.055;
  const edgeGrad = ctx.createLinearGradient(fogEdgeX - edgeW, globeY, fogEdgeX + edgeW * 2, globeY);
  edgeGrad.addColorStop(0, 'rgba(56,189,248,0.0)');
  edgeGrad.addColorStop(0.3, 'rgba(56,189,248,0.55)');
  edgeGrad.addColorStop(0.55, 'rgba(200,235,255,0.9)');
  edgeGrad.addColorStop(0.75, 'rgba(56,189,248,0.45)');
  edgeGrad.addColorStop(1, 'rgba(56,189,248,0.0)');
  ctx.fillStyle = edgeGrad;
  ctx.fillRect(fogEdgeX - edgeW, globeY - globeR, edgeW * 3, globeR * 2);

  // Specular
  const specGrad = ctx.createRadialGradient(cx+globeR*0.3, globeY-globeR*0.35, 0, cx+globeR*0.3, globeY-globeR*0.35, globeR*0.55);
  specGrad.addColorStop(0, 'rgba(255,255,255,0.14)');
  specGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = specGrad;
  ctx.fillRect(0, 0, w, h);

  ctx.restore(); // end globe clip

  // Globe ring
  ctx.strokeStyle = 'rgba(56,189,248,0.4)';
  ctx.lineWidth = Math.max(1.5, scale * 2.5);
  ctx.beginPath();
  ctx.arc(cx, globeY, globeR, 0, Math.PI * 2);
  ctx.stroke();

  // W mark
  const wSize = globeR * 0.24;
  drawW(ctx, cx, globeY + globeR * 0.05, wSize, scale);

  // ── WANDERWORLD text ──────────────────────────────────────────────────────
  const textY = globeY + globeR * 1.38;
  const fontSize = Math.round(scale * 52);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Text glow
  ctx.shadowColor = 'rgba(56,189,248,0.6)';
  ctx.shadowBlur = scale * 28;

  ctx.font = `700 ${fontSize}px "Arial Narrow", Arial, sans-serif`;
  // Letter-spaced WANDERWORLD — draw char by char for spacing
  const title = 'WANDERWORLD';
  const letterSpacing = scale * 8;
  ctx.fillStyle = '#ffffff';
  drawLetterSpaced(ctx, title, cx, textY, fontSize, letterSpacing);

  // Reset shadow
  ctx.shadowBlur = 0;

  // Tagline
  const tagY = textY + fontSize * 1.28;
  const tagSize = Math.round(scale * 22);
  ctx.font = `400 ${tagSize}px Arial, sans-serif`;
  ctx.fillStyle = 'rgba(147,213,255,0.65)';
  ctx.letterSpacing = `${scale * 4}px`;
  ctx.fillText('EXPLORE · LIFT THE FOG · DISCOVER', cx, tagY);

  // Subtle bottom vignette
  const vigGrad = ctx.createLinearGradient(0, h * 0.75, 0, h);
  vigGrad.addColorStop(0, 'rgba(2,4,8,0)');
  vigGrad.addColorStop(1, 'rgba(2,4,8,0.7)');
  ctx.fillStyle = vigGrad;
  ctx.fillRect(0, 0, w, h);

  return canvas;
}

function drawLetterSpaced(ctx, text, cx, cy, fontSize, spacing) {
  // Measure total width
  const chars = text.split('');
  const widths = chars.map(c => ctx.measureText(c).width);
  const totalW = widths.reduce((a, b) => a + b, 0) + spacing * (chars.length - 1);
  let x = cx - totalW / 2;
  chars.forEach((c, i) => {
    ctx.fillText(c, x + widths[i] / 2, cy);
    x += widths[i] + spacing;
  });
}

function drawW(ctx, cx, cy, s, scale) {
  const pts = [
    [cx - s,     cy - s * 0.55],
    [cx - s*0.5, cy + s * 0.55],
    [cx,         cy - s * 0.1 ],
    [cx + s*0.5, cy + s * 0.55],
    [cx + s,     cy - s * 0.55],
  ];
  // Glow
  const wGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, s * 1.5);
  wGlow.addColorStop(0, 'rgba(56,189,248,0.20)');
  wGlow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = wGlow;
  ctx.beginPath(); ctx.arc(cx, cy, s*1.5, 0, Math.PI*2); ctx.fill();

  ctx.beginPath();
  ctx.moveTo(...pts[0]);
  pts.slice(1).forEach(p => ctx.lineTo(...p));
  ctx.strokeStyle = 'rgba(255,255,255,0.88)';
  ctx.lineWidth = Math.max(2, scale * 3.5);
  ctx.lineJoin = 'miter';
  ctx.miterLimit = 5;
  ctx.stroke();

  // Accent dot
  ctx.fillStyle = 'rgba(56,189,248,0.9)';
  ctx.beginPath(); ctx.arc(cx, pts[2][1], Math.max(2, scale*3.2), 0, Math.PI*2); ctx.fill();
}

// ── Generate ──────────────────────────────────────────────────────────────────
const outDir = path.join(__dirname, 'splash');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);

async function generateAll() {
  for (const s of SPLASH_SIZES) {
    const canvas = drawSplash(s.w, s.h);
    const buf = canvas.toBuffer('image/png');
    await sharp(buf)
      .png({ compressionLevel: 8 })
      .toFile(path.join(outDir, `${s.name}.png`));
    console.log(`✓ ${s.name}.png  (${s.w}×${s.h})`);
  }
  console.log('Done.');
}

generateAll().catch(console.error);
