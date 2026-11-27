// 連線層：沒有自己的伺服器。房主的瀏覽器負責規則與擲骰，雙方透過公共 MQTT 中繼交換訊息。
//   {ns}{房號}/state      房主發布的完整狀態（retained，後進來的人立刻拿得到）
//   {ns}{房號}/host       房主是否在線（retained，斷線時由 last-will 改成 0）
//   {ns}{房號}/up         客人送給房主：join / act / hb / leave
//   {ns}{房號}/reply/{id} 房主回覆單一客人（行動是否成功）
import mqtt from 'mqtt';
import { newRoom, newPlayer, applyAction, MAX_PLAYERS } from './game.js';

export const BROKER = process.env.NEXT_PUBLIC_MQTT_URL || 'wss://broker.hivemq.com:8884/mqtt';
const NS = 'jydw/v1/';
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const CODE_LEN = 5;
const HB_MS = 5000, OFFLINE_MS = 16000;

export function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}
const ls = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 無痕模式等 */ } },
};
const hostKey = (code) => 'jydw_host_' + code;
export function isHostOf(code) { return !!ls.get(hostKey(String(code).toUpperCase())); }
const clone = (o) => JSON.parse(JSON.stringify(o));

export class Net {
  constructor({ token, onState, onStatus, onHost }) {
    this.token = token; this.id = hash(token);
    this.onState = onState; this.onStatus = onStatus; this.onHost = onHost;
    this.client = null; this.role = null; this.code = null; this.room = null;
    this.pending = new Map(); this.seq = 0; this.lastState = null; this.gen = 0;
  }
  get base() { return NS + this.code + '/'; }

  _connect(will) {
    return new Promise((resolve, reject) => {
      const opts = {
        clean: true, connectTimeout: 10000, reconnectPeriod: 2000, keepalive: 30,
        clientId: 'jydw_' + this.id + '_' + Math.random().toString(36).slice(2, 8),
      };
      if (will) opts.will = { topic: will, payload: '0', retain: true, qos: 1 };
      const c = mqtt.connect(BROKER, opts);
      this.client = c;
      let first = true;
      c.on('connect', () => {
        this.onStatus?.(true);
        if (first) { first = false; resolve(); }
        else if (this.role === 'host') { c.publish(this.base + 'host', '1', { retain: true, qos: 1 }); this._broadcast(); }
      });
      c.on('offline', () => this.onStatus?.(false));
      c.on('close', () => this.onStatus?.(false));
      c.on('error', (e) => { if (first) { first = false; c.end(true); reject(e); } });
      c.on('message', (t, p) => this._msg(t, p));
    });
  }
  _sub(topic) {
    return new Promise((res, rej) => this.client.subscribe(topic, { qos: 1 }, (e) => (e ? rej(e) : res())));
  }

  // ── 房主 ───────────────────────────────────────
  async host(name, resumeCode) {
    this.close();
    const gen = ++this.gen;
    let room = resumeCode ? ls.get(hostKey(resumeCode.toUpperCase())) : null;
    if (!room || room.tokens[0] !== this.token) {
      let code = '';
      for (let i = 0; i < CODE_LEN; i++) code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
      room = { st: newRoom(code), tokens: [this.token], seen: {} };
      room.st.players.push(newPlayer(name));
    }
    this.role = 'host'; this.room = room; this.code = room.st.code;
    await this._connect(this.base + 'host');
    if (gen !== this.gen) return { aborted: true };
    await this._sub(this.base + 'up');
    this.client.publish(this.base + 'host', '1', { retain: true, qos: 1 });
    room.st.players[0].online = true;
    if (name) room.st.players[0].name = String(name).slice(0, 12);
    this._timer = setInterval(() => this._presence(), HB_MS);
    this._broadcast();
    return { code: this.code, seat: 0 };
  }
  _broadcast() {
    const r = this.room;
    if (!r || !this.client) return;
    ls.set(hostKey(r.st.code), r);
    const seats = {};
    r.tokens.forEach((t, i) => { seats[hash(t)] = i; });
    this.client.publish(this.base + 'state', JSON.stringify({ st: r.st, seats }), { retain: true, qos: 1 });
    this.onState?.({ st: clone(r.st), you: 0 });
  }
  _hostMsg(m) {
    const r = this.room;
    if (!m || typeof m.token !== 'string' || !m.token) return;
    r.seen[m.token] = Date.now();
    let seat = r.tokens.indexOf(m.token);
    if (m.kind === 'join') {
      if (seat < 0 && r.st.phase === 'lobby' && r.tokens.length < MAX_PLAYERS) {
        seat = r.tokens.length; r.tokens.push(m.token); r.st.players.push(newPlayer(m.name));
      }
      if (seat >= 0) {
        const p = r.st.players[seat]; p.online = true;
        if (m.name) p.name = String(m.name).slice(0, 12);
      }
      this._reply(m, { seat });
      this._broadcast();
    } else if (m.kind === 'hb') {
      if (seat > 0 && !r.st.players[seat].online) { r.st.players[seat].online = true; this._broadcast(); }
    } else if (m.kind === 'leave') {
      if (seat > 0) { r.st.players[seat].online = false; delete r.seen[m.token]; this._broadcast(); }
    } else if (m.kind === 'act') {
      if (seat < 0) return this._reply(m, { error: '觀戰中無法行動' });
      if (!m.a || typeof m.a !== 'object' || typeof m.a.type !== 'string') return this._reply(m, { error: '格式錯誤' });
      const err = applyAction(r.st, seat, m.a);
      this._reply(m, err ? { error: err } : {});
      if (!err) this._broadcast();
    }
  }
  _reply(m, body) {
    if (m.id == null) return;
    this.client.publish(this.base + 'reply/' + hash(m.token), JSON.stringify({ id: m.id, ...body }), { qos: 1 });
  }
  _presence() {
    const r = this.room, now = Date.now();
    let changed = false;
    r.tokens.forEach((t, i) => {
      if (i === 0) return;
      const on = now - (r.seen[t] || 0) < OFFLINE_MS;
      if (r.st.players[i].online !== on) { r.st.players[i].online = on; changed = true; }
    });
    if (changed) this._broadcast();
  }

