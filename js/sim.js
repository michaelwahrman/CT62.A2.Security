// CT62.A1 - the simulation: scripted people walk through the venue, each camera takes a frame at its own rate
// (1-2 fps), and a FAKE recogniser decides from pixel size and viewing angle whether a face is matched.
// Tracks + rules + alert levels + simulated notifications. No DOM here; the UI reads sim state.
(function (CT) {
  'use strict';

  CT.makeSim = (db, scenario, seed = 1) => {
    const venue = db.venue, R = venue.recognition, rnd = CT.rng(CT.hash(scenario.id) ^ seed);
    const people = new Map(db.people.people.map((p) => [p.id, p]));
    const rules = Object.fromEntries(db.alerts.rules.map((r) => [r.id, r]));
    const models = venue.cameras.map(CT.camModel);
    const sim = { t: 0, scenario, agents: [], tracks: [], alerts: [], log: [], notes: [], frames: {}, level: 0, manualLevel: null, notified: new Set(), counts: { frames: 0, dets: 0, matches: 0 } };
    const camNext = Object.fromEntries(venue.cameras.map((c) => [c.id, (CT.hash(c.id) % 1000) / 1000 / c.fps]));

    const wp = (n) => venue.waypoints[n];
    scenario.agents.forEach((a, i) => {
      const steps = a.route.map((s) => (typeof s === 'string' ? { p: wp(s), dwell: 0, face: null, name: s } : { p: wp(s.wp), dwell: s.dwell || 0, face: s.face ?? null, name: s.wp }));
      const person = a.person ? people.get(a.person) || null : null;
      sim.agents.push({ i, cfg: a, person, label: a.label || (person ? person.name : 'Unknown'), coat: a.coat || '#666', speed: a.speed || 1.3, carry: a.carry || null,
        steps, k: 0, x: steps[0].p[0], z: steps[0].p[1], yaw: 180, state: 'pending', dwell: steps[0].dwell, track: null });
    });
    const log = (text, level = null) => sim.log.push({ t: sim.t, clock: clock().text, text, level });
    const clock = () => CT.clockAt(scenario.clock, sim.t);
    sim.clock = clock;

    function moveAgent(a, dt) {
      if (a.state === 'gone') return;
      if (a.state === 'pending') {
        if (sim.t < (a.cfg.start || 0)) return;
        a.state = a.dwell > 0 ? 'dwell' : 'walk'; if (a.steps[0].face !== null) a.yaw = a.steps[0].face;
        if (a.state === 'walk') advance(a);
      }
      if (a.state === 'dwell') { a.dwell -= dt; if (a.dwell <= 0) advance(a); return; }
      if (a.state === 'walk') {
        const [tx, tz] = a.steps[a.k].p, dx = tx - a.x, dz = tz - a.z, d = Math.hypot(dx, dz), s = a.speed * dt;
        if (d > 1e-6) a.yaw = CT.dirYaw(dx, dz);
        if (d <= s) {
          a.x = tx; a.z = tz; const st = a.steps[a.k];
          if (st.dwell > 0) { a.state = 'dwell'; a.dwell = st.dwell; if (st.face !== null) a.yaw = st.face; } else advance(a);
        } else { a.x += (dx / d) * s; a.z += (dz / d) * s; }
      }
    }
    function advance(a) {
      a.k++;
      if (a.k >= a.steps.length) { a.k = a.steps.length - 1; if (a.cfg.exit) { a.state = 'gone'; if (a.track) log(`${a.track.id} left the area`); } else { a.state = 'dwell'; a.dwell = 1e9; } return; }
      a.state = 'walk';
    }

    // viewing angle between where the person faces and the direction to the camera
    function viewClass(a, c) {
      const yawToCam = CT.dirYaw(c.pos[0] - a.x, c.pos[2] - a.z);
      let d = Math.abs(((yawToCam - a.yaw + 540) % 360) - 180);
      return d < 30 ? ['frontal', 1, d] : d < 60 ? ['three-quarter', 0.85, d] : d < 100 ? ['profile', 0.6, d] : ['back', 0, d];
    }

    function frame(m) {
      const c = m.c, dets = []; sim.counts.frames++;
      for (const a of sim.agents) {
        if (a.state === 'pending' || a.state === 'gone') continue;
        const head = CT.camSees(m, venue, a.x, 1.6, a.z), body = head || CT.camSees(m, venue, a.x, 0.9, a.z);
        if (!body) continue;
        const [view, qView, ang] = viewClass(a, c);
        const qPx = head ? CT.clamp((head.facePx - R.minFacePx) / (R.goodFacePx - R.minFacePx), 0, 1) : 0;
        const q = qPx * qView;
        const det = { agent: a, facePx: (head || body).facePx, bodyPx: body.bodyPx, view, ang, q, matched: false };
        dets.push(det); sim.counts.dets++;
        const tr = trackFor(a);
        tr.lastSeen = sim.t; tr.cams[c.id] = sim.t; tr.x = a.x; tr.z = a.z; tr.bestQ = Math.max(tr.bestQ, q);
        // fake recogniser: enrolled people (any category) are matched with probability ~ q; non-enrolled never are (no false matches in A1)
        if (q > 0) {
          if (a.person && rnd() < q * 0.97) {
            det.matched = true; tr.matches++; sim.counts.matches++;
            tr.conf = 1 - (1 - tr.conf) * (1 - q * 0.9);
            if (!tr.person) { tr.person = a.person; tr.firstMatch = sim.t; log(`${tr.id} recognised as ${a.person.name} (${CT.CAT[a.person.category].label}) by ${c.id}, ${view}, face ${Math.round(det.facePx)} px`); }
          } else if (q >= 0.4) tr.goodLooks++;
        }
        if (a.carry && !tr.object && body.bodyPx >= R.minBodyPxForObject && rnd() < 0.5) { tr.object = a.carry; tr.objectCam = c.id; log(`${tr.id}: possible ${a.carry} seen by ${c.id}`); }
      }
      sim.frames[c.id] = { t: sim.t, dets };
    }

    function trackFor(a) {
      if (a.track) return a.track;
      const tr = { id: 'T' + String(sim.tracks.length + 1).padStart(2, '0'), agent: a, firstSeen: sim.t, lastSeen: sim.t, cams: {}, person: null, conf: 0, matches: 0, goodLooks: 0, bestQ: 0,
        object: null, zone: null, zoneSince: sim.t, levelSince: {}, loiter: 0, cleared: false, fired: new Set(), x: a.x, z: a.z };
      a.track = tr; sim.tracks.push(tr); log(`${tr.id} new track (${CT.zoneAt(venue, a.x, a.z).name})`);
      return tr;
    }

    function raise(tr, ruleId, text) {
      const r = rules[ruleId]; if (!r || !r.enabled || tr.fired.has(ruleId)) return;
      tr.fired.add(ruleId);
      const al = { id: 'A' + String(sim.alerts.length + 1).padStart(2, '0'), t: sim.t, clock: clock().text, level: r.level, rule: ruleId, ruleName: r.name, track: tr, text, acked: false, resolved: false };
      sim.alerts.push(al); log(`ALERT ${al.id} level ${r.level}: ${r.name} - ${text}`, r.level);
    }

    function evalRules(dt) {
      const clk = clock(), open = CT.isOpen(venue, clk);
      for (const tr of sim.tracks) {
        if (sim.t - tr.lastSeen > 15 || tr.agent.state === 'gone') continue; // lost / gone tracks are not evaluated
        const zone = CT.zoneAt(venue, tr.x, tr.z);
        if (!tr.zone || tr.zone.id !== zone.id) { if (tr.zone) log(`${tr.id} ${tr.zone.name} -> ${zone.name}`); tr.zone = zone; tr.zoneSince = sim.t; }
        if (tr.levelSince[zone.level] === undefined) tr.levelSince[zone.level] = sim.t;
        const p = tr.person, who = p ? p.name : `unrecognised person ${tr.id}`;
        if (p && p.category === 'threat') raise(tr, 'threat_match', `${p.name} at ${zone.name}`);
        if (p && p.category === 'not_trusted') raise(tr, 'not_trusted_match', `${p.name} at ${zone.name}`);
        const unk = !p && !tr.cleared;
        if (unk && zone.level === 1 && sim.t - tr.levelSince[1] >= R.unknownGraceSec) raise(tr, 'unknown_zone1', `${who} in ${zone.name} (${tr.goodLooks} good face views, no match)`);
        if (unk && zone.level === 2) raise(tr, 'unknown_zone2', `${who} entered ${zone.name}`);
        if (unk && zone.level === 0) { tr.loiter += dt; if (tr.loiter >= (rules.loiter_zone0?.seconds || 240)) raise(tr, 'loiter_zone0', `${who} has stayed near the venue ${Math.round(tr.loiter)} s`); }
        if (p && p.access !== 'any' && !open && zone.id !== 'street') raise(tr, 'wrong_time', `${p.name} at ${zone.name} outside open hours (${clk.text})`);
        if (p && ['member', 'staff', 'security'].includes(p.category) && !p.zones.includes('*') && !p.zones.includes(zone.id)) raise(tr, 'wrong_zone', `${p.name} in ${zone.name}`);
        if (tr.object) raise(tr, 'object', `${tr.object} carried by ${who} (${tr.objectCam})`);
        if (tr.object && unk && zone.level >= 1) raise(tr, 'object_unknown', `${tr.object} + ${who} in ${zone.name}`);
      }
    }

    function updateLevel() {
      const lv = Math.max(0, sim.manualLevel ?? 0, ...sim.alerts.filter((a) => !a.resolved).map((a) => a.level));
      if (lv > sim.level) { log(`VENUE LEVEL ${sim.level} -> ${lv}: ${db.alerts.levels[lv]?.name}`, lv); notify(lv); }
      else if (lv < sim.level) log(`Venue level lowered to ${lv}`);
      sim.level = lv;
    }
    function notify(lv) {
      const L = db.alerts.levels.find((l) => l.level === lv); if (!L) return;
      for (const n of L.notify) {
        const targets = n === 'onduty' ? db.duty.officers.filter((o) => o.status === 'on_duty') : n === 'oncall' ? db.duty.officers.filter((o) => o.status === 'on_call') : db.duty.contacts.filter((c) => c.id === n);
        for (const tg of targets) {
          if (sim.notified.has(tg.id + '@' + lv)) continue; sim.notified.add(tg.id + '@' + lv);
          sim.notes.push({ t: sim.t, clock: clock().text, level: lv, to: tg.name, phone: tg.phone, via: tg.radio ? `radio ${tg.radio} + SMS` : tg.phone === '911' ? 'phone call' : 'SMS + call', text: `Level ${lv} ${L.name}` });
        }
      }
    }

    sim.step = (dt) => {
      const t1 = sim.t + dt;
      for (const a of sim.agents) moveAgent(a, dt);
      for (const m of models) { const id = m.c.id; while (camNext[id] <= t1) { sim.t = camNext[id]; frame(m); camNext[id] += 1 / m.c.fps; } }
      sim.t = t1; evalRules(dt); updateLevel();
    };
    sim.runTo = (t, dt = 0.25) => { while (sim.t + 1e-9 < t) sim.step(Math.min(dt, t - sim.t)); };

    // operator actions
    sim.ack = (al) => { al.acked = true; log(`Operator acknowledged ${al.id}`); };
    sim.resolve = (al) => { al.resolved = true; al.acked = true; log(`Operator resolved ${al.id}`); updateLevel(); };
    sim.clearTrack = (tr) => {
      tr.cleared = true; log(`Operator cleared ${tr.id} as a verified visitor`);
      sim.alerts.filter((a) => a.track === tr && ['unknown_zone1', 'unknown_zone2', 'loiter_zone0'].includes(a.rule)).forEach((a) => { a.resolved = a.acked = true; });
      updateLevel();
    };
    sim.declare = (lv) => { sim.manualLevel = lv; log(`Operator declared level ${lv}: ${db.alerts.levels[lv]?.name}`, lv); updateLevel(); };
    sim.allClear = () => { sim.manualLevel = null; sim.alerts.forEach((a) => (a.resolved = a.acked = true)); log('Operator: ALL CLEAR'); updateLevel(); };
    sim.trackStatus = (tr) => {
      if (tr.person) return { text: `${tr.person.name}`, color: CT.CAT[tr.person.category].color, kind: tr.person.category };
      if (tr.cleared) return { text: `${tr.id} visitor (cleared)`, color: CT.STATUS.cleared, kind: 'cleared' };
      if (tr.fired.size) return { text: `${tr.id} UNKNOWN`, color: CT.STATUS.flagged, kind: 'flagged' };
      return { text: `${tr.id} ${tr.bestQ > 0 ? 'unknown' : 'no face yet'}`, color: tr.bestQ > 0 ? CT.STATUS.unknown : CT.STATUS.unseen, kind: 'unknown' };
    };
    for (const a of sim.agents) if (a.cfg.preTracked && a.person) { const tr = trackFor(a); tr.person = a.person; tr.conf = 0.9; tr.firstMatch = 0; log(`${tr.id} ${a.person.name}: identified on arrival before the scenario start`); }
    log(`Scenario "${scenario.name}" started (${clock().text}; venue ${CT.isOpen(venue, clock()) ? 'OPEN' : 'CLOSED'} by schedule)`);
    return sim;
  };
})(window.CT);
