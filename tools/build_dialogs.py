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
  {"id": "upwork", "name": "Entrevista Upwork – empresa de mudanças", "dialogs": [
    # Bloco 1 — Apresentação
    {"q": "Tell me a bit about yourself and why you're a good fit for this role.",
     "note": "Termine sempre ligando a sua experiência ao negócio dele. É isso que ele quer ouvir.", "a": [
      ["Sure. I'm a licensed accountant from Brazil with about 17 years in corporate finance at multinational companies."],
      ["For the last six years I was Finance & Controlling Manager at Glovis Brasil, a logistics company,"],
      ["where I ran the monthly close, cash flow forecasting, budget versus actual by business unit, and internal controls."],
      ["Before that I was a senior FP&A analyst at FMC and worked in planning and accounting at Ottobock.",
       "Before that I was a senior F P and A analyst at F M C and worked in planning and accounting at Ottobock."],
      ["What makes me a fit is that your business looks a lot like the one I came from:"],
      ["labor-heavy, fleet-heavy, thin margins and constant cash pressure."],
      ["I'm used to turning operational numbers into decisions for leadership, and that's exactly what you described."],
    ]},
    {"q": "Why are you doing fractional work instead of a full-time job?",
     "note": "Seja positivo e breve. Foque no que você oferece.", "a": [
      ["After six years at Glovis I decided to work directly with business owners, where my work has a visible impact on decisions."],
      ["A fractional role lets me bring corporate-level discipline to a growing company without the overhead of a full-time executive hire."],
    ]},
    {"q": "What do you know about the moving industry?",
     "note": "Seja honesto sobre não ter trabalhado no setor e mostre que entende a lógica econômica. Isso convence mais do que fingir.", "a": [
      ["I haven't worked for a moving company itself, but I know the economics from logistics."],
      ["Your profit lives in a few drivers: crew labor as a percentage of revenue, revenue per truck, fuel, claims, and how fast you collect."],
      ["Seasonality matters too: summer is your peak, and winter is when cash gets tight while trucks, insurance and rent keep running."],
      ["That's why a weekly cash forecast matters so much in this business."],
    ]},
    # Bloco 2 — Experiência com logística e margens
    {"q": "Walk me through the freight analysis you mentioned in your proposal.",
     "note": "Esta é a sua história principal. Treine até contar em 60 segundos: problema, análise, decisão, resultado.", "a": [
      ["At Glovis we delivered freight in three ways: our own fleet, outsourced carriers, and owner-operator trucks."],
      ["I built a full cost comparison for each."],
      ["On direct cost, owner-operators were the cheapest."],
      ["But when I included the legal and labor liability we carried as the contracting party, the risk was bigger than the savings."],
      ["I presented this to the operations, legal and finance directors."],
      ["The decision was a mix: we used owner-operators only where the risk was low, and priced the other contracts to reflect their true cost."],
      ["Our standard contract margin went from 8% to 10%."],
    ]},
    {"q": "How did you get the operations team to accept your numbers?",
     "note": "O dono vai querer saber se você consegue trabalhar com o gerente geral e com as equipes, não só com planilhas.", "a": [
      ["I didn't present it as finance against operations."],
      ["I showed each director the part that mattered to them:"],
      ["operations saw cost per trip, legal saw the liability exposure, and leadership saw the margin."],
      ["When everyone sees the same numbers from their own angle, the discussion is about the decision, not about whether the numbers are right."],
    ]},
    {"q": "What did your monthly close look like at Glovis?",
     "note": "Se lembrar do prazo real de fechamento, use: \"We closed in X working days.\" Número concreto pesa muito nessa pergunta. Me passe o número que eu incluo a frase aqui.", "a": [
      ["I led a team across treasury, accounting and controlling."],
      ["The close covered reconciliations, accruals, intercompany, and the management report to leadership and to our headquarters,"],
      ["with explanations for the main variances against budget."],
    ]},
    # Bloco 3 — Raciocínio prático sobre a empresa deles
    {"q": "What would you do in your first 30 days?",
     "note": "Termine com o que ele recebe no dia 30. Donos compram resultado, não processo.", "a": [
      ["Week one is cash: I'd build the 13-week cash forecast so we know right away where the risk is."],
      ["Weeks two and three, I'd review the last three months of financials and reconciliations with your bookkeeper,"],
      ["and calculate labor percentage, revenue per truck and claims by branch."],
      ["By day 30 you'd have a weekly cash snapshot, a first monthly reporting package,"],
      ["and a short list of the three biggest margin opportunities with my recommendations."],
    ]},
    {"q": "One of our branches has lower margins than the others. How would you find out why?",
     "note": "Se quiser, abra a aba Branch KPI Snapshot da sua planilha. Ela mostra exatamente essa lógica com a filial South.", "a": [
      ["I'd break the branch's margin down into its drivers and compare each one with the other branches:"],
      ["labor percentage, revenue per job, revenue per truck, fuel, packing materials and claims."],
      ["Usually one or two drivers explain most of the gap."],
      ["Then I'd go to the operation to understand the cause,"],
      ["for example crew scheduling, pricing on certain job types, or packing quality behind the claims."],
      ["The fix depends on the cause, but the analysis always starts by isolating the driver."],
    ]},
    {"q": "How would you decide whether we should finance new trucks or keep the old ones?",
     "note": "A frase \"lucrativo mas aperta o caixa\" mostra maturidade de CFO. Use.", "a": [
      ["I'd compare the full cost of each option over the truck's life:"],
      ["financing payments, maintenance, downtime, fuel efficiency and resale value,"],
      ["against the revenue a newer truck can generate with fewer breakdowns."],
      ["I'd also run it through the cash forecast, because a decision can be profitable and still create a cash squeeze in the slow season."],
      ["The right answer is the one that works on both margin and cash."],
    ]},
    {"q": "What KPIs would you put on our weekly snapshot?",
     "note": "Listar poucos indicadores mostra foco. Ele não quer um relatório de 20 páginas.", "a": [
      ["Five or six, no more: cash on hand and the 13-week low point, collections and overdue receivables,"],
      ["labor percentage, revenue per truck, claims cost, and booked jobs for the coming weeks."],
      ["Every number would come with one line on what changed and what to do about it."],
    ]},
    # Bloco 4 — Bookkeeper, CPA e controles
    {"q": "How would you work with our bookkeeper and our CPA?",
     "note": "A última frase é a mais importante. Você está tirando trabalho das costas do dono.", "a": [
      ["Clear roles: your bookkeeper owns the transactions and the reconciliations;"],
      ["I review them, run the close and turn the numbers into analysis and recommendations;"],
      ["your CPA owns tax and compliance."],
      ["I'd set a monthly close calendar with dates for each step, so everyone knows what's due and when."],
      ["And I'd be the single point of contact for you, so you don't have to coordinate three people."],
    ]},
    {"q": "What internal controls would you put in place first?",
     "note": "Mostre que sabe adaptar os controles de multinacional ao tamanho de uma empresa pequena, sem burocracia.", "a": [
      ["Three basics first."],
      ["Payment approvals with clear limits, so no large payment goes out without the right sign-off."],
      ["Separation of duties, so the person who records a bill isn't the same person who pays it."],
      ["And a monthly review of reconciliations and unusual transactions."],
      ["In a company your size, these three prevent most problems without slowing the operation down."],
    ]},
    # Bloco 5 — Perguntas difíceis
    {"q": "You have no reviews on Upwork and no U.S. accounting experience. Why should we take the risk?",
     "note": "É a pergunta mais provável. Não se defenda: reconheça, responda com fatos e ofereça um teste curto.", "a": [
      ["That's a fair question."],
      ["I'm new to Upwork, but not new to this work:"],
      ["I've done it for 17 years at multinational companies, under audits and headquarters deadlines."],
      ["On U.S. specifics, that's exactly why your CPA stays in charge of tax and compliance;"],
      ["my role is cash, margins and decisions, and those work the same way in any country."],
      ["And to lower your risk, I'm happy to start with a short paid trial:"],
      ["in the first two weeks you get the 13-week cash forecast, and you decide from there."],
    ]},
    {"q": "You're in Brazil. How will this work with the distance and the time zone?",
     "note": "Transforme a distância em vantagem: mesmo horário comercial e experiência real de trabalhar com matriz estrangeira.", "a": [
      ["Brazil overlaps almost completely with Chicago business hours, so we can talk in real time every day."],
      ["I've worked remotely with headquarters abroad for years at multinationals,"],
      ["so video calls, shared files and written updates are my normal routine."],
      ["You'd get a weekly cash snapshot on a fixed day, and I'd be available on calls whenever you need me."],
    ]},
    # Bloco 6 — Horas, valor e rotina
    {"q": "Your rate is $50 an hour. Can you do it for less?",
     "note": "Não baixe o preço logo de cara. Ofereça flexibilidade nas horas antes de mexer no valor, e decida o seu mínimo antes da chamada.", "a": [
      ["My rate reflects 17 years of corporate experience and it's already within the range you posted."],
      ["What I can do is be efficient with the hours:"],
      ["I use automation and AI tools to build reports faster, and I always review every number myself,"],
      ["so you pay for analysis, not for data entry."],
      ["If the budget is the issue, we can also agree on a fixed number of hours per week to start."],
    ]},
    {"q": "How many hours can you commit, and when can you start?",
     "note": "Resposta curta e firme. Não prometa o que não sabe.", "a": [
      ["I can commit 40 hours a week, and I can start right away."],
    ]},
    {"q": "What tools do you use?", "a": [
      ["Advanced Excel and Google Sheets for forecasting and models, and ERP systems from my corporate work."],
      ["I'm comfortable learning whatever accounting system your bookkeeper uses, such as QuickBooks,"],
      ["and I use AI tools to speed up analysis, always validating the numbers myself."],
    ]},
  ]},
]

async def tts(text, voice, path, rate="+0%"):
    if path.exists() and path.stat().st_size > 0:
        return
    # o serviço às vezes falha sem motivo, e algumas frases só falham numa velocidade específica
    alt = {"-6%": ["-6%", "-6%", "-5%", "-7%", "-4%", "-8%", "+0%"]}.get(rate, [rate] * 4)
    for attempt, r in enumerate(alt):
        try:
            # limite de 40 s por tentativa: o serviço às vezes trava sem responder
            await asyncio.wait_for(edge_tts.Communicate(text, voice, rate=r).save(str(path)), 40)
            if path.stat().st_size > 0:
                return
        except (edge_tts.exceptions.NoAudioReceived, asyncio.TimeoutError):
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

if __name__ == "__main__":
    asyncio.run(main())
