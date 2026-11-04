// Personnalisation : avatar dessiné à composer + cadres, bannières, titres, couleur du pseudo, dos de cartes.
// Les éléments s'achètent dans la Boutique ; certains sont réservés aux succès (palier Or ou Diamant).
import { profile, stats } from './store.js';
import { reached } from './achievements.js';

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- Pièces de l'avatar ----------
export const SKINS = ['#f6dcc8', '#eec3a3', '#d9a47f', '#b87a55', '#8d5a3b', '#5e3b26'];
const HAIR_COLORS = { noir: '#151515', brun: '#3b2a20', chatain: '#7a4b2a', blond: '#d9ad5f', blanc: '#e9e9ec', roux: '#b5452f', bleu: '#4f6bff', rose: '#e07ad8', or: '#ffd60a' };
const BGS = { ardoise: '#2a2a2e', craie: '#e9e9ec', rubis: '#ff453a', azur: '#0a84ff', ciel: '#64d2ff', violet: '#bf5af2', ambre: '#ff9f0a', or: '#ffd60a', nuit: '#101018' };

const HAIR = {
  court: c => `<path fill="${c}" d="M29 43C28 24 39 17 50 17s23 7 21 26c-5-9-13-13-21-12-8-1-16 3-21 12z"/>`,
  ras: c => `<path fill="${c}" d="M31 39c1-12 10-18 19-18s18 6 19 18c-7-6-31-6-38 0z"/>`,
  long: c => `<path fill="${c}" d="M27 46C25 22 39 15 50 15s25 7 23 31l3 28c-6-5-10-9-10-17V41c-6-8-26-8-32 0v16c0 8-4 12-10 17z"/>`,
  boucles: c => `<g fill="${c}"><circle cx="33" cy="35" r="8"/><circle cx="41" cy="26" r="9"/><circle cx="51" cy="22" r="9.5"/><circle cx="61" cy="26" r="9"/><circle cx="68" cy="35" r="8"/></g>`,
  crete: c => `<path fill="${c}" d="M43 32c0-12 4-22 7-25 3 3 7 13 7 25-4-2-10-2-14 0z"/>`,
  chignon: c => `<g fill="${c}"><circle cx="50" cy="13" r="7.5"/><path d="M29 43C28 24 39 18 50 18s23 6 21 25c-5-9-13-13-21-12-8-1-16 3-21 12z"/></g>`,
  meche: c => `<path fill="${c}" d="M29 44C27 23 40 16 52 17c14 1 21 10 19 27-3-6-8-10-15-11-6 6-16 8-27 11z"/>`,
  chauve: () => '',
};
const EYES = {
  points: '<g fill="#151515"><circle cx="42" cy="46" r="2.7"/><circle cx="58" cy="46" r="2.7"/></g>',
  joyeux: '<path d="M38 47q4-4 8 0M54 47q4-4 8 0" stroke="#151515" stroke-width="2.4" fill="none" stroke-linecap="round"/>',
  calme: '<path d="M38 46h8M54 46h8" stroke="#151515" stroke-width="2.4" stroke-linecap="round"/>',
  grands: '<g><circle cx="42" cy="46" r="4.6" fill="#fff"/><circle cx="58" cy="46" r="4.6" fill="#fff"/><circle cx="42.6" cy="46.6" r="2.4" fill="#151515"/><circle cx="58.6" cy="46.6" r="2.4" fill="#151515"/></g>',
  clin: '<g><circle cx="42" cy="46" r="2.7" fill="#151515"/><path d="M54 47q4-4 8 0" stroke="#151515" stroke-width="2.4" fill="none" stroke-linecap="round"/></g>',
};
const MOUTHS = {
  sourire: '<path d="M44 56q6 5 12 0" stroke="#151515" stroke-width="2.4" fill="none" stroke-linecap="round"/>',
  neutre: '<path d="M45 57h10" stroke="#151515" stroke-width="2.4" stroke-linecap="round"/>',
  rire: '<path d="M43 55q7 9 14 0z" fill="#151515"/>',
  malin: '<path d="M45 57q7 2 12-3" stroke="#151515" stroke-width="2.4" fill="none" stroke-linecap="round"/>',
  surpris: '<ellipse cx="50" cy="57" rx="3" ry="3.6" fill="#151515"/>',
};
const ACCS = {
  aucun: '',
  lunettes: '<g fill="none" stroke="#151515" stroke-width="2.2"><circle cx="42" cy="46" r="6"/><circle cx="58" cy="46" r="6"/><path d="M48 46h4"/></g>',
  solaires: '<g fill="#151515"><rect x="34" y="41" width="14" height="9" rx="4"/><rect x="52" y="41" width="14" height="9" rx="4"/><rect x="47" y="43" width="6" height="2"/></g>',
  casquette: '<g fill="#f5f5f7"><path d="M28 37c0-17 44-17 44 0z"/><path d="M50 35h32q-2 5-12 4z"/></g><path d="M28 37c0-17 44-17 44 0" fill="none" stroke="#151515" stroke-width="1.5"/>',
  casque: '<g><path d="M26 47C26 15 74 15 74 47" fill="none" stroke="#151515" stroke-width="5"/><rect x="22" y="41" width="9" height="15" rx="4" fill="#151515"/><rect x="69" y="41" width="9" height="15" rx="4" fill="#151515"/></g>',
  boucle: '<circle cx="30.5" cy="54" r="2.6" fill="#e5e5ea"/>',
  couronne: '<path d="M33 25l5-12 7 8 5-11 5 11 7-8 5 12z" fill="#e5e5ea" stroke="#8e8e93" stroke-width="1.2"/>',
};
const SHIRT = { ardoise: '#151518', craie: '#b8b8bd', rubis: '#a12a22', azur: '#0a4fa8', ciel: '#2a7fa0', violet: '#6d2f8f', ambre: '#a8650a', or: '#9a7d00', nuit: '#2a2a40' };

