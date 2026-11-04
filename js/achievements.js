// Succès : objectifs débloqués en jouant, chacun rapporte des jetons
import { stats, profile, friends, save } from './store.js';
import { toast, fmt, sfx } from './util.js';

const acc = () => stats.dec >= 100 ? Math.round(100 * stats.good / stats.dec) : 0;
export const ACH = [
  { id: 'win1', name: 'Première victoire', desc: 'Gagne ta première main', goal: 1, val: () => stats.won, reward: 100 },
  { id: 'bj1', name: 'Vingt-et-un', desc: 'Obtiens un blackjack', goal: 1, val: () => stats.bj, reward: 200 },
  { id: 'h100', name: 'Habitué', desc: 'Joue 100 mains', goal: 100, val: () => stats.hands, reward: 500 },
  { id: 's5', name: 'En feu', desc: 'Gagne 5 mains d\'affilée', goal: 5, val: () => stats.bestStreak, reward: 500 },
  { id: 'f3', name: 'Bien entouré', desc: 'Ajoute 3 amis', goal: 3, val: () => friends.length, reward: 300 },
  { id: 'on50', name: 'Connecté', desc: 'Joue 50 mains en ligne', goal: 50, val: () => stats.online, reward: 1000 },
  { id: 'r10k', name: 'Gros joueur', desc: 'Atteins 10 000 jetons', goal: 10000, val: () => stats.best, reward: 1000 },
  { id: 'bj25', name: 'Collectionneur', desc: 'Obtiens 25 blackjacks', goal: 25, val: () => stats.bj, reward: 1500 },
  { id: 'strat', name: 'Stratège', desc: '90 % de bons coups sur au moins 100 décisions', goal: 90, val: acc, reward: 1500 },
  { id: 'tour1', name: 'Champion', desc: 'Gagne un tournoi', goal: 1, val: () => stats.tourWins, reward: 1000 },
  { id: 's10', name: 'Intouchable', desc: 'Gagne 10 mains d\'affilée', goal: 10, val: () => stats.bestStreak, reward: 2500 },
  { id: 'h1000', name: 'Vétéran', desc: 'Joue 1 000 mains', goal: 1000, val: () => stats.hands, reward: 3000 },
  { id: 'r100k', name: 'Légende', desc: 'Atteins 100 000 jetons', goal: 100000, val: () => stats.best, reward: 5000 },
];

export function checkAch() {
  stats.ach = stats.ach || {};
  let any = false;
  for (const a of ACH) {
    if (stats.ach[a.id] || a.val() < a.goal) continue;
    stats.ach[a.id] = Date.now(); profile.bank += a.reward; any = true;
    toast(`Succès débloqué · <b>${a.name}</b> · +${fmt(a.reward)}`, { ms: 4000 });
  }
  if (any) { sfx.win(); save(); }
}

export function achHTML() {
  stats.ach = stats.ach || {};
  const n = ACH.filter(a => stats.ach[a.id]).length;
  return `<h2 class="h">Succès · ${n}/${ACH.length}</h2><div class="achs">${ACH.map(a => {
    const done = !!stats.ach[a.id], p = Math.min(1, a.val() / a.goal);
    return `<div class="ach${done ? ' done' : ''}"><b>${a.name}</b><small>${a.desc}</small>
      <span class="rw"><i class="coin"></i>${fmt(a.reward)}</span><span class="prog"><i style="width:${Math.round(p * 100)}%"></i></span></div>`;
  }).join('')}</div>`;
}
