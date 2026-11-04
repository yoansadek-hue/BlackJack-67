// Petits outils partagés : sélecteurs, format, sons, vibrations, notifications
import { settings } from './store.js';

export const $ = s => document.querySelector(s);
export const $$ = s => [...document.querySelectorAll(s)];
export const fmt = n => Math.round(n).toLocaleString('fr-FR');
export const wait = ms => new Promise(r => setTimeout(r, ms));
export const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let actx;
export function beep(f = 520, d = .06, type = 'sine', g = .05) {
  if (!settings.sound) return;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const o = actx.createOscillator(), v = actx.createGain();
    o.type = type; o.frequency.value = f; v.gain.value = g;
    o.connect(v); v.connect(actx.destination); o.start();
    v.gain.exponentialRampToValueAtTime(.0001, actx.currentTime + d); o.stop(actx.currentTime + d);
  } catch (e) {}
}
export const sfx = {
  card: () => beep(380, .05, 'triangle', .06),
  chip: () => beep(900, .03, 'square', .02),
  win: () => { beep(660, .1); setTimeout(() => beep(990, .16), 90); },
  lose: () => beep(180, .2, 'sawtooth', .03),
  tap: () => beep(600, .02, 'sine', .03),
};
export const vib = ms => { if (settings.vibrate) try { navigator.vibrate && navigator.vibrate(ms); } catch (e) {} };

// Notification en haut de l'écran, avec bouton d'action optionnel
export function toast(html, { cls = '', action, onAction, ms = 3000 } = {}) {
  const box = $('#toasts'), t = document.createElement('div');
  t.className = 'toast ' + cls;
  t.innerHTML = `<span>${html}</span>`;
  if (action) {
    const b = document.createElement('button');
    b.className = 'btn sm white'; b.textContent = action;
    b.onclick = () => { t.remove(); onAction && onAction(); };
    t.appendChild(b); ms = Math.max(ms, 9000);
  }
  box.appendChild(t);
  setTimeout(() => t.remove(), ms);
}

// Feuille modale du bas
export function sheet(html) {
  $('#sheetBody').innerHTML = html;
  $('#sheet').hidden = false;
  return $('#sheetBody');
}
export function closeSheet() { $('#sheet').hidden = true; }

// Avatars sans emoji : initiale du pseudo sur un motif
export const AVATARS = [
  ['a0', 'Ardoise', 0], ['a1', 'Craie', 300], ['a2', 'Anneau', 600], ['a3', 'Rayures', 1000],
  ['a4', 'Points', 1500], ['a5', 'Moitié', 2500], ['a6', 'Rubis', 4000], ['a7', 'Azur', 6000],
  ['a8', 'Améthyste', 9000], ['a9', 'Or', 15000], ['a10', 'Grille', 25000], ['a11', 'Halo', 50000],
];
export const avStyle = id => AVATARS.some(a => a[0] === id) ? id : 'a0';
const initial = name => esc(((name || '?').trim()[0] || '?').toUpperCase());
export const avHTML = (id, name, cls = '') => `<span class="av ${cls}" data-s="${avStyle(id)}">${initial(name)}</span>`;
export function paintAv(el, id, name) { el.dataset.s = avStyle(id); el.innerHTML = initial(name); }
