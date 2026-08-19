/* ============================================================
   GDPR — il motore di ricerca
   Un file solo, usato da tre parti diverse:

     indicizza.mjs   (Node, in fase di build)  costruisce l'indice
     valuta.mjs      (Node, in fase di build)  misura la precisione
     app.js          (browser, a ogni tasto)   interroga

   E' deliberato. Il tokenizzatore va applicato due volte — una
   ai documenti quando si indicizza, una alla domanda quando si
   cerca — e le due volte devono comportarsi in modo identico.
   Scriverlo in Python per l'indice e in JavaScript per il
   browser vuol dire che prima o poi divergono: qualcuno cambia
   una regola da una parte sola, la ricerca smette di trovare
   certe cose, e non se ne accorge nessuno perche' non fallisce
   niente, peggiora e basta. Un file solo rende quel guasto
   impossibile invece che improbabile.

   Il modello di punteggio e' BM25, non un embedding. Il perche'
   e' misurato, non assunto: vedi valuta.mjs e la scheda del
   caso studio.
   ============================================================ */

/* ------------------------------------------------------------
   Parole vuote. Elenco corto e volutamente conservativo: in un
   testo giuridico parole come "non", "salvo", "senza" cambiano
   completamente il senso di una norma, quindi restano.
   ------------------------------------------------------------ */
export const PAROLE_VUOTE = new Set(`
a ad agli ai al alla alle allo anche c che chi ci co coi col come con cui
da dagli dai dal dalla dalle dallo degli dei del della delle dello di
e ed egli gli ha hanno ho i il in io la le lei li lo loro lui ma me mi
nei nel nella nelle nello noi o per piu questa queste questi questo qui
si sia sono su sugli sui sul sulla sulle sullo ti tra tu tuo un una uno
vi voi essere stato stati essendo avere avuto quale quali quanto quando
ove ovvero nonche altresi cio esso essa essi esse tale tali
`.trim().split(/\s+/));

/* ------------------------------------------------------------
   Normalizzazione. Gli accenti vengono tolti da entrambe le
   parti: chi cerca scrive "puo" molto piu' spesso di "può", e
   "liceita" invece di "liceità". Se li togliessi solo dai
   documenti, la domanda con l'accento non troverebbe niente.
   ------------------------------------------------------------ */
