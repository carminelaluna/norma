/* ============================================================
   Norma — l'interfaccia

   Tutto il sapere sta in ricerca.js, che e' lo stesso file usato
   da Node per costruire l'indice e per misurarlo. Qui dentro c'e'
   soltanto: caricare due file, chiamare cerca(), disegnare.

   Se un giorno i risultati sulla pagina non coincidessero con
   quelli di `node valuta.mjs`, il colpevole sarebbe in questo
   file — perche' il motore, letteralmente, e' lo stesso oggetto.
   ============================================================ */
import { creaMotore, radice, normalizza } from './ricerca.js';

const $ = s => document.querySelector(s);
const campo = $('#q');
const stato = $('#stato');
const esiti = $('#esiti');
const messaggio = $('#messaggio');

const SUGGERIMENTI = [
  'entro quando devo segnalare una violazione al garante',
  'chi è il titolare del trattamento',
  'quando serve una valutazione d\'impatto',
  'posso mandare i dati negli stati uniti',
  'art. 17'
];

let motore = null;
let testi = null;

/* ------------------------------------------------------------
   Avvio: due file in parallelo.

   indice.json ha le postings e i metadati; testi.json ha solo i
   testi, nello stesso ordine. Sono separati perche' l'indice
   basterebbe a cercare: se un giorno servisse far partire la
   ricerca prima di aver scaricato tutto, la divisione e' gia'
   fatta.
   ------------------------------------------------------------ */
async function avvia() {
  const t0 = performance.now();
  try {
    const [indice, corpi] = await Promise.all([
      fetch('indice.json').then(r => { if (!r.ok) throw new Error('indice.json'); return r.json(); }),
      fetch('testi.json').then(r => { if (!r.ok) throw new Error('testi.json'); return r.json(); })
    ]);
    testi = corpi;
    motore = creaMotore(indice);

    campo.disabled = false;
    stato.textContent = `${indice.brani.length} brani · pronti in ${Math.round(performance.now() - t0)} ms`;
    campo.focus();

    const casa = $('#suggerimenti');
    for (const s of SUGGERIMENTI) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = s;
      b.addEventListener('click', () => { campo.value = s; interroga(); campo.focus(); });
      casa.append(b);
    }
  } catch (err) {
    stato.textContent = '';
    const p = document.createElement('p');
    p.className = 'niente';
    p.textContent = "Non sono riuscito a caricare l'indice. "
      + 'Se hai aperto il file con un doppio click serve un server: '
      + 'il protocollo file:// blocca i moduli JavaScript.';
    messaggio.replaceChildren(p);
  }
}

/* ------------------------------------------------------------
   Evidenziazione.

   Si costruisce con nodi del DOM e non con innerHTML: il testo
   viene da un file JSON, quindi e' dato, e infilarlo in innerHTML
   e' il modo classico di trasformare un dato in codice. Qui non
   c'e' input di terzi, ma l'abitudine giusta si prende sui casi
   in cui non serve.

   Il confronto avviene sulle radici, non sulle parole: la domanda
   dice "notificare" e il testo dice "notifica", e devono
   accendersi lo stesso.
   ------------------------------------------------------------ */
function evidenzia(testo, radici) {
  const frammento = document.createDocumentFragment();
  const parole = /[\p{L}\p{N}]+/gu;
  let ultimo = 0, m;
  while ((m = parole.exec(testo)) !== null) {
    if (m.index > ultimo) frammento.append(testo.slice(ultimo, m.index));
    const r = radice(normalizza(m[0]).trim());
    if (r && radici.has(r)) {
      const mark = document.createElement('mark');
      mark.textContent = m[0];
      frammento.append(mark);
    } else {
      frammento.append(m[0]);
    }
    ultimo = m.index + m[0].length;
  }
  if (ultimo < testo.length) frammento.append(testo.slice(ultimo));
  return frammento;
}

