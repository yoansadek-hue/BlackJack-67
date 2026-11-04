// Moteur de la table : sabot, mains, croupier, paiements, stratégie de base.
// Le même moteur sert en solo (local) et en ligne (exécuté chez l'hôte).
import { wait } from './util.js';

export const SUITS = ['♠', '♥', '♦', '♣'];
export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
export const val = c => c.r === 'A' ? 11 : (['J', 'Q', 'K'].includes(c.r) ? 10 : +c.r);

export function total(cards) {
  let t = 0, a = 0;
  for (const c of cards) { if (!c || c.back) continue; t += val(c); if (c.r === 'A') a++; }
  while (t > 21 && a) { t -= 10; a--; }
  return { t, soft: a > 0 };
}
export const isBJ = h => h.cards.length === 2 && !h.split && total(h.cards).t === 21;
export const canDouble = (h, seat) => h.cards.length === 2 && seat.bank >= h.bet;
export const canSplit = (h, seat) => h.cards.length === 2 && val(h.cards[0]) === val(h.cards[1]) && seat.hands.length < 4 && seat.bank >= h.bet;

// Stratégie de base : 6 jeux, croupier reste sur 17, double après séparation
export function best(h, up, canD, canP) {
  const u = val(up), { t, soft } = total(h.cards), D = alt => canD ? 'D' : alt;
  if (canP) {
    const p = val(h.cards[0]);
    if (p === 11 || p === 8 || ((p === 2 || p === 3 || p === 7) && u <= 7) || (p === 4 && (u === 5 || u === 6)) ||
        (p === 6 && u <= 6) || (p === 9 && u !== 7 && u !== 10 && u !== 11)) return 'P';
  }
  if (soft && t >= 13) {
    if (t >= 19) return 'S';
    if (t === 18) return (u >= 3 && u <= 6) ? D('S') : (u <= 8 ? 'S' : 'H');
    if (t === 17) return (u >= 3 && u <= 6) ? D('H') : 'H';
    if (t >= 15) return (u >= 4 && u <= 6) ? D('H') : 'H';
    return (u === 5 || u === 6) ? D('H') : 'H';
  }
  if (t >= 17) return 'S';
  if (t >= 13) return u <= 6 ? 'S' : 'H';
  if (t === 12) return (u >= 4 && u <= 6) ? 'S' : 'H';
  if (t === 11) return u <= 10 ? D('H') : 'H';
  if (t === 10) return u <= 9 ? D('H') : 'H';
  if (t === 9) return (u >= 3 && u <= 6) ? D('H') : 'H';
  return 'H';
}

const BET_TIME = 15000, TURN_TIME = 30000;

export class Table {
  constructor({ online = false, onChange, stake = 0, tour = null, fun = false }) {
    Object.assign(this, { online, onChange, stake, tour, fun, seats: [], dealer: [], hole: true, phase: tour ? 'lobby' : 'bet', turn: -1, round: 0, deadline: 0, timer: null, busy: false, dead: false });
    this.newShoe();
  }
  newShoe() {
    const s = [];
    for (let d = 0; d < 6; d++) for (const su of SUITS) for (const r of RANKS) s.push({ r, s: su });
    for (let i = s.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [s[i], s[j]] = [s[j], s[i]]; }
    this.shoe = s;
  }
  draw() { if (this.shoe.length < 60) this.newShoe(); return this.shoe.pop(); }
  emit(ev) { if (!this.dead && this.onChange) this.onChange(ev); }
  stop() { this.dead = true; clearTimeout(this.timer); }
  live() { return this.seats.filter(s => !s.gone); }

  // État envoyé aux joueurs (la carte cachée du croupier reste secrète)
  snapshot() {
    return JSON.parse(JSON.stringify({
      phase: this.phase, stake: this.stake, tour: this.tour, fun: this.fun, round: this.round, turn: this.turn, deadline: this.deadline, hole: this.hole,
      dealer: this.hole && this.dealer.length > 1 ? [this.dealer[0], { back: true }] : this.dealer,
      seats: this.seats.map(({ id, name, avatar, bet, ready, out, bank, hands, net, cur, gone, tbank }) => ({ id, name, avatar, bet, ready, out, bank, hands, net, cur, gone, tbank })),
    }));
  }

