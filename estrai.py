#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
============================================================
 GDPR — estrazione del corpus
 Prima meta' della catena: da EUR-Lex a un elenco di brani
 citabili. La seconda meta' (indice e ricerca) sta in
 indicizza.py.

 Perche' il comma e non l'articolo
 ---------------------------------
 L'articolo 15 e' lungo quattro commi e otto lettere. Se
 l'unita' di recupero fosse l'articolo, la risposta a "quanto
 tempo ho per rispondere a una richiesta di accesso" sarebbe
 due pagine di testo in cui la risposta e' nascosta. Con il
 comma la citazione diventa esatta: "Articolo 12, paragrafo 3".

 Ogni brano si porta dietro la rubrica dell'articolo e il capo
 in cui vive, perche' servono a due cose diverse: la rubrica
 pesa nel punteggio (chi cerca usa quelle parole), il capo
 serve a mostrare il contesto accanto al risultato.

 Struttura del documento EUR-Lex, verificata sul file:
   div#art_N      un articolo
     p.oj-ti-art    "Articolo N"
     div.eli-title  la rubrica
     div            un comma, inizia con "N."
       table          una lettera: a), b), c)
   div#rct_N      un considerando, testo "(N) ..."

 Uso:
   python estrai.py            usa la copia locale, la scarica se manca
   python estrai.py --aggiorna riscarica comunque
============================================================
"""
import argparse
import json
import re
import sys
import unicodedata
from pathlib import Path

try:
    from bs4 import BeautifulSoup
except ImportError:
    sys.exit("Serve beautifulsoup4:  pip install beautifulsoup4")

QUI = Path(__file__).resolve().parent
SORGENTE = QUI / "sorgente" / "gdpr-it.html"
USCITA = QUI / "brani.json"

# Il regolamento su EUR-Lex. Il riutilizzo e' permesso dalla
# decisione 2011/833/UE, con attribuzione: vedi la nota in fondo
# alla pagina della demo.
URL = ("https://eur-lex.europa.eu/legal-content/IT/TXT/HTML/"
       "?uri=CELEX:32016R0679")


def scarica(forza=False):
    """Scarica il testo una volta sola e lo tiene in locale.

    Non committo il sorgente: sono 800 KB che si riprendono con un
    comando, e il repository di un sito non e' un archivio."""
    if SORGENTE.exists() and not forza:
        return SORGENTE.read_text(encoding="utf-8")
    import requests
    SORGENTE.parent.mkdir(parents=True, exist_ok=True)
    print(f"  scarico  {URL}")
    r = requests.get(URL, timeout=90, headers={
        "User-Agent": "17labs-lab/1.0 (contact@17labs.it)"})
    r.raise_for_status()
    # EUR-Lex dichiara utf-8 e mantiene la promessa: i byte degli
    # accenti sono \xc3\xa8 e compagnia. Se la console li stampa
    # male, e' la console, non il file.
    r.encoding = "utf-8"
    SORGENTE.write_text(r.text, encoding="utf-8")
    print(f"  salvato  {SORGENTE.relative_to(QUI)}  ({len(r.text):,} caratteri)")
    return r.text


def ripulisci(t):
    """Spazi unificati e virgolette normalizzate.

    EUR-Lex usa lo spazio unificatore \\xa0 come rientro dopo il
    numero del comma, e le virgolette curve per le definizioni.
    Lasciarli passa inosservato finche' qualcuno cerca
    «liceita'» e non trova niente perche' nel testo c'e' un
    apostrofo tipografico e nella query no."""
    t = unicodedata.normalize("NFC", t)
    t = t.replace("\xa0", " ").replace(" ", " ").replace(" ", " ")
    t = t.replace("’", "'").replace("‘", "'")
    t = t.replace("“", '"').replace("”", '"')
    t = t.replace("«", '"').replace("»", '"')
    t = re.sub(r"\s+", " ", t)
    t = t.replace('" :', '":')   # EUR-Lex stacca il termine definito dai due punti
    return t.strip()


def testo_di(nodo):
    """Testo di un nodo, senza i richiami alle note a pie' di pagina."""
    copia = BeautifulSoup(str(nodo), "html.parser")
    for n in copia.select(".oj-note-tag, .oj-super, sup"):
        n.decompose()
    return ripulisci(copia.get_text(" ", strip=True))


def mappa_capi(zuppa):
    """Associa a ogni articolo il capo e la sezione che lo contengono.

    Non c'e' un contenitore per capo nel documento: i titoli sono
    fratelli degli articoli, non genitori. Quindi si percorre il
    documento nell'ordine e si tiene traccia dell'ultimo titolo
    incontrato."""
    capi, capo, sezione = {}, None, None
    for el in zuppa.find_all(["p", "div"]):
        classi = el.get("class") or []
        if "oj-ti-section-1" in classi:
            testo = testo_di(el)
            if testo.upper().startswith("CAPO"):
                capo, sezione = testo, None
            elif testo.upper().startswith("SEZIONE"):
                sezione = testo
        elif "oj-ti-section-2" in classi:
            # il titolo vero e proprio segue la numerazione
            testo = testo_di(el)
            if sezione is not None and sezione.upper().startswith("SEZIONE"):
                sezione = f"{sezione} — {testo}"
            elif capo:
                capo = f"{capo} — {testo}"
        elif el.get("id", "").startswith("art_"):
            capi[el["id"]] = (capo, sezione)
    return capi


