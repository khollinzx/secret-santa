/** Pure matching logic, shared by the API and browser preview. */
export function canFinish(members, entries, selections = [], exclusions = []) {
  const picked = new Set(selections.map(s => s.giverId));
  const taken = new Set(selections.map(s => s.number));
  const available = entries.filter(e => !taken.has(e.number));
  const remaining = members.filter(m => !picked.has(m.id));
  if (remaining.length !== available.length) return false;
  const forbidden = new Set(exclusions.map(e => `${e.giverId}:${e.recipientId}`));
  const match = new Map();
  function assign(giverId, seen) {
    for (const entry of available) {
      if (entry.recipientId === giverId || forbidden.has(`${giverId}:${entry.recipientId}`) || seen.has(entry.number)) continue;
      seen.add(entry.number);
      if (!match.has(entry.number) || assign(match.get(entry.number), seen)) {
        match.set(entry.number, giverId); return true;
      }
    }
    return false;
  }
  return remaining.every(m => assign(m.id, new Set()));
}
export function eligibleNumbers(members, entries, selections, exclusions, giverId) {
  if (!members.some(m => m.id === giverId) || selections.some(s => s.giverId === giverId)) return [];
  const taken = new Set(selections.map(s => s.number));
  return entries.filter(e => !taken.has(e.number) && e.recipientId !== giverId && !exclusions.some(x => x.giverId === giverId && x.recipientId === e.recipientId) && canFinish(members, entries, [...selections, {giverId,number:e.number}], exclusions)).map(e => e.number);
}
export function preparePool(members, exclusions, randomIndex) {
  if (members.length < 3) throw new Error('At least three participants are required.');
  const shuffled = members.map(m => m.id);
  for(let i=shuffled.length-1;i>0;i--) {const j=randomIndex(i+1); [shuffled[i],shuffled[j]]=[shuffled[j],shuffled[i]];}
  const entries = shuffled.map((recipientId,i)=>({number:i+1,recipientId}));
  if(!canFinish(members,entries,[],exclusions)) throw new Error('These exclusions prevent a complete exchange. Adjust the rules and try again.');
  return entries;
}
