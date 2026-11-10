// Zbalí src/main.js + three.js do jedného samostatného index.html (funguje aj z file://)
import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';
const out = await build({ entryPoints: ['src/main.js'], bundle: true, minify: true, format: 'iife', write: false, target: 'es2020', legalComments: 'none' });
const js = out.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const html = readFileSync('src/template.html', 'utf8').replace('/*SCRIPT*/', () => js);
writeFileSync('index.html', html);
console.log('index.html', (html.length / 1024).toFixed(0) + ' kB');
