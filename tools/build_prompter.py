"""Monta os textos do Teleprompter (prompter-data.js) a partir das respostas dos Diálogos.

- Sílabas e tônicas: CMUdict (pronúncia com acento 1 = tônica, 2 = secundária)
  + Pyphen para dividir a palavra escrita em sílabas.
- Semáforo: 3 = vermelho (tônica da palavra-foco: última palavra de conteúdo antes de cada pausa),
            2 = amarelo (tônica das outras palavras de conteúdo), 1 = verde (tônica secundária), 0 = branco.
- Tempo de cada palavra no áudio do modelo: WordBoundary do edge-tts. Para isso o áudio das
  respostas é regravado junto (mesma voz e velocidade) e os tempos ficam em tools/boundaries.json.

Uso:  python tools/build_prompter.py
"""
import asyncio, json, re, pathlib, sys
import cmudict, pyphen, edge_tts

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
from build_dialogs import SETS, MALE, MALE_RATE  # noqa: E402

CMU = cmudict.dict()
HY = pyphen.Pyphen(lang="en_US")
BOUND_FILE = ROOT / "tools" / "boundaries.json"

FUNCTION = set("""a an the and or but nor so yet if then than that this these those there here
to of in on at by for from with without into onto over under about as per via up out off
i me my mine we us our ours you your yours he him his she her it its they them their
is am are was were be been being do does did have has had will would can could should may might must shall
not no just also too very what which who whom whose where when while how why all any each both every some
such own same other another let let's i'm i'd i've i'll you're you'd you've you'll we're we'd we'll we've
it's that's what's there's they're don't doesn't didn't isn't aren't wasn't weren't can't won't couldn't wouldn't shouldn't
""".split())

# nomes e siglas que não estão no dicionário: sílabas e nível (2 = tônica, 1 = secundária)
MANUAL = {
  "agriventus": [("a",1),("gri",0),("ven",2),("tus",0)],
  "glovis": [("glo",2),("vis",0)], "ottobock": [("ot",2),("to",0),("bock",1)],
  "cofins": [("co",0),("fins",2)], "mercosur": [("mer",2),("co",0),("sur",1)],
  "reais": [("re",0),("ais",2)], "brasil": [("bra",0),("sil",2)], "snap's": [("snap's",2)],
  "quickbooks": [("quick",2),("books",1)], "upwork": [("up",2),("work",1)],
  "agribusiness": [("ag",2),("ri",0),("bus",1),("i",0),("ness",0)],
  "multinationals": [("mul",1),("ti",0),("na",2),("tion",0),("als",0)],
  "owner": [("own",2),("er",0)], "intercompany": [("in",1),("ter",0),("com",2),("pa",0),("ny",0)],
}