export const DEFAULT_LOOK = { skin: 1, hair: 'court', hc: 'brun', eyes: 'points', mouth: 'sourire', acc: 'aucun', bg: 'ardoise' };

export function avatarSVG(look) {
  const l = { ...DEFAULT_LOOK, ...(look && typeof look === 'object' ? look : {}) };
  const skin = SKINS[l.skin] || SKINS[1], hc = HAIR_COLORS[l.hc] || HAIR_COLORS.brun, bg = BGS[l.bg] || BGS.ardoise;
  const hair = (HAIR[l.hair] || HAIR.court)(hc), back = l.hair === 'long' ? hair : '';
  return `<svg viewBox="0 0 100 100" aria-hidden="true"><rect width="100" height="100" fill="${bg}"/>${back}
    <path d="M16 100c2-20 16-30 34-30s32 10 34 30z" fill="${SHIRT[l.bg] || '#151518'}"/>
    <rect x="43" y="58" width="14" height="14" rx="5" fill="${skin}"/>
    <circle cx="30" cy="47" r="5" fill="${skin}"/><circle cx="70" cy="47" r="5" fill="${skin}"/>
    <ellipse cx="50" cy="45" rx="20" ry="22" fill="${skin}"/>
    ${l.hair === 'long' ? HAIR.court(hc) : hair}${EYES[l.eyes] || EYES.points}${MOUTHS[l.mouth] || MOUTHS.sourire}${ACCS[l.acc] || ''}</svg>`;
}

// ---------- Catalogue (3 onglets : Avatar, Dos de cartes, Fond) ----------
// [id, nom, prix, succès requis "id:palier"]
const L = (cat, list) => list.map(([id, name, price, req]) => ({ cat, id, name, price, req }));
export const SKIN_ITEMS = SKINS.map((c, i) => ({ cat: 'skin', id: i, name: 'Teint ' + (i + 1), price: 0 }));
export const AVATAR_GROUPS = [
  { cat: 'skin', title: 'Teint', items: SKIN_ITEMS },
  { cat: 'hair', title: 'Coiffure', items: L('hair', [['court', 'Court', 0], ['ras', 'Ras', 0], ['chauve', 'Chauve', 0], ['meche', 'Mèche', 400], ['long', 'Long', 700], ['boucles', 'Boucles', 1000], ['chignon', 'Chignon', 1500], ['crete', 'Crête', 2500]]) },
  { cat: 'hc', title: 'Cheveux', items: L('hc', [['noir', 'Noir', 0], ['brun', 'Brun', 0], ['chatain', 'Châtain', 0], ['blond', 'Blond', 300], ['roux', 'Roux', 500], ['blanc', 'Blanc', 900], ['bleu', 'Bleu', 0, 'bj:2'], ['rose', 'Rose', 0, 'win:2']]) },
  { cat: 'eyes', title: 'Yeux', items: L('eyes', [['points', 'Points', 0], ['joyeux', 'Joyeux', 0], ['calme', 'Calme', 300], ['grands', 'Grands', 600], ['clin', "Clin d'œil", 1200]]) },
  { cat: 'mouth', title: 'Bouche', items: L('mouth', [['sourire', 'Sourire', 0], ['neutre', 'Neutre', 0], ['malin', 'Malin', 300], ['rire', 'Rire', 600], ['surpris', 'Surpris', 900]]) },
  { cat: 'acc', title: 'Accessoire', items: L('acc', [['aucun', 'Aucun', 0], ['lunettes', 'Lunettes', 800], ['casquette', 'Casquette', 1500], ['solaires', 'Solaires', 2500], ['casque', 'Casque audio', 4000], ['couronne', 'Couronne', 0, 'rich:3']]) },
  { cat: 'bg', title: 'Couleur', items: L('bg', [['ardoise', 'Ardoise', 0], ['craie', 'Craie', 0], ['nuit', 'Nuit', 400], ['ciel', 'Ciel', 700], ['violet', 'Violet', 1000], ['rubis', 'Rubis', 1500]]) },
  { cat: 'frame', title: 'Cadre', items: L('frame', [['none', 'Aucun', 0], ['blanc', 'Blanc', 600], ['double', 'Double', 1500], ['neon', 'Néon', 4000], ['diamant', 'Diamant', 0, 'hands:3']]) },
];
export const SHOP_TABS = [
  { id: 'avatar', title: 'Avatar', groups: AVATAR_GROUPS },
  { id: 'back', title: 'Dos de cartes', groups: [{ cat: 'back', title: 'Dos de cartes', items: L('back', [['stripes', 'Rayures', 0], ['dots', 'Points', 800], ['grid', 'Grille', 1500], ['waves', 'Ondes', 3000], ['noir', 'Noir', 6000], ['rouge', 'Rouge', 12000]]) }] },
  { id: 'felt', title: 'Fond', groups: [{ cat: 'felt', title: 'Fond de table', items: L('felt', [['noir', 'Noir', 0], ['graphite', 'Graphite', 500], ['nuit', 'Nuit', 1500], ['bordeaux', 'Bordeaux', 3000], ['velours', 'Velours', 6000], ['marbre', 'Marbre', 0, 'streak:3']]) }] },
];
export const AVATAR_CATS = ['hair', 'hc', 'eyes', 'mouth', 'acc', 'bg'];
export const ALL_GROUPS = SHOP_TABS.flatMap(t => t.groups);
export const findItem = (cat, id) => { for (const g of ALL_GROUPS) if (g.cat === cat) return g.items.find(i => String(i.id) === String(id)); return null; };

