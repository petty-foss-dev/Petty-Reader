// Every sound here is synthesized, so there are no audio assets to license or ship.

let ctx;
let master;
let fxBus;
let ambienceBus;
let current = null;
const buffers = {};

function audio() {
  if (!ctx) {
    ctx = new AudioContext();
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -6;
    limiter.knee.value = 0;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.25;
    limiter.connect(ctx.destination);
    master = gain(1, limiter);
    fxBus = gain(1.3, master);
    ambienceBus = gain(1.7, master);
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

export function setVolume(value) {
  audio();
  master.gain.setTargetAtTime(value, ctx.currentTime, 0.05);
}

const rand = (min, max) => min + Math.random() * (max - min);
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const midi = (n) => 440 * 2 ** ((n - 69) / 12);

function gain(value, destination) {
  const node = ctx.createGain();
  node.gain.value = value;
  if (destination) node.connect(destination);
  return node;
}

function filter(type, frequency, q = 0.7, destination) {
  const node = ctx.createBiquadFilter();
  node.type = type;
  node.frequency.value = frequency;
  node.Q.value = q;
  if (destination) node.connect(destination);
  return node;
}

function panner(pan, destination) {
  const node = ctx.createStereoPanner();
  node.pan.value = pan;
  node.connect(destination);
  return node;
}

function buffer(kind) {
  if (buffers[kind]) return buffers[kind];
  const length = ctx.sampleRate * (kind === "impulse" ? 2.4 : 4);
  const channels = kind === "impulse" ? 2 : 1;
  const buf = ctx.createBuffer(channels, length, ctx.sampleRate);
  for (let ch = 0; ch < channels; ch++) {
    const data = buf.getChannelData(ch);
    let last = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      if (kind === "white") data[i] = white;
      else if (kind === "brown") data[i] = last = (last + 0.02 * white) / 1.02;
      else if (kind === "crackle") data[i] = Math.random() < 0.00035 ? white * rand(0.3, 1) : 0;
      else data[i] = white * (1 - i / length) ** 3.2;
    }
    if (kind === "brown") for (let i = 0; i < length; i++) data[i] *= 3.5;
  }
  return (buffers[kind] = buf);
}

function source(kind, destination, { loop = true, rate = 1 } = {}) {
  const node = ctx.createBufferSource();
  node.buffer = buffer(kind);
  node.loop = loop;
  node.playbackRate.value = rate;
  node.connect(destination);
  return node;
}

function envelope(param, at, peak, attack, release) {
  param.setValueAtTime(0.0001, at);
  param.exponentialRampToValueAtTime(peak, at + attack);
  param.exponentialRampToValueAtTime(0.0001, at + attack + release);
}

function burst(at, { type = "bandpass", frequency, q = 1, peak, attack = 0.002, release, pan = 0, out = fxBus }) {
  const amp = gain(0, panner(pan, out));
  const shape = filter(type, frequency, q, amp);
  const src = source("white", shape, { loop: false });
  envelope(amp.gain, at, peak, attack, release);
  src.start(at, rand(0, 3));
  src.stop(at + attack + release + 0.05);
}

function tone(at, { frequency, to, type = "sine", peak, attack = 0.005, release, out = fxBus, glide = release }) {
  const amp = gain(0, out);
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, at);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, at + glide);
  osc.connect(amp);
  envelope(amp.gain, at, peak, attack, release);
  osc.start(at);
  osc.stop(at + attack + release + 0.05);
  return osc;
}

export function playTurn(kind) {
  if (kind === "off") return;
  const c = audio();
  const t = c.currentTime + 0.01;
  const amp = gain(0, fxBus);
  const shape = filter("bandpass", 900, kind === "hardcover" ? 1.1 : 0.8, amp);
  const src = source("white", shape, { loop: false, rate: rand(0.9, 1.1) });

  if (kind === "hardcover") {
    shape.frequency.setValueAtTime(380, t);
    shape.frequency.exponentialRampToValueAtTime(1500, t + 0.22);
    shape.frequency.exponentialRampToValueAtTime(600, t + 0.42);
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(0.32, t + 0.12);
    amp.gain.exponentialRampToValueAtTime(0.22, t + 0.3);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + 0.46);
    tone(t + 0.4, { frequency: 105, to: 48, peak: 0.55, release: 0.16, out: filter("lowpass", 400, 0.7, fxBus) });
    burst(t + 0.4, { frequency: 260, q: 2.5, peak: 0.35, release: 0.08 });
  } else {
    const top = rand(3800, 5200);
    shape.frequency.setValueAtTime(1300, t);
    shape.frequency.exponentialRampToValueAtTime(top, t + 0.16);
    shape.frequency.exponentialRampToValueAtTime(2200, t + 0.34);
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(0.42, t + 0.05);
    amp.gain.exponentialRampToValueAtTime(0.18, t + 0.17);
    amp.gain.exponentialRampToValueAtTime(0.5, t + 0.25);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + 0.38);
    burst(t + 0.26, { type: "highpass", frequency: 3200, peak: 0.28, release: 0.03 });
  }
  src.start(t, rand(0, 3));
  src.stop(t + 0.6);
}

