"""Gera os áudios (vozes neurais gratuitas do edge-tts) e o arquivo dialogs-data.js.

Uso:  python tools/build_dialogs.py
Cada frase é [texto na tela] ou [texto na tela, texto falado] quando a voz
precisa ler siglas letra por letra (IPI, ICMS, SG&A...).
"""
import asyncio, json, pathlib
import edge_tts

ROOT = pathlib.Path(__file__).resolve().parent.parent
AUDIO = ROOT / "audio"
FEMALE, MALE = "en-US-AvaNeural", "en-US-AndrewNeural"
MALE_RATE = "-6%"   # um pouco mais devagar, como o guia recomenda

SETS = [
  {"id": "agriventus", "name": "Entrevista Agriventus (gestores)", "dialogs": [
    {"q": "Tell us about yourself.", "a": [
      ["I'm a certified accountant in Brazil, with a career in accounting, FP&A, treasury and controlling at multinationals.",
       "I'm a certified accountant in Brazil, with a career in accounting, F P and A, treasury and controlling at multinationals."],
      ["At FMC, I learned agribusiness from the inside: crop seasonality, distributor credit and working capital.",
       "At F M C, I learned agribusiness from the inside: crop seasonality, distributor credit and working capital."],
      ["At Glovis, as a coordinator, I worked in a logistics and import operation reporting to a foreign headquarters."],
      ["My strength is building the finance function: a reliable close, cash under control and numbers the headquarters can trust."],
      ["For an operation that is growing in Brazil, I can set up that foundation and be the local team's finance partner."],
      ["That's why I'm excited about building the finance function at Agriventus Brazil."],
    ]},
    {"q": "What do you know about Agriventus?", "a": [
      ["You're the exclusive global distributor of SNAP's dust control and coating products, SP50C for grains and C40F for fertilizers.",
       "You're the exclusive global distributor of SNAP's dust control and coating products, S P 50 C for grains and C 40 F for fertilizers."],
      ["Brazil is one of the largest fertilizer markets in the world, so the local operation makes a lot of sense."],
      ["I'd like to hear how you see the Brazilian business growing."],
    ]},
    {"q": "Why do you want this role?", "a": [
      ["It combines what I know best: agribusiness from FMC, import operations from Glovis, and reporting to a foreign headquarters.",
       "It combines what I know best: agribusiness from F M C, import operations from Glovis, and reporting to a foreign headquarters."],
      ["And I want a role where I build something, not just maintain it."],
    ]},
    {"q": "How would you set up finance in Brazil from scratch? What are your first 90 days?", "a": [
      ["First 30 days: understand the business, the cash position and what the external accountant delivers."],
      ["Days 30 to 60: monthly close calendar, approval limits and bank reconciliations."],
      ["Days 60 to 90: budget, cash forecast and a monthly reporting package for headquarters."],
    ]},
    {"q": "Brazilian taxes are complex. How would you explain the tax impact of importing our product?", "a": [
      ["When we import from Argentina, we pay import duty, IPI, PIS, Cofins and ICMS, plus customs costs.",
       "When we import from Argentina, we pay import duty, I P I, P I S, Cofins and I C M S, plus customs costs."],
      ["Some of these generate tax credits, so the real cost is lower than the gross amount."],
      ["Mercosur origin may reduce the import duty."],
      ["I'd build a landed cost model so pricing reflects all of it."],
    ]},
    {"q": "How do you manage cash and FX risk?", "q_tts": "How do you manage cash and F X risk?", "a": [
      ["A rolling 13-week cash forecast, reviewed weekly."],
      ["For FX, I map our exposure, since we buy in dollars and sell in reais.",
       "For F X, I map our exposure, since we buy in dollars and sell in reais."],
      ["Then I decide with you whether to hedge or price in dollars."],
      ["In agribusiness, customers often pay at harvest, so credit control is key."],
    ]},
    {"q": "Tell us about a time you found a significant error or problem in the numbers.",
     "note": "Exemplo de história no formato STAR. Troque pela sua história real, com um número no final.", "a": [
      ["At FMC, I analyzed SG&A by business line, with products broken down into up to seven levels.",
       "At F M C, I analyzed S G and A by business line, with products broken down into up to seven levels."],
      ["I noticed that some expenses were allocated to the wrong business line, which distorted the margins."],
      ["I traced the allocation keys, corrected them with the cost center owners, and added a monthly check to the close."],
      ["As a result, management could trust the margin by business line and use it for pricing decisions."],
    ]},
    {"q": "How do you report to US headquarters? Are you familiar with US GAAP?",
     "q_tts": "How do you report to U S headquarters? Are you familiar with U S GAAP?", "a": [
      ["I've prepared monthly reporting packages for foreign headquarters, reconciling Brazilian GAAP to the group's standard."],
      ["I'm comfortable with the main US GAAP differences, and I learn fast where specifics apply.",
       "I'm comfortable with the main U S GAAP differences, and I learn fast where specifics apply."],
    ]},
    {"q": "This is a small company. Are you comfortable doing hands-on work?", "a": [
      ["Yes, in a small operation, the finance manager does the analysis and also the operations."],
      ["I'm comfortable with both."],
    ]},
    {"q": "Where do you see yourself in a few years?", "a": [
      ["Growing with the company, leading a finance team as the Brazilian operation scales."],
    ]},
    {"q": "Do you have any questions for us?", "a": [
      ["Yes, I have a few."],
      ["What does success look like for this role in the first year?"],
      ["And how big is the Brazilian operation today, and what are the growth plans?"],
    ]},
  ]},
]

async def tts(text, voice, path, rate="+0%"):
    if path.exists() and path.stat().st_size > 0:
        return
    for attempt in range(4):   # o serviço às vezes falha sem motivo; tenta de novo
        try:
            await edge_tts.Communicate(text, voice, rate=rate).save(str(path))
            if path.stat().st_size > 0:
                return
        except edge_tts.exceptions.NoAudioReceived:
            pass
        await asyncio.sleep(2 + attempt * 3)
    raise RuntimeError(f"Falhou: {path.name}: {text}")

async def main():
    AUDIO.mkdir(exist_ok=True)
    out = []
    for s in SETS:
        ds = []
        for i, d in enumerate(s["dialogs"], 1):
            did = f"{s['id']}-{i:02d}"
            qf = f"audio/{did}-q.mp3"
            await tts(d.get("q_tts", d["q"]), FEMALE, ROOT / qf)
            sents = []
            for k, a in enumerate(d["a"], 1):
                af = f"audio/{did}-a{k}.mp3"
                await tts(a[1] if len(a) > 1 else a[0], MALE, ROOT / af, MALE_RATE)
                sents.append({"t": a[0], "audio": af})
            ds.append({"id": did, "q": d["q"], "qAudio": qf, "note": d.get("note", ""), "a": sents})
            print(did, "ok")
        out.append({"id": s["id"], "name": s["name"], "dialogs": ds})
    js = "// Gerado por tools/build_dialogs.py — não edite à mão.\nconst DIALOG_SETS = " + \
         json.dumps(out, ensure_ascii=False, indent=1) + ";\n"
    (ROOT / "dialogs-data.js").write_text(js, encoding="utf-8")

asyncio.run(main())