def spezza_definizioni(testo):
    """Spezza un elenco di definizioni numerate «N) "termine": ...».

    Serve per l'articolo 4, che e' l'articolo piu' consultato del
    regolamento e nel documento e' un blocco unico da 9.682
    caratteri: 26 definizioni indipendenti attaccate una all'altra.
    Lasciato intero manderebbe a monte tutto il lavoro sulla
    citazione esatta — cerchi «titolare del trattamento» e ti
    ritrovi nove pagine invece della definizione.

    La regola e' generale, non cucita sull'articolo 4: serve un
    elenco di almeno tre voci con quella forma. Se domani un altro
    articolo avesse la stessa struttura verrebbe spezzato uguale.
    """
    punti = list(re.finditer(r'(\d{1,2})\)\s*"([^"]{2,80})"\s*:?\s*', testo))
    if len(punti) < 3:
        return None
    fuori = []
    for i, m in enumerate(punti):
        fine = punti[i + 1].start() if i + 1 < len(punti) else len(testo)
        corpo = testo[m.end():fine].strip(" ;")
        if corpo:
            fuori.append((int(m.group(1)), m.group(2).strip(), corpo))
    return fuori or None


def commi_di(articolo):
    """Spezza un articolo nei suoi commi.

    I commi sono i div figli che iniziano con "N.". Le lettere
    stanno in tabelle dentro il comma e restano attaccate al
    comma cui appartengono: staccarle produrrebbe brani come
    "c) i destinatari", inutili da soli."""
    fuori = []
    for figlio in articolo.find_all("div", recursive=False):
        if "eli-title" in (figlio.get("class") or []):
            continue
        testo = testo_di(figlio)
        if testo:
            fuori.append(testo)

    if not fuori:                      # articolo senza div: testo diretto
        intero = testo_di(articolo)
        return [(None, intero)] if intero else []

    commi = []
    for testo in fuori:
        m = re.match(r"^(\d+)\.\s*(.*)$", testo, re.S)
        if m:
            commi.append((int(m.group(1)), m.group(2).strip()))
        elif commi:
            # continuazione di un comma gia' aperto
            n, prec = commi[-1]
            commi[-1] = (n, f"{prec} {testo}")
        else:
            commi.append((None, testo))   # comma unico, non numerato
    return commi


def estrai():
    html = scarica(forza="--aggiorna" in sys.argv)
    zuppa = BeautifulSoup(html, "html.parser")
    capi = mappa_capi(zuppa)
    brani = []

    # --- considerando: uno a testa, sono gia' unita' compiute ---
    for div in zuppa.find_all("div", id=re.compile(r"^rct_\d+$")):
        n = int(div["id"].split("_")[1])
        testo = testo_di(div)
        testo = re.sub(r"^\(\d+\)\s*", "", testo)
        if not testo:
            continue
        brani.append({
            "id": f"c{n}",
            "tipo": "considerando",
            "n": n,
            "citazione": f"Considerando {n}",
            "rubrica": "",
            "capo": "",
            "testo": testo,
        })

    # --- articoli: un brano per comma ---
    for div in zuppa.find_all("div", id=re.compile(r"^art_\d+$")):
        n = int(div["id"].split("_")[1])
        rub = div.find("p", class_="oj-sti-art")
        rubrica = testo_di(rub) if rub else ""
        capo, sezione = capi.get(div["id"], (None, None))
        for par, testo in commi_di(div):
            # la rubrica compare all'inizio del primo blocco: via
            testo = re.sub(r"^Articolo\s+\d+\s*", "", testo)
            if rubrica and testo.startswith(rubrica):
                testo = testo[len(rubrica):].strip()
            if len(testo) < 12:
                continue

            definizioni = spezza_definizioni(testo)
            if definizioni:
                for num, termine, corpo in definizioni:
                    brani.append({
                        "id": f"a{n}d{num}",
                        "tipo": "articolo",
                        "n": n,
                        "par": None,
                        "citazione": f"Articolo {n}, punto {num})",
                        # il termine definito entra nella rubrica: e' la
                        # parola con cui la gente cerca davvero
                        "rubrica": f"{rubrica} — {termine}",
                        "termine": termine,
                        "capo": sezione or capo or "",
                        "testo": corpo,
                    })
                continue

            cit = f"Articolo {n}" + (f", paragrafo {par}" if par else "")
            brani.append({
                "id": f"a{n}" + (f"p{par}" if par else ""),
                "tipo": "articolo",
                "n": n,
                "par": par,
                "citazione": cit,
                "rubrica": rubrica,
                "capo": sezione or capo or "",
                "testo": testo,
            })

    return brani


def main():
    argparse.ArgumentParser(description=__doc__)  # solo per --help
    brani = estrai()
    USCITA.write_text(
        json.dumps(brani, ensure_ascii=False, indent=1), encoding="utf-8")

    art = [b for b in brani if b["tipo"] == "articolo"]
    con = [b for b in brani if b["tipo"] == "considerando"]
    caratteri = sum(len(b["testo"]) for b in brani)
    print()
    print(f"  brani            {len(brani):>6}")
    print(f"    articoli       {len(art):>6}  (da {len({b['n'] for b in art})} articoli)")
    print(f"    considerando   {len(con):>6}")
    print(f"  caratteri        {caratteri:>6,}")
    print(f"  media per brano  {caratteri // max(1, len(brani)):>6} caratteri")
    print(f"  scritto          {USCITA.relative_to(QUI)}"
          f"  ({USCITA.stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
