/* Factory Defense — ядро симуляции: карта, пути, ленты, фабрики, турели, враги, волны */
var FD = window.FD || (window.FD = {});
(function () {
  'use strict';

  var C = FD.config;
  var T = C.TILE, W = C.MAP_W, H = C.MAP_H;
  var DX = [1, 0, -1, 0], DY = [0, 1, 0, -1];

  // ---------------- утилиты ----------------
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function dist(ax, ay, bx, by) { var dx = ax - bx, dy = ay - by; return Math.sqrt(dx * dx + dy * dy); }

  var st = null; // состояние

  // коды руды → ключи предметов
  var ORE_NAME = { 1: 'iron_ore', 2: 'copper_ore', 3: 'coal', 4: 'crystal' };

  // ---------------- модификаторы ----------------
  function baseMods() {
    return {
      dmg: 1, rate: 1, range: 1, splash: 1,
      beltSpeed: 1, craftSpeed: 1, mineSpeed: 1,
      depotRadius: 1, sellMul: C.BAL.sellMul,
      coreHp: 0, coreRegen: 0, buildingHp: 1
    };
  }
  function recomputeMods() {
    var m = baseMods();
    for (var id in st.research) {
      var def = C.RESEARCH[id];
      if (!def) continue;
      for (var k in def.mod) {
        var v = def.mod[k];
        if (k === 'coreHp' || k === 'coreRegen') m[k] += v;
        else if (k === 'sellMul') m.sellMul += v;
        else if (k === 'buildingHp') m.buildingHp += v;
        else m[k] += v;
      }
    }
    st.mods = m;
    var newMax = C.BAL.coreHp + m.coreHp;
    if (newMax > st.core.hpMax) st.core.hp += newMax - st.core.hpMax;
    st.core.hpMax = newMax;
    st.core.hp = Math.min(st.core.hp, st.core.hpMax);
  }

  // ---------------- генерация карты ----------------
  function idx(x, y) { return y * W + x; }
  function inMap(x, y) { return x >= 0 && y >= 0 && x < W && y < H; }

  // плавный шум значений
  function makeNoise(rng, gw, gh) {
    var g = new Float32Array(gw * gh);
    for (var i = 0; i < g.length; i++) g[i] = rng();
    return function (x, y) {
      var fx = x / W * (gw - 1), fy = y / H * (gh - 1);
      var x0 = fx | 0, y0 = fy | 0;
      var x1 = Math.min(gw - 1, x0 + 1), y1 = Math.min(gh - 1, y0 + 1);
      var tx = fx - x0, ty = fy - y0;
      tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
      var a = g[y0 * gw + x0], b = g[y0 * gw + x1], c = g[y1 * gw + x0], d = g[y1 * gw + x1];
      return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
    };
  }

  function genTerrain(mapDef, seed) {
    var rng = mulberry32(seed + mapDef.seed);
    var terrain = new Uint8Array(W * H); // 0 земля, 1 вода, 2 скала
    var ore = new Uint8Array(W * H);
    var n1 = makeNoise(rng, 8, 6), n2 = makeNoise(rng, 14, 10), n3 = makeNoise(rng, 5, 4);
    var x, y, i;
    for (y = 0; y < H; y++) {
      for (x = 0; x < W; x++) {
        var h = n1(x, y) * 0.55 + n2(x, y) * 0.3 + n3(x, y) * 0.15;
        i = idx(x, y);
        if (h < mapDef.water) terrain[i] = 1;
        else if (h > 1 - mapDef.rock) terrain[i] = 2;
        else terrain[i] = 0;
      }
    }
    // расчистка вокруг ядра и спавнов
    function clear(cx, cy, r) {
      for (var dy = -r; dy <= r; dy++) for (var dx = -r; dx <= r; dx++) {
        var xx = cx + dx, yy = cy + dy;
        if (inMap(xx, yy) && dx * dx + dy * dy <= r * r) terrain[idx(xx, yy)] = 0;
      }
    }
    var cs = C.BAL.coreSize;
    clear(mapDef.core[0] + cs / 2, mapDef.core[1] + cs / 2, 4);
    for (i = 0; i < mapDef.spawns.length; i++) clear(mapDef.spawns[i][0], mapDef.spawns[i][1], 3);

    // рудные жилы
    var ores = [1, 2, 3, 4]; // iron copper coal crystal
    var veins = Math.round(16 * mapDef.oreRich);
    for (i = 0; i < veins; i++) {
      var ot = ores[i % 4];
      // кристалл реже
      if (ot === 4 && rng() < 0.5) ot = 1;
      var vx = 3 + (rng() * (W - 6)) | 0, vy = 3 + (rng() * (H - 6)) | 0;
      if (terrain[idx(vx, vy)] !== 0) continue;
      // не рядом с ядром
      if (dist(vx, vy, mapDef.core[0], mapDef.core[1]) < 5) continue;
      var len = 5 + (rng() * 12) | 0;
      var ang = rng() * Math.PI * 2;
      for (var j = 0; j < len; j++) {
        vx = clamp((vx + Math.cos(ang) + (rng() - 0.5) * 1.4) | 0, 1, W - 2);
        vy = clamp((vy + Math.sin(ang) + (rng() - 0.5) * 1.4) | 0, 1, H - 2);
        if (inMap(vx, vy) && terrain[idx(vx, vy)] === 0) {
          ore[idx(vx, vy)] = ot;
          if (rng() < 0.5) {
            var nx = vx + (rng() * 3 - 1) | 0, ny = vy + (rng() * 3 - 1) | 0;
            if (inMap(nx, ny) && terrain[idx(nx, ny)] === 0) ore[idx(nx, ny)] = ot;
          }
        }
        ang += (rng() - 0.5) * 0.9;
      }
    }
    // гарантируем руду рядом с ядром
    var homeOres = [1, 2, 3];
    for (i = 0; i < 3; i++) {
      var hx = mapDef.core[0] + 5 + i * 2, hy = mapDef.core[1] + 5 + i;
      for (var k = 0; k < 4; k++) {
        if (inMap(hx + k, hy) && terrain[idx(hx + k, hy)] === 0) ore[idx(hx + k, hy)] = homeOres[i];
      }
    }
    // под ядром руды быть не должно (тайлы заняты)
    var cs2 = C.BAL.coreSize;
    for (var ccy = 0; ccy < cs2; ccy++) {
      for (var ccx = 0; ccx < cs2; ccx++) {
        ore[idx(mapDef.core[0] + ccx, mapDef.core[1] + ccy)] = 0;
      }
    }
    return { terrain: terrain, ore: ore };
  }

  // ---------------- путьfinding ----------------
  function blockedGrid(ignoreId) {
    var b = new Uint8Array(W * H);
    for (var i = 0; i < W * H; i++) {
      if (st.terrain[i] !== 0) b[i] = 1;
    }
    for (var id in st.buildings) {
      if (ignoreId && +id === ignoreId) continue;
      var bd = st.buildings[id];
      if (bd.type === 'core') continue; // тайлы ядра — цель пути, не блокировка
      b[idx(bd.x, bd.y)] = 1;
    }
    return b;
  }

  function coreTiles() {
    var out = [];
    var cs = C.BAL.coreSize, cx = st.core.x, cy = st.core.y;
    for (var dy = 0; dy < cs; dy++) for (var dx = 0; dx < cs; dx++) out.push(idx(cx + dx, cy + dy));
    return out;
  }

  // BFS: достижимо ли ядро из спавна
  function hasPathFrom(sx, sy, blk) {
    var goal = {};
    var ct = coreTiles();
    for (var i = 0; i < ct.length; i++) goal[ct[i]] = 1;
    var start = idx(sx, sy);
    if (blk[start]) {
      // спавн может быть занят — ищем соседний свободный
      var found = false;
      for (var d = 0; d < 4; d++) {
        var nx = sx + DX[d], ny = sy + DY[d];
        if (inMap(nx, ny) && !blk[idx(nx, ny)]) { start = idx(nx, ny); found = true; break; }
      }
      if (!found) return false;
    }
    var visited = new Uint8Array(W * H);
    var queue = [start];
    visited[start] = 1;
    while (queue.length) {
      var cur = queue.pop();
      if (goal[cur]) return true;
      var cx2 = cur % W, cy2 = (cur / W) | 0;
      for (var d2 = 0; d2 < 4; d2++) {
        var x = cx2 + DX[d2], y = cy2 + DY[d2];
        if (!inMap(x, y)) continue;
        var ii = idx(x, y);
        if (visited[ii] || blk[ii]) continue;
        visited[ii] = 1;
        queue.push(ii);
      }
    }
    return false;
  }

  function allPathsOk(blk) {
    for (var i = 0; i < st.mapDef.spawns.length; i++) {
      var s = st.mapDef.spawns[i];
      if (!hasPathFrom(s[0], s[1], blk)) return false;
    }
    return true;
  }

  // A* до ядра, возвращает тайловые вейпоинты (сглаженные)
  function findPath(sx, sy) {
    var goal = {};
    var ct = coreTiles();
    for (var i = 0; i < ct.length; i++) goal[ct[i]] = 1;
    var blk = st.blkCache || (st.blkCache = blockedGrid());
    var start = idx(sx, sy);
    if (blk[start]) {
      for (var d = 0; d < 4; d++) {
        var nx = sx + DX[d], ny = sy + DY[d];
        if (inMap(nx, ny) && !blk[idx(nx, ny)]) { start = idx(nx, ny); break; }
      }
    }
    var gScore = new Float32Array(W * H).fill(Infinity);
    var from = new Int32Array(W * H).fill(-1);
    var closed = new Uint8Array(W * H);
    gScore[start] = 0;
    // простой open-list на массиве
    var open = [start];
    var fScore = new Float32Array(W * H).fill(Infinity);
    function h(ix) {
      var x = ix % W, y = (ix / W) | 0;
      return Math.abs(x - st.core.x) + Math.abs(y - st.core.y);
    }
    fScore[start] = h(start);
    var guard = 0;
    while (open.length && guard++ < W * H * 8) {
      // выбор минимального f (для 1536 тайлов допустимо)
      var best = 0, bestF = Infinity;
      for (var oi = 0; oi < open.length; oi++) {
        if (fScore[open[oi]] < bestF) { bestF = fScore[open[oi]]; best = oi; }
      }
      var cur = open[best];
      open[best] = open[open.length - 1]; open.pop();
      if (goal[cur]) {
        // восстановление
        var path = [];
        var c = cur;
        while (c !== -1) {
          path.push({ x: c % W, y: (c / W) | 0 });
          c = from[c];
        }
        path.reverse();
        return smooth(path);
      }
      closed[cur] = 1;
      var cx = cur % W, cy = (cur / W) | 0;
      for (var d2 = 0; d2 < 4; d2++) {
        var x = cx + DX[d2], y = cy + DY[d2];
        if (!inMap(x, y)) continue;
        var ii = idx(x, y);
        if (blk[ii] || closed[ii]) continue;
        var ng = gScore[cur] + 1;
        if (ng < gScore[ii]) {
          gScore[ii] = ng;
          from[ii] = cur;
          fScore[ii] = ng + h(ii);
          if (open.indexOf(ii) === -1) open.push(ii);
        }
      }
    }
    return null;
  }

  function smooth(path) {
    if (path.length < 3) return path;
    var out = [path[0]];
    for (var i = 1; i < path.length - 1; i++) {
      var a = out[out.length - 1], c = path[i + 1], b = path[i];
      // если поворот — оставляем
      var d1x = b.x - a.x, d1y = b.y - a.y;
      var d2x = c.x - b.x, d2y = c.y - b.y;
      if (d1x !== d2x || d1y !== d2y) out.push(b);
    }
    out.push(path[path.length - 1]);
    return out;
  }

  function rebuildPaths() {
    st.blkCache = blockedGrid();
    st.paths = [];
    for (var i = 0; i < st.mapDef.spawns.length; i++) {
      var s = st.mapDef.spawns[i];
      var p = findPath(s[0], s[1]);
      st.paths.push(p || [{ x: s[0], y: s[1] }, { x: st.core.x, y: st.core.y }]);
    }
    // враги пересчитывают маршрут с текущей позиции
    for (var e = 0; e < st.enemies.length; e++) {
      var en = st.enemies[e];
      if (en.flying) {
        en.path = [{ x: (en.x / T) | 0, y: (en.y / T) | 0 }, { x: st.core.x, y: st.core.y }];
      } else {
        var currentX = (en.x / T) | 0, currentY = (en.y / T) | 0;
        en.path = findPath(currentX, currentY) || st.paths[en.spawnIdx % st.paths.length];
      }
      en.wpIdx = nearestWp(en);
    }
    st.needPathRebuild = false;
  }

  function nearestWp(en) {
    var path = en.path;
    if (!path || !path.length) return 0;
    var best = 0, bestD = Infinity;
    for (var i = 0; i < path.length; i++) {
      var d = dist(en.x, en.y, path[i].x * T + T / 2, path[i].y * T + T / 2);
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  // ---------------- здания ----------------
  function buildingHp(type) {
    var def = C.BUILDINGS[type];
    return Math.round((def.hp || 100) * (st ? st.mods.buildingHp : 1));
  }

  function canPlace(type, x, y) {
    if (!inMap(x, y)) return { ok: false, why: 'За пределами карты' };
    var def = C.BUILDINGS[type];
    if (!def) return { ok: false, why: 'Неизвестная постройка' };
    if (type === 'miner') {
      if (!st.ore[idx(x, y)]) return { ok: false, why: 'Шахта ставится только на рудную жилу' };
    }
    if (st.terrain[idx(x, y)] !== 0) return { ok: false, why: 'Тут нельзя строить' };
    if (st.bgrid[idx(x, y)] !== -1) return { ok: false, why: 'Занято' };
    // проверка денег
    if (!st.skipPathCheck && !canAfford(def.cost)) return { ok: false, why: 'Не хватает ресурсов' };
    // Проверяем именно карту с кандидатом: blockedGrid строится из terrain и
    // buildings, поэтому временной записи в bgrid для этого недостаточно.
    if (!st.skipPathCheck && type !== 'core') {
      var candidateGrid = blockedGrid();
      candidateGrid[idx(x, y)] = 1;
      if (!allPathsOk(candidateGrid)) {
        return { ok: false, why: 'Путь к ядру будет перекрыт!' };
      }
    }
    return { ok: true };
  }

  function canAfford(cost) {
    for (var k in cost) if ((st.stock[k] || 0) < cost[k]) return false;
    return true;
  }
  function pay(cost) {
    for (var k in cost) st.stock[k] -= cost[k];
  }
  function refund(cost, mul) {
    for (var k in cost) st.stock[k] += cost[k] * mul;
  }

  function place(type, x, y, dir, free) {
    var check = canPlace(type, x, y);
    if (!check.ok) return check;
    var def = C.BUILDINGS[type];
    if (!free) pay(def.cost);
    var b = {
      id: st.nextId++, type: type, x: x, y: y,
      dir: dir == null ? 0 : dir,
      hp: buildingHp(type), hpMax: buildingHp(type),
      level: 1, flash: 0
    };
    if (type === 'belt' || type === 'splitter') {
      b.item = null; b.progress = 0; b.alt = 0;
    }
    if (type === 'miner') { b.timer = 0; b.buf = []; b.oreType = st.ore[idx(x, y)]; }
    if (type === 'smelter' || type === 'ammo_plant' || type === 'shell_plant' ||
        type === 'battery_plant' || type === 'missile_plant' || type === 'lab') {
      b.inStore = {}; b.progress = 0; b.active = false; b.buf = []; b.curRecipe = null;
    }
    if (type === 'depot') { b.ammo = { bullet: 0, shell: 0, battery: 0, missile: 0 }; b.giveT = 0; }
    if (type === 'container') { b.buf = []; b.outDir = -1; }
    if (type === 'farm') { b.timer = 0; b.buf = []; b.oreType = 0; }
    if (C.TURRET_KEYS.indexOf(type) !== -1) {
      b.ammo = 0; b.cooldown = 0; b.angle = -Math.PI / 2; b.targetId = -1;
    }
    // АВТО-ОРИЕНТАЦИЯ: лента упёрлась в тупик, но рядом ядро — повернуть в ядро
    if ((type === 'belt' || type === 'splitter') && !st.loading) {
      var fx2 = b.x + DX[b.dir], fy2 = b.y + DY[b.dir];
      var fid2 = inMap(fx2, fy2) ? st.bgrid[idx(fx2, fy2)] : -2;
      if (fid2 === -1 || fid2 === -2) {
        for (var dd = 0; dd < 4; dd++) {
          var nx2 = b.x + DX[dd], ny2 = b.y + DY[dd];
          if (!inMap(nx2, ny2)) continue;
          var nid = st.bgrid[idx(nx2, ny2)];
          if (nid >= 0 && st.buildings[nid] && st.buildings[nid].type === 'core') {
            b.dir = dd;
            break;
          }
        }
      }
    }
    st.buildings[b.id] = b;
    if (type === 'core') {
      st.core.x = x; st.core.y = y;
      for (var cdy = 0; cdy < C.BAL.coreSize; cdy++) {
        for (var cdx = 0; cdx < C.BAL.coreSize; cdx++) {
          st.bgrid[idx(x + cdx, y + cdy)] = b.id;
        }
      }
    } else {
      st.bgrid[idx(x, y)] = b.id;
    }
    st.needPathRebuild = true;
    st.stats.built++;
    // флаги для обучения
    if (st.flags) {
      if (type === 'miner') st.flags.miner = 1;
      if (type === 'belt' || type === 'splitter') st.flags.belt = 1;
      if (type === 'container') st.flags.container = 1;
      if (type === 'smelter') st.flags.smelter = 1;
      if (type === 'ammo_plant') st.flags.ammo = 1;
      if (type === 'depot') st.flags.depot = 1;
      if (C.TURRET_KEYS.indexOf(type) !== -1) st.flags.turret = 1;
    }
    pushList(b);
    return { ok: true, building: b };
  }

  function pushList(b) {
    if (b.type === 'belt' || b.type === 'splitter') st.belts.push(b);
    else if (b.type === 'miner' || b.type === 'farm') st.miners.push(b);
    else if (C.TURRET_KEYS.indexOf(b.type) !== -1) st.turrets.push(b);
    else if (b.type === 'depot') st.depots.push(b);
    else if (b.type === 'armory') st.armories.push(b);
    else if (C.RECIPES[b.type] || b.type === 'container') st.factories.push(b);
    else st.others.push(b);
  }
  function pullList(b) {
    function rm(arr) {
      var i = arr.indexOf(b);
      if (i !== -1) arr.splice(i, 1);
    }
    if (b.type === 'belt' || b.type === 'splitter') rm(st.belts);
    else if (b.type === 'miner' || b.type === 'farm') rm(st.miners);
    else if (C.TURRET_KEYS.indexOf(b.type) !== -1) rm(st.turrets);
    else if (b.type === 'depot') rm(st.depots);
    else if (b.type === 'armory') rm(st.armories);
    else if (C.RECIPES[b.type] || b.type === 'container') rm(st.factories);
    else rm(st.others);
  }

  function sell(x, y) {
    var id = st.bgrid[idx(x, y)];
    if (id === -1) return false;
    var b = st.buildings[id];
    if (!b || b.type === 'core') return false;
    var def = C.BUILDINGS[b.type];
    refund(def.cost, st.mods.sellMul);
    st.bgrid[idx(x, y)] = -1;
    pullList(b);
    delete st.buildings[id];
    st.needPathRebuild = true;
    FD.audio.play('sell');
    return true;
  }

  function upgradeTurret(b) {
    if (b.level >= 3) return { ok: false, why: 'Максимальный уровень' };
    var cost = C.TURRET_UPGRADE.costs[b.level - 1];
    if (!canAfford(cost)) return { ok: false, why: 'Не хватает ресурсов' };
    pay(cost);
    b.level++;
    b.hp = b.hpMax = buildingHp(b.type);
    FD.audio.play('research');
    return { ok: true };
  }

  // ---------------- вставка предметов ----------------
  function tryInsert(b, item) {
    if (!b) return false;
    if (b.type === 'core') {
      var got = false, label = '';
      if (item === 'iron_ore') { st.stock.iron += 0.5; got = true; label = 'железо'; }
      else if (item === 'copper_ore') { st.stock.copper += 0.5; got = true; label = 'медь'; }
      else if (item === 'iron' || item === 'copper' || item === 'coal' || item === 'crystal' || item === 'science' || item === 'food') {
        st.stock[item] = (st.stock[item] || 0) + 1;
        got = true;
        label = C.ITEMS[item].name;
      }
      if (got) {
        if (st.flags) st.flags.itemToCore = 1;
        // всплывающий подтверждённый «+1» не чаще раза в полсекунды
        if (!st._lastCoreT || st.time - st._lastCoreT > 0.5) {
          st._lastCoreT = st.time;
          st.texts.push({
            x: st.core.x * T + T, y: st.core.y * T - 6,
            text: '+1 ' + label, life: 1.1, color: '#9ef0ff'
          });
        }
      }
      return got;
    }
    if (b.type === 'belt' || b.type === 'splitter') {
      if (!b.item) { b.item = item; b.progress = 0; return true; }
      return false;
    }
    if (b.type === 'depot') {
      if ((item === 'bullet' || item === 'shell' || item === 'battery' || item === 'missile') &&
          b.ammo[item] < C.BUILDINGS.depot.cap) {
        b.ammo[item]++;
        return true;
      }
      return false;
    }
    if (C.TURRET_KEYS.indexOf(b.type) !== -1) {
      var tdef = C.BUILDINGS[b.type];
      if (item === tdef.ammo && b.ammo < tdef.ammoCap * (1 + 0.5 * (b.level - 1))) {
        b.ammo++;
        return true;
      }
      return false;
    }
    if (b.type === 'container') {
      if (b.buf.length < (C.BUILDINGS.container.cap || 60)) {
        b.buf.push(item);
        return true;
      }
      return false;
    }
    if (b.type === 'smelter') {
      if ((item === 'iron_ore' || item === 'copper_ore') && countIn(b.inStore) < C.BUILDINGS.smelter.inCap) {
        b.inStore[item] = (b.inStore[item] || 0) + 1;
        return true;
      }
      return false;
    }
    var recipe = C.RECIPES[b.type];
    if (recipe && recipe.in && recipe.in[item] != null) {
      if (countIn(b.inStore) < (C.BUILDINGS[b.type].inCap || 12)) {
        b.inStore[item] = (b.inStore[item] || 0) + 1;
        return true;
      }
    }
    return false;
  }
  function countIn(obj) {
    var n = 0;
    for (var k in obj) n += obj[k];
    return n;
  }

  function frontTile(b) {
    return { x: b.x + DX[b.dir], y: b.y + DY[b.dir] };
  }
  function tileBuilding(x, y) {
    if (!inMap(x, y)) return null;
    var id = st.bgrid[idx(x, y)];
    if (id === -1) return null;
    return st.buildings[id] || null;
  }

  // ---------------- ленты ----------------
  function beltStep(dt) {
    var belts = st.belts, n = belts.length;
    if (!n) return;
    var i, b;
    // снимок
    var snapItem = new Array(n), snapProg = new Array(n);
    for (i = 0; i < n; i++) {
      snapItem[i] = belts[i].item;
      snapProg[i] = belts[i].progress;
      if (belts[i].item) {
        belts[i].progress = Math.min(1, belts[i].progress + dt * st.mods.beltSpeed / C.BUILDINGS.belt.beltTime);
      }
    }
    var gotIn = new Uint8Array(n);
    var beltIndex = new Map();
    for (i = 0; i < n; i++) beltIndex.set(belts[i].id, i);

    for (i = 0; i < n; i++) {
      b = belts[i];
      if (!snapItem[i] || snapProg[i] < 1) continue;
      var item = snapItem[i];
      // куда
      var candidates = [];
      var f = frontTile(b);
      candidates.push(f);
      if (b.type === 'splitter') {
        var sd = (b.dir + 1) % 4;
        candidates.push({ x: b.x + DX[sd], y: b.y + DY[sd] });
        // чередование
        if (b.alt) candidates.reverse();
        b.alt ^= 1;
      }
      for (var c = 0; c < candidates.length; c++) {
        var t = candidates[c];
        if (!inMap(t.x, t.y)) continue;
        var dest = tileBuilding(t.x, t.y);
        if (!dest) continue;
        if (dest.type === 'belt' || dest.type === 'splitter') {
          var di = beltIndex.get(dest.id);
          if (di != null && snapItem[di] == null && !gotIn[di] && !dest.item) {
            dest.item = item; dest.progress = 0;
            gotIn[di] = 1;
            b.item = null;
            break;
          }
        } else if (tryInsert(dest, item)) {
          b.item = null;
          break;
        }
      }
    }
  }

  // ---------------- добыча и фабрики ----------------
  // выдача буфера: сначала «своя» сторона (dir), потом любая соседняя
  function flushBuf(b) {
    if (!b.buf || !b.buf.length) return;
    var order = [b.dir, (b.dir + 1) % 4, (b.dir + 3) % 4, (b.dir + 2) % 4];
    for (var i = 0; i < 4; i++) {
      var d = order[i];
      var x = b.x + DX[d], y = b.y + DY[d];
      var dest = tileBuilding(x, y);
      if (!dest) continue;
      // не пихать в ленту, которая ведёт обратно в нас (анти-пинг-понг)
      if (dest.type === 'belt' || dest.type === 'splitter') {
        var f = frontTile(dest);
        if (f.x === b.x && f.y === b.y) continue;
      }
      if (tryInsert(dest, b.buf[0])) {
        b.buf.shift();
        b.outDir = d;
        return;
      }
    }
  }

  function minerStep(dt) {
    var arr = st.miners;
    var wf = st.wf || 1;
    for (var i = 0; i < arr.length; i++) {
      var b = arr[i];
      flushBuf(b);
      var isFarm = b.type === 'farm';
      var cap = isFarm ? C.BUILDINGS.farm.buffer : C.BUILDINGS.miner.buffer;
      if (b.buf.length >= cap) continue;
      b.timer -= dt * (isFarm ? 1 : st.mods.mineSpeed) * wf;
      if (b.timer <= 0) {
        if (isFarm) {
          b.timer = C.BUILDINGS.farm.farmTime;
          b.buf.push('food');
        } else {
          b.timer = C.BUILDINGS.miner.mineTime;
          b.buf.push(ORE_NAME[b.oreType] || 'iron_ore');
          st.stats.mined++;
        }
      }
    }
  }

  // ---------- население, еда, рабочие ----------
  function countHouses() {
    var n = 0;
    for (var id in st.buildings) if (st.buildings[id].type === 'house') n++;
    return n;
  }
  function workerDemand() {
    var need = 0;
    for (var i = 0; i < st.miners.length; i++) need += C.WORKERS[st.miners[i].type] || 0;
    for (i = 0; i < st.factories.length; i++) need += C.WORKERS[st.factories[i].type] || 0;
    for (i = 0; i < st.armories.length; i++) need += C.WORKERS.armory || 0;
    return need;
  }
  function popStep(dt) {
    var P = C.POP;
    // вместимость пересчитываем раз в секунду
    st._popT = (st._popT || 0) - dt;
    if (st._popT <= 0) {
      st._popT = 1;
      st.pop.capacity = P.baseCap + countHouses() * P.houseCap;
      st.pop.need = workerDemand();
    }
    // рост населения при еде и свободных местах
    if (st.pop.current < st.pop.capacity && st.stock.food > 2) {
      st.pop.current = Math.min(st.pop.capacity, st.pop.current + P.growth * dt);
    }
    // едим
    st.stock.food = Math.max(0, st.stock.food - st.pop.current * P.eatPerSec * dt);
    st.pop.hungry = st.stock.food <= 0.05 && st.pop.current > 0.5;
    // занятость
    var f = Math.min(P.maxFactor, Math.max(P.minFactor, st.pop.current / Math.max(1, st.pop.need || 1)));
    if (st.pop.hungry) f *= P.hungryPenalty;
    st.wf = f;
    // предупреждение один раз
    if (st.flags && !st.flags.workerWarn && st.pop.need > 0 && st.pop.current < st.pop.need * 0.8) {
      st.flags.workerWarn = 1;
      if (typeof FD.ui !== 'undefined' && FD.ui.toast) {
        FD.ui.toast('👷 Не хватает рабочих! Строй ЖИЛЫЕ ДОМА и ФЕРМЫ (категория «🏘 Город»).');
      }
    }
    if (st.flags && !st.flags.hungerWarn && st.pop.hungry) {
      st.flags.hungerWarn = 1;
      if (typeof FD.ui !== 'undefined' && FD.ui.toast) {
        FD.ui.toast('🍞 Голод! Производство замедлено — вези еду в ядро (Ферма → конвейер).', true);
      }
    }
    if (st.pop.hungry === false && st.flags) st.flags.hungerWarn = 0;
  }

  function factoryStep(dt) {
    var arr = st.factories;
    for (var i = 0; i < arr.length; i++) {
      var b = arr[i];
      flushBuf(b);
      var recipe = C.RECIPES[b.type];
      if (!recipe) continue;
      var time = (C.BUILDINGS[b.type].recipeTime || recipe.time) / (st.mods.craftSpeed * (st.wf || 1));

      if (b.active) {
        b.progress += dt;
        if (b.progress >= time) {
          b.active = false;
          b.progress = 0;
          if (recipe.auto && b.curRecipe) {
            b.buf.push(b.curRecipe.out);
          } else if (recipe.out && recipe.out.item) {
            for (var q = 0; q < recipe.out.qty; q++) b.buf.push(recipe.out.item);
          }
          b.curRecipe = null;
        }
        continue;
      }
      // старт рецепта
      if (recipe.auto) {
        if (b.inStore.iron_ore > 0) {
          b.inStore.iron_ore--;
          b.curRecipe = { out: 'iron' };
          b.active = true; b.progress = 0;
        } else if (b.inStore.copper_ore > 0) {
          b.inStore.copper_ore--;
          b.curRecipe = { out: 'copper' };
          b.active = true; b.progress = 0;
        }
      } else {
        var ok = true;
        for (var k in recipe.in) if ((b.inStore[k] || 0) < recipe.in[k]) { ok = false; break; }
        if (ok) {
          for (var k2 in recipe.in) b.inStore[k2] -= recipe.in[k2];
          b.active = true; b.progress = 0;
        }
      }
    }
  }

  // ---------------- депо и турели ----------------
  function depotStep(dt) {
    var arr = st.depots;
    for (var i = 0; i < arr.length; i++) {
      var d = arr[i];
      d.giveT -= dt;
      if (d.giveT > 0) continue;
      d.giveT = 0.4;
      var radius = C.BUILDINGS.depot.radius * st.mods.depotRadius * T;
      var dcx = d.x * T + T / 2, dcy = d.y * T + T / 2;
      for (var j = 0; j < st.turrets.length; j++) {
        var t = st.turrets[j];
        var tdef = C.BUILDINGS[t.type];
        if (!tdef.ammo) continue;
        var cap = tdef.ammoCap * (1 + 0.5 * (t.level - 1));
        if (t.ammo >= cap) continue;
        if (dist(dcx, dcy, t.x * T + T / 2, t.y * T + T / 2) > radius) continue;
        if (d.ammo[tdef.ammo] > 0) {
          var give = Math.min(d.ammo[tdef.ammo], cap - t.ammo, 10);
          d.ammo[tdef.ammo] -= give;
          t.ammo += give;
        }
      }
    }
  }

  function findTarget(b, range) {
    var bcx = b.x * T + T / 2, bcy = b.y * T + T / 2;
    var tdef = C.BUILDINGS[b.type];
    var best = null, bestD = Infinity;
    for (var i = 0; i < st.enemies.length; i++) {
      var e = st.enemies[i];
      if (tdef.antiAir && !e.flying) continue;
      if (!tdef.antiAir && !tdef.beam && !tdef.chain && !tdef.homing && e.flying) continue;
      // gun/cannon: только земля; laser/tesla/missile/flak: все (flak только воздух)
      if ((b.type === 'gun' || b.type === 'cannon') && e.flying) continue;
      if (tdef.minRange) {
        var dr = dist(bcx, bcy, e.x, e.y);
        if (dr < tdef.minRange) continue;
      }
      var d = dist(bcx, bcy, e.x, e.y);
      if (d < range && d < bestD) { bestD = d; best = e; }
    }
    return best;
  }

  function turretDmg(b) {
    var tdef = C.BUILDINGS[b.type];
    var dmg = tdef.dmg * st.mods.dmg * Math.pow(C.TURRET_UPGRADE.dmgMul, b.level - 1);
    // бонус оружейных (максимум 2)
    var bcx = b.x * T + T / 2, bcy = b.y * T + T / 2;
    var stacks = 0;
    for (var i = 0; i < st.armories.length && stacks < 2; i++) {
      var a = st.armories[i];
      if (dist(bcx, bcy, a.x * T + T / 2, a.y * T + T / 2) <= C.BUILDINGS.armory.radius * T) stacks++;
    }
    if (stacks) dmg *= 1 + C.BUILDINGS.armory.dmgMul * stacks;
    return dmg;
  }

  function turretStep(dt) {
    var arr = st.turrets;
    for (var i = 0; i < arr.length; i++) {
      var b = arr[i];
      var tdef = C.BUILDINGS[b.type];
      b.cooldown -= dt;
      if (b.flash > 0) b.flash -= dt;
      var range = tdef.range * st.mods.range * Math.pow(C.TURRET_UPGRADE.rangeMul, b.level - 1);
      var target = b.targetId >= 0 ? st.enemies.find(function (e) { return e.id === b.targetId; }) : null;
      if (target) {
        var d = dist(b.x * T + T / 2, b.y * T + T / 2, target.x, target.y);
        if (d > range * 1.15) target = null;
      }
      if (!target) target = findTarget(b, range);
      b.targetId = target ? target.id : -1;
      if (!target) continue;

      var bcx = b.x * T + T / 2, bcy = b.y * T + T / 2;
      var ang = Math.atan2(target.y - bcy, target.x - bcx);
      b.angle = ang;
      if (b.cooldown > 0) continue;
      if (b.ammo < tdef.ammoUse) continue;
      b.ammo -= tdef.ammoUse;
      b.cooldown = tdef.cooldown / (st.mods.rate * Math.pow(C.TURRET_UPGRADE.rateMul, b.level - 1));
      b.flash = 0.09;

      var dmg = turretDmg(b);
      if (tdef.beam) {
        // лазер — мгновенно
        dealDamage(target, dmg, tdef);
        st.beams.push({ x1: bcx, y1: bcy, x2: target.x, y2: target.y, life: 0.12, color: '#7ad6ff' });
        FD.audio.play('laser');
      } else if (tdef.chain) {
        // тесла
        var hitList = [target];
        var cur = target;
        for (var ch = 1; ch < tdef.chain; ch++) {
          var next = null, nd = 90;
          for (var j = 0; j < st.enemies.length; j++) {
            var e2 = st.enemies[j];
            if (hitList.indexOf(e2) !== -1) continue;
            var dd = dist(cur.x, cur.y, e2.x, e2.y);
            if (dd < nd) { nd = dd; next = e2; }
          }
          if (!next) break;
          hitList.push(next);
          cur = next;
        }
        var px2 = bcx, py2 = bcy;
        for (var hi = 0; hi < hitList.length; hi++) {
          st.beams.push({ x1: px2, y1: py2, x2: hitList[hi].x, y2: hitList[hi].y, life: 0.16, color: '#c07dff' });
          dealDamage(hitList[hi], dmg * (hi === 0 ? 1 : 0.7), tdef);
          px2 = hitList[hi].x; py2 = hitList[hi].y;
        }
        FD.audio.play('tesla');
      } else {
        // снаряд
        var speed = tdef.projSpeed;
        var proj = {
          x: bcx + Math.cos(ang) * 10, y: bcy + Math.sin(ang) * 10,
          vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed,
          dmg: dmg, splash: (tdef.splash || 0) * st.mods.splash,
          pierce: tdef.pierceArmor || 0,
          life: C.BAL.projectileLife,
          targetId: tdef.homing ? target.id : -1,
          homing: !!tdef.homing,
          color: b.type === 'missile_turret' ? '#ff8060' : b.type === 'cannon' ? '#ffc060' : '#ffe070',
          r: b.type === 'cannon' ? 4 : b.type === 'missile_turret' ? 5 : 3
        };
        st.projectiles.push(proj);
        if (b.type === 'cannon') FD.audio.play('cannon');
        else if (b.type === 'missile_turret') FD.audio.play('missile');
        else FD.audio.play('shoot');
      }
    }
  }

  // ---------------- урон и враги ----------------
  function dealDamage(e, dmg, tdef) {
    if (!e || e.dead) return;
    var armor = e.armor * (1 - (tdef && tdef.pierceArmor ? tdef.pierceArmor : 0));
    var final = Math.max(dmg * 0.18, dmg - armor);
    e.hp -= final;
    e.flash = 0.12;
    if (e.hp <= 0) killEnemy(e);
  }

  function killEnemy(e) {
    if (e.dead) return;
    e.dead = true;
    st.stats.kills++;
    var def = C.ENEMIES[e.type];
    // награда
    st.stock.iron += def.reward * 0.5;
    st.stock.copper += def.reward * 0.25;
    spawnParticles(e.x, e.y, e.flying ? '#b08ae8' : '#e06050', 10);
    st.texts.push({ x: e.x, y: e.y - 8, text: '+' + def.reward, life: 0.8, color: '#ffe070' });
    FD.audio.play('die');
    // сплиттер
    if (def.split) {
      for (var i = 0; i < def.split; i++) {
        spawnEnemy(e.type === 'boss_swarm' ? 'runner' : 'runner', e.spawnIdx, e.x + (Math.random() * 16 - 8), e.y + (Math.random() * 16 - 8), 0.45);
      }
    }
  }

  var enemyIdCounter = 1;
  function spawnEnemy(type, spawnIdx, x, y, hpMul) {
    var def = C.ENEMIES[type];
    var path = st.paths[spawnIdx % st.paths.length];
    var s = st.mapDef.spawns[spawnIdx % st.mapDef.spawns.length];
    var ex = x != null ? x : s[0] * T + T / 2;
    var ey = y != null ? y : s[1] * T + T / 2;
    var diff = st.diff || { hp: 1, speed: 1 };
    var waveMul = 1 + C.WAVES.hpGrow * Math.max(0, st.wave - 1);
    var e = {
      id: enemyIdCounter++,
      type: type, spawnIdx: spawnIdx,
      x: ex, y: ey,
      hp: def.hp * waveMul * (hpMul || 1) * diff.hp,
      hpMax: def.hp * waveMul * (hpMul || 1) * diff.hp,
      speed: def.speed * (1 + C.WAVES.speedGrow * Math.max(0, st.wave - 1)) * diff.speed,
      armor: def.armor, reward: def.reward,
      flying: !!def.flying, boss: !!def.boss, sapper: !!def.sapper,
      split: def.split || 0, heal: def.heal || 0, regen: def.regen || 0,
      scale: def.scale || 1,
      path: path, wpIdx: 0,
      attackT: 0, flash: 0, dead: false,
      slowT: 0
    };
    if (e.flying) {
      // прямой маршрут к ядру
      e.path = [{ x: (ex / T) | 0, y: (ey / T) | 0 }, { x: st.core.x, y: st.core.y }];
    } else {
      e.wpIdx = nearestWp(e);
    }
    st.enemies.push(e);
    return e;
  }

  function enemyStep(dt) {
    var arr = st.enemies;
    for (var i = arr.length - 1; i >= 0; i--) {
      var e = arr[i];
      if (e.dead) { arr.splice(i, 1); continue; }
      if (e.flash > 0) e.flash -= dt;

      // регенерация боссов
      if (e.regen && e.hp < e.hpMax) {
        e.hp = Math.min(e.hpMax, e.hp + e.regen * dt);
      }

      // ремонтник лечит
      if (e.heal) {
        for (var j = 0; j < arr.length; j++) {
          var o = arr[j];
          if (o === e || o.dead || o.hp >= o.hpMax) continue;
          if (dist(e.x, e.y, o.x, o.y) < T * 3) o.hp = Math.min(o.hpMax, o.hp + e.heal * dt);
        }
      }

      // сапёр: грызёт постройки рядом
      if (e.sapper) {
        var victim = null, vd = T * 2.4;
        for (var id in st.buildings) {
          var b = st.buildings[id];
          if (b.type === 'core') continue;
          var d = dist(e.x, e.y, b.x * T + T / 2, b.y * T + T / 2);
          if (d < vd) { vd = d; victim = b; }
        }
        if (victim) {
          e.attackT -= dt;
          if (e.attackT <= 0) {
            e.attackT = 0.85;
            victim.hp -= C.BAL.sapperDps * 0.85;
            victim.flash = 0.15;
            spawnParticles(victim.x * T + T / 2, victim.y * T + T / 2, '#ff9040', 4);
            FD.audio.play('hit');
            if (victim.hp <= 0) {
              st.bgrid[idx(victim.x, victim.y)] = -1;
              pullList(victim);
              delete st.buildings[victim.id];
              st.needPathRebuild = true;
              spawnParticles(victim.x * T + T / 2, victim.y * T + T / 2, '#c8c8d4', 8);
            }
          }
          continue; // стоит и грызёт
        }
      }

      // движение по пути
      var path = e.path;
      if (!path || !path.length) { arr.splice(i, 1); continue; }
      var wp = path[Math.min(e.wpIdx, path.length - 1)];
      var tx = wp.x * T + T / 2, ty = wp.y * T + T / 2;
      var d = dist(e.x, e.y, tx, ty);
      var step = e.speed * dt;
      if (d <= step + 1) {
        e.x = tx; e.y = ty;
        e.wpIdx++;
        if (e.wpIdx >= path.length) {
          // дошли до ядра
          var dmg = C.BAL.enemyDamageToCore * (e.boss ? 3 : 1) * e.scale;
          st.core.hp -= dmg;
          st.coreFlash = 0.3;
          spawnParticles(e.x, e.y, '#5ad6ff', 12);
          FD.audio.play('coreHit');
          arr.splice(i, 1);
          if (st.core.hp <= 0) {
            st.core.hp = 0;
            gameOver();
          }
          continue;
        }
      } else {
        e.x += (tx - e.x) / d * step;
        e.y += (ty - e.y) / d * step;
      }
    }
  }

  function spawnParticles(x, y, color, n) {
    for (var i = 0; i < n; i++) {
      if (st.particles.length >= C.BAL.maxParticles) st.particles.shift();
      var a = Math.random() * Math.PI * 2, sp = 30 + Math.random() * 90;
      st.particles.push({
        x: x, y: y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 0.35 + Math.random() * 0.35, maxLife: 0.7,
        color: color, size: 1 + (Math.random() * 2.5) | 0
      });
    }
  }

  function projectileStep(dt) {
    var arr = st.projectiles;
    for (var i = arr.length - 1; i >= 0; i--) {
      var p = arr[i];
      p.life -= dt;
      if (p.life <= 0) { arr.splice(i, 1); continue; }
      if (p.homing && p.targetId >= 0) {
        var tgt = null;
        for (var j = 0; j < st.enemies.length; j++) if (st.enemies[j].id === p.targetId) { tgt = st.enemies[j]; break; }
        if (tgt) {
          var a = Math.atan2(tgt.y - p.y, tgt.x - p.x);
          var ca = Math.atan2(p.vy, p.vx);
          var da = a - ca;
          while (da > Math.PI) da -= Math.PI * 2;
          while (da < -Math.PI) da += Math.PI * 2;
          ca += clamp(da, -3.2 * dt, 3.2 * dt);
          var sp = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
          p.vx = Math.cos(ca) * sp; p.vy = Math.sin(ca) * sp;
        }
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.x < -20 || p.y < -20 || p.x > W * T + 20 || p.y > H * T + 20) { arr.splice(i, 1); continue; }
      // попадание
      var hit = null;
      for (var k = 0; k < st.enemies.length; k++) {
        var e = st.enemies[k];
        if (e.dead) continue;
        if (dist(p.x, p.y, e.x, e.y) < 7 + 4 * e.scale) { hit = e; break; }
      }
      if (hit) {
        dealDamage(hit, p.dmg, { pierceArmor: p.pierce });
        if (p.splash > 0) {
          for (var m = 0; m < st.enemies.length; m++) {
            var e2 = st.enemies[m];
            if (e2 === hit || e2.dead) continue;
            if (dist(p.x, p.y, e2.x, e2.y) < p.splash * 0.5) {
              dealDamage(e2, p.dmg * 0.55, { pierceArmor: p.pierce });
            }
          }
          spawnParticles(p.x, p.y, '#ff9040', 8);
          FD.audio.play('explode');
        } else {
          spawnParticles(p.x, p.y, p.color, 3);
          FD.audio.play('hit');
        }
        arr.splice(i, 1);
      }
    }
  }

  function effectStep(dt) {
    var i;
    for (i = st.particles.length - 1; i >= 0; i--) {
      var p = st.particles[i];
      p.life -= dt;
      if (p.life <= 0) { st.particles.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= 0.94; p.vy *= 0.94;
    }
    for (i = st.texts.length - 1; i >= 0; i--) {
      var t = st.texts[i];
      t.life -= dt;
      t.y -= 22 * dt;
      if (t.life <= 0) st.texts.splice(i, 1);
    }
    for (i = st.beams.length - 1; i >= 0; i--) {
      st.beams[i].life -= dt;
      if (st.beams[i].life <= 0) st.beams.splice(i, 1);
    }
    if (st.coreFlash > 0) st.coreFlash -= dt;
  }

  // ---------------- волны ----------------
  function buildWave(n) {
    // бюджет очков
    var points = 4 + n * 2.1 + (n > 20 ? (n - 20) * 1.4 : 0);
    var pool = ['soldier'];
    if (n >= 2) pool.push('runner');
    if (n >= 4) pool.push('armored');
    if (n >= 6) pool.push('flyer');
    if (n >= 8) pool.push('splitter');
    if (n >= 11) pool.push('healer');
    if (n >= 13) pool.push('sapper');
    if (n >= 17) pool.push('runner', 'runner');

    var costs = {
      runner: 1, soldier: 1.6, armored: 3.2, flyer: 2.2,
      splitter: 2.6, healer: 3, sapper: 3
    };
    var rng = mulberry32(n * 7919 + st.seed);
    var queue = [];
    var t = 1.5;
    var guard = 0;
    while (points > 0.4 && guard++ < 400) {
      var type = pool[(rng() * pool.length) | 0];
      var cost = costs[type];
      if (cost > points) { type = 'soldier'; cost = costs.soldier; }
      var count = Math.min(points / cost, 3 + (n / 4) | 0, 8);
      count = Math.max(1, count | 0);
      var gap = Math.max(0.35, 1.25 - n * 0.02);
      for (var i = 0; i < count; i++) {
        queue.push({ t: t, type: type, spawn: (rng() * st.mapDef.spawns.length) | 0 });
        t += gap * (0.7 + rng() * 0.6);
      }
      points -= count * cost;
      t += 1.2;
    }
    // боссы
    if (n % 10 === 0 && n >= 10) {
      var bossType = n === 10 ? 'boss_titan' : n === 20 ? 'boss_shield' : 'boss_swarm';
      if (n > 30) bossType = ['boss_titan', 'boss_shield', 'boss_swarm'][n % 3];
      queue.push({ t: t + 1, type: bossType, spawn: 0, hpMul: 1 + (n - 10) * 0.04 });
      // свита
      for (var s2 = 0; s2 < 4 + n / 6; s2++) {
        queue.push({ t: t + 2 + s2 * 0.8, type: 'soldier', spawn: 0 });
      }
      st.stats.bossIncoming = true;
    }
    queue.sort(function (a, b) { return a.t - b.t; });
    return queue;
  }

  function startWave() {
    st.wave++;
    st.spawnQueue = buildWave(st.wave);
    st.spawnClock = 0;
    st.phase = 'wave';
    var isBoss = st.wave % 10 === 0;
    FD.audio.play(isBoss ? 'boss' : 'wave');
    if (typeof FD.ui !== 'undefined' && FD.ui.onWaveStart) FD.ui.onWaveStart(st.wave, isBoss);
  }

  function waveStep(dt) {
    if (st.phase === 'prep') {
      // ❄ заморозка обучения: время не идёт, пока игрок сам не вызовет волну
      if (st.tutorialFrozen && st.wave < 1) return;
      st.prepTimer -= dt;
      if (st.prepTimer <= 0) startWave();
      return;
    }
    if (st.phase !== 'wave') return;
    st.spawnClock += dt;
    while (st.spawnQueue.length && st.spawnQueue[0].t <= st.spawnClock) {
      var s = st.spawnQueue.shift();
      spawnEnemy(s.type, s.spawn, null, null, s.hpMul);
    }
    if (!st.spawnQueue.length && !st.enemies.length) {
      // волна отбита
      st.phase = 'prep';
      st.prepTimer = C.WAVES.prepTime;
      st.stock.iron += C.BAL.waveReward.iron + st.wave * 1.5;
      st.stock.copper += C.BAL.waveReward.copper + st.wave * 0.8;
      st.stats.waves = st.wave;
      if (st.flags) st.flags.waveDone = 1;
      FD.audio.play('waveDone');
      if (typeof FD.io !== 'undefined' && FD.io.autoSave) FD.io.autoSave();
      if (typeof FD.ui !== 'undefined' && FD.ui.onWaveDone) FD.ui.onWaveDone(st.wave);
      if (st.wave >= C.WAVES.total && !st.endless) {
        st.phase = 'victory';
        if (FD.ui && FD.ui.onVictory) FD.ui.onVictory();
      }
    }
  }

  function callWaveNow() {
    if (st.phase !== 'prep') return;
    st.tutorialFrozen = false;
    var bonus = C.WAVES.callBonus;
    st.stock.iron += bonus.iron;
    st.stock.copper += bonus.copper;
    startWave();
  }

  function gameOver() {
    st.phase = 'gameover';
    FD.audio.play('boss');
    if (FD.ui && FD.ui.onGameOver) FD.ui.onGameOver();
  }

  // ---------------- частицы для тика ----------------
  function fixedStep(dt) {
    st.time += dt;
    if (st.needPathRebuild) rebuildPaths();
    if (st.phase === 'prep' || st.phase === 'wave') {
      waveStep(dt);
      popStep(dt);
      minerStep(dt);
      factoryStep(dt);
      beltStep(dt);
      depotStep(dt);
      turretStep(dt);
      projectileStep(dt);
      enemyStep(dt);
    }
    effectStep(dt);
    // ремонт ядра
    if (st.mods.coreRegen > 0 && st.core.hp > 0 && st.core.hp < st.core.hpMax) {
      st.core.hp = Math.min(st.core.hpMax, st.core.hp + st.mods.coreRegen * dt);
    }
    st.stats.time += dt;
  }

  var acc = 0;
  function tick(frameDt) {
    if (!st || st.paused) return;
    acc += Math.min(frameDt, 0.1) * st.speed;
    var step = 1 / 60;
    var iter = 0;
    while (acc >= step && iter++ < 12) {
      fixedStep(step);
      acc -= step;
    }
  }
  function resetAcc() { acc = 0; }

  // ---------------- новая игра / сохранение ----------------
  function newGame(mapId, diffKey) {
    var mapDef = C.MAPS[mapId];
    var seed = (Math.random() * 1e9) | 0;
    var tg = genTerrain(mapDef, seed);
    var diff = C.DIFFICULTY[diffKey || 'normal'] || C.DIFFICULTY.normal;
    st = {
      v: 2,
      mapId: mapId, mapDef: mapDef, seed: seed,
      diff: diff, diffKey: diffKey || 'normal',
      terrain: tg.terrain, ore: tg.ore,
      bgrid: new Int32Array(W * H).fill(-1),
      buildings: {}, nextId: 1,
      belts: [], miners: [], turrets: [], depots: [], factories: [], others: [], armories: [],
      enemies: [], projectiles: [], particles: [], texts: [], beams: [],
      core: { x: mapDef.core[0], y: mapDef.core[1], hp: C.BAL.coreHp, hpMax: C.BAL.coreHp },
      coreFlash: 0,
      stock: JSON.parse(JSON.stringify(C.BAL.startStock)),
      wave: 0, phase: 'prep', prepTimer: C.WAVES.prepTime,
      spawnQueue: [], spawnClock: 0,
      research: {}, mods: baseMods(),
      stats: { kills: 0, mined: 0, built: 0, waves: 0, time: 0 },
      time: 0, speed: 1, paused: false, endless: false,
      paths: [], needPathRebuild: true,
      tutorialStep: 0,
      flags: {}, _lastCoreT: 0,
      pop: { current: C.POP.start, capacity: C.POP.baseCap, need: 0, hungry: false },
      wf: 1, tutorialFrozen: !!C.WAVES.firstPrepFrozen
    };
    resetAcc();
    // ядро
    place('core', mapDef.core[0], mapDef.core[1], 0, true);
    st.stock = JSON.parse(JSON.stringify(C.BAL.startStock));
    recomputeMods();
    rebuildPaths();
    return st;
  }

  function serialize() {
    var buildings = [];
    for (var id in st.buildings) {
      var b = st.buildings[id];
      var o = {
        id: b.id, type: b.type, x: b.x, y: b.y, dir: b.dir, hp: b.hp, level: b.level
      };
      if (b.type === 'belt' || b.type === 'splitter') {
        o.item = b.item; o.progress = b.progress;
      }
      if (b.type === 'miner') { o.timer = b.timer; o.buf = b.buf; o.oreType = b.oreType; }
      if (b.type === 'farm') { o.timer = b.timer; o.buf = b.buf; }
      if (C.RECIPES[b.type]) { o.inStore = b.inStore; o.progress = b.progress; o.active = b.active; o.buf = b.buf; o.curRecipe = b.curRecipe; }
      if (b.type === 'container') o.buf = b.buf;
      if (b.type === 'depot') o.ammo = b.ammo;
      if (C.TURRET_KEYS.indexOf(b.type) !== -1) o.ammo = b.ammo;
      buildings.push(o);
    }
    return {
      v: 3,
      mapId: st.mapId, seed: st.seed,
      diffKey: st.diffKey || 'normal',
      terrain: Array.from(st.terrain), ore: Array.from(st.ore),
      buildings: buildings,
      coreHp: st.core.hp,
      stock: st.stock,
      wave: st.wave,
      phase: st.phase === 'wave' ? 'wave' : 'prep',
      prepTimer: st.prepTimer,
      spawnClock: st.spawnClock,
      spawnQueue: st.spawnQueue.map(function (entry) {
        return { t: entry.t, type: entry.type, spawn: entry.spawn, hpMul: entry.hpMul };
      }),
      enemies: st.enemies.filter(function (e) { return !e.dead; }).map(function (e) {
        return {
          id: e.id, type: e.type, spawnIdx: e.spawnIdx,
          x: e.x, y: e.y, hp: e.hp, hpMax: e.hpMax, speed: e.speed,
          armor: e.armor, reward: e.reward, flying: e.flying, boss: e.boss,
          sapper: e.sapper, split: e.split, heal: e.heal, regen: e.regen,
          scale: e.scale, attackT: e.attackT, slowT: e.slowT
        };
      }),
      projectiles: st.projectiles.map(function (p) {
        return {
          x: p.x, y: p.y, vx: p.vx, vy: p.vy, dmg: p.dmg,
          splash: p.splash, pierce: p.pierce, life: p.life,
          targetId: p.targetId, homing: p.homing, color: p.color, r: p.r
        };
      }),
      nextEnemyId: enemyIdCounter,
      research: st.research,
      stats: st.stats,
      endless: st.endless,
      flags: st.flags,
      pop: { current: st.pop.current },
      tutorialFrozen: st.tutorialFrozen,
      time: st.time
    };
  }

  function deserialize(data) {
    var mapDef = C.MAPS[data.mapId];
    var diff = C.DIFFICULTY[data.diffKey || 'normal'] || C.DIFFICULTY.normal;
    st = {
      v: 2,
      mapId: data.mapId, mapDef: mapDef, seed: data.seed,
      diff: diff, diffKey: data.diffKey || 'normal',
      terrain: Uint8Array.from(data.terrain), ore: Uint8Array.from(data.ore),
      bgrid: new Int32Array(W * H).fill(-1),
      buildings: {}, nextId: 1,
      belts: [], miners: [], turrets: [], depots: [], factories: [], others: [], armories: [],
      enemies: [], projectiles: [], particles: [], texts: [], beams: [],
      core: { x: mapDef.core[0], y: mapDef.core[1], hp: data.coreHp, hpMax: C.BAL.coreHp },
      coreFlash: 0,
      stock: data.stock,
      wave: data.wave,
      phase: data.phase === 'wave' ? 'wave' : 'prep',
      prepTimer: data.prepTimer != null ? data.prepTimer : C.WAVES.prepTime,
      spawnQueue: Array.isArray(data.spawnQueue) ? data.spawnQueue.slice() : [],
      spawnClock: data.spawnClock || 0,
      research: data.research || {},
      mods: baseMods(),
      stats: data.stats,
      time: data.time || 0, speed: 1, paused: false,
      endless: !!data.endless,
      paths: [], needPathRebuild: true,
      tutorialStep: 0,
      flags: data.flags || {}, _lastCoreT: 0,
      pop: {
        current: (data.pop && data.pop.current) || C.POP.start,
        capacity: C.POP.baseCap, need: 0, hungry: false
      },
      wf: 1, tutorialFrozen: data.tutorialFrozen != null ? !!data.tutorialFrozen : true
    };
    for (var i = 0; i < data.buildings.length; i++) {
      var bd = data.buildings[i];
      st.skipPathCheck = true;
      st.loading = true;
      var r = place(bd.type, bd.x, bd.y, bd.dir, true);
      st.skipPathCheck = false;
      st.loading = false;
      if (r.ok) {
        var b = r.building;
        // перерегистрируем под старый id (словарь и bgrid)
        delete st.buildings[b.id];
        b.id = bd.id;
        st.buildings[b.id] = b;
        st.nextId = Math.max(st.nextId, bd.id + 1);
        b.hp = bd.hp;
        b.level = bd.level || 1;
        if (bd.item !== undefined) { b.item = bd.item; b.progress = bd.progress || 0; }
        if (bd.timer !== undefined) { b.timer = bd.timer; b.buf = bd.buf || []; b.oreType = bd.oreType; }
        if (bd.inStore) { b.inStore = bd.inStore; b.progress = bd.progress || 0; b.active = bd.active; b.buf = bd.buf || []; b.curRecipe = bd.curRecipe; }
        if (b.type === 'container' && bd.buf) b.buf = bd.buf;
        if (bd.ammo && b.type === 'depot') b.ammo = bd.ammo;
        if (bd.ammo != null && C.TURRET_KEYS.indexOf(b.type) !== -1) b.ammo = bd.ammo;
        if (b.type === 'core') {
          for (var cdy = 0; cdy < C.BAL.coreSize; cdy++) {
            for (var cdx = 0; cdx < C.BAL.coreSize; cdx++) {
              st.bgrid[idx(b.x + cdx, b.y + cdy)] = b.id;
            }
          }
        } else {
          st.bgrid[idx(b.x, b.y)] = b.id;
        }
      }
    }

    // Сейв из старых версий не содержит активные волны — для него остаётся
    // безопасный режим подготовки. Новые сейвы восстанавливают бой целиком.
    var savedEnemies = Array.isArray(data.enemies) ? data.enemies : [];
    var highestEnemyId = 0;
    for (var ei = 0; ei < savedEnemies.length; ei++) {
      var se = savedEnemies[ei];
      var ed = C.ENEMIES[se.type];
      if (!ed || se.dead) continue;
      var enemyId = se.id != null ? +se.id : highestEnemyId + 1;
      var restored = {
        id: enemyId, type: se.type,
        spawnIdx: se.spawnIdx || 0,
        x: se.x || 0, y: se.y || 0,
        hp: se.hp != null ? se.hp : ed.hp,
        hpMax: se.hpMax != null ? se.hpMax : ed.hp,
        speed: se.speed != null ? se.speed : ed.speed,
        armor: se.armor != null ? se.armor : ed.armor,
        reward: se.reward != null ? se.reward : ed.reward,
        flying: se.flying != null ? !!se.flying : !!ed.flying,
        boss: se.boss != null ? !!se.boss : !!ed.boss,
        sapper: se.sapper != null ? !!se.sapper : !!ed.sapper,
        split: se.split != null ? se.split : (ed.split || 0),
        heal: se.heal != null ? se.heal : (ed.heal || 0),
        regen: se.regen != null ? se.regen : (ed.regen || 0),
        scale: se.scale || ed.scale || 1,
        path: [], wpIdx: 0, attackT: se.attackT || 0,
        flash: 0, dead: false, slowT: se.slowT || 0
      };
      st.enemies.push(restored);
      highestEnemyId = Math.max(highestEnemyId, enemyId);
    }
    var requestedNextEnemyId = data.nextEnemyId != null ? +data.nextEnemyId : 1;
    enemyIdCounter = Math.max(1, requestedNextEnemyId || 1, highestEnemyId + 1);
    if (Array.isArray(data.projectiles)) {
      st.projectiles = data.projectiles.filter(function (p) {
        return p && typeof p.x === 'number' && typeof p.y === 'number';
      });
    }

    recomputeMods();
    rebuildPaths();
    resetAcc();
    return st;
  }

  // ---------------- API ----------------
  FD.sim = {
    tick: tick,
    newGame: newGame,
    serialize: serialize,
    deserialize: deserialize,
    get: function () { return st; },
    canPlace: canPlace,
    place: place,
    sell: sell,
    upgradeTurret: upgradeTurret,
    canAfford: canAfford,
    callWaveNow: callWaveNow,
    startWave: startWave,
    previewWave: function (n) {
      var q = buildWave(n);
      var counts = {};
      for (var i = 0; i < q.length; i++) counts[q[i].type] = (counts[q[i].type] || 0) + 1;
      return counts;
    },
    workerDemand: workerDemand,
    research: function (id) {
      var def = C.RESEARCH[id];
      if (!def || st.research[id]) return { ok: false, why: 'Уже исследовано' };
      if (def.req && !st.research[def.req]) return { ok: false, why: 'Требуется предыдущее' };
      if ((st.stock.science || 0) < def.cost) return { ok: false, why: 'Нужно нау-пакетов: ' + def.cost };
      st.stock.science -= def.cost;
      st.research[id] = true;
      recomputeMods();
      FD.audio.play('research');
      return { ok: true };
    },
    setSpeed: function (s) { if (st) st.speed = clamp(s, 1, 3); },
    setPaused: function (p) { if (st) st.paused = p; },
    setEndless: function () { if (st) { st.endless = true; st.phase = 'prep'; st.prepTimer = C.WAVES.prepTime; } },
    spawnParticles: spawnParticles,
    idx: idx, inMap: inMap
  };
})();
