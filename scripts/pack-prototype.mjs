// Packs the prototype build (dist-demo, made with VITE_DEMO=1) into one page plus its two
// pictures, ready to publish as the private prototype page. Usage: node scripts/pack-prototype.mjs <out dir>
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const out = process.argv[2] || 'prototype-out';
const dist = 'dist-demo';
const html = readFileSync(join(dist, 'index.html'), 'utf8');
const js = readdirSync(join(dist, 'assets')).filter(f => f.endsWith('.js'));
const css = readdirSync(join(dist, 'assets')).filter(f => f.endsWith('.css'));
if (js.length !== 1) throw new Error(`expected one script, found ${js.length}`);
let code = readFileSync(join(dist, 'assets', js[0]), 'utf8');
// an inline script must not contain its own closing tag
code = code.replace(/<\/script/gi, '<\\/script');
const style = css.map(f => readFileSync(join(dist, 'assets', f), 'utf8')).join('\n').replace(/<\/style/gi, '<\\/style');
const fonts = (html.match(/<link rel="(?:preconnect|stylesheet)" href="https:\/\/fonts\.[^"]+"[^>]*>/g) || []).join('\n');
const page = `<title>Goose Prototype</title>
${fonts}
<style>${style}</style>
<div id="root"></div>
<script type="module">${code}</script>
`;
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'goose-prototype.html'), page);
for (const f of ['goose.png', 'goose-tile-96.png']) copyFileSync(join('public', f), join(out, f));
console.log(`packed ${Math.round(page.length / 1024)} KB into ${out}/goose-prototype.html`);
