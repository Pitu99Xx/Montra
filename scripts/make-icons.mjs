// Genera el logo (variante B4 con la «M» de Playfair Display) como SVG de trazados
// y los PNG de la PWA. Uso: npm run icons  (los PNG requieren Playwright instalado)
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import opentype from 'opentype.js';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const fontFile = path.join(root, 'node_modules/@fontsource/playfair-display/files/playfair-display-latin-600-normal.woff');
const buf = readFileSync(fontFile);
const font = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));

const NAVY = '#07101F';
const GOLD = '#C9A45C';

// «M» centrada en (80, 80) con una altura de 50 unidades (viewBox 160)
function mPath(targetHeight = 50) {
  const probe = font.getPath('M', 0, 0, 100).getBoundingBox();
  const size = (100 * targetHeight) / (probe.y2 - probe.y1);
  const bb = font.getPath('M', 0, 0, size).getBoundingBox();
  const x = 80 - (bb.x1 + bb.x2) / 2;
  const y = 80 - (bb.y1 + bb.y2) / 2;
  return font.getPath('M', x, y, size).toPathData(2);
}

const M = mPath();
const RING = 'M126.98 62.9A50 50 0 1 1 97.1 33';
const mark = (gold, stroke = 5) =>
  `<path d="${RING}" fill="none" stroke="${gold}" stroke-width="${stroke}" stroke-linecap="round"/>` +
  `<circle cx="115.4" cy="44.6" r="${stroke + 1}" fill="${gold}"/>` +
  `<path d="${M}" fill="${gold}"/>`;

const svg = (body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160">${body}</svg>\n`;

const out = path.join(root, 'public/icons');
mkdirSync(out, { recursive: true });
const files = {
  // Favicon / logo con esquinas redondeadas
  'icon.svg': svg(`<rect width="160" height="160" rx="36" fill="${NAVY}"/>${mark(GOLD, 7)}`),
  // A sangre: iOS y Android aplican su propia máscara
  'icon-square.svg': svg(`<rect width="160" height="160" fill="${NAVY}"/>${mark(GOLD, 6)}`),
};
for (const [name, content] of Object.entries(files)) writeFileSync(path.join(out, name), content);

// Trazados para el componente <Logo /> de la app
writeFileSync(
  path.join(root, 'src/components/logoPaths.ts'),
  `// Generado por scripts/make-icons.mjs — no editar a mano\nexport const LOGO_M = '${M}';\nexport const LOGO_RING = '${RING}';\n`
);

// PNG con Playwright (Chromium)
try {
  const globalRoot = execSync('npm root -g').toString().trim();
  const req = createRequire(path.join(globalRoot, 'noop.js'));
  const { chromium } = req('playwright');
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const pngs = [
    ['icon-square.svg', 'apple-touch-icon.png', 180],
    ['icon-square.svg', 'icon-192.png', 192],
    ['icon-square.svg', 'icon-512.png', 512],
    ['icon-square.svg', 'icon-maskable-512.png', 512],
    ['icon.svg', 'favicon-32.png', 32],
  ];
  for (const [src, dest, size] of pngs) {
    const content = readFileSync(path.join(out, src), 'utf8');
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(
      `<html><body style="margin:0;background:transparent">${content.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`
    );
    await page.locator('svg').screenshot({ path: path.join(out, dest), omitBackground: true });
  }
  await browser.close();
  console.log('Iconos PNG generados');
} catch (err) {
  console.warn('No se pudieron generar los PNG (¿falta Playwright?):', err.message);
}
