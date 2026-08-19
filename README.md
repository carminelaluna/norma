# Norma

Ricerca per citazione esatta su un corpus giuridico chiuso, **senza server e senza
modello**. Il corpus di partenza è il GDPR in italiano; il motore non ha niente di
specifico al GDPR e regge qualsiasi testo normativo strutturato.

Primo caso studio del laboratorio di [17Labs](https://17labs.it).

## Cosa fa

Fai una domanda in lingua corrente — *"entro quando devo segnalare una violazione al
garante"* — e ottieni il comma che risponde, citato per esteso: **Articolo 33,
paragrafo 1**. Non una parafrasi, non una risposta generata: il testo di legge, con
la sua collocazione.

Tutto avviene nel browser. Nessuna chiamata a un servizio, nessuna chiave API,
nessun costo per interrogazione, e il corpus è un file statico.

## I numeri

45 domande scritte **prima** di guardare i risultati, con la risposta nota in
partenza (`valutazione.json`).

|  | Articolo giusto | Comma esatto |
|---|---|---|
| P@1 | **56 %** | 38 % |
| P@3 | **69 %** | 58 % |
| MRR | 0.635 | 0.491 |

Peso sul filo: **156 KB compressi** (misurati sul sito vivo, non stimati in locale). Un modello a
embedding multilingue, per confronto, ne costerebbe circa 30 000.

Due misure e non una perché sono due errori diversi: atterrare sull'articolo 15
paragrafo 4 invece del paragrafo 1 vuol dire avere la norma giusta sotto gli occhi;
finire sull'articolo 61 vuol dire non aver trovato niente.

## Cosa ha prodotto quel numero

`node valuta.mjs --ablazione` spegne una correzione per volta:

| Configurazione | P@1 articolo |
|---|---|
| Motore completo | **56 %** |
| Senza peso rubrica | 31 % |
| Senza sinonimi di dominio | 44 % |
| Senza stemmer | 58 % |
| Senza pavimento lunghezza | 56 % |
| Senza peso considerando | 56 % |
| BM25 nudo | 18 % |

Contano due cose: **indicizzare la rubrica dell'articolo come campo separato** e
**venti righe di sinonimi di dominio**. Il resto è rumore su questo banco di prova.

Lo stemmer resta, ma non perché migliori la precisione — non lo fa. Resta perché
l'indice è dell'11 % più piccolo e P@3 sale da 64 % a 69 %.

## Tre errori, tutti trovati misurando

Restano scritti perché sono la parte utile.

1. **La rubrica dentro il corpo.** Ripeterla tre volte nello stesso sacchetto di
   termini rendeva indistinguibili i commi di uno stesso articolo, e allora vinceva
   il più corto — quello con meno sostanza. Per *"diritto di accesso
   dell'interessato"* usciva l'articolo 15 paragrafo 4, che è una riga di chiusura,
   prima del paragrafo 1, che è la norma. Campo separato: 31 % → 56 %.
2. **Il fattore copertura.** Premiare i brani che azzeccano più termini della
   domanda sembrava ovviamente giusto. Misurato: **peggiora** (44 % → 40 %). Le
   domande contengono parole che nel testo giuridico non esistono — "garante",
   "azienda" — quindi puniva i brani buoni per termini che nessun brano poteva
   avere. È rimasto nel codice, spento, col suo numero accanto: serve a impedirmi
   di riaverla, quell'idea, fra sei mesi.
3. **Il confronto sullo stemmer era truccato a mio favore.** `cerca()` tokenizzava
   sempre con lo stemmer acceso, anche interrogando l'indice costruito senza:
   nessun termine combaciava e il confronto dava un trionfale "+21 domande".
   Corretto, sposta **−1 domanda**.

## Com'è fatto

```
estrai.py          EUR-Lex HTML  ->  brani.json        (Python + bs4)
indicizza.mjs      brani.json    ->  indice.json       (Node)
ricerca.js         tokenizzatore, stemmer, BM25        (condiviso)
valuta.mjs         misura la precisione                (Node)
valutazione.json   45 domande con risposta nota
index.html         la pagina
stile.css          il tema, autonomo
app.js             carica, disegna, evidenzia
pubblica.mjs       prepara dist/ da caricare ovunque (Node)
sorgente/          copia locale del testo EUR-Lex, non versionata
```

**`ricerca.js` è un file solo, usato da Node in fase di build e dal browser a ogni
tasto.** Il tokenizzatore va applicato due volte — ai documenti quando si indicizza,
alla domanda quando si cerca — e le due volte devono comportarsi in modo identico.
Scriverlo in Python per l'indice e in JavaScript per il browser vuol dire che prima o
poi divergono: qualcuno cambia una regola da una parte sola, la ricerca peggiora, e
non se ne accorge nessuno perché non fallisce niente. Un file solo rende quel guasto
impossibile invece che improbabile.

Python fa solo l'estrazione dall'HTML, dove `bs4` serve davvero.

### L'unità di recupero è il comma, non l'articolo

L'articolo 15 è lungo quattro commi e otto lettere: se l'unità fosse l'articolo, la
risposta sarebbe due pagine con dentro, da qualche parte, la risposta. Le 26
definizioni dell'articolo 4 sono estratte una per una, con il termine definito
catturato a parte — è l'articolo più consultato del regolamento e nel documento
originale è un blocco unico da 9.682 caratteri.

**586 brani**, mediana 418 caratteri: 413 dagli articoli, 173 considerando.

## Autonomo

Questo progetto **non dipende da nient'altro**. Nessun percorso esce dalla cartella,
nessun file è condiviso con il sito di 17Labs, nessuna richiesta va a un dominio
esterno. Si carica dove capita — un sottodominio, una sottocartella, un altro host —
e funziona.

I caratteri sono quelli di sistema: Georgia per il testo di legge, il carattere
d'interfaccia del sistema operativo per l'apparato, il monospaziato di sistema per le
citazioni. Ospitarne di propri vorrebbe dire mezzo megabyte di woff2 su una pagina
che ne pesa centoquaranta, e Georgia sta su qualsiasi macchina da venticinque anni.

Il tema è deliberatamente l'opposto di quello del sito, che è inchiostro scuro e
ottone: qui il fondo è carta, l'accento è amaranto, il testo di legge è in carattere
graziato e la colonna è stretta come quella di un codice. Il contenuto è un testo
normativo e deve somigliare a un'opera di consultazione, non alla vetrina di uno
studio. Contrasto verificato: 106 elementi, nessuno sotto la soglia WCAG AA nei due
temi.

`node pubblica.mjs` prepara `dist/` con i sei file che servono — pagina, stile,
`app.js`, `ricerca.js`, `indice.json`, `testi.json` — più un `.nojekyll`. Il sorgente
EUR-Lex, gli script di costruzione, il banco di prova e l'indice di controllo restano
fuori: sono gli attrezzi, non il prodotto.

`testi.json` esiste perché `brani.json` contiene testo **e** metadati, ma i metadati
stanno già dentro `indice.json`: spedirli due volte regalerebbe un centinaio di KB a
ogni visita. `pubblica.mjs` verifica che i due file abbiano lo stesso numero di
brani, perché è l'ordine a tenerli allineati — e se si rompesse, la pagina mostrerebbe
il testo sbagliato sotto la citazione giusta.

Sul filo: **156 KB compressi**.

Sul sito di 17Labs c'è **una sola referenza**: la scheda del Caso 02 con un
collegamento in uscita. Nient'altro.

## Ricostruire tutto

```bash
python estrai.py && node indicizza.mjs && node valuta.mjs --ablazione && node pubblica.mjs
```

Il primo comando scarica il testo da EUR-Lex se `sorgente/` è vuota. Serve
`beautifulsoup4` e `requests`; Node senza dipendenze.

Per guardarla: doppio click su **`anteprima.cmd`**, che avvia un server locale sulla
porta 8180 e apre il browser. Serve un server: aprendo `index.html` con un doppio
click il protocollo è `file://` e il browser blocca i moduli JavaScript e la lettura
dell'indice. La pagina se ne accorge e lo spiega, invece di restare muta.

## Cosa manca

- **L'indirizzo vero.** La scheda sul sito punta a `https://norma.17labs.it/`, che è
  un segnaposto: va aggiornato quando decidi dove pubblicarla.
- **La tappa 2**: le 20 domande ancora sbagliate sono in gran parte divario
  semantico vero (*"quanto tempo ho"* contro *"al più tardi entro un mese"*), che
  nessuna tabella di sinonimi chiude. È lì che un modello a embedding si
  guadagnerebbe i suoi 30 MB — e ora il preventivo è quantificato invece che
  immaginato.

## Fonte e licenze

Il testo del regolamento viene da EUR-Lex, CELEX **32016R0679**, versione italiana.
Il riutilizzo è permesso dalla decisione **2011/833/UE** della Commissione, con
attribuzione. Il codice è mio.
