/* Factory Defense — WebAudio синтез (без внешних файлов) */
var FD = window.FD || (window.FD = {});
(function () {
  'use strict';

  var ctx = null, master = null, musicGain = null, sfxGain = null;
  var musicOn = false, sfxOn = true, musicTimer = null, noteIdx = 0;

  function ensure() {
    if (ctx) return true;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.85;
      master.connect(ctx.destination);
      sfxGain = ctx.createGain();
      sfxGain.gain.value = 0.6;
      sfxGain.connect(master);
      musicGain = ctx.createGain();
      musicGain.gain.value = 0.16;
      musicGain.connect(master);
      return true;
    } catch (e) { return false; }
  }

  function resume() {
    if (!ensure()) return;
    if (ctx.state === 'suspended') ctx.resume();
  }

  function env(gainNode, t0, a, d, peak) {
    var g = gainNode.gain;
    g.cancelScheduledValues(t0);
    g.setValueAtTime(0.0001, t0);
    g.exponentialRampToValueAtTime(peak, t0 + a);
    g.exponentialRampToValueAtTime(0.0001, t0 + a + d);
  }

  function osc(type, freq, t0, a, d, peak, dest, freqEnd) {
    var o = ctx.createOscillator();
    var g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (freqEnd != null) o.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t0 + a + d);
    env(g, t0, a, d, peak);
    o.connect(g); g.connect(dest || sfxGain);
    o.start(t0); o.stop(t0 + a + d + 0.05);
  }

  function noise(t0, dur, peak, filterFreq, dest) {
    var len = Math.max(1, (ctx.sampleRate * dur) | 0);
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    var src = ctx.createBufferSource();
    src.buffer = buf;
    var g = ctx.createGain();
    g.gain.value = peak;
    var f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = filterFreq || 1200;
    src.connect(f); f.connect(g); g.connect(dest || sfxGain);
    src.start(t0);
    src.stop(t0 + dur);
  }

  var SFX = {
    click:   function (t) { osc('square', 660, t, 0.005, 0.05, 0.25); },
    select:  function (t) { osc('square', 440, t, 0.005, 0.07, 0.3); osc('square', 660, t + 0.05, 0.005, 0.07, 0.25); },
    error:   function (t) { osc('sawtooth', 160, t, 0.01, 0.16, 0.3, sfxGain, 90); },
    build:   function (t) { noise(t, 0.09, 0.35, 900); osc('square', 220, t, 0.005, 0.09, 0.22, sfxGain, 330); },
    sell:    function (t) { osc('square', 520, t, 0.005, 0.05, 0.22); osc('square', 360, t + 0.05, 0.005, 0.08, 0.2); },
    shoot:   function (t) { noise(t, 0.05, 0.22, 2400); osc('square', 700, t, 0.002, 0.045, 0.16, sfxGain, 240); },
    cannon:  function (t) { noise(t, 0.16, 0.5, 700); osc('sine', 110, t, 0.005, 0.16, 0.5, sfxGain, 55); },
    laser:   function (t) { osc('sawtooth', 900, t, 0.004, 0.1, 0.22, sfxGain, 300); },
    tesla:   function (t) { noise(t, 0.12, 0.3, 3200); osc('square', 1400, t, 0.002, 0.1, 0.14, sfxGain, 200); },
    missile: function (t) { noise(t, 0.22, 0.35, 1100); osc('sawtooth', 300, t, 0.01, 0.2, 0.2, sfxGain, 90); },
    explode: function (t) { noise(t, 0.3, 0.55, 500); osc('sine', 90, t, 0.005, 0.28, 0.5, sfxGain, 40); },
    hit:     function (t) { noise(t, 0.04, 0.16, 1800); },
    die:     function (t) { noise(t, 0.12, 0.3, 800); osc('square', 220, t, 0.005, 0.1, 0.18, sfxGain, 70); },
    wave:    function (t) {
      osc('square', 392, t, 0.01, 0.14, 0.3); osc('square', 523, t + 0.15, 0.01, 0.14, 0.3);
      osc('square', 659, t + 0.3, 0.01, 0.28, 0.32);
    },
    boss:    function (t) {
      osc('sawtooth', 98, t, 0.02, 0.5, 0.4, sfxGain, 70);
      osc('sawtooth', 130, t + 0.45, 0.02, 0.5, 0.4, sfxGain, 80);
      osc('sawtooth', 98, t + 0.9, 0.02, 0.7, 0.45, sfxGain, 55);
    },
    research:function (t) {
      osc('triangle', 523, t, 0.01, 0.12, 0.3);
      osc('triangle', 659, t + 0.1, 0.01, 0.12, 0.3);
      osc('triangle', 784, t + 0.2, 0.01, 0.12, 0.3);
      osc('triangle', 1047, t + 0.3, 0.01, 0.3, 0.34);
    },
    coreHit: function (t) { noise(t, 0.22, 0.5, 400); osc('sine', 70, t, 0.01, 0.22, 0.5, sfxGain, 35); },
    waveDone:function (t) {
      osc('triangle', 440, t, 0.01, 0.12, 0.28);
      osc('triangle', 554, t + 0.12, 0.01, 0.12, 0.28);
      osc('triangle', 659, t + 0.24, 0.01, 0.28, 0.3);
    }
  };

  var lastPlay = {};
  function play(name) {
    if (!sfxOn || !ensure()) return;
    resume();
    var t = ctx.currentTime;
    // анти-спам одинаковых звуков
    if (lastPlay[name] && t - lastPlay[name] < 0.035) return;
    lastPlay[name] = t;
    var fn = SFX[name];
    if (fn) fn(t);
  }

  // ---- музыка: простой чиптюн-луп ----
  var bass = [110, 110, 130.8, 110, 146.8, 130.8, 110, 98];
  var arp = [440, 523, 659, 523, 440, 392, 440, 523, 659, 784, 659, 523, 440, 392, 330, 392];
  function musicTick() {
    if (!musicOn || !ensure()) return;
    var t = ctx.currentTime + 0.08;
    var b = bass[noteIdx % bass.length];
    osc('triangle', b, t, 0.01, 0.22, 0.5, musicGain);
    if (noteIdx % 2 === 0) {
      osc('square', arp[(noteIdx / 2) % arp.length | 0], t + 0.11, 0.01, 0.1, 0.16, musicGain);
    }
    if (noteIdx % 4 === 0) noise(t, 0.05, 0.1, 3000, musicGain);
    noteIdx++;
  }
  function setMusic(on) {
    musicOn = on;
    if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
    if (on) {
      resume();
      noteIdx = 0;
      musicTimer = setInterval(musicTick, 260);
    }
  }

  FD.audio = {
    play: play,
    resume: resume,
    setMusic: setMusic,
    setSfx: function (on) { sfxOn = on; },
    getSfx: function () { return sfxOn; },
    getMusic: function () { return musicOn; }
  };
})();