export function playSip() {
  const c = audio();
  const t = c.currentTime + 0.01;
  for (let i = 0; i < 3; i++) {
    const at = t + i * rand(0.13, 0.18);
    const amp = gain(0, fxBus);
    const shape = filter("bandpass", rand(650, 1000), 4, amp);
    shape.frequency.exponentialRampToValueAtTime(shape.frequency.value * 1.35, at + 0.1);
    const src = source("white", shape, { loop: false });
    envelope(amp.gain, at, rand(1.6, 2.2), 0.02, 0.1);
    src.start(at, rand(0, 3));
    src.stop(at + 0.2);
  }
  const lp = filter("lowpass", 700, 0.7, fxBus);
  tone(t + 0.62, { frequency: 280, to: 105, peak: 1, attack: 0.012, release: 0.11, out: lp });
}

export function playPour() {
  const c = audio();
  const t = c.currentTime + 0.01;
  const amp = gain(0, fxBus);
  const shape = filter("bandpass", 420, 5, amp);
  shape.frequency.exponentialRampToValueAtTime(1150, t + 1.6);
  const src = source("white", shape);
  amp.gain.setValueAtTime(0.0001, t);
  amp.gain.exponentialRampToValueAtTime(1.2, t + 0.12);
  amp.gain.setValueAtTime(1.2, t + 1.45);
  amp.gain.exponentialRampToValueAtTime(0.0001, t + 1.75);
  src.start(t, rand(0, 2));
  src.stop(t + 1.8);
}

export function setAmbience(kind) {
  if (current?.kind === kind) return;
  const previous = current;
  current = null;
  if (previous) {
    previous.bus.gain.setTargetAtTime(0, ctx.currentTime, 0.5);
    setTimeout(() => previous.stop(), 2500);
  }
  if (kind === "off" || !AMBIENCES[kind]) return;

  const c = audio();
  const bus = gain(0, ambienceBus);
  bus.gain.setTargetAtTime(1, c.currentTime, 0.6);
  const timers = [];
  const sources = [];
  const every = (ms, fn) => timers.push(setInterval(fn, ms));
  const later = (fn, ms) => {
    const id = setTimeout(() => {
      timers.splice(timers.indexOf(id), 1);
      fn();
    }, ms);
    timers.push(id);
  };
  const loop = (kind, destination, options) => {
    const src = source(kind, destination, options);
    src.start(0, rand(0, 3));
    sources.push(src);
    return src;
  };

  const own = (node) => (node.start(), sources.push(node), node);

  AMBIENCES[kind]({ bus, every, later, loop, own });
  current = {
    kind,
    bus,
    stop() {
      timers.forEach((id) => (clearInterval(id), clearTimeout(id)));
      sources.forEach((src) => src.stop());
      bus.disconnect();
    },
  };
}

