/* ============================================================
   GDPR — misura della precisione

   Serve a rispondere a una domanda sola: questo motore trova le
   cose, oppure sembra soltanto che le trovi?

   Due bersagli, non uno
   ---------------------
   La prima versione misurava solo il comma esatto, e dava numeri
   pessimi che nascondevano cosa stesse succedendo davvero: il
   motore trovava l'articolo giusto e sbagliava il comma. Per chi
   cerca sono due errori molto diversi — atterrare sull'articolo
   15 paragrafo 4 invece del paragrafo 1 vuol dire avere la norma
   giusta sotto gli occhi e la citazione da aggiustare; finire
   sull'articolo 61 vuol dire non aver trovato niente.

   Quindi si misurano entrambi e si dichiarano entrambi:
     ARTICOLO   la norma giusta e' in cima. Il numero pratico.
     ESATTO     il comma citato e' esattamente quello. Il severo.

   Le misure:
     P@1   la prima risposta e' giusta. Chi cerca guarda quella.
     P@3   la risposta e' nei primi tre, cioe' senza scorrere.
     MRR   media di 1/posizione: distingue il secondo posto
           dall'ottavo, che P@3 tratterebbe uguale.

   Uso:
     node valuta.mjs                misura
     node valuta.mjs --dettagli     elenca cosa sbaglia
     node valuta.mjs --ablazione    spegne una correzione per volta
   ============================================================ */
import { readFileSync, existsSync } from 'node:fs';
import { creaMotore } from './ricerca.js';

const DETTAGLI = process.argv.includes('--dettagli');
const ABLAZIONE = process.argv.includes('--ablazione');
const leggi = f => JSON.parse(readFileSync(new URL(f, import.meta.url), 'utf8'));

const domande = leggi('./valutazione.json').domande;

/* Un banco di prova che punta a brani inesistenti misura il nulla
   e non se ne accorge nessuno. Quindi si controlla, e si muore
   rumorosamente. */
const brani = leggi('./brani.json');
const perId = new Map(brani.map(b => [b.id, b]));
const fantasmi = [...new Set(domande.flatMap(d => d.attesi))].filter(i => !perId.has(i));
if (fantasmi.length) {
  console.error(`\n  ERRORE: il banco di prova cita brani inesistenti: ${fantasmi.join(', ')}\n`);
  process.exit(1);
}

/* "stessa norma" = stesso tipo e stesso numero. L'articolo 15
   paragrafo 4 e l'articolo 15 paragrafo 1 sono la stessa norma;
   il considerando 15 e l'articolo 15 no. */
const stessaNorma = (esito, attesi) => attesi.some(id => {
  const a = perId.get(id);
  return a.tipo === esito.tipo && a.n === esito.n;
});

function misura(fileIndice, opzioni = {}) {
  const motore = creaMotore(leggi(fileIndice), opzioni);
  const acc = { e1: 0, e3: 0, emrr: 0, a1: 0, a3: 0, amrr: 0 };
  const errori = [];

  for (const { d, attesi } of domande) {
    const esiti = motore.cerca(d, { limite: 10 });
    const pe = esiti.findIndex(e => attesi.includes(e.id));
    const pa = esiti.findIndex(e => stessaNorma(e, attesi));

    if (pe === 0) acc.e1++;
    if (pe >= 0 && pe < 3) acc.e3++;
    if (pe >= 0) acc.emrr += 1 / (pe + 1);
    if (pa === 0) acc.a1++;
    if (pa >= 0 && pa < 3) acc.a3++;
    if (pa >= 0) acc.amrr += 1 / (pa + 1);

    if (pa !== 0) errori.push({ d, attesi, pa, pe, dato: esiti.slice(0, 3).map(e => e.citazione) });
  }

  const n = domande.length;
  return {
    n, errori,
    esatto:   { p1: acc.e1 / n, p3: acc.e3 / n, mrr: acc.emrr / n },
    articolo: { p1: acc.a1 / n, p3: acc.a3 / n, mrr: acc.amrr / n }
  };
}

const pct = x => (x * 100).toFixed(0).padStart(3) + ' %';
const blocco = m => `P@1 ${pct(m.p1)}  P@3 ${pct(m.p3)}  MRR ${m.mrr.toFixed(3)}`;
const riga = (nome, r) =>
  `  ${nome.padEnd(24)}  ${blocco(r.articolo)}   │   ${blocco(r.esatto)}`;

console.log(`\n  ${domande.length} domande, risposta nota in partenza\n`);
console.log(`  ${''.padEnd(24)}  ARTICOLO GIUSTO${''.padEnd(9)}   │   COMMA ESATTO`);
console.log(`  ${'─'.repeat(24)}  ${'─'.repeat(24)}   │   ${'─'.repeat(24)}`);

const conStem = misura('./indice.json');
console.log(riga('motore completo', conStem));

if (existsSync(new URL('./indice-senza-stem.json', import.meta.url))) {
  const senza = misura('./indice-senza-stem.json');
  console.log(riga('senza stemmer', senza));
  const d = (conStem.articolo.p1 - senza.articolo.p1) * domande.length;
  console.log(`\n  Lo stemmer sposta ${d >= 0 ? '+' : ''}${d.toFixed(0)} domande su P@1 articolo.`);
}

if (ABLAZIONE) {
  console.log('\n  Ablazione — una correzione spenta per volta:\n');
  for (const [nome, opz] of [
    ['senza pavimento lungh.',  { lunghezzaMinima: 0 }],
    ['senza peso considerando', { pesoConsiderando: 1 }],
    ['senza fattore copertura', { copertura: 0 }],
    ['senza peso rubrica',      { pesoRubrica: 0 }],
    ['BM25 nudo',               { lunghezzaMinima: 0, pesoConsiderando: 1, copertura: 0, pesoRubrica: 0 }]
  ]) console.log(riga(nome, misura('./indice.json', opz)));
}

console.log(`\n  Domande senza l'articolo giusto in cima: ${conStem.errori.length}`);
if (DETTAGLI) {
  for (const e of conStem.errori) {
    const dove = e.pa < 0 ? 'FUORI dai primi 10' : `posizione ${e.pa + 1}`;
    console.log(`\n    "${e.d}"`);
    console.log(`      atteso  ${e.attesi.join(' | ')}   →  articolo ${dove}`);
    console.log(`      dato    ${e.dato.join('  ·  ')}`);
  }
}
console.log();