def vowel_split(word, n):
    """Divide a palavra em n pedaços pelos grupos de vogais (plano B quando o hifenizador não bate)."""
    groups = [m.span() for m in re.finditer(r"[aeiouy]+", word.lower())]
    if word.lower().endswith("e") and len(groups) > 1 and groups[-1][0] == len(word)-1:
        groups = groups[:-1]  # 'e' mudo no fim
    if n <= 1 or len(groups) < 2:
        return [word]
    while len(groups) > n:  # junta os grupos mais próximos
        k = min(range(len(groups)-1), key=lambda i: groups[i+1][0]-groups[i][1])
        groups[k] = (groups[k][0], groups[k+1][1]); del groups[k+1]
    cuts = []
    for i in range(len(groups)-1):
        a, b = groups[i][1], groups[i+1][0]  # consoantes entre as vogais
        cuts.append(a + (b - a) // 2 if b - a > 1 else a)
    pieces, last = [], 0
    for c in cuts:
        pieces.append(word[last:c]); last = c
    pieces.append(word[last:])
    while len(pieces) < n:  # palavras com sílabas que não aparecem na escrita
        pieces.append("")
    return [p for p in pieces if p] or [word]

def syllables(core):
    """Lista [(texto, nível)] para uma palavra sem pontuação (nível só de acento: 2 tônica, 1 secundária)."""
    low = core.lower()
    if low in MANUAL:
        out, i = [], 0
        for s, lv in MANUAL[low]:
            out.append((core[i:i+len(s)], lv)); i += len(s)
        if i < len(core): out[-1] = (out[-1][0] + core[i:], out[-1][1])
        return out
    if re.fullmatch(r"[A-Z][A-Z&.]*[A-Za-z]?s?", core) and len(core) >= 2 and low not in CMU:
        letters = re.findall(r"[A-Z]s?|&|\.", core)  # sigla soletrada: tônica na última letra
        letters = [l for l in letters if l != "."] or [core]
        out = [(l, 0) for l in letters]; out[-1] = (out[-1][0], 2)
        return [(re.sub(r"(?<=.)$", "", t), lv) for t, lv in out] if "." not in core else [(core, 2)]
    if re.search(r"\d", core):
        return [(core, 2)]
    key = low.replace("’", "'")
    pron = CMU.get(key) or CMU.get(key.rstrip("s")) or CMU.get(key.replace("'s", ""))
    if not pron:
        return [(core, 2)]
    stresses = [int(p[-1]) for p in pron[0] if p[-1].isdigit()]
    n = len(stresses)
    pieces = HY.inserted(core).split("-")
    if len(pieces) != n:
        pieces = vowel_split(core, n)
    if len(pieces) != n:  # ainda não bate: marca a palavra inteira pela tônica
        return [(core, 2 if 1 in stresses else 0)]
    lv = {1: 2, 2: 1, 0: 0}
    return [(p, lv[s]) for p, s in zip(pieces, stresses)]

def word_tokens(text):
    """Quebra a frase em palavras exibidas, com sílabas coloridas e marca de pausa."""
    out = []
    for raw in text.split():
        m = re.match(r"^([\"“(]*)(.*?)([\"”),.;:!?]*)$", raw)
        pre, core, post = m.groups()
        if re.fullmatch(r"[A-Z](\.[A-Z])+", core) and post.startswith("."):  # U.S. não é fim de frase
            core, post = core + ".", post[1:]
        parts = core.split("-") if "-" in core and not re.search(r"\d", core.split("-")[0][:1] or "x") else [core]
        if re.fullmatch(r"\d+-\w+", core): parts = core.split("-")
        syl, content = [], False
        for j, p in enumerate(parts):
            if not p: continue
            is_func = p.lower() in FUNCTION
            ss = syllables(p)
            if is_func: ss = [(t, 0) for t, _ in ss]
            else: content = True
            if j: syl.append(["-", 0])
            syl.extend([[t, lv] for t, lv in ss])
        if pre: syl.insert(0, [pre, 0])
        if post: syl.append([post, 0])
        out.append({"syl": syl, "content": content, "pause": bool(re.search(r"[,.;:!?]", post))})
    return out

def mark_focus(words):
    """Vermelho na tônica da última palavra de conteúdo de cada trecho entre pausas."""
    start = 0
    for i, w in enumerate(words):
        if w["pause"] or i == len(words) - 1:
            for k in range(i, start - 1, -1):
                if words[k]["content"]:
                    best = max(words[k]["syl"], key=lambda s: s[1])
                    if best[1] >= 2: best[1] = 3
                    break
            start = i + 1

async def tts_bounds(text, path, rate):
    """Regrava o áudio guardando o tempo de cada palavra."""
    alt = [rate, rate, "-5%", "-7%", "-4%", "-8%", "+0%"]
    for r in alt:
        audio, bounds = bytearray(), []
        async def run():
            c = edge_tts.Communicate(text, MALE, rate=r, boundary="WordBoundary")
            async for ch in c.stream():
                if ch["type"] == "audio": audio.extend(ch["data"])
                elif ch["type"] == "WordBoundary": bounds.append([ch["text"], round(ch["offset"]/10000)])
        try:
            await asyncio.wait_for(run(), 40)
            if audio and bounds:
                path.write_bytes(bytes(audio)); return bounds
        except Exception:
            pass
        await asyncio.sleep(2)
    raise RuntimeError("Falhou: " + text)

def normw(s):
    return re.sub(r"[^a-z0-9]", "", s.lower())

def word_times(words, bounds):
    """Casa as palavras exibidas com as palavras faladas (que podem vir soletradas, ex.: F P and A)."""
    times, bi = [], 0
    for w in words:
        target = normw("".join(t for t, _ in w["syl"]))
        if not target:
            times.append(times[-1] if times else 0); continue
        acc, t0, k = "", None, bi
        while k < len(bounds) and len(acc) < len(target):
            nb = normw(bounds[k][0])
            if t0 is None: t0 = bounds[k][1]
            acc += nb if nb != "and" or "&" not in "".join(t for t, _ in w["syl"]) else ""
            k += 1
        if t0 is not None and (acc.startswith(target[:2]) or target.startswith(acc[:2])):
            times.append(t0); bi = k
        else:
            times.append(times[-1] + 300 if times else 0)
    return times

async def main():
    cache = json.loads(BOUND_FILE.read_text("utf-8")) if BOUND_FILE.exists() else {}
    out = []
    for s in SETS:
        for i, d in enumerate(s["dialogs"], 1):
            did = f"{s['id']}-{i:02d}"
            words, sents = [], []
            for k, a in enumerate(d["a"], 1):
                af = f"audio/{did}-a{k}.mp3"
                spoken = a[1] if len(a) > 1 else a[0]
                key = f"{af}|{spoken}"
                if key not in cache:
                    cache[key] = await tts_bounds(spoken, ROOT / af, MALE_RATE)
                    BOUND_FILE.write_text(json.dumps(cache, ensure_ascii=False), "utf-8")
                ws = word_tokens(a[0])
                mark_focus(ws)
                t = word_times(ws, cache[key])
                sents.append({"audio": af, "from": len(words), "to": len(words) + len(ws), "t": t})
                words.extend(ws)
            out.append({"id": did, "set": s["name"], "q": d["q"],
                        "w": [[w["syl"], 1 if w["pause"] else 0] for w in words], "s": sents})
            print(did, "ok", len(words), "palavras")
    js = "// Gerado por tools/build_prompter.py — não edite à mão.\nconst PROMPTER = " + \
         json.dumps(out, ensure_ascii=False, separators=(",", ":")) + ";\n"
    (ROOT / "prompter-data.js").write_text(js, encoding="utf-8")

if __name__ == "__main__":
    asyncio.run(main())