function disegnaScheda(r, radici) {
  const art = document.createElement('article');
  art.className = 'scheda';

  const capo = document.createElement('div');
  capo.className = 'scheda__capo';

  const cit = document.createElement('span');
  cit.className = 'scheda__cit';
  cit.textContent = r.citazione;
  capo.append(cit);

  if (r.esatto) {
    const tag = document.createElement('span');
    tag.className = 'marchietto';
    tag.textContent = 'riferimento esatto';
    capo.append(tag);
  }

  if (r.rubrica) {
    const rub = document.createElement('span');
    rub.className = 'scheda__rubrica';
    rub.textContent = r.rubrica;
    capo.append(rub);
  }

  if (r.capo) {
    const sede = document.createElement('span');
    sede.className = 'scheda__sede';
    sede.textContent = r.capo;
    capo.append(sede);
  }

  const testo = testi[r.posizione] ?? '';
  const p = document.createElement('p');
  p.className = 'scheda__testo';
  p.append(evidenzia(testo, radici));

  art.append(capo, p);

  // i brani lunghi si ripiegano, con il modo di riaprirli
  if (testo.length > 700) {
    p.classList.add('ripiegato');
    const btn = document.createElement('button');
    btn.className = 'scheda__apri';
    btn.type = 'button';
    btn.textContent = 'Leggi tutto';
    btn.addEventListener('click', () => {
      const chiuso = p.classList.toggle('ripiegato');
      btn.textContent = chiuso ? 'Leggi tutto' : 'Riduci';
    });
    art.append(btn);
  }

  return art;
}

function interroga() {
  if (!motore) return;
  const domanda = campo.value.trim();
  esiti.replaceChildren();
  messaggio.replaceChildren();

  if (domanda.length < 3) {
    stato.textContent = `${testi.length} brani indicizzati`;
    return;
  }

  const t0 = performance.now();
  const risultati = motore.cerca(domanda, { limite: 8 });
  const ms = performance.now() - t0;

  stato.textContent = risultati.length
    ? `${risultati.length} risultati in ${ms < 1 ? '<1' : Math.round(ms)} ms`
    : `nessun risultato · ${Math.round(ms)} ms`;

  if (!risultati.length) {
    const p = document.createElement('p');
    p.className = 'niente';
    p.textContent = 'Nessun brano contiene queste parole. '
      + 'Prova a dirlo in un altro modo, oppure con il numero: "art. 33".';
    messaggio.append(p);
    return;
  }

  const radici = new Set(risultati[0].termini);
  const frammento = document.createDocumentFragment();
  for (const r of risultati) frammento.append(disegnaScheda(r, radici));
  esiti.append(frammento);
}

/* Ricerca a ogni tasto: con l'indice in memoria costa meno di un
   millisecondo, quindi non serve nessun ritardo artificiale. Il
   ritardo si mette quando dietro c'e' una rete — qui non c'e'. */
campo.addEventListener('input', interroga);
campo.addEventListener('keydown', e => {
  if (e.key === 'Escape') { campo.value = ''; interroga(); }
});

/* La barra di ricerca resta in alto mentre si scorre. Il filetto
   e l'ombra compaiono solo quando serve separarla dal contenuto:
   se ci fossero sempre, in cima sarebbero una riga senza motivo. */
const barra = $('#barra');
if (barra) {
  const sentinella = () => barra.classList.toggle('attaccata', window.scrollY > 4);
  sentinella();
  window.addEventListener('scroll', sentinella, { passive: true });
}

/* Tema proprio, chiave propria: questo progetto non condivide
   niente con il sito, nemmeno la preferenza salvata. */
const bottone = $('#tema');
if (bottone) {
  bottone.addEventListener('click', () => {
    const d = document.documentElement;
    const prossimo = d.getAttribute('data-tema') === 'chiaro' ? 'scuro' : 'chiaro';
    d.setAttribute('data-tema', prossimo);
    try { localStorage.setItem('norma-tema', prossimo); } catch (e) {}
  });
}

avvia();
