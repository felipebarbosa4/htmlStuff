// Pure language helpers shared by the browser and Node tests.
export function normalized(text) {
  return String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function extractWakePhrase(input) {
  const original = String(input || '').trim();
  const match = original.match(/^(?:hey|ei|ok|oi)\s+(?:family|fam[ií]lia)\b[\s,.:;!?-]*/i);
  if (!match) return null;
  return original.slice(match[0].length).trim();
}

export function localIntent(input) {
  const q = normalized(input);
  if (!q) return {type:'empty'};
  if (/\b(financ|banco|cartao|saldo|extrato|pin|senha|pagamento|gasto)/.test(q))
    return {type:'restricted'};
  if (/^(?:que horas sao|me diga as horas|qual e a hora|que dia e hoje|qual e a data de hoje)/.test(q))
    return {type:'clock',date: q.includes('dia') || q.includes('data')};
  if (/(?:proxim[oa]s? compromissos?|(?:tenho|temos|ha) (?:algum )?compromisso|agenda de hoje|calendario de hoje)/.test(q))
    return {type:'agenda'};
  const verbs = /\b(abrir|abre|abra|mostra|mostre|mostrar|ver|ir para|vai para|muda para|troca para|coloca|quero ver|volte|volta|retorne|retorna)\b/;
  if (verbs.test(q)) {
    const screens = [
      ['calendar', /\b(calendario|agenda|compromissos?)\b/],
      ['weather', /\b(roupas?|vestir|clima|clothes)\b/],
      ['activities', /\b(passeios?|atividades?|programas?|what to do|o que fazer)\b/],
      ['waste', /\b(lixo|coleta|reciclagem)\b/],
      ['meals', /\b(refeic(?:ao|oes)|comida|almoco|jantar|meals)\b/],
      ['night', /\b(noite|modo noturno|night)\b/],
      ['auto', /\b(automatico|modo automatico|auto)\b/]
    ];
    for (const [screen,pattern] of screens) if (pattern.test(q)) return {type:'screen',screen};
  }
  return {type:'question',question:String(input).trim()};
}

export function nextAgenda(events,now=Date.now()) {
  if (!Array.isArray(events)) return [];
  return events.filter(e=>e && !e.allDay && Number.isFinite(Date.parse(e.start)) &&
    Date.parse(e.start)>now).sort((a,b)=>Date.parse(a.start)-Date.parse(b.start)).slice(0,3)
    .map(e=>({title:String(e.title||'Compromisso').slice(0,100),start:e.start}));
}