const AMBIENCES = {
  rain({ bus, every, loop }) {
    loop("white", filter("highpass", 450, 0.5, filter("lowpass", 6500, 0.5, gain(0.08, bus))));
    loop("brown", filter("lowpass", 800, 0.5, gain(0.28, bus)));
    every(45, () => {
      const now = ctx.currentTime;
      const drops = Math.random() < 0.5 ? 1 : Math.floor(rand(1, 4));
      for (let i = 0; i < drops; i++) {
        burst(now + rand(0.05, 0.1), {
          frequency: rand(1600, 7000),
          q: rand(1, 5),
          peak: rand(0.02, 0.11),
          release: rand(0.012, 0.05),
          pan: rand(-0.8, 0.8),
          out: bus,
        });
      }
    });
  },

  forest({ bus, every, later, loop }) {
    const windGain = gain(0.25, bus);
    const windTone = filter("lowpass", 550, 0.6, windGain);
    loop("brown", windTone);
    const rustleGain = gain(0.015, bus);
    loop("white", filter("bandpass", 2600, 0.6, rustleGain));
    const brookGain = gain(0.02, bus);
    loop("white", filter("bandpass", 1300, 1.4, brookGain), { rate: 0.7 });
    every(1800, () => {
      const now = ctx.currentTime;
      windGain.gain.setTargetAtTime(rand(0.12, 0.45), now, 1.4);
      windTone.frequency.setTargetAtTime(rand(300, 900), now, 1.4);
      rustleGain.gain.setTargetAtTime(rand(0.004, 0.04), now, 0.8);
    });
    every(110, () => brookGain.gain.setTargetAtTime(rand(0.012, 0.03), ctx.currentTime, 0.05));

    const singer = () => {
      const now = ctx.currentTime + 0.05;
      const out = panner(rand(-0.9, 0.9), filter("lowpass", rand(4000, 9000), 0.7, gain(rand(0.25, 0.7), bus)));
      const song = pick(["whistle", "trill", "coo", "whistle"]);
      if (song === "whistle") {
        const base = rand(2300, 3700);
        const notes = Math.floor(rand(2, 5));
        for (let i = 0; i < notes; i++) {
          const f = base * pick([1, 1.12, 1.25, 0.9]);
          tone(now + i * rand(0.16, 0.24), { frequency: f, to: f * rand(1.15, 1.4), peak: 0.08, attack: 0.015, release: 0.12, out });
        }
      } else if (song === "trill") {
        const base = rand(3800, 5200);
        const notes = Math.floor(rand(8, 15));
        for (let i = 0; i < notes; i++) {
          tone(now + i * 0.055, { frequency: base, to: base * 0.82, peak: 0.05, attack: 0.006, release: 0.04, out });
        }
      } else {
        const base = rand(480, 650);
        [0, 0.45, 0.75].forEach((offset, i) => {
          tone(now + offset, { frequency: base * (i === 0 ? 1 : 0.94), to: base * 0.9, peak: 0.12, attack: 0.08, release: 0.32, out });
        });
      }
      later(singer, rand(1500, 6500));
    };
    later(singer, 800);
  },

  cafe({ bus, every, later, loop }) {
    const reverb = ctx.createConvolver();
    reverb.buffer = buffer("impulse");
    reverb.connect(gain(0.5, bus));
    const room = gain(1, bus);
    room.connect(reverb);

    loop("brown", filter("lowpass", 260, 0.6, gain(0.3, bus)));

    const voices = Array.from({ length: 9 }, () => {
      const amp = gain(0, panner(rand(-0.9, 0.9), room));
      const formant = filter("bandpass", rand(350, 900), 1.6, amp);
      loop("white", filter("lowpass", 1400, 0.6, formant), { rate: rand(0.6, 0.9) });
      return { amp, formant, talking: Math.random() < 0.5, loudness: rand(0.025, 0.07) };
    });
    every(95, () => {
      const now = ctx.currentTime;
      for (const voice of voices) {
        if (Math.random() < 0.01) voice.talking = !voice.talking;
        const level = voice.talking && Math.random() < 0.8 ? voice.loudness * rand(0.4, 1) : 0.0001;
        voice.amp.gain.setTargetAtTime(level, now, 0.035);
        voice.formant.frequency.setTargetAtTime(rand(320, 1100), now, 0.04);
      }
    });

    const clink = () => {
      const now = ctx.currentTime + 0.05;
      const base = rand(1900, 3300);
      const out = panner(rand(-0.7, 0.7), room);
      const hits = Math.random() < 0.3 ? 2 : 1;
      for (let h = 0; h < hits; h++) {
        [1, 2.76, 5.4].forEach((ratio, i) => {
          tone(now + h * 0.12, { frequency: base * ratio, peak: 0.035 / (i + 1), attack: 0.002, release: rand(0.25, 0.55), out });
        });
      }
      later(clink, rand(2500, 9000));
    };
    later(clink, 1500);

    const espresso = () => {
      const now = ctx.currentTime;
      const amp = gain(0, room);
      const src = source("white", filter("bandpass", 3600, 0.8, amp));
      amp.gain.setValueAtTime(0.0001, now);
      amp.gain.exponentialRampToValueAtTime(0.03, now + 0.6);
      amp.gain.setValueAtTime(0.03, now + 3.2);
      amp.gain.exponentialRampToValueAtTime(0.0001, now + 4);
      src.start(now, rand(0, 3));
      src.stop(now + 4.1);
      later(espresso, rand(25000, 50000));
    };
    later(espresso, rand(8000, 20000));
  },

  lofi({ bus, every, loop, own }) {
    const tape = filter("lowpass", 3000, 0.5, bus);
    const wow = ctx.createDelay(0.05);
    wow.delayTime.value = 0.012;
    wow.connect(tape);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.55;
    lfo.connect(gain(0.0016, wow.delayTime));
    own(lfo);

    const reverb = ctx.createConvolver();
    reverb.buffer = buffer("impulse");
    reverb.connect(gain(0.25, tape));

    const keys = gain(0.85, wow);
    keys.connect(reverb);
    const tremolo = ctx.createOscillator();
    tremolo.frequency.value = 4.2;
    tremolo.connect(gain(0.08, keys.gain));
    own(tremolo);
    const drums = gain(1.1, tape);

    loop("crackle", gain(0.5, bus));
    loop("white", filter("bandpass", 5200, 0.7, gain(0.012, bus)));

    const progressions = [
      [
        { bass: 38, notes: [53, 57, 60, 64] },
        { bass: 43, notes: [53, 57, 59, 64] },
        { bass: 36, notes: [52, 55, 59, 62] },
        { bass: 33, notes: [55, 58, 61, 64] },
      ],
      [
        { bass: 41, notes: [52, 55, 57, 60] },
        { bass: 40, notes: [50, 55, 59, 62] },
        { bass: 38, notes: [53, 57, 60, 64] },
        { bass: 36, notes: [52, 55, 59, 62] },
      ],
    ];
    const kick = [0, 7, 10];
    const snare = [4, 12];
    const step = 60 / 74 / 4;
    let next = ctx.currentTime + 0.15;
    let index = 0;

    const epiano = (at, note, velocity, length) => {
      const f = midi(note);
      const out = gain(0, keys);
      out.gain.setValueAtTime(0.0001, at);
      out.gain.exponentialRampToValueAtTime(velocity, at + 0.008);
      out.gain.exponentialRampToValueAtTime(velocity * 0.35, at + 0.6);
      out.gain.exponentialRampToValueAtTime(0.0001, at + length);
      [
        [f, "sine", 1],
        [f * 2.001, "sine", 0.12],
        [f * 1.003, "triangle", 0.25],
      ].forEach(([freq, type, level]) => {
        const osc = ctx.createOscillator();
        osc.type = type;
        osc.frequency.value = freq;
        osc.connect(gain(level, out));
        osc.start(at);
        osc.stop(at + length + 0.05);
      });
    };

    every(50, () => {
      while (next < ctx.currentTime + 0.25) {
        const sixteenth = index % 16;
        const bar = Math.floor(index / 16);
        const chord = progressions[Math.floor(bar / 8) % 2][bar % 4];
        const swing = sixteenth % 2 === 1 ? step * 0.18 : 0;
        const at = next + swing;

        if (kick.includes(sixteenth)) tone(at, { frequency: 140, to: 44, peak: 0.85, attack: 0.003, release: 0.32, glide: 0.12, out: drums });
        if (snare.includes(sixteenth)) {
          burst(at + 0.012, { frequency: 1900, q: 0.8, peak: 0.28, release: 0.17, out: drums });
          tone(at + 0.012, { frequency: 190, type: "triangle", peak: 0.16, release: 0.07, out: drums });
        }
        if (sixteenth % 2 === 0 || Math.random() < 0.15) {
          burst(at, { type: "highpass", frequency: 7500, peak: rand(0.03, 0.07), release: 0.035, out: drums });
        }
        if (sixteenth === 0 || sixteenth === 6) {
          chord.notes.forEach((note, i) => epiano(at + i * 0.018, note, sixteenth === 0 ? 0.09 : 0.06, step * 9));
        }
        if (sixteenth === 0 || sixteenth === 10) {
          tone(at, { frequency: midi(chord.bass), peak: 0.45, attack: 0.01, release: step * 7, out: keys });
        }
        if (sixteenth % 4 === 2 && Math.random() < 0.3) {
          epiano(at, pick(chord.notes) + 12, 0.05, step * 6);
        }
        next += step;
        index++;
      }
    });
  },
};
