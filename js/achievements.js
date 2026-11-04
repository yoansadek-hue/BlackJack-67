// Succès évolutifs : chaque succès a 4 paliers (Bronze, Argent, Or, Diamant) qui rapportent des jetons
// et débloquent parfois des éléments exclusifs de la Boutique.
import { stats, profile, friends, save } from './store.js';
import { toast, fmt, sfx } from './util.js';

export const TIERS = ['Bronze', 'Argent', 'Or', 'Diamant'];
const REWARD = [150, 600, 2000, 8000];
const acc = () => stats.dec >= 50 ? Math.round(100 * stats.good / stats.dec) : 0;
export const ACH = [
  { id: 'hands', name: 'Habitué', unit: 'mains jouées', goals: [25, 250, 1000, 5000], val: () => stats.hands },
  { id: 'win', name: 'Gagnant', unit: 'mains gagnées', goals: [10, 100, 500, 2500], val: () => stats.won },
  { id: 'bj', name: 'Vingt-et-un', unit: 'blackjacks', goals: [1, 10, 50, 250], val: () => stats.bj },
  { id: 'streak', name: 'En feu', unit: "victoires d'affilée", goals: [3, 5, 8, 12], val: () => stats.bestStreak },
  { id: 'rich', name: 'Gros joueur', unit: 'jetons au maximum', goals: [2500, 10000, 50000, 250000], val: () => stats.best },
  { id: 'double', name: 'Audacieux', unit: 'doubles gagnés', goals: [5, 40, 150, 600], val: () => stats.dblWon || 0 },
  { id: 'online', name: 'Connecté', unit: 'mains en ligne', goals: [10, 100, 500, 2000], val: () => stats.online },
  { id: 'strat', name: 'Stratège', unit: '% de bons coups (min. 50 décisions)', goals: [70, 80, 90, 97], val: acc },
  { id: 'tour', name: 'Champion', unit: 'tournois gagnés', goals: [1, 5, 20, 50], val: () => stats.tourWins || 0 },
  { id: 'friends', name: 'Bien entouré', unit: 'amis', goals: [1, 3, 8, 15], val: () => friends.length },
];

// Palier atteint (0 = aucun, 1..4)
export const tierOf = a => a.goals.filter(g => a.val() >= g).length;
export const reached = (id, tier) => { const a = ACH.find(x => x.id === id); return !!a && (stats.ach2 || {})[id] >= tier; };

export function checkAch() {
  stats.ach2 = stats.ach2 || {};
  let any = false;
  for (const a of ACH) {
    const t = tierOf(a), had = stats.ach2[a.id] || 0;
    if (t <= had) continue;
    for (let k = had; k < t; k++) { profile.bank += REWARD[k]; toast(`${a.name} · palier <b>${TIERS[k]}</b> · +${fmt(REWARD[k])}`, { ms: 4000 }); }
    stats.ach2[a.id] = t; any = true;
  }
  if (any) { sfx.win(); save(); }
}

export function achHTML() {
  stats.ach2 = stats.ach2 || {};
  const total = ACH.reduce((n, a) => n + (stats.ach2[a.id] || 0), 0);
  return `<h2 class="h">Succès · ${total}/${ACH.length * 4} paliers</h2><div class="achs">${ACH.map(a => {
    const t = stats.ach2[a.id] || 0, v = a.val(), next = a.goals[t];
    const prev = t ? a.goals[t - 1] : 0, p = next ? Math.min(1, (v - prev) / (next - prev)) : 1;
    return `<div class="ach t${t}"><div class="tiers">${TIERS.map((n, i) => `<i class="${i < t ? 'on' : ''}" title="${n}"></i>`).join('')}</div>
      <b>${a.name}</b><small>${next ? `${fmt(Math.min(v, next))} / ${fmt(next)} ${a.unit}` : `Diamant · ${fmt(v)} ${a.unit}`}</small>
      <span class="rw">${t ? `<em>${TIERS[t - 1]}</em>` : ''}${next ? `<i class="coin"></i>${fmt(REWARD[t])}` : ''}</span>
      <span class="prog"><i style="width:${Math.round(Math.max(0, p) * 100)}%"></i></span></div>`;
  }).join('')}</div>`;
}
