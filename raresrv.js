// RARE server side (docs/reports/rare-items.md): what the 26 rare items DO. Server-authoritative; server.js calls these hooks (RARE-HOOK lines) and nothing else.
// make(env) -> hooks. env: { G (items.js), bcast, sendTo, hit (hitTarget), stagger (c4Stagger), recalc }. Per-player state lives in p.ri (dies with the goblin).
// Every damage number is applied BEFORE items.js capHit, so the x1.75 cap of docs/reports/balance-3.md still bounds a blow.
'use strict';
module.exports = function make(env) {
  const G = env.G, I = G.ITEMS;
  const st = p => p.ri || (p.ri = {});
  const wOf = p => !p.npc && p.inv && p.inv.weapon && I[p.inv.weapon] && I[p.inv.weapon].rare ? I[p.inv.weapon] : null;
  const aOf = p => !p.npc && p.inv && p.inv.armor && I[p.inv.armor] && I[p.inv.armor].rare ? I[p.inv.armor] : null;
  const cOf = (p, f) => { const c = !p.npc && p.inv && p.inv.charm && I[p.inv.charm]; return c && c.eff && c.eff[f] != null ? c.eff[f] : 0; };
  const heal = (m, p, n, now) => {   // healing from items: sudden death stops it (the Bloodlust Brew keeps half)
    if (!(n > 0) || p.dead || m.sudden) return 0; const was = p.stats.health; p.stats.health = Math.min(p.stats.maxHealth, was + Math.round(n)); if (p.stats.health > was) m.dirty = true; return p.stats.health - was;
  };
  const leader = (m, not) => { let best = null, k = 0; for (const q of m.players.values()) if (!q.npc && !q.dead && q !== not && (q.kills || 0) > k) { k = q.kills; best = q; } return best; };
  const R = {
    // dash recovery multiplier: Ironwill Knot 0.75, Hourglass Sand 0.5 for its time
    dashMul(p, now) { const s = p.ri; return (cOf(p, 'dashCd') || 1) * (s && s.hgUntil > now ? 0.5 : 1); },
    maxHp(p) { return (p.ri && p.ri.maxHp) || 0; },
    // outgoing: the attacker's multipliers on one blow (before the damage cap). opts as in hitTarget.
    out(m, p, t, dmg, now, opts) {
      if (p.npc || (opts && (opts.bleed || opts.echo || opts.chain))) return dmg;
      const w = wOf(p), s = st(p); let d = dmg;
      if (w) {
        if (w.exec && t.stats.maxHealth > 0 && t.stats.health < t.stats.maxHealth * w.exec.below) d *= w.exec.mul;
        if (w.grow) d += Math.min(w.grow.max, (p.kills || 0) * w.grow.per);
        if (w.bane && leader(m, p) === t) d *= w.bane.mul;
      }
      const gr = cOf(p, 'grudge'); if (gr && s.gBy === t.id && now - (s.gAt || 0) < cOf(p, 'grudgeMs')) d *= gr;
      const cl = cOf(p, 'clap'); if (cl && (s.clapN | 0) % cl === cl - 1) { d *= cOf(p, 'clapMul'); if (opts) opts.clap = 1; }
      return Math.round(d);
    },
    // incoming: the target's armour and potions. -> the damage to apply; 0 = the blow passed through (cue sent)
    inn(m, t, p, dmg, now, opts) {
      if (t.npc) return dmg;
      const a = aOf(t), s = st(t), bleed = !!(opts && opts.bleed);
      if (a && a.phase && !bleed && s.phaseRd !== m.round) { s.phaseRd = m.round; env.bcast(m, { rare: { fx: 'phase', id: t.id } }); return 0; }
      let d = dmg;
      if (s.skinUntil > now) d *= I['x:stoneskin'].n;
      if (a && a.firm && bleed) d *= a.firm.bleed;
      if (a && a.mirror && opts && !opts.melee && !bleed) d *= 1 - a.mirror.cut;
      if (a && a.bastion) d = Math.min(d, Math.ceil(t.stats.maxHealth * a.bastion));
      return Math.max(1, Math.round(d));
    },
    // the blow that would kill: Phoenix Ember leaves 1 HP once a round
    save(m, t, now) {
      if (t.npc || !cOf(t, 'revive')) return false; const s = st(t); if (s.reviveRd === m.round) return false;
      s.reviveRd = m.round; env.bcast(m, { rare: { fx: 'phoenix', id: t.id } }); return true;
    },
    // a landed blow: lost = real health lost, dead = the target died, dmg = the damage that reached it
    dealt(m, p, t, tws, lost, dead, now, opts, dmg) {
      const o = opts || {};
      if (t.hitBy === p.id && !t.npc) { const ts = st(t); ts.gBy = p.id; ts.gAt = now; }   // Grudge Stone: remember who hurt the wearer
      const ta = aOf(t);
      if (ta && ta.mirror && !o.melee && !o.bleed && !p.dead && !p.npc && dmg > 0 && p.stats.health > 1) {   // Mirrorscale Mail: part of the shot flies back (never lethal)
        const back = Math.max(1, Math.round(dmg / (1 - ta.mirror.cut) * ta.mirror.back)), ph = Math.max(1, p.stats.health - back);
        p.stats.health = ph; p.hurtAt = now; env.bcast(m, { hit: { from: t.id, to: p.id, dmg: back, hp: ph, max: p.stats.maxHealth, dead: false, thorns: 1 } });
      }
      if (p.npc || o.bleed) return;
      const w = wOf(p), s = st(p);
      if (w && w.leech) heal(m, p, Math.min(w.leech.cap, lost * w.leech.frac), now);
      if (s.lustUntil > now && !o.echo) { const hv = Math.min(I['x:bloodlust'].cap, lost * I['x:bloodlust'].n); if (m.sudden) { p.stats.health = Math.min(p.stats.maxHealth, p.stats.health + Math.round(hv / 2)); } else heal(m, p, hv, now); }
      if (dead) { const k = cOf(p, 'onKill'); if (k) heal(m, p, k, now); }
      if (o.clap) { s.clapN = 0; if (!dead) env.stagger(m, t, 400, now); env.bcast(m, { rare: { fx: 'clap', id: t.id } }); } else if (cOf(p, 'clap') && !o.echo && !o.chain) s.clapN = (s.clapN | 0) + 1;
      if (o.echo || o.chain || dead || !w) return;
      if (w.shatter) { if (t.ward) t.ward = null; const ts = st(t); ts.skinUntil = 0; env.stagger(m, t, w.shatter.stagger, now); env.bcast(m, { rare: { fx: 'shatter', id: t.id } }); }
      if (w.combo) { s.comboN = (s.comboN | 0) + 1; if (s.comboN % w.combo.every === 0) { env.bcast(m, { rare: { fx: 'echo', id: t.id } }); env.hit(m, p.ws, p, tws, t, Math.max(1, Math.round(dmg * w.combo.mul)), now, undefined, { echo: 1, melee: o.melee, base: o.base }); } }
      if (w.chain) {
        let best = null, bd = w.chain.r;
        for (const [ows, q] of m.players) { if (q === p || q === t || q.dead || !q.entered || q.room !== t.room) continue; const d = Math.hypot(q.x - t.x, q.z - t.z); if (d <= bd) { bd = d; best = [ows, q]; } }
        if (best) { env.bcast(m, { rare: { fx: 'chain', id: t.id, to: best[1].id } }); env.hit(m, p.ws, p, best[0], best[1], Math.max(1, Math.round(dmg * w.chain.mul)), now, undefined, { chain: 1, melee: o.melee, base: o.base }); }
      }
    },
    thorned(m, t, now) { const a = aOf(t); if (a && a.sip) heal(m, t, a.sip, now); },   // Bloodpact Plate: the thorns bit
    stagImmune(t) { const a = aOf(t); return !!(a && a.firm); },   // Stonebark Shell: heavy blows do not stagger
    // 50 ms match tick: Mossback Hide regrowth
    tick(m, now) {
      if (m.sudden) return;
      for (const p of m.players.values()) {
        const a = p.npc || p.dead || !p.entered ? null : aOf(p); if (!a || !a.moss) continue;
        const s = st(p); if (now < (s.mossAt || 0) || now - (p.hurtAt || 0) < a.moss.after || p.stats.health >= p.stats.maxHealth) continue;
        s.mossAt = now + 1000; heal(m, p, a.moss.hp, now);
      }
    },
    // a consumable of the rare set (server.js use2 default). -> failure reason, or the extra fields for { used }
    use(m, p, it, now) {
      const s = st(p), max = p.stats.maxHealth;
      switch (it.use) {
        case 'stoneskin': if (s.skinUntil > now) return 'busy'; s.skinUntil = now + it.ms; return { ms: it.ms };
        case 'bloodlust': if (s.lustUntil > now) return 'busy'; s.lustUntil = now + it.ms; return { ms: it.ms };
        case 'hourglass': s.hgUntil = now + it.ms; p.dashAt = 0; return { ms: it.ms };
        case 'phoenixtear': {
          if (p.stats.health >= max) return 'full';
          p.stats.health = Math.min(max, p.stats.health + Math.round(max * it.n * (m.sudden ? 0.5 : 1))); return { hp: p.stats.health };
        }
        case 'feast': s.maxHp = (s.maxHp || 0) + it.n; env.recalc(p); p.stats.health = p.stats.maxHealth; return { hp: p.stats.health, max: p.stats.maxHealth };
        case 'stormflask': {
          const hx = +p.x.toFixed(2), hz = +p.z.toFixed(2);
          for (const [tws, q] of [...m.players]) {
            if (q === p || q.dead || !q.entered || q.room !== p.room || Math.hypot(q.x - p.x, q.z - p.z) > it.r) continue;
            q.dazeUntil = now + it.ms; env.hit(m, p.ws, p, tws, q, it.n, now, 'Storm Flask', {});
          }
          env.bcast(m, { flash: { id: p.id, x: hx, z: hz, room: p.room, r: it.r, ms: it.ms } }); return {};
        }
        default: return null;
      }
    },
    // a goblin took an item (giveItem): the finder gets the announcement, everyone else a faint cue when it is a trophy
    found(m, p, key) {
      const it = I[key]; if (!m || !p || p.npc || !it || !(it.rare || it.tierN >= 3)) return;
      const r = m.rare || (m.rare = {}), tier = it.tierN | 0;
      if (p.ws) env.sendTo(p.ws, { rareFind: { key, name: it.name, tier: it.tier, lore: it.lore || '' } });
      if (tier >= 5) { r.cued = r.cued || {}; if (!r.cued[key]) { r.cued[key] = 1; for (const [ws, q] of m.players) if (q !== p && !q.npc && ws.readyState === 1) env.sendTo(ws, { rareCue: { tier } }); } }
    },
  };
  return R;
};
