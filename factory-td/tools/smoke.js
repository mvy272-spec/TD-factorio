/* Headless smoke-тест: грузит всю игру без браузера и прогоняет сценарии. */
'use strict';
const fs = require('fs');
const path = require('path');

// ---- заглушки браузера ----
function stubCtx() {
  return new Proxy({}, {
    get(t, p) {
      if (p === 'canvas') return { width: 0, height: 0 };
      if (p === 'measureText') return () => ({ width: 0 });
      return function () {};
    },
    set() { return true; }
  });
}
function stubEl() {
  return {
    classList: { toggle() {}, add() {}, remove() {}, contains: () => false },
    style: {}, dataset: {},
    innerHTML: '', textContent: '', title: '',
    checked: true,
    addEventListener() {}, appendChild() {}, removeChild() {},
    getContext: () => stubCtx(),
    width: 0, height: 0,
    toDataURL: () => 'data:',
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 960, height: 640 })
  };
}
global.window = global;
global.document = {
  createElement: () => stubEl(),
  getElementById: () => stubEl(),
  querySelectorAll: () => [],
  addEventListener: () => {},
  readyState: 'complete'
};
global.addEventListener = () => {};
global.localStorage = {
  _d: {},
  getItem(k) { return this._d[k] || null; },
  setItem(k, v) { this._d[k] = v; },
  removeItem(k) { delete this._d[k]; }
};
global.requestAnimationFrame = () => {};
global.performance = { now: () => Date.now() };
global.setInterval = () => 0;
global.setTimeout = () => 0;
global.clearTimeout = () => {};

const root = path.join(__dirname, '..');
function load(f) {
  const code = fs.readFileSync(path.join(root, 'js', f), 'utf8');
  (0, eval)(code);
}

let failed = 0;
function check(name, cond) {
  if (cond) console.log('  ✓ ' + name);
  else { console.log('  ✗ FAIL: ' + name); failed++; }
}