// ---------- Possession ----------
export const ownKey = (cat, id) => cat + ':' + id;
export const owns = it => it.req ? reached(...reqOf(it)) : it.price === 0 || (profile.owned || []).includes(ownKey(it.cat, it.id));
export const reqOf = it => { const [id, t] = it.req.split(':'); return [id, +t]; };
export const equipped = it => it.cat === 'back' ? profile.back === it.id : (AVATAR_CATS.includes(it.cat) || it.cat === 'skin') ? String(profile.look[it.cat]) === String(it.id) : String(profile.cos[it.cat] ?? (it.cat === 'felt' ? 'noir' : 'none')) === String(it.id);
export function equip(it) {
  if (it.cat === 'back') profile.back = it.id;
  else if (AVATAR_CATS.includes(it.cat) || it.cat === 'skin') profile.look[it.cat] = it.id;
  else profile.cos[it.cat] = it.id;
}

// ---------- Affichage ----------
// Ce que les autres joueurs voient de toi
export function myPub() {
  const lvl = level().lvl, wr = stats.hands ? Math.round(100 * stats.won / stats.hands) : 0;
  return { look: profile.look, frame: profile.cos.frame, nc: profile.cos.nc, title: profile.cos.title, lvl, wr, hands: stats.hands, bj: stats.bj };
}
// Nettoie ce qu'envoie un autre joueur
export function cleanPub(p) {
  if (!p || typeof p !== 'object') return {};
  const s = v => String(v == null ? '' : v).slice(0, 24), n = v => Math.max(0, Math.min(1e7, +v || 0));
  const look = {}; for (const k of [...AVATAR_CATS, 'skin']) if (p.look && p.look[k] != null) look[k] = k === 'skin' ? n(p.look[k]) % SKINS.length : s(p.look[k]);
  return { look, frame: s(p.frame), nc: s(p.nc), title: s(p.title), lvl: n(p.lvl), wr: n(p.wr), hands: n(p.hands), bj: n(p.bj) };
}
export function avHTML(pub, name, cls = '') {
  const p = pub && typeof pub === 'object' ? pub : {};
  const look = p.look || (p.skin != null || p.hair ? p : null);
  return `<span class="av ${cls}" data-f="${esc(p.frame || 'none')}">${avatarSVG(look)}</span>`;
}
export function paintAv(el, pub) { const p = pub || {}; el.dataset.f = p.frame || 'none'; el.innerHTML = avatarSVG(p.look); }
export const nameHTML = (name, pub) => `<span class="nm" data-nc="${esc((pub && pub.nc) || 'blanc')}">${esc(name)}</span>`;

// ---------- Niveau (expérience) ----------
export function level() {
  const xp = stats.hands * 5 + stats.won * 5 + stats.bj * 20 + (stats.tourWins || 0) * 200;
  let lvl = 1, need = 100, rest = xp;
  while (rest >= need) { rest -= need; lvl++; need = Math.round(need * 1.18); }
  return { lvl, xp, rest, need };
}