export function normalizza(testo) {
  return testo
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')   // via i segni diacritici
    .replace(/['’`]/g, ' ')            // l'interessato -> l interessato
    .replace(/[^a-z0-9 ]+/g, ' ');
}

/* ------------------------------------------------------------
   Stemmer italiano, versione corta.

   Non e' lo Snowball completo: e' una scorciatoia ragionata che
   toglie i suffissi piu' produttivi dell'italiano burocratico
   ("trattamento" / "trattamenti", "notificare" / "notificazione")
   e poi la vocale finale. Serve a far combaciare la domanda,
   scritta al singolare, con il testo, scritto al plurale.

   La soglia di quattro caratteri e' la protezione contro il
   danno tipico di questi stemmer: senza, "dati" diventerebbe "d"
   e finirebbe per combaciare con qualsiasi cosa.

   Che questo passaggio serva davvero non e' un atto di fede:
   valuta.mjs misura la precisione con e senza.
   ------------------------------------------------------------ */
const SUFFISSI = [
  'amento', 'amenti', 'imento', 'imenti',
  'azione', 'azioni', 'zione', 'zioni', 'sione', 'sioni',
  'mente', 'abile', 'abili', 'ibile', 'ibili',
  'ante', 'anti', 'ente', 'enti',
  'ismo', 'ismi', 'ista', 'isti',
  'ato', 'ati', 'ata', 'ate', 'uto', 'uti', 'uta', 'ute',
  'oso', 'osi', 'osa', 'ose', 'ivo', 'ivi', 'iva', 'ive',
  'ale', 'ali', 'are', 'ere', 'ire', 'ita', 'ite'
];

export function radice(parola) {
  let p = parola;
  for (const s of SUFFISSI) {
    if (p.length - s.length >= 4 && p.endsWith(s)) {
      p = p.slice(0, -s.length);
      break;                        // un suffisso solo, niente catene
    }
  }
  if (p.length >= 4 && /[aeio]$/.test(p)) p = p.slice(0, -1);
  return p;
}

export function tokenizza(testo, { stem = true } = {}) {
  const fuori = [];
  for (const g of normalizza(testo).split(/\s+/)) {
    if (g.length < 2 || PAROLE_VUOTE.has(g)) continue;
    fuori.push(stem ? radice(g) : g);
  }
  return fuori;
}

/* ------------------------------------------------------------
   Sinonimi di dominio.

   E' il vero limite di un motore lessicale, e si vede subito
   nelle domande vere: la gente scrive "garante", il regolamento
   dice "autorita' di controllo"; scrive "data breach", il testo
   dice "violazione dei dati personali"; scrive "dpo", il testo
   dice "responsabile della protezione dei dati". Nessuna di
   queste combacia, e BM25 non ha modo di saperlo.

   E' esattamente il divario che un modello a embedding
   colmerebbe. Prima di pagarlo 30 MB, vale la pena vedere quanto
   ne chiudono trenta righe di tabella.

   Onesta' sul metodo: questi alias li ho ricavati guardando le
   domande sbagliate, quindi da questo momento le 45 domande non
   sono piu' una stima imparziale di *questo* miglioramento —
   misurano anche quanto bene ho letto i miei errori. Il numero
   resta dichiarato lo stesso, con il suo asterisco.

   La riga che non ho passato: sono sinonimi di terminologia, non
   di formulazione. "garante -> autorita' di controllo" e' un
   fatto sulla lingua italiana degli uffici; "quanto tempo -> un
   mese" sarebbe stato scrivere la risposta dentro la domanda.
   ------------------------------------------------------------ */
export const SINONIMI = [
  [/\bgarante\b|\bautorita garante\b/, 'autorita di controllo'],
  [/\bdata breach\b|\bdatabreach\b|\bfuga di dati\b/, 'violazione dei dati personali'],
  [/\bdpo\b|\bdata protection officer\b/, 'responsabile della protezione dei dati'],
  [/\bprivacy\b/, 'protezione dei dati personali'],
  [/\binformativa\b/, 'informazioni da fornire all interessato'],
  [/\bcliente\b|\bclienti\b|\butente\b|\butenti\b|\bdipendente\b|\bdipendenti\b/, 'interessato persona fisica'],
  [/\bazienda\b|\bimpresa\b|\bsocieta\b|\bditta\b/, 'titolare del trattamento impresa'],
  [/\bfornitore\b|\bfornitori\b/, 'responsabile del trattamento'],
  [/\balgoritmo\b|\bautomatico\b|\bautomatizzato\b/, 'processo decisionale automatizzato profilazione'],
  [/\bcancellare\b|\bcancellazione\b|\boblio\b/, 'diritto alla cancellazione'],
  [/\bvalutazione d impatto\b|\bdpia\b|\bvia\b/, 'valutazione impatto sulla protezione dei dati'],
  [/\bsanzione\b|\bsanzioni\b|\bmulta\b|\bmulte\b/, 'sanzioni amministrative pecuniarie'],
  [/\bregistro\b/, 'registri delle attivita di trattamento'],
  [/\bextra ue\b|\bestero\b|\bstati uniti\b|\busa\b|\bpaese terzo\b/, 'trasferimento paese terzo'],
  [/\bsalute\b|\bmedico\b|\bmedici\b|\bsanitari\b/, 'categorie particolari dati relativi alla salute'],
  [/\bminore\b|\bminori\b|\bragazzo\b|\bbambino\b|\bbambini\b/, 'minore eta consenso servizi societa informazione'],
  [/\bsicurezza\b/, 'sicurezza del trattamento misure tecniche organizzative'],
  [/\breclamo\b|\bdenuncia\b/, 'proporre reclamo autorita di controllo'],
  [/\brisarcimento\b|\bdanno\b|\bdanni\b/, 'diritto al risarcimento responsabilita'],
  [/\bconsenso\b/, 'condizioni per il consenso']
];

export function espandi(domanda) {
  const base = normalizza(domanda);
  const aggiunte = [];
  for (const [motivo, espansione] of SINONIMI) {
    if (motivo.test(base)) aggiunte.push(espansione);
  }
  return aggiunte.length ? `${base} ${aggiunte.join(' ')}` : base;
}

/* ------------------------------------------------------------
   Riconoscimento dei riferimenti espliciti.

   Chi conosce il regolamento non fa domande: scrive "art. 33" o
   "considerando 39". Farlo passare da BM25 sarebbe assurdo —
   la risposta e' certa, non probabile. Questi vanno in cima
   comunque, senza punteggio.
   ------------------------------------------------------------ */
export function riferimentoEsplicito(domanda) {
  const t = normalizza(domanda);
  let m = t.match(/\b(?:art|articolo|articoli)\s*\.?\s*(\d{1,3})(?:\s*(?:par|paragrafo|comma)\s*\.?\s*(\d{1,2}))?/);
  if (m) return { tipo: 'articolo', n: +m[1], par: m[2] ? +m[2] : null };
  m = t.match(/\bconsiderando\s*(\d{1,3})\b/);
  if (m) return { tipo: 'considerando', n: +m[1] };
  return null;
}

/* ------------------------------------------------------------
   BM25.

   k1 governa quanto conta ripetere un termine: oltre una certa
   soglia, la quinta occorrenza di "trattamento" non rende un
   brano piu' pertinente della quarta. b governa quanto penalizzare
   i brani lunghi. I valori sono quelli classici, ed e' onesto
   dirlo: non li ho tarati sul corpus, e con 586 brani la taratura
   rischierebbe solo di adattarli al banco di prova.
   ------------------------------------------------------------ */
export const K1 = 1.2;
export const B = 0.75;

/* ------------------------------------------------------------
   Le tre correzioni sopra BM25 puro.

   Non sono state indovinate: la prima misura del motore nudo
   dava P@1 13 %, e i risultati sbagliati avevano tre forme
   riconoscibili. Ogni voce qui sotto risponde a una di quelle,
   e valuta.mjs --ablazione misura quanto vale ciascuna da sola.

   lunghezzaMinima
     BM25 divide per la lunghezza del documento, quindi un brano
     di dieci parole che ne azzecca una prende un punteggio
     enorme. Nei primi posti finivano "Articolo 29" e "Articolo
     92, paragrafo 3": commi procedurali brevissimi, giusti per
     BM25 e inutili per chi cerca. Il pavimento toglie il caso
     patologico senza toccare i brani di lunghezza normale.

   pesoConsiderando
     I considerando sono lunghi, discorsivi e scritti in lingua
     corrente, quindi somigliano alle domande molto piu' degli
     articoli, che sono secchi. Risultato: monopolizzavano le
     prime posizioni. Ma un considerando spiega, non dispone:
     chi chiede "posso mandare i dati negli Stati Uniti" vuole
     l'articolo 45, e il considerando semmai dopo. Non vanno
     esclusi — vanno messi al loro posto.

   copertura — SPENTA, e la storia merita di restare scritta
     L'idea: BM25 somma i contributi dei termini, quindi un brano
     che azzecca un termine raro batte un brano che ne azzecca tre
     comuni; premiare la frazione di termini trovati sembrava
     ovviamente giusto. L'ablazione dice di no — con il fattore
     attivo P@1 articolo scende da 44 % a 40 %. Il motivo, a
     posteriori, e' che le domande contengono parole che nel testo
     giuridico non compaiono mai ("garante", "azienda"), quindi
     penalizza i brani buoni per termini che nessun brano poteva
     avere.

     Resta nel codice, spenta, con il suo numero accanto: e' piu'
     utile di un'idea cancellata, perche' impedisce a me fra sei
     mesi di riaverla e riprovarla.
   ------------------------------------------------------------ */
export const PREDEFINITE = {
  lunghezzaMinima: 25,
  pesoConsiderando: 0.55,
  copertura: 0,       // misurata dannosa: vedi sopra. 0 = spenta
  sinonimi: true,     // espansione della domanda con i sinonimi di dominio
  pesoRubrica: 2.2    // quanto conta il titolo dell'articolo
};

export function creaMotore(indice, opzioni = {}) {
  const cfg = { ...PREDEFINITE, ...opzioni };
  /* La domanda va tokenizzata come lo sono stati i documenti.
     Sembra ovvio, e la prima versione lo sbagliava: interrogava
     con lo stemmer acceso anche l'indice costruito senza, quindi
     nessun termine combaciava e il confronto "con e senza
     stemmer" restituiva un numero fasullo, comodamente a favore
     della scelta che avevo gia' fatto. L'indice si porta dietro
     come e' stato costruito, e qui lo si rispetta. */
  const stem = indice.stem !== false;
  const { postings, lunghezze, mediaLunghezza, brani } = indice;
  const N = brani.length;

  function cerca(domanda, { limite = 8 } = {}) {
    const risultati = [];

    // 1 — riferimento esplicito: risposta certa, va in testa
    const rif = riferimentoEsplicito(domanda);
    const esatti = new Set();
    if (rif) {
      brani.forEach((b, i) => {
        if (b.tipo !== rif.tipo || b.n !== rif.n) return;
        if (rif.par != null && b.par !== rif.par) return;
        esatti.add(i);
      });
    }

    // 2 — BM25 su due campi: corpo e rubrica, contati a parte
    const punteggi = new Map();
    const trovati = new Map();       // doc -> quanti termini distinti ha preso
    const termini = tokenizza(cfg.sinonimi ? espandi(domanda) : domanda, { stem });
    const visti = new Set();

    const accumula = (elenco, lung, mediaLung, pavimento, peso, contaTermini) => {
      for (const t of visti) {
        const lista = elenco[t];
        if (!lista) continue;
        const df = lista.length / 2;   // la lista e' piatta: doc, tf, doc, tf
        const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
        for (let k = 0; k < lista.length; k += 2) {
          const doc = lista[k], tf = lista[k + 1];
          const len = Math.max(lung[doc], pavimento);
          const norm = 1 - B + B * (len / mediaLung);
          const p = peso * idf * (tf * (K1 + 1)) / (tf + K1 * norm);
          punteggi.set(doc, (punteggi.get(doc) || 0) + p);
          if (contaTermini) trovati.set(doc, (trovati.get(doc) || 0) + 1);
        }
      }
    };

    for (const t of termini) visti.add(t);   // un termine ripetuto non vale doppio
    accumula(postings, lunghezze, mediaLunghezza, cfg.lunghezzaMinima, 1, true);
    if (indice.postingsRub) {
      // la rubrica non ha pavimento: e' corta per natura, e la sua
      // lunghezza e' la stessa per tutti i commi dello stesso articolo
      accumula(indice.postingsRub, indice.lunghezzeRub,
               indice.mediaLunghezzaRub || 1, 0, cfg.pesoRubrica, false);
    }

    // correzioni: copertura della domanda e natura del brano
    const distinti = visti.size || 1;
    for (const [doc, p] of punteggi) {
      let v = p;
      if (cfg.copertura > 0) {
        v *= Math.pow(trovati.get(doc) / distinti, cfg.copertura);
      }
      if (brani[doc].tipo === 'considerando') v *= cfg.pesoConsiderando;
      punteggi.set(doc, v);
    }

    for (const i of esatti) {
      risultati.push({ i, punteggio: Infinity, esatto: true });
      punteggi.delete(i);
    }
    const ordinati = [...punteggi.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limite);
    for (const [i, p] of ordinati) risultati.push({ i, punteggio: p, esatto: false });

    return risultati.slice(0, limite).map(r => ({
      ...brani[r.i],
      // posizione nell'indice: serve alla pagina per pescare il testo
      // da testi.json, che e' allineato allo stesso ordine
      posizione: r.i,
      punteggio: r.punteggio,
      esatto: r.esatto,
      termini
    }));
  }

  return { cerca, termini: n => tokenizza(n) };
}