try {
  for (const f of ['config.js', 'sprites.js', 'audio.js', 'sim.js', 'render.js', 'ui.js', 'main.js']) {
    load(f);
    console.log('Загружен ' + f);
  }

  const FD = global.FD;
  const C = FD.config;

  // --- новая игра на каждой карте ---
  for (const map of C.MAPS) {
    FD.sim.newGame(map.id);
    const st = FD.sim.get();
    check('карта «' + map.name + '»: ядро на месте', st.core && st.core.hp > 0);
    check('карта «' + map.name + '»: пути построены', st.paths.length === map.spawns.length && st.paths[0].length > 1);
  }

  // --- регрессия: постройка не должна полностью запирать ядро ---
  FD.sim.newGame(0);
  const pathSt = FD.sim.get();
  const cx = pathSt.core.x, cy = pathSt.core.y;
  const coreRing = [];
  for (let x = cx - 1; x <= cx + 2; x++) {
    coreRing.push([x, cy - 1], [x, cy + 2]);
  }
  for (let y = cy; y < cy + 2; y++) {
    coreRing.push([cx - 1, y], [cx + 2, y]);
  }
  let pathBlockedPlacementRejected = false;
  for (const [x, y] of coreRing) {
    const wall = FD.sim.place('wall', x, y, 0, true);
    if (!wall.ok) {
      pathBlockedPlacementRejected = wall.why.indexOf('Путь к ядру') !== -1;
      break;
    }
  }
  check('нельзя полностью перекрыть путь к ядру', pathBlockedPlacementRejected);

  // --- сценарий: мини-фабрика ---
  FD.sim.newGame(0);
  let st = FD.sim.get();

  function findOre(type, nearX, nearY) {
    let best = null, bd = 1e9;
    for (let y = 0; y < C.MAP_H; y++) for (let x = 0; x < C.MAP_W; x++) {
      if (st.ore[FD.sim.idx(x, y)] === type) {
        const d = Math.abs(x - nearX) + Math.abs(y - nearY);
        if (d < bd) { bd = d; best = { x, y }; }
      }
    }
    return best;
  }
  const iron = findOre(1, st.core.x + 6, st.core.y + 6);
  check('есть железная жила', !!iron);

  const dirToCore = st.core.x > iron.x ? 0 : st.core.x < iron.x ? 2 : st.core.y > iron.y ? 1 : 3;
  let r = FD.sim.place('miner', iron.x, iron.y, dirToCore, true);
  check('шахта поставлена', r.ok === true);

  let bx = iron.x, by = iron.y;
  for (let i = 0; i < 6; i++) {
    bx += [1, 0, -1, 0][dirToCore]; by += [0, 1, 0, -1][dirToCore];
    if (!FD.sim.inMap(bx, by)) break;
    const rr = FD.sim.place('belt', bx, by, dirToCore, true);
    if (!rr.ok) break;
  }
  check('конвейер проложен', st.belts.length > 0);

  // добыча работает: буфер шахты растёт
  for (let i = 0; i < 60 * 5; i++) FD.sim.tick(1 / 60);
  const minerB = Object.values(st.buildings).find(b => b.type === 'miner');
  check('шахта добывает руду (буфер/лента)', (minerB.buf && minerB.buf.length > 0) || st.belts.some(b => b.item));
  check('предметы — строки-ключи (регрессия)', (minerB.buf || []).every(s => typeof s === 'string') || st.belts.some(b => typeof b.item === 'string'));

  // лента → ядро: кладём слиток на ленту перед ядром
  const coreFront = { x: st.core.x - 1, y: st.core.y };
  const beltRes = FD.sim.place('belt', coreFront.x, coreFront.y, 0, true);
  check('лента у ядра поставлена', beltRes.ok === true);
  if (beltRes.ok) {
    beltRes.building.item = 'iron';
    beltRes.building.progress = 1;
    const ironBefore = st.stock.iron;
    for (let i = 0; i < 30; i++) FD.sim.tick(1 / 60);
    check('слиток доставлен в ядро (+' + (st.stock.iron - ironBefore) + ')', st.stock.iron > ironBefore);
  }

  // турель + боезапас → убивает врагов (ставим у реального маршрута врагов)
  const path = st.paths[0];
  const wp = path[Math.min(3, path.length - 2)];
  let turret = null;
  outer:
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const px = wp.x + dx, py = wp.y + dy;
      if (!FD.sim.inMap(px, py)) continue;
      const chk = FD.sim.canPlace('gun', px, py);
      if (chk.ok) {
        const rr = FD.sim.place('gun', px, py, 0, true);
        if (rr.ok) { turret = rr.building; break outer; }
      }
    }
  }
  check('турель поставлена у маршрута', !!turret);
  if (turret) {
    turret.ammo = 500;
    st.wave = 3;
    FD.sim.startWave();
    for (let i = 0; i < 60 * 60 && st.stats.kills === 0; i++) FD.sim.tick(1 / 60);
    check('турель с патронами убивает врагов (kills=' + st.stats.kills + ')', st.stats.kills > 0);
  }

  // депо раздаёт боезапас
  if (turret) {
    turret.ammo = 0;
    const dr = FD.sim.place('depot', turret.x + 1, turret.y, 0, true);
    check('депо поставлено', dr.ok === true);
    if (dr.ok) {
      dr.building.ammo.bullet = 50;
      for (let i = 0; i < 60 * 2; i++) FD.sim.tick(1 / 60);
      check('депо передало патроны турели (' + turret.ammo + ')', turret.ammo > 0);
    }
  }

  // исследование
  st.stock.science = 500;
  check('исследование dmg1', FD.sim.research('dmg1').ok === true);
  check('исследование dmg2', FD.sim.research('dmg2').ok === true);
  check('исследование dmg3', FD.sim.research('dmg3').ok === true);

  // сейв/лоад
  const data = FD.sim.serialize();
  check('serialize вернул данные', data && data.buildings.length >= 2);
  check('сейв сохраняет активную волну', data.phase === 'wave' &&
    data.spawnQueue.length + data.enemies.length > 0);
  FD.sim.deserialize(JSON.parse(JSON.stringify(data)));
  const st2 = FD.sim.get();
  check('deserialize: здания на месте', Object.keys(st2.buildings).length === data.buildings.length);
  check('deserialize: ядро живо', st2.core.hp > 0);
  check('deserialize: бой восстановлен', st2.phase === 'wave' &&
    st2.spawnQueue.length === data.spawnQueue.length && st2.enemies.length === data.enemies.length);

  // босс-волна
  st2.wave = 9;
  FD.sim.startWave();
  const hasBoss = st2.spawnQueue.some(q => q.type.indexOf('boss_') === 0);
  check('босс-волна 10 запускается (волна ' + st2.wave + ', босс: ' + hasBoss + ')',
    st2.wave === 10 && hasBoss);

  // полный прогон: 2 волны на скорость 3x
  FD.sim.newGame(0);
  const st3 = FD.sim.get();
  st3.speed = 3;
  FD.sim.callWaveNow();
  for (let i = 0; i < 60 * 120 && st3.wave < 2; i++) FD.sim.tick(1 / 60);
  check('первая волна отбита и вторая запущена (волна ' + st3.wave + ', фаза ' + st3.phase + ')', st3.wave >= 2);

  // --- население, еда, фермы ---
  FD.sim.newGame(0);
  const st5 = FD.sim.get();
  check('стартовое население есть', st5.pop.current >= 5);
  // дом рядом с ядром
  let hr = FD.sim.place('house', st5.core.x + 3, st5.core.y, 0, true);
  check('жилой дом построен', hr.ok === true);
  st5._popT = 0; // форсируем пересчёт
  for (let i = 0; i < 60; i++) FD.sim.tick(1 / 60);
  check('вместимость выросла от дома (' + st5.pop.capacity + ')', st5.pop.capacity >= 14);

  // ферма вплотную к ядру — еда падает прямо в склад
  const food0 = st5.stock.food;
  let fr2 = null;
  for (let dy = -3; dy <= 3 && !fr2; dy++) {
    for (let dx = -3; dx <= 3 && !fr2; dx++) {
      const chk = FD.sim.canPlace('farm', st5.core.x + dx, st5.core.y + dy);
      if (chk.ok) {
        const rr = FD.sim.place('farm', st5.core.x + dx, st5.core.y + dy, 0, true);
        if (rr.ok) fr2 = rr.building;
      }
    }
  }
  check('ферма поставлена', !!fr2);
  for (let i = 0; i < 60 * 12; i++) FD.sim.tick(1 / 60);
  check('ферма произвела еду (было ' + food0.toFixed(1) + ', стало ' + st5.stock.food.toFixed(1) + ')',
    st5.stock.food > food0 || (fr2 && fr2.buf && fr2.buf.length > 0));
  check('рабочие: коэффициент посчитан (' + (st5.wf || 0).toFixed(2) + ')', st5.wf > 0 && st5.wf <= 1.16);

  // --- заморозка обучения ---
  FD.sim.newGame(0);
  const st6 = FD.sim.get();
  check('первая волна ждёт ручного вызова', st6.tutorialFrozen === true);
  const pt0 = st6.prepTimer;
  for (let i = 0; i < 60 * 10; i++) FD.sim.tick(1 / 60);
  check('таймер подготовки ждёт вызова', Math.abs(st6.prepTimer - pt0) < 0.01);
  FD.sim.callWaveNow();
  check('вызов волны снимает заморозку', st6.tutorialFrozen === false && st6.wave === 1);

  // --- поворот конвейера (угол) ---
  FD.sim.newGame(0);
  const st7 = FD.sim.get();
  // угол: лента (20,10) dir→восток, лента (21,10) dir→юг, лента (21,11) dir→восток в ядро... не обязательно к ядру: просто перенос
  const b1 = FD.sim.place('belt', 20, 10, 0, true);   // восток → (21,10)
  const b2 = FD.sim.place('belt', 21, 10, 1, true);   // юг → (21,11)
  const b3 = FD.sim.place('belt', 21, 11, 2, true);   // запад (тупик — проверим ручной поворот)
  if (b1.ok && b2.ok && b3.ok) {
    b3.building.dir = 0; // поворот как делает reorientBelt
    b1.building.item = 'iron';
    b1.building.progress = 1;
    for (let i = 0; i < 60 * 3; i++) FD.sim.tick(1 / 60);
    const moved = (b2.building.item === 'iron' || b2.building.progress > 0) ||
                  (b3.building.item === 'iron');
    check('предмет пошёл по углу (жёлтый угол поворачивает)', moved);
  } else {
    check('угловая цепь построена', false);
  }

  console.log('\n' + (failed ? 'ПРОВАЛЕНО ПРОВЕРОК: ' + failed : 'ВСЕ ПРОВЕРКИ ПРОЙДЕНЫ ✓'));
  process.exit(failed ? 1 : 0);
} catch (e) {
  console.error('ИСКЛЮЧЕНИЕ:', e);
  process.exit(1);
}