  addSeat(id, name, avatar) {
    if (this.seats.some(s => s.id === id && !s.gone)) return true;
    if (this.live().length >= 4 || (this.tour && this.phase !== 'lobby')) return false;
    this.seats = this.seats.filter(s => s.id !== id);
    this.seats.push({ id, name, avatar, tbank: this.tour ? this.tour.start : this.fun ? FUN_BANK : 0, bet: 0, ready: false, out: !['bet', 'lobby'].includes(this.phase), bank: 0, hands: [], net: null, cur: 0 });
    this.emit('seat'); return true;
  }
  removeSeat(id) {
    const i = this.seats.findIndex(s => s.id === id); if (i < 0) return;
    const s = this.seats[i];
    if (this.phase === 'bet' || this.phase === 'lobby' || this.phase === 'over') { this.seats.splice(i, 1); if (this.phase === 'bet') this.checkStart(); }
    else { s.gone = true; s.hands.forEach(h => h.done = true); if (this.phase === 'play' && this.turn === i) this.next(); }
    this.emit('seat');
  }

  startTour() {
    if (this.phase !== 'lobby' || !this.live().length) return;
    this.seats.forEach(s => s.tbank = this.tour.start);
    this.phase = 'bet'; this.emit('start');
  }
  canPlay(s) { return (!this.tour && !this.fun) || s.tbank >= (STAKES[this.stake] || STAKES[0]).min; }

  bet(id, amount, bank) {
    const s = this.seats.find(x => x.id === id);
    if (s && (this.tour || this.fun)) bank = s.tbank;
    const lv = STAKES[this.stake] || STAKES[0];
    if (this.phase !== 'bet' || !s || s.ready || !(amount >= lv.min) || amount > lv.max || amount > bank) return;
    Object.assign(s, { bet: amount, bank: bank - amount, ready: true });
    this.emit('bet'); this.checkStart();
  }
  checkStart() {
    const live = this.live().filter(s => this.canPlay(s)); if (!live.length) return;
    const ready = live.filter(s => s.ready);
    if (ready.length === live.length) return this.deal();
    if (ready.length && !this.timer) {
      this.deadline = Date.now() + BET_TIME;
      this.timer = setTimeout(() => { this.timer = null; this.deal(); }, BET_TIME);
      this.emit('timer');
    }
  }

  async deal() {
    clearTimeout(this.timer); this.timer = null; this.deadline = 0;
    const players = this.live().filter(s => s.ready);
    if (!players.length || this.phase !== 'bet') return;
    this.seats = this.seats.filter(s => !s.gone);
    this.phase = 'deal'; this.round++; this.dealer = []; this.hole = true; this.turn = -1;
    for (const s of this.seats) { s.out = !s.ready; s.hands = s.out ? [] : [{ cards: [], bet: s.bet }]; s.net = null; s.cur = 0; }
    for (let k = 0; k < 2; k++) {
      for (const s of players) { s.hands[0].cards.push(this.draw()); this.emit('card'); await wait(280); }
      this.dealer.push(this.draw()); this.emit('card'); await wait(280);
    }
    if (this.dead) return;
    if (total(this.dealer).t === 21) return this.finish();
    players.forEach(s => { if (isBJ(s.hands[0])) s.hands[0].done = true; });
    this.phase = 'play'; this.next();
  }

  next() {
    clearTimeout(this.timer); this.timer = null; this.deadline = 0;
    for (let i = Math.max(this.turn, 0); i < this.seats.length; i++) {
      const s = this.seats[i]; if (s.out || s.gone) continue;
      const k = s.hands.findIndex(h => !h.done);
      if (k < 0) continue;
      this.turn = i; s.cur = k;
      if (total(s.hands[k].cards).t >= 21) { s.hands[k].done = true; return this.next(); }
      if (this.online && this.live().length > 1) {
        this.deadline = Date.now() + TURN_TIME;
        this.timer = setTimeout(() => this.act(s.id, 'S'), TURN_TIME);
      }
      return this.emit('turn');
    }
    this.turn = -1; this.finish();
  }

  async act(id, a) {
    const s = this.seats[this.turn];
    if (this.phase !== 'play' || this.busy || !s || s.id !== id) return;
    const h = s.hands[s.cur];
    if (a === 'D' && !canDouble(h, s)) return;
    if (a === 'P' && !canSplit(h, s)) return;
    this.busy = true;
    if (a === 'H') h.cards.push(this.draw());
    else if (a === 'S') h.done = true;
    else if (a === 'D') { s.bank -= h.bet; h.bet *= 2; h.dbl = true; h.cards.push(this.draw()); h.done = true; }
    else if (a === 'P') {
      s.bank -= h.bet;
      const c = h.cards.pop(), nh = { cards: [c], bet: h.bet, split: true };
      h.split = true; s.hands.splice(s.cur + 1, 0, nh);
      h.cards.push(this.draw()); this.emit('card'); await wait(260);
      nh.cards.push(this.draw());
      if (c.r === 'A') h.done = nh.done = true; // As séparés : une seule carte
    }
    if (total(h.cards).t >= 21) h.done = true;
    this.emit('card'); await wait(220);
    this.busy = false;
    if (!this.dead) this.next();
  }

