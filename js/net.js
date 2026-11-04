// Réseau en ligne sans serveur : connexions directes entre navigateurs (PeerJS / WebRTC).
// Chaque joueur a un identifiant permanent "blackoff-<CODE>" : c'est aussi le code de son salon.
const PFX = 'blackoff-v1-';
const LOBBY = PFX + 'lobby';
let peer = null, ready = null, myCode = '';
const handlers = {};       // type de connexion entrante -> fonction
const pending = new Map(); // id distant -> échecs en attente

export const peerId = code => PFX + code;
export const myId = () => peerId(myCode);
export const online = () => !!(peer && peer.open);
export const on = (kind, fn) => { handlers[kind] = fn; };

export function init(code) {
  if (ready) return ready;
  myCode = code;
  ready = new Promise((res, rej) => {
    const wait = () => window.Peer ? start() : setTimeout(wait, 100);
    let tries = 0;
    const start = () => {
      peer = new window.Peer(peerId(code), { debug: 0 });
      peer.on('open', () => res(peer));
      peer.on('connection', c => c.on('open', () => {
        const fn = handlers[c.metadata && c.metadata.kind];
        fn ? fn(c) : c.close();
      }));
      peer.on('disconnected', () => { setTimeout(() => { try { peer.reconnect(); } catch (e) {} }, 1500); });
      peer.on('error', e => {
        if (e.type === 'peer-unavailable') {
          const id = (String(e.message).match(/peer\s+(\S+)/) || [])[1];
          (pending.get(id) || []).forEach(f => f());
          pending.delete(id);
        } else if (!peer.open) {
          if (e.type === 'unavailable-id' && tries++ < 3) { peer.destroy(); setTimeout(start, 2500); } // autre onglet encore ouvert
          else rej(e);
        }
      });
    };
    setTimeout(() => rej(new Error('timeout')), 15000);
    wait();
  });
  ready.catch(() => { ready = null; });
  return ready;
}

// Ouvre une connexion vers un autre joueur ; échoue s'il est hors ligne
export function connect(code, meta, timeout = 7000) {
  return new Promise((res, rej) => {
    if (!online()) return rej(new Error('offline'));
    const id = peerId(code);
    const c = peer.connect(id, { metadata: meta, reliable: true });
    let done = false;
    const fail = () => { if (done) return; done = true; clearTimeout(t); try { c.close(); } catch (e) {} rej(new Error('unavailable')); };
    const t = setTimeout(fail, timeout);
    pending.set(id, [...(pending.get(id) || []), fail]);
    c.on('open', () => { if (done) return; done = true; clearTimeout(t); res(c); });
    c.on('error', fail);
  });
}

// Présence d'un ami : renvoie { online, name, hosting } ou null
export async function ping(code) {
  try {
    const c = await connect(code, { kind: 'ping' }, 5000);
    return await new Promise(res => {
      const t = setTimeout(() => { c.close(); res({ online: true }); }, 3000);
      c.on('data', d => { clearTimeout(t); c.close(); res({ online: true, ...d }); });
    });
  } catch (e) { return null; }
}

// Envoie un message ponctuel (invitation, demande d'ami)
export async function notify(code, meta) {
  const c = await connect(code, meta);
  setTimeout(() => c.close(), 1500);
}

// Partie rapide : le premier joueur occupe le « hall » et attend ; le suivant le rejoint.
export function quickMatch({ onWaiting, onFound, onError }) {
  let lp = null, stopped = false;
  const stop = () => { stopped = true; try { lp && lp.destroy(); } catch (e) {} };
  const tryOnce = (n = 0) => {
    if (stopped) return;
    lp = new window.Peer(LOBBY, { debug: 0 });
    lp.on('open', () => {
      if (stopped) return stop();
      onWaiting();
      lp.on('connection', c => c.on('open', () => {
        c.send({ t: 'go', code: myCode });
        setTimeout(stop, 2000);
      }));
    });
    lp.on('error', e => {
      if (e.type !== 'unavailable-id') { if (!lp.open) onError && onError(e); return; }
      lp.destroy();
      // Quelqu'un attend déjà : on lui demande son code de salon
      const c = peer.connect(LOBBY, { reliable: true });
      const t = setTimeout(() => { try { c.close(); } catch (er) {} if (n < 3) setTimeout(() => tryOnce(n + 1), 800 + Math.random() * 1200); }, 5000);
      c.on('data', d => { if (d.t === 'go' && !stopped) { clearTimeout(t); stopped = true; c.close(); onFound(d.code); } });
    });
  };
  tryOnce();
  return stop;
}
