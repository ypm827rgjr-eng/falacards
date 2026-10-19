"use strict";
/* ============ Baralhos prontos ============
   Ao abrir, o app adiciona os baralhos e cartões novos desta lista.
   Não apaga nada e não recria o que o usuário apagou. Para incluir palavras,
   acrescente linhas [frente, verso] e publique. */
const BUNDLED_DECKS = [
  {id:"work-en", name:"Inglês – Trabalho", lang:"en-US", cards:[
    ["realistic","realista\nWe need a realistic deadline."],
    ["deadline","prazo final\nThe deadline is next Friday."],
    ["project","projeto\nThe project is on track."],
    ["ensure","garantir, assegurar\nPlease ensure the report is accurate."],
    ["expectations","expectativas\nLet's align our expectations."],
    ["requesting","solicitando\nI'm requesting more time to finish it."],
    ["refine","refinar, aprimorar\nWe need to refine the budget."],
    ["excited","animado, empolgado\nI'm excited about this project."],
    ["prioritize","priorizar\nLet's prioritize the urgent tasks."],
    ["tasks","tarefas\nI have three tasks to finish today."],
    ["upcoming","próximo, que está por vir\nThe upcoming meeting is on Monday."],
    ["proposed","proposto\nThe proposed schedule works for me."],
    ["schedule","cronograma, agenda\nLet's check the schedule."],
    ["feasible","viável\nIs this plan feasible?"],
    ["resources","recursos\nWe don't have enough resources."],
    ["assessment","avaliação\nThe assessment will be ready next week."],
    ["achievements","conquistas, realizações\nLet's review your achievements this year."],
    ["quarter","trimestre\nSales grew in the third quarter."],
    ["identify","identificar\nWe need to identify the main risks."],
    ["strength","ponto forte, força\nAttention to detail is one of my strengths."],
    ["development","desenvolvimento\nWe should focus on your professional development."],
    ["enhance","melhorar, aprimorar\nThis tool will enhance our reporting."],
    ["feedback","retorno, feedback\nThank you for the feedback."],
    ["appreciate","agradecer, valorizar\nI really appreciate your help."],
  ]},
];

function syncBundled(){
  DB.bundled = DB.bundled || {decks:[], cards:[]};
  const seenDecks = new Set(DB.bundled.decks), seenCards = new Set(DB.bundled.cards);
  let added = 0;
  for (const b of BUNDLED_DECKS){
    let deck = DB.decks.find(d => d.id === b.id);
    if (!deck){
      if (seenDecks.has(b.id)) continue;          // o usuário apagou: não recria
      deck = {id:b.id, name:b.name, lang:b.lang}; DB.decks.push(deck);
    }
    seenDecks.add(b.id);
    const fronts = new Set(DB.cards.filter(c => c.deckId === b.id).map(c => c.front.toLowerCase()));
    for (const [f, back] of b.cards){
      const key = b.id + "|" + f.toLowerCase();
      if (seenCards.has(key) || fronts.has(f.toLowerCase())){ seenCards.add(key); continue; }
      DB.cards.push(newCard(b.id, f, back)); seenCards.add(key); added++;
    }
  }
  DB.bundled = {decks:[...seenDecks], cards:[...seenCards]};
  save();
  if (added) setTimeout(() => toast(added + " cartões novos adicionados"), 600);
}
