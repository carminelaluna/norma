/* ============================================================
   GDPR — costruzione dell'indice
   brani.json  ->  indice.json

   Gira con Node in fase di build, e usa lo stesso tokenizzatore
   che poi usera' il browser (ricerca.js). E' l'unico modo di
   garantire che documenti e domande vengano trattati allo stesso
   modo.

   Uso:  node indicizza.mjs [--senza-stem]
   ============================================================ */
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { tokenizza } from './ricerca.js';

const SENZA_STEM = process.argv.includes('--senza-stem');
const USCITA = SENZA_STEM ? 'indice-senza-stem.json' : 'indice.json';

/* Due campi separati, non un sacchetto solo.

   La prima versione metteva la rubrica dentro il corpo, ripetuta
   tre volte per pesarla di piu'. Sembra ragionevole e non lo e':
   tutti i commi di uno stesso articolo condividono la rubrica,
   quindi diventano quasi indistinguibili, e a quel punto la
   normalizzazione per lunghezza di BM25 fa vincere il piu' corto.
   La misura lo mostrava chiaramente — per "diritto di accesso
   dell'interessato" usciva l'articolo 15 paragrafo 4, che e' una
   riga di chiusura, prima del paragrafo 1, che e' la norma.

   Tenendoli separati, la rubrica viene normalizzata sulla propria
   lunghezza — identica per tutti i commi dell'articolo — e quindi
   non decide piu' quale comma vince: sceglie l'articolo giusto,
   e poi e' il corpo a scegliere il comma. Che e' esattamente il
   comportamento che si vuole. */
const brani = JSON.parse(readFileSync(new URL('./brani.json', import.meta.url), 'utf8'));

const postings = new Map();        // corpo:   termine -> [doc, tf, ...]
const postingsRub = new Map();     // rubrica: termine -> [doc, tf, ...]
const lunghezze = new Int32Array(brani.length);
const lunghezzeRub = new Int32Array(brani.length);

function riempi(mappa, termini, doc) {
  const frequenze = new Map();
  for (const t of termini) frequenze.set(t, (frequenze.get(t) || 0) + 1);
  for (const [t, tf] of frequenze) {
    if (!mappa.has(t)) mappa.set(t, []);
    mappa.get(t).push(doc, tf);
  }
}

brani.forEach((b, i) => {
  const corpo = tokenizza(b.testo, { stem: !SENZA_STEM });
  const rubrica = tokenizza(b.rubrica || '', { stem: !SENZA_STEM });
  lunghezze[i] = corpo.length;
  lunghezzeRub[i] = rubrica.length;
  riempi(postings, corpo, i);
  riempi(postingsRub, rubrica, i);
});

const media = a => a.reduce((x, y) => x + y, 0) / (a.length || 1);
const mediaLunghezza = media(Array.from(lunghezze));
// i considerando non hanno rubrica: la media si calcola su chi ce l'ha,
// altrimenti gli zeri la schiacciano e il campo pesa troppo
const conRubrica = Array.from(lunghezzeRub).filter(x => x > 0);
const mediaLunghezzaRub = media(conRubrica);

/* Nell'indice il testo non serve: serve solo a mostrare il
   risultato. Resta in brani.json, che la pagina carica a parte,
   cosi' la ricerca parte prima di aver scaricato tutto. */
/* Niente data di costruzione qui dentro.

   C'era, ed era un difetto: un timestamp rende il file diverso a
   ogni ricostruzione, quindi l'indice non e' piu' riproducibile e
   la verifica automatica "l'indice corrisponde ai brani?"
   fallirebbe ogni giorno per un motivo falso. L'ha trovato la
   verifica stessa, il giorno dopo averla scritta.

   Quando serve sapere da cosa e' stato costruito, lo dice git. */
const indice = {
  fonte: 'EUR-Lex CELEX 32016R0679 (IT) — riuso ex decisione 2011/833/UE',
  stem: !SENZA_STEM,
  mediaLunghezza,
  mediaLunghezzaRub,
  lunghezze: Array.from(lunghezze),
  lunghezzeRub: Array.from(lunghezzeRub),
  postings: Object.fromEntries(postings),
  postingsRub: Object.fromEntries(postingsRub),
  brani: brani.map(b => ({
    id: b.id, tipo: b.tipo, n: b.n, par: b.par ?? null,
    citazione: b.citazione, rubrica: b.rubrica, capo: b.capo,
    termine: b.termine ?? undefined
  }))
};

writeFileSync(new URL(`./${USCITA}`, import.meta.url), JSON.stringify(indice));

/* testi.json: i soli testi, nell'ordine dell'indice.

   brani.json contiene testo E metadati, ma i metadati stanno gia'
   dentro indice.json: spedirli due volte regalerebbe un centinaio
   di KB a ogni visita. La pagina carica indice.json + testi.json e
   ignora brani.json, che resta un file di lavoro.

   Viene scritto qui e non da uno script di pubblicazione a parte
   cosi' la cartella e' pronta all'uso appena finito di indicizzare:
   niente passaggi intermedi da ricordare. */
if (!SENZA_STEM) {
  writeFileSync(new URL('./testi.json', import.meta.url),
                JSON.stringify(brani.map(b => b.testo)));
}

const grezzo = statSync(new URL(`./${USCITA}`, import.meta.url)).size;
const compresso = gzipSync(readFileSync(new URL(`./${USCITA}`, import.meta.url))).length;
const testi = statSync(new URL('./brani.json', import.meta.url)).size;
const testiCompressi = gzipSync(readFileSync(new URL('./brani.json', import.meta.url))).length;

const kb = n => (n / 1024).toFixed(0).padStart(5) + ' KB';
console.log();
console.log(`  stemmer          ${SENZA_STEM ? 'disattivato' : 'attivo'}`);
console.log(`  brani            ${String(brani.length).padStart(5)}`);
console.log(`  termini distinti ${String(postings.size).padStart(5)}`);
console.log(`  lunghezza media  ${mediaLunghezza.toFixed(0).padStart(5)} termini per brano`);
console.log();
console.log(`  ${USCITA.padEnd(16)} ${kb(grezzo)}   ${kb(compresso)} compresso`);
console.log(`  brani.json       ${kb(testi)}   ${kb(testiCompressi)} compresso  (di lavoro)`);
if (!SENZA_STEM) {
  const t = statSync(new URL('./testi.json', import.meta.url)).size;
  const tc = gzipSync(readFileSync(new URL('./testi.json', import.meta.url))).length;
  console.log(`  testi.json       ${kb(t)}   ${kb(tc)} compresso`);
}
console.log(`  ${'totale sul filo'.padEnd(16)} ${kb(grezzo + testi)}   ${kb(compresso + testiCompressi)} compresso`);
console.log();