  // ── 客人 ───────────────────────────────────────
  async join(code, name) {
    this.close();
    const gen = ++this.gen;
    this.role = 'guest'; this.code = String(code).toUpperCase().trim(); this.lastState = null;
    try { await this._connect(); } catch { return { error: '連不上中繼伺服器，請檢查網路' }; }
    if (gen !== this.gen) return { aborted: true };
    await this._sub(this.base + 'reply/' + this.id);
    await this._sub(this.base + 'host');
    const got = new Promise((res) => {
      const t = setTimeout(() => res(!!this.lastState), 5000);
      this._first = () => { clearTimeout(t); res(true); };
    });
    await this._sub(this.base + 'state');
    const exists = await got;
    if (gen !== this.gen) return { aborted: true };
    if (!exists) { this.close(); return { error: '找不到這個房間，請確認房號' }; }
    const r = await this._send({ kind: 'join', name }, 7000);
    if (gen !== this.gen) return { aborted: true };
    if (r.timeout) return { error: '房主目前不在線上，請等房主打開遊戲頁面' };
    this._timer = setInterval(() => this._send({ kind: 'hb' }, 0), HB_MS);
    return { code: this.code, seat: r.seat };
  }
  _send(body, wait = 8000) {
    if (!this.client) return Promise.resolve({ error: '尚未連線' });
    const id = wait ? ++this.seq : undefined;
    this.client.publish(this.base + 'up', JSON.stringify({ ...body, token: this.token, id }), { qos: 1 });
    if (!wait) return Promise.resolve({});
    return new Promise((res) => {
      const t = setTimeout(() => { this.pending.delete(id); res({ timeout: true, error: '房主沒有回應，可能已離線' }); }, wait);
      this.pending.set(id, (m) => { clearTimeout(t); res(m); });
    });
  }

  _msg(topic, payload) {
    const text = payload.toString();
    if (this.role === 'host') {
      if (topic === this.base + 'up') { try { this._hostMsg(JSON.parse(text)); } catch { /* 忽略壞訊息 */ } }
      return;
    }
    if (this.role !== 'guest') return;
    if (topic === this.base + 'host') { this.onHost?.(text === '1'); return; }
    let m; try { m = JSON.parse(text); } catch { return; }
    if (topic === this.base + 'state') {
      if (!m || !m.st) return;
      this.lastState = m;
      this._first?.(); this._first = null;
      const you = m.seats?.[this.id];
      this.onState?.({ st: m.st, you: you === undefined ? -1 : you });
    } else if (topic.startsWith(this.base + 'reply/')) {
      const p = this.pending.get(m.id);
      if (p) { this.pending.delete(m.id); p(m); }
    }
  }

  // ── 共用 ───────────────────────────────────────
  act(a) {
    if (this.role === 'host') {
      const err = applyAction(this.room.st, 0, a);
      if (!err) this._broadcast();
      return Promise.resolve(err ? { error: err } : {});
    }
    return this._send({ kind: 'act', a });
  }
  close() {
    this.gen++;
    clearInterval(this._timer);
    const c = this.client;
    if (c) {
      try {
        if (this.role === 'guest') c.publish(this.base + 'up', JSON.stringify({ kind: 'leave', token: this.token }), { qos: 0 });
        if (this.role === 'host') c.publish(this.base + 'host', '0', { retain: true, qos: 1 });
      } catch { /* 已斷線 */ }
      c.end(false);
    }
    for (const p of this.pending.values()) p({ error: '已離開房間' });
    this.pending.clear();
    this.client = null; this.role = null; this.room = null; this.lastState = null;
  }
}
