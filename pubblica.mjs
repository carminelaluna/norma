/* ============================================================
   Norma — prepara la cartella da pubblicare

   Mette in dist/ i soli file che servono a far funzionare la
   pagina. Quella cartella si carica dove capita — GitHub Pages,
   Netlify, una sottocartella di un dominio, un sottodominio come
   norma.17labs.it — senza dipendere da nient'altro.

   Cosa resta fuori, e perche':
     sorgente/               826 KB di HTML EUR-Lex, si riscarica
     estrai.py               attrezzo di costruzione
     indicizza.mjs           attrezzo di costruzione
     valuta.mjs              banco di prova
     valutazione.json        le 45 domande
     indice-senza-stem.json  indice di controllo, solo per misurare
     brani.json              file di lavoro: la pagina usa testi.json
     anteprima.cmd           serve solo qui
     README.md               documentazione

   Sono gli attrezzi, non il prodotto.

   Uso:  node pubblica.mjs
   ============================================================ */
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, rmSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const QUI = dirname(fileURLToPath(import.meta.url));
const DIST = join(QUI, 'dist');

const DA_COPIARE = ['index.html', 'stile.css', 'app.js', 'ricerca.js', 'indice.json', 'testi.json'];

const mancanti = DA_COPIARE.filter(f => !existsSync(join(QUI, f)));
if (mancanti.length) {
  console.error(`\n  Mancano: ${mancanti.join(', ')}`);
  console.error('  Ricostruisci con:  python estrai.py  &&  node indicizza.mjs\n');
  process.exit(1);
}

/* L'ordine di testi.json deve corrispondere a quello dell'indice:
   e' l'unica cosa che li tiene insieme, e se si rompe la pagina
   mostrerebbe il testo sbagliato sotto la citazione giusta — il
   guasto peggiore possibile per uno strumento che vende esattezza. */
const indice = JSON.parse(readFileSync(join(QUI, 'indice.json'), 'utf8'));
const testi = JSON.parse(readFileSync(join(QUI, 'testi.json'), 'utf8'));
if (indice.brani.length !== testi.length) {
  console.error(`\n  indice.json ha ${indice.brani.length} brani, testi.json ne ha ${testi.length}.`);
  console.error('  Rilancia:  node indicizza.mjs\n');
  process.exit(1);
}

rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });
for (const f of DA_COPIARE) copyFileSync(join(QUI, f), join(DIST, f));
writeFileSync(join(DIST, '.nojekyll'), '');   // per GitHub Pages

const kb = n => (n / 1024).toFixed(0).padStart(5) + ' KB';
let tot = 0, totZip = 0;
console.log(`\n  pronto in  ${DIST}\n`);
for (const f of DA_COPIARE) {
  const b = readFileSync(join(DIST, f));
  const z = gzipSync(b).length;
  tot += b.length; totZip += z;
  console.log(`  ${f.padEnd(13)} ${kb(b.length)}   ${kb(z)} compresso`);
}
console.log(`  ${'─'.repeat(13)} ${'─'.repeat(8)}   ${'─'.repeat(18)}`);
console.log(`  ${'totale'.padEnd(13)} ${kb(tot)}   ${kb(totZip)} compresso`);
console.log(`\n  Carica il contenuto di dist/ dove vuoi: non ha percorsi assoluti`);
console.log(`  ne' dipendenze esterne, quindi funziona anche in sottocartella.\n`);
