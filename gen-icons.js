const { createCanvas } = require('canvas');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

// WanderWorld icon: dark cosmos bg, glowing globe with fog-of-war lifting effect
// Left ~40% = dense fog (dark navy/black), right ~60% = revealed (cyan-blue glow)
// Globe wireframe grid visible through both halves
// Subtle "W" compass shape at center

function drawIcon(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const cx = size / 2, cy = size / 2, r = size / 2;

  // ── Background: deep space ──────────────────────────────────────────────
  const bgGrad = ctx.createRadialGradient(cx, cy * 0.85, 0, cx, cy, r * 1.05);
  bgGrad.addColorStop(0, '#0a0e1a');
  bgGrad.addColorStop(0.6, '#05080f');
  bgGrad.addColorStop(1, '#020305');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, size, size);

  // ── Subtle star field ───────────────────────────────────────────────────
  if (size >= 128) {
    const starCount = Math.floor(size * 0.18);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    const rng = mulberry32(42); // deterministic
    for (let i = 0; i < starCount; i++) {
      const sx = rng() * size, sy = rng() * size;
      const sr = rng() * 0.9 + 0.2;
      // Keep stars outside the globe area
      const dx = sx - cx, dy = sy - cy;
      if (Math.sqrt(dx*dx+dy*dy) < r * 0.54) continue;
      ctx.beginPath();
      ctx.arc(sx, sy, sr * (size/512), 0, Math.PI*2);
      ctx.fill();
    }
  }

  const globeR = r * 0.62;

  // ── Globe base glow (revealed side) ────────────────────────────────────
  const glowGrad = ctx.createRadialGradient(cx + globeR*0.15, cy - globeR*0.1, 0, cx, cy, globeR * 1.35);
  glowGrad.addColorStop(0, 'rgba(56,189,248,0.22)');
  glowGrad.addColorStop(0.45, 'rgba(14,165,233,0.14)');
  glowGrad.addColorStop(0.75, 'rgba(99,102,241,0.08)');
  glowGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glowGrad;
  ctx.fillRect(0, 0, size, size);

  // ── Clip to globe circle for all globe drawing ──────────────────────────
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, globeR, 0, Math.PI * 2);
  ctx.clip();

  // Globe surface — dark ocean base
  const surfGrad = ctx.createRadialGradient(cx - globeR*0.28, cy - globeR*0.28, 0, cx, cy, globeR);
  surfGrad.addColorStop(0, '#0d1f35');
  surfGrad.addColorStop(0.55, '#060d1a');
  surfGrad.addColorStop(1, '#020509');
  ctx.fillStyle = surfGrad;
  ctx.fillRect(0, 0, size, size);

  // ── Latitude lines ──────────────────────────────────────────────────────
  const gridAlpha = size < 96 ? 0.18 : 0.22;
  ctx.strokeStyle = `rgba(56,189,248,${gridAlpha})`;
  ctx.lineWidth = Math.max(0.5, size / 512 * 0.9);
  for (let lat = -60; lat <= 60; lat += 30) {
    const latR = Math.cos(lat * Math.PI/180) * globeR;
    const latY = cy + Math.sin(lat * Math.PI/180) * globeR;
    if (latR > 1) {
      ctx.beginPath();
      ctx.ellipse(cx, latY, latR, latR * 0.22, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  // Equator slightly brighter
  ctx.strokeStyle = `rgba(56,189,248,${gridAlpha * 1.5})`;
  ctx.lineWidth = Math.max(0.6, size / 512 * 1.1);
  ctx.beginPath();
  ctx.ellipse(cx, cy, globeR, globeR * 0.22, 0, 0, Math.PI * 2);
  ctx.stroke();

  // ── Longitude lines ─────────────────────────────────────────────────────
  ctx.strokeStyle = `rgba(56,189,248,${gridAlpha})`;
  ctx.lineWidth = Math.max(0.5, size / 512 * 0.9);
  for (let lon = 0; lon < 180; lon += 30) {
    const angle = lon * Math.PI / 180;
    const xScale = Math.abs(Math.cos(angle));
    ctx.beginPath();
    ctx.ellipse(cx, cy, globeR * xScale, globeR, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  // ── Revealed territory patches (stylized continents as glowing blobs) ──
  const patches = [
    { x: 0.18, y: -0.05, rx: 0.28, ry: 0.22, a: 0.13 }, // N America
    { x: 0.08, y:  0.22, rx: 0.14, ry: 0.20, a: 0.10 }, // S America
    { x:-0.08, y: -0.12, rx: 0.22, ry: 0.28, a: 0.14 }, // Europe/Africa
    { x:-0.28, y: -0.08, rx: 0.26, ry: 0.22, a: 0.12 }, // Asia
    { x:-0.30, y:  0.28, rx: 0.18, ry: 0.12, a: 0.09 }, // Australia
  ];
  patches.forEach(p => {
    const pg = ctx.createRadialGradient(
      cx + p.x*globeR, cy + p.y*globeR, 0,
      cx + p.x*globeR, cy + p.y*globeR, globeR * Math.max(p.rx, p.ry)
    );
    pg.addColorStop(0, `rgba(14,165,233,${p.a})`);
    pg.addColorStop(0.5, `rgba(56,189,248,${p.a * 0.5})`);
    pg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = pg;
    ctx.beginPath();
    ctx.ellipse(cx + p.x*globeR, cy + p.y*globeR, globeR*p.rx, globeR*p.ry, 0, 0, Math.PI*2);
    ctx.fill();
  });

  // ── FOG OVERLAY — covers left 45% of globe ──────────────────────────────
  // Use a soft-edge fog that blends at the reveal boundary
  const fogEdgeX = cx - globeR * 0.08; // fog/reveal boundary slightly left of center
  const fogGrad = ctx.createLinearGradient(cx - globeR, cy, fogEdgeX + globeR * 0.38, cy);
  fogGrad.addColorStop(0,    'rgba(3,5,12,0.96)');
  fogGrad.addColorStop(0.55, 'rgba(3,5,12,0.92)');
  fogGrad.addColorStop(0.80, 'rgba(3,5,12,0.72)');
  fogGrad.addColorStop(0.92, 'rgba(3,5,12,0.30)');
  fogGrad.addColorStop(1,    'rgba(3,5,12,0.0)');
  ctx.fillStyle = fogGrad;
  ctx.fillRect(0, 0, size, size);

  // ── Fog texture — subtle particle noise on the fog side ─────────────────
  if (size >= 128) {
    const rng2 = mulberry32(99);
    for (let i = 0; i < 60; i++) {
      const px = (cx - globeR) + rng2() * (globeR * 0.88);
      const py = cy - globeR + rng2() * globeR * 2;
      const pr = rng2() * (globeR * 0.06) + globeR * 0.015;
      const pa = rng2() * 0.04 + 0.02;
      ctx.fillStyle = `rgba(56,189,248,${pa})`;
      ctx.beginPath();
      ctx.arc(px, py, pr * (size/512), 0, Math.PI*2);
      ctx.fill();
    }
  }

  // ── Reveal edge glow — bright cyan line where fog meets revealed ─────────
  const edgeGlowW = globeR * (size < 96 ? 0.04 : 0.055);
  const edgeGrad = ctx.createLinearGradient(fogEdgeX - edgeGlowW, cy, fogEdgeX + edgeGlowW * 2, cy);
  edgeGrad.addColorStop(0, 'rgba(56,189,248,0.0)');
  edgeGrad.addColorStop(0.3, 'rgba(56,189,248,0.55)');
  edgeGrad.addColorStop(0.55, 'rgba(147,213,255,0.85)');
  edgeGrad.addColorStop(0.75, 'rgba(56,189,248,0.45)');
  edgeGrad.addColorStop(1, 'rgba(56,189,248,0.0)');
  ctx.fillStyle = edgeGrad;
  ctx.fillRect(fogEdgeX - edgeGlowW, cy - globeR, edgeGlowW * 3, globeR * 2);

  // ── Specular highlight (top-right) ──────────────────────────────────────
  const specGrad = ctx.createRadialGradient(
    cx + globeR * 0.3, cy - globeR * 0.35, 0,
    cx + globeR * 0.3, cy - globeR * 0.35, globeR * 0.55
  );
  specGrad.addColorStop(0, 'rgba(255,255,255,0.15)');
  specGrad.addColorStop(0.4, 'rgba(147,213,255,0.07)');
  specGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = specGrad;
  ctx.fillRect(0, 0, size, size);

  ctx.restore(); // end globe clip

  // ── Globe border ring ────────────────────────────────────────────────────
  ctx.strokeStyle = 'rgba(56,189,248,0.35)';
  ctx.lineWidth = Math.max(1, size / 512 * 2.5);
  ctx.beginPath();
  ctx.arc(cx, cy, globeR, 0, Math.PI * 2);
  ctx.stroke();

  // Subtle outer ring glow
  ctx.strokeStyle = 'rgba(56,189,248,0.12)';
  ctx.lineWidth = Math.max(1, size / 512 * 5);
  ctx.beginPath();
  ctx.arc(cx, cy, globeR + size/512 * 2, 0, Math.PI * 2);
  ctx.stroke();

  // ── "W" compass mark at center ───────────────────────────────────────────
  if (size >= 96) {
    const wSize = globeR * (size < 192 ? 0.28 : 0.24);
    const wY = cy + globeR * 0.05;
    drawCompassW(ctx, cx, wY, wSize, size);
  }

  return canvas;
}

// Stylized W made of four compass-point triangles meeting at center
function drawCompassW(ctx, cx, cy, s, iconSize) {
  const alpha = iconSize < 192 ? 0.7 : 0.85;
  ctx.save();

  // Glow behind W
  const wGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, s * 1.4);
  wGlow.addColorStop(0, `rgba(56,189,248,0.22)`);
  wGlow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = wGlow;
  ctx.beginPath();
  ctx.arc(cx, cy, s * 1.4, 0, Math.PI * 2);
  ctx.fill();

  // Classic W — 5 points
  const pts = [
    [cx - s,     cy - s * 0.55],  // top-left
    [cx - s*0.5, cy + s * 0.55],  // bottom inner-left
    [cx,         cy - s * 0.1 ],  // center top
    [cx + s*0.5, cy + s * 0.55],  // bottom inner-right
    [cx + s,     cy - s * 0.55],  // top-right
  ];

  // Draw W stroke
  ctx.beginPath();
  ctx.moveTo(...pts[0]);
  pts.slice(1).forEach(p => ctx.lineTo(...p));
  ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
  ctx.lineWidth = Math.max(1.5, iconSize / 512 * 3.5);
  ctx.lineJoin = 'miter';
  ctx.miterLimit = 6;
  ctx.stroke();

  // Bright dot at center-top of W
  ctx.fillStyle = `rgba(56,189,248,${alpha})`;
  ctx.beginPath();
  ctx.arc(cx, pts[2][1], Math.max(1.5, iconSize/512 * 3), 0, Math.PI*2);
  ctx.fill();

  // Dots at tips
  const tipAlpha = alpha * 0.6;
  ctx.fillStyle = `rgba(147,213,255,${tipAlpha})`;
  [[pts[0]], [pts[4]]].forEach(([p]) => {
    ctx.beginPath();
    ctx.arc(p[0], p[1], Math.max(1, iconSize/512 * 2), 0, Math.PI*2);
    ctx.fill();
  });

  ctx.restore();
}

// Deterministic PRNG for consistent star patterns
function mulberry32(seed) {
  return function() {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// ── Generate all sizes ────────────────────────────────────────────────────
const sizes = [72, 96, 128, 144, 152, 192, 384, 512];
const outDir = path.join(__dirname, 'icons');

async function generateAll() {
  for (const size of sizes) {
    const canvas = drawIcon(size);
    const buf = canvas.toBuffer('image/png');

    // Use sharp to write with proper PNG compression
    await sharp(buf)
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .toFile(path.join(outDir, `icon-${size}.png`));

    console.log(`✓ icon-${size}.png`);
  }

  // Also generate a maskable variant (512px, with safe zone padding ~10%)
  // Maskable icons need content within the inner 80% circle
  await generateMaskable();
  console.log('✓ icon-512-maskable.png');
  console.log('Done.');
}

async function generateMaskable() {
  const size = 512;
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  // Full bleed dark background
  const bgGrad = ctx.createRadialGradient(size/2, size/2 * 0.9, 0, size/2, size/2, size * 0.7);
  bgGrad.addColorStop(0, '#0c1220');
  bgGrad.addColorStop(0.6, '#060a12');
  bgGrad.addColorStop(1, '#020408');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, size, size);

  // Scale globe down to fit safe zone (80% of width = 409px, so globe fits in ~200px radius)
  ctx.save();
  ctx.translate(size/2, size/2);
  ctx.scale(0.76, 0.76);
  ctx.translate(-size/2, -size/2);

  const inner = drawIcon(size);
  ctx.drawImage(inner, 0, 0);
  ctx.restore();

  const buf = canvas.toBuffer('image/png');
  await sharp(buf)
    .png({ compressionLevel: 9 })
    .toFile(path.join(__dirname, 'icons', 'icon-512-maskable.png'));
}

generateAll().catch(console.error);
