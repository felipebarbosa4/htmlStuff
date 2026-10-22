// ReCollect iCalendar parser. Only collection dates and categories are returned;
// address, UID, description and raw ICS are never sent to the browser.
export function parseWasteIcs(input) {
  if (typeof input !== 'string' || !input.includes('BEGIN:VCALENDAR')) throw new Error('Invalid collection calendar');
  const lines = input.replace(/\r\n/g, '\n').split('\n');
  const unfolded = [];
  for (const line of lines) {
    if (/^[ \t]/.test(line) && unfolded.length) unfolded[unfolded.length-1] += line.slice(1);
    else unfolded.push(line);
  }
  const events = [];
  let record = null;
  for (const line of unfolded) {
    if (line === 'BEGIN:VEVENT') { record = {}; continue; }
    if (line === 'END:VEVENT') {
      if (record) {
        const dt = (record.DTSTART || '').replace(/[^0-9]/g, '').slice(0, 8);
        const name = (record.SUMMARY || '').replace(/\\,/g, ',').toLowerCase();
        const types = [];
        if (/\bgarbage\b/.test(name)) types.push('garbage');
        if (/\bblue bin\b/.test(name)) types.push('blue');
        if (/\bblack bin\b/.test(name)) types.push('black');
        if (/\bgreen bin\b/.test(name)) types.push('green');
        if (/\byard\s*(trimmings|waste)\b|\bleaf and yard\b/.test(name)) types.push('yard');
        if (/^\d{8}$/.test(dt) && types.length) events.push({date:dt.slice(0,4)+'-'+dt.slice(4,6)+'-'+dt.slice(6,8),types});
      }
      record = null; continue;
    }
    if (!record) continue;
    if (line.startsWith('DTSTART')) record.DTSTART = line.slice(line.indexOf(':')+1);
    if (line.startsWith('SUMMARY:')) record.SUMMARY = line.slice(8);
  }
  const unique = new Map();
  for (const event of events) if (!unique.has(event.date)) unique.set(event.date,event);
  return [...unique.values()].sort((a,b)=>a.date.localeCompare(b.date));
}
