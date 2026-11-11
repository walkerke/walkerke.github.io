// Day 11 player: steps saltwater disposal rates month by month (feature-state on the wells layer), pulses each
// earthquake when its time comes, and plays one synthesized sound per earthquake through Web Audio.
// The same voice() draws each sound for the live page (AudioContext) and for the video (OfflineAudioContext).
(function () {
  var CFG = window.DAY11 || {};
  var SPM = CFG.secPerMonth || 0.5;          // playback seconds per month
  var PULSE = CFG.pulseMonths || 2.5;        // how long a ring keeps expanding, in months
  var LON = [-106.65, -93.5];                // Texas, west to east, for stereo position
  var map, rates, totals, pendN, months, quakes = [], NK = 0;
  var t = 0, playing = false, lastK = -1, qi = 0;
  var actx = null, master = null, soundOn = false, noiseBuf = null;
  var clock0 = 0, t0 = 0;
  var pending = [], resumeQi = -1, pausedAt = -1;   // sounds queued ahead of the clock, so pause and seek can cancel them
  var ui = {};

  // ---------- sound ----------
  // Two voices. "timpani": a tuned drum, higher and shorter for small earthquakes, low and ringing for large ones.
  // "boom": a pitch-dropping thump with a low rumble, like distant blasting. Both go through a short hall reverb.
  var VOICE = (new URLSearchParams(location.search).get("voice")) || CFG.voice || "timpani";
  function seeded(seed) { var s = seed; return function () { s = (s * 16807) % 2147483647; return (s / 2147483647) * 2 - 1; }; }
  function makeNoise(ctx) {   // fixed seed so the offline render is repeatable
    var n = Math.floor(ctx.sampleRate * 3), b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0), r = seeded(12345);
    for (var i = 0; i < n; i++) d[i] = r();
    return b;
  }
  function makeReverb(ctx) {
    var sr = ctx.sampleRate, n = Math.floor(sr * 2.6), ir = ctx.createBuffer(2, n, sr);
    for (var c = 0; c < 2; c++) {
      var d = ir.getChannelData(c), r = seeded(777 + c), lp = 0;
      for (var i = 0; i < n; i++) { lp = lp * 0.82 + r() * 0.18; d[i] = lp * Math.exp(-i / (sr * 0.62)) * (i < sr * 0.012 ? i / (sr * 0.012) : 1); }
    }
    var cv = ctx.createConvolver(); cv.buffer = ir; return cv;
  }
  function makeMaster(ctx) {
    var comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 10; comp.ratio.value = 5; comp.attack.value = 0.003; comp.release.value = 0.3;
    var out = ctx.createGain(); out.gain.value = 0.95; comp.connect(out); out.connect(ctx.destination);
    var bus = ctx.createGain(), wet = ctx.createGain(), rv = makeReverb(ctx);
    wet.gain.value = 0.32; bus.connect(comp); bus.connect(rv); rv.connect(wet); wet.connect(comp);
    bus.out = out;
    return bus;
  }
  function env(ctx, g, when, peak, attack, tau) {
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(peak, when + attack);
    g.gain.setTargetAtTime(0, when + attack, tau);
  }
  function osc(ctx, dest, when, f0, f1, glide, peak, attack, tau) {
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(f0, when); o.frequency.exponentialRampToValueAtTime(f1, when + glide);
    env(ctx, g, when, peak, attack, tau); o.connect(g); g.connect(dest); o.start(when); o.stop(when + attack + tau * 6);
  }
  function noise(ctx, dest, buf, when, type, freq, q, peak, tau) {
    var src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = buf; f.type = type; f.frequency.value = freq; f.Q.value = q;
    env(ctx, g, when, peak, 0.003, tau); src.connect(f); f.connect(g); g.connect(dest);
    var off = (when * 7.3) % 1.5; src.start(when, off); src.stop(when + Math.min(2.99 - off, tau * 6));
  }
  // magnitude -> timpani note (D minor pentatonic, falling): D3 C3 A2 G2 F2 D2 C2
  var NOTES = [[2.8, 146.83], [3.1, 130.81], [3.5, 110.0], [3.9, 98.0], [4.4, 87.31], [5.0, 73.42], [99, 65.41]];
  function voice(ctx, bus, buf, when, mag, lon, kind) {
    kind = kind || VOICE;
    var m = Math.max(0, mag - 2.5), k = Math.min(1, m / 2.9);       // k: 0 at M2.5, 1 at M5.4
    var amp = 0.06 * Math.pow(10, 0.36 * m);                         // M2.5 0.06 -> M5.4 about 0.66
    var pan = ctx.createStereoPanner();
    pan.pan.value = Math.max(-1, Math.min(1, ((lon - LON[0]) / (LON[1] - LON[0])) * 2 - 1)) * 0.6;
    pan.connect(bus);
    if (kind === "boom") {
      var shaper = ctx.createWaveShaper(), curve = new Float32Array(1024);
      for (var i = 0; i < 1024; i++) { var x = i / 511.5 - 1; curve[i] = Math.tanh(2.2 * x) / Math.tanh(2.2); }
      shaper.curve = curve; shaper.connect(pan);                        // gentle saturation keeps the low end audible on small speakers
      var tau = 0.18 + 0.75 * k;
      osc(ctx, shaper, when, 150 - 40 * k, 52 - 20 * k, 0.12 + 0.5 * k, amp, 0.004, tau);
      noise(ctx, shaper, buf, when, "lowpass", 260 - 120 * k, 0.7, amp * (0.7 + 0.6 * k), 0.12 + 1.1 * k);   // rumble
      noise(ctx, pan, buf, when, "bandpass", 900, 0.9, amp * 0.25, 0.02 + 0.03 * k);                       // the crack
    } else {
      var f = NOTES.filter(function (n) { return mag < n[0]; })[0][1];
      var tau1 = 0.28 + 1.1 * k;
      // principal tone and the overtones of a kettledrum membrane, higher ones dying away faster
      [[1, 1], [1.504, 0.5], [1.742, 0.28], [2.0, 0.32], [2.245, 0.16], [2.494, 0.11]].forEach(function (p, j) {
        osc(ctx, pan, when, f * p[0] * 1.025, f * p[0], 0.14, amp * p[1], 0.005, tau1 / (1 + 0.55 * j));
      });
      osc(ctx, pan, when, f * 0.7, f * 0.55, 0.06, amp * 0.9, 0.003, 0.07 + 0.08 * k);   // the low thud of the strike
      noise(ctx, pan, buf, when, "bandpass", 700 + 400 * (1 - k), 0.8, amp * 0.35, 0.012);  // felt mallet
    }
  }
  function ensureAudio() {
    if (!actx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      actx = new AC(); master = makeMaster(actx); noiseBuf = makeNoise(actx);
    }
    if (actx.state === "suspended") actx.resume();
    return true;
  }

  // ---------- clock ----------
  // visuals run on the page clock so a suspended audio context can never stall the map; sounds are placed relative to it
  function now() { return performance.now() / 1000; }
  function anchor() { clock0 = now(); t0 = t; }
  function seekQuakeIndex(tt) { qi = 0; while (qi < quakes.length && quakes[qi].t <= tt) qi++; }

  // ---------- map ----------
  function setMonth(k) {
    k = Math.max(0, Math.min(NK - 1, k));
    if (k === lastK) return;
    var prev = lastK >= 0 ? lastK : -1;
    for (var i = 0; i < rates.length; i++) {
      var v = rates[i][k];
      if (prev < 0 || rates[i][prev] !== v) map.setFeatureState({ source: "wells", id: i }, { r: v });
    }
    lastK = k;
    ui.month.textContent = months[k];
    ui.rate.textContent = (totals[k] / 1e6).toFixed(1);
    ui.rateLabel.textContent = pendN[k] > 0
      ? "million barrels a day reported so far; " + pendN[k].toLocaleString("en-US") + " wells not yet on file"
      : "million barrels a day of oilfield wastewater injected";
  }
  function drawQuakes(tt) {
    map.setFilter("quake-dots", ["<=", ["get", "t"], tt]);
    map.setFilter("quake-rings", ["all", ["<=", ["get", "t"], tt], [">", ["get", "t"], tt - PULSE]]);
    var age = ["/", ["-", tt, ["get", "t"]], PULSE];   // 0 at the moment of the quake, 1 when the ring is gone
    var base = ["interpolate", ["linear"], ["get", "mag"], 2.5, 4, 4, 14, 5.4, 34];
    map.setPaintProperty("quake-rings", "circle-radius", ["*", base, ["+", 0.35, ["*", 1.9, ["sqrt", age]]]]);
    map.setPaintProperty("quake-rings", "circle-stroke-opacity", ["*", 0.95, ["-", 1, age]]);
    map.setPaintProperty("quake-flash", "circle-opacity", ["max", 0, ["-", 0.9, ["*", 6, age]]]);
    map.setFilter("quake-flash", ["all", ["<=", ["get", "t"], tt], [">", ["get", "t"], tt - PULSE / 6]]);
    var n = 0; for (var i = 0; i < quakes.length && quakes[i].t <= tt; i++) n++;
    ui.count.textContent = n.toLocaleString("en-US");
  }
  function show(tt) {
    t = Math.max(0, Math.min(NK, tt));
    setMonth(Math.floor(Math.min(t, NK - 1e-6)));
    drawQuakes(t);
    ui.scrub.value = String(t);
  }

  // ---------- playback ----------
  function schedule(tt, upTo) {
    var live = soundOn && actx && actx.state === "running";
    if (live) pending = pending.filter(function (p) { return p.when > actx.currentTime; });
    while (qi < quakes.length && quakes[qi].t <= upTo) {
      var i = qi++, q = quakes[i];
      if (!live) continue;
      var when = actx.currentTime + 0.03 + Math.max(0, (q.t - tt) * SPM), gate = actx.createGain();
      gate.connect(master);
      voice(actx, gate, noiseBuf, when, q.mag, q.lon);
      pending.push({ i: i, when: when, gate: gate });
    }
  }
  // silence queued sounds that have not started yet; returns the earliest cancelled quake index, or -1
  function cancelPending() {
    var first = -1, now = actx ? actx.currentTime : 0;
    pending.forEach(function (p) {
      if (p.when <= now) return;
      p.gate.gain.value = 0; p.gate.disconnect();
      if (first < 0 || p.i < first) first = p.i;
    });
    pending = [];
    return first;
  }
  function frame() {
    if (!playing) return;
    var tt = t0 + (now() - clock0) / SPM;
    schedule(tt, tt + 0.12 / SPM);   // a little lookahead keeps sound on time
    show(tt);
    if (t >= NK) { pause(); return; }
    requestAnimationFrame(frame);
  }
  function play() {
    if (t >= NK) { show(0); }
    playing = true; anchor(); seekQuakeIndex(t);
    if (resumeQi >= 0 && t === pausedAt) qi = Math.min(qi, resumeQi);   // resume replays only what pause cancelled
    resumeQi = -1;
    ui.play.setAttribute("aria-label", "Pause"); ui.play.classList.add("on");
    requestAnimationFrame(frame);
  }
  function pause() {
    resumeQi = cancelPending(); pausedAt = t;
    playing = false; ui.play.setAttribute("aria-label", "Play"); ui.play.classList.remove("on");
  }
  function setSound(on) {
    if (on && !ensureAudio()) on = false;
    var tt = t;
    soundOn = on;
    ui.sound.classList.toggle("on", on);
    ui.sound.setAttribute("aria-pressed", on ? "true" : "false");
    ui.sound.querySelector("span").textContent = on ? "Sound on" : "Sound off";
    if (master && actx) master.out.gain.setTargetAtTime(on ? 0.95 : 0, actx.currentTime, 0.03);
    cancelPending(); resumeQi = -1;
    t = tt; anchor(); seekQuakeIndex(t);
  }

  // ---------- offline audio for the video ----------
  function wavBase64(buf) {
    var ch = [buf.getChannelData(0), buf.getChannelData(1)], n = ch[0].length, bytes = new DataView(new ArrayBuffer(44 + n * 4));
    function str(o, s) { for (var i = 0; i < s.length; i++) bytes.setUint8(o + i, s.charCodeAt(i)); }
    str(0, "RIFF"); bytes.setUint32(4, 36 + n * 4, true); str(8, "WAVEfmt "); bytes.setUint32(16, 16, true);
    bytes.setUint16(20, 1, true); bytes.setUint16(22, 2, true); bytes.setUint32(24, buf.sampleRate, true);
    bytes.setUint32(28, buf.sampleRate * 4, true); bytes.setUint16(32, 4, true); bytes.setUint16(34, 16, true);
    str(36, "data"); bytes.setUint32(40, n * 4, true);
    for (var i = 0, o = 44; i < n; i++) for (var c = 0; c < 2; c++, o += 2) {
      var s = Math.max(-1, Math.min(1, ch[c][i])); bytes.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
    var u8 = new Uint8Array(bytes.buffer), out = "", step = 0x8000;
    for (var j = 0; j < u8.length; j += step) out += String.fromCharCode.apply(null, u8.subarray(j, j + step));
    return btoa(out);
  }
  // Video soundtrack: each quake sounds at lead + t * spm. opts.kind picks the voice; opts.from/opts.to (months)
  // render just a stretch of the timeline, starting at lead.
  window.day11RenderAudio = function (duration, lead, spm, opts) {
    opts = opts || {};
    var from = opts.from || 0, to = opts.to == null ? Infinity : opts.to;
    var sr = 44100, ctx = new OfflineAudioContext(2, Math.ceil(sr * duration), sr);
    var m = makeMaster(ctx), nb = makeNoise(ctx);
    quakes.forEach(function (q) {
      if (q.t < from || q.t >= to) return;
      var w = lead + (q.t - from) * spm; if (w < duration - 0.5) voice(ctx, m, nb, w, q.mag, q.lon, opts.kind);
    });
    return ctx.startRendering().then(function (buf) { window.day11Wav = wavBase64(buf); return window.day11Wav.length; });
  };
  // Single hits from M2.5 to M5.4, for auditioning a voice
  window.day11RenderHits = function (kind) {
    var mags = [2.5, 3.0, 3.5, 4.0, 4.5, 5.0, 5.4], sr = 44100, gap = 1.8;
    var ctx = new OfflineAudioContext(2, Math.ceil(sr * (mags.length * gap + 3)), sr), m = makeMaster(ctx), nb = makeNoise(ctx);
    mags.forEach(function (g, i) { voice(ctx, m, nb, 0.3 + i * gap, g, -100.1, kind); });
    return ctx.startRendering().then(function (buf) { window.day11Wav = wavBase64(buf); return window.day11Wav.length; });
  };

  // ---------- setup ----------
  window.day11 = { show: show, months: function () { return NK; }, ready: false };
  function init(m) {
    map = m;
    var get = function (u) { return fetch(u).then(function (r) { return r.json(); }); };
    Promise.all([get(CFG.rates), get(CFG.quakes)]).then(function (res) {
      var d = res[0];
      rates = d.rates; months = d.months.map(function (s) {
        var p = s.split("-"); return new Date(+p[0], +p[1] - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
      });
      NK = months.length;
      // reported volume only; negative rates mark wells not yet on file for the month
      totals = months.map(function (_, k) { var s = 0; for (var i = 0; i < rates.length; i++) if (rates[i][k] > 0) s += rates[i][k]; return s; });
      pendN = months.map(function (_, k) { var n = 0; for (var i = 0; i < rates.length; i++) if (rates[i][k] < 0) n++; return n; });
      quakes = res[1].map(function (q) { return { t: q[0], mag: q[1], lon: q[2] }; }).sort(function (a, b) { return a.t - b.t; });
      ui.scrub.max = String(NK);
      show(CFG.start != null ? CFG.start : NK);
      window.day11.ready = true;
    });
  }
  function buildUI() {
    ui.box = document.getElementById("player");
    ui.play = document.getElementById("pl-play");
    ui.sound = document.getElementById("pl-sound");
    ui.scrub = document.getElementById("pl-scrub");
    ui.month = document.getElementById("pl-month");
    ui.rate = document.getElementById("pl-rate");
    ui.rateLabel = document.getElementById("pl-rate-label");
    ui.count = document.getElementById("pl-count");
    ui.play.addEventListener("click", function () {
      if (playing) { pause(); return; }
      if (!soundOn && !ui.sound.dataset.touched) setSound(true);   // first play turns sound on; the toggle can mute it
      play();
    });
    ui.sound.addEventListener("click", function () { ui.sound.dataset.touched = "1"; setSound(!soundOn); });
    ui.scrub.addEventListener("input", function () {
      var was = playing; pause(); show(parseFloat(ui.scrub.value)); if (was) play();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === " " && e.target === document.body) { e.preventDefault(); ui.play.click(); }
    });
  }
  window.addEventListener("load", function () {
    buildUI();
    var tries = 0, iv = setInterval(function () {
      var w = window.HTMLWidgets && HTMLWidgets.find("#map");
      var m = w && w.getMap && w.getMap();
      if (m && m.getSource && m.getSource("quakes") && m.getLayer("quake-rings")) {
        clearInterval(iv);
        if (m.loaded()) init(m); else m.once("idle", function () { init(m); });
      } else if (++tries > 200) clearInterval(iv);
    }, 100);
  });
})();