  async finish() {
    clearTimeout(this.timer); this.timer = null; this.deadline = 0;
    this.phase = 'dealer'; this.hole = false; this.emit('flip'); await wait(550);
    const live = this.seats.some(s => !s.out && !s.gone && s.hands.some(h => total(h.cards).t <= 21 && !isBJ(h)));
    if (live) while (total(this.dealer).t < 17 && !this.dead) { this.dealer.push(this.draw()); this.emit('card'); await wait(520); }
    const d = total(this.dealer).t, dBJ = this.dealer.length === 2 && d === 21;
    for (const s of this.seats) {
      if (s.out) continue;
      let net = 0;
      for (const h of s.hands) {
        const t = total(h.cards).t, bj = isBJ(h);
        let r;
        if (t > 21) r = 'lose';
        else if (bj && !dBJ) r = 'bj';
        else if (dBJ && !bj) r = 'lose';
        else if (d > 21 || t > d) r = 'win';
        else if (t === d) r = 'push';
        else r = 'lose';
        h.gain = r === 'bj' ? h.bet * 1.5 : r === 'win' ? h.bet : r === 'lose' ? -h.bet : 0;
        h.res = r === 'bj' ? 'win' : r; h.bj = r === 'bj';
        net += h.gain;
      }
      s.net = net;
      if (this.tour || this.fun) s.tbank += net;
      if (this.fun && s.tbank < (STAKES[this.stake] || STAKES[0]).min) s.tbank = FUN_BANK;
    }
    this.seats = this.seats.filter(s => !s.gone);
    for (const s of this.seats) { s.ready = false; s.bet = 0; }
    if (this.tour && (this.round >= this.tour.hands || !this.live().some(s => this.canPlay(s)))) { this.phase = 'over'; return this.emit('over'); }
    this.phase = 'bet'; this.emit('done');
  }
}

// ---------- Niveaux de table (on joue selon ses jetons) ----------
export const STAKES = [
  { id: 0, name: 'Salon', min: 10, max: 200, chips: [10, 25, 50, 100], need: 0 },
  { id: 1, name: 'Club', min: 50, max: 1000, chips: [50, 100, 250, 500], need: 1000 },
  { id: 2, name: 'Prestige', min: 250, max: 5000, chips: [250, 500, 1000, 2500], need: 5000 },
  { id: 3, name: 'Élite', min: 1000, max: 25000, chips: [1000, 2500, 5000, 10000], need: 25000 },
  { id: 4, name: 'Légende', min: 5000, max: 100000, chips: [5000, 10000, 25000, 50000], need: 100000 },
  { id: 5, name: 'Tournoi', min: 50, max: 2500, chips: [50, 100, 250, 500], need: 0, hidden: true },
];
export const FUN_BANK = 10000;
export const TOUR = { hands: 15, start: 5000, prize: 1000 };

// ---------- Probabilités de la main en cours (simulation, stratégie de base) ----------
const RV = [11, 2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 10, 10];
const rnd = () => RV[Math.random() * 13 | 0];
function addCard(st, v) { st.t += v; if (v === 11) st.a++; while (st.t > 21 && st.a) { st.t -= 10; st.a--; } }
function fromCards(cards) { const st = { t: 0, a: 0 }; cards.forEach(c => addCard(st, val(c))); return st; }
export function odds(cards, up, n = 2500) {
  if (!cards.length || !up || up.back) return null;
  const u = val(up);
  let win = 0, push = 0;
  for (let i = 0; i < n; i++) {
    const p = fromCards(cards); let len = cards.length, stop = false;
    while (!stop && p.t < 21) {
      // Décision rapide (stratégie de base sur le total)
      const soft = p.a > 0, t = p.t;
      let a;
      if (soft) a = t >= 19 || (t === 18 && u <= 8) ? 'S' : 'H';
      else a = t >= 17 || (t >= 13 && u <= 6) || (t === 12 && u >= 4 && u <= 6) ? 'S' : 'H';
      if (a === 'S') break;
      const dbl = len === 2 && ((t === 11 && u <= 10) || (t === 10 && u <= 9) || (t === 9 && u >= 3 && u <= 6));
      addCard(p, rnd()); len++;
      if (dbl) stop = true;
    }
    if (p.t > 21) continue;
    const d = { t: 0, a: 0 }; addCard(d, u);
    let hole; do { hole = rnd(); } while ((u === 11 && hole === 10) || (u === 10 && hole === 11)); // pas de blackjack croupier
    addCard(d, hole);
    while (d.t < 17) addCard(d, rnd());
    if (d.t > 21 || p.t > d.t) win++; else if (p.t === d.t) push++;
  }
  return { win: win / n, push: push / n, lose: 1 - (win + push) / n };
}
