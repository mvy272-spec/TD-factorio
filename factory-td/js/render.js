/* Factory Defense — canvas-рендер игрового поля (анимированный) */
var FD = window.FD || (window.FD = {});
(function () {
  'use strict';
  var C = FD.config;
  var T = C.TILE, W = C.MAP_W, H = C.MAP_H;

  var canvas = null, ctx = null, terrainCanvas = null, waterCanvas = null;
  var ghost = { active: false, type: null, x: 0, y: 0, dir: 0, valid: true, why: '' };
  var selectedId = -1;
  var hoverTile = { x: -1, y: -1 };

  function dist2(ax, ay, bx, by) {
    var dx = ax - bx, dy = ay - by;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function init(cv) {
    canvas = cv;
    canvas.width = W * T;
    canvas.height = H * T;
    ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    buildTerrain();
  }

  function buildTerrain() {
    var st = FD.sim.get();
    if (!st) return;
    terrainCanvas = document.createElement('canvas');
    terrainCanvas.width = W * T;
    terrainCanvas.height = H * T;
    var x = terrainCanvas.getContext('2d');
    x.imageSmoothingEnabled = false;
    var S = FD.sprites;
    for (var y = 0; y < H; y++) {
      for (var xx = 0; xx < W; xx++) {
        var i = FD.sim.idx(xx, y);
        var t = st.terrain[i];
        var spr;
        if (t === 1) spr = S.water;
        else if (t === 2) spr = S.rock;
        else {
          var h = (xx * 7 + y * 13) % 3;
          spr = h === 0 ? S.ground : h === 1 ? S.ground2 : S.ground3;
        }
        x.drawImage(spr, xx * T, y * T);
        var ore = st.ore[i];
        if (ore && t === 0) {
          var ospr = ore === 1 ? S.ore_iron : ore === 2 ? S.ore_copper : ore === 3 ? S.ore_coal : S.ore_crystal;
          x.drawImage(ospr, xx * T, y * T);
          // яркая рамка жилы — руду видно сразу
          x.fillStyle = ore === 1 ? 'rgba(230,150,80,0.35)' : ore === 2 ? 'rgba(255,170,90,0.35)' :
            ore === 3 ? 'rgba(120,120,150,0.3)' : 'rgba(110,220,255,0.4)';
          x.fillRect(xx * T, yy0(y), T, 1);
          x.fillRect(xx * T, y * T + T - 1, T, 1);
          x.fillRect(xx * T, y * T, 1, T);
          x.fillRect(xx * T + T - 1, y * T, 1, T);
        }
      }
    }
    // слабая сетка
    x.fillStyle = 'rgba(0,0,0,0.07)';
    for (var gx = 0; gx <= W; gx++) x.fillRect(gx * T - 1, 0, 1, H * T);
    for (var gy = 0; gy <= H; gy++) x.fillRect(0, gy * T - 1, W * T, 1);
  }
  function yy0(y) { return y * T; }

  // ---------- маршрут врагов и порталы спавна ----------
  function drawPaths(st, bright) {
    var i, j;
    for (i = 0; i < st.paths.length; i++) {
      var p = st.paths[i];
      if (!p || p.length < 2) continue;
      ctx.strokeStyle = bright ? 'rgba(255,90,90,0.55)' : 'rgba(255,90,90,0.18)';
      ctx.lineWidth = bright ? 2.5 : 1.5;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      var s0 = st.mapDef.spawns[i];
      ctx.moveTo(s0[0] * T + T / 2, s0[1] * T + T / 2);
      for (j = 0; j < p.length; j++) ctx.lineTo(p[j].x * T + T / 2, p[j].y * T + T / 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.lineWidth = 1;
    }
    // порталы спавна — пульсирующие кольца
    var pulse = 0.5 + 0.5 * Math.sin(st.time * 3);
    for (i = 0; i < st.mapDef.spawns.length; i++) {
      var s = st.mapDef.spawns[i];
      var cx = s[0] * T + T / 2, cy = s[1] * T + T / 2;
      ctx.strokeStyle = 'rgba(255,70,70,' + (0.35 + pulse * 0.45) + ')';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, 8 + pulse * 4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,60,60,' + (0.15 + pulse * 0.2) + ')';
      ctx.beginPath();
      ctx.arc(cx, cy, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 1;
      // иконка черепа-силуэта
      ctx.fillStyle = '#ffd0d0';
      ctx.fillRect(cx - 2, cy - 3, 4, 4);
      ctx.fillRect(cx - 3, cy + 1, 6, 2);
    }
  }

  // ---------- подсветка руды под инструментом ----------
  function drawOreHighlight(st) {
    var S = FD.sprites;
    for (var y = 0; y < H; y++) {
      for (var x = 0; x < W; x++) {
        var ore = st.ore[FD.sim.idx(x, y)];
        if (!ore) continue;
        var glow = 0.22 + 0.18 * Math.sin(st.time * 3.2 + x * 0.7 + y * 0.9);
        ctx.fillStyle = 'rgba(80,255,120,' + glow.toFixed(2) + ')';
        ctx.fillRect(x * T, y * T, T, T);
      }
    }
  }

  // ---------- здания ----------
  function drawBuilding(b, st) {
    var S = FD.sprites;
    var px = b.x * T, py = b.y * T;
    var t = st.time;

    // тень
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    ctx.fillRect(px + 2, py + 2, (b.type === 'core' ? T * 2 : T) - 1, (b.type === 'core' ? T * 2 : T) - 1);

    if (b.type === 'core') {
      // пульс ядра
      var pulse = 0.5 + 0.5 * Math.sin(t * 2.2);
      ctx.save();
      ctx.globalAlpha = 0.25 + pulse * 0.25;
      ctx.fillStyle = '#5ad6ff';
      ctx.beginPath();
      ctx.arc(px + T, py + T, 26 + pulse * 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.drawImage(S.core, px, py);
      if (st.coreFlash > 0) {
        ctx.fillStyle = 'rgba(255,60,60,0.35)';
        ctx.fillRect(px, py, T * 2, T * 2);
      }
      return;
    }

    if (b.type === 'belt' || b.type === 'splitter') {
      var beltSprite = b.type === 'splitter' ? S.splitter : S.belt;
      ctx.drawImage(FD.rot(beltSprite, b.dir), px, py);
      var DX4 = [1, 0, -1, 0], DY4 = [0, 1, 0, -1];
      var dx = DX4[b.dir], dy = DY4[b.dir];
      var speed = (st.mods.beltSpeed || 1) * 1.6;
      for (var k = 0; k < 3; k++) {
        var off = ((t * speed + k / 3) % 1) - 0.5; // -0.5..0.5
        var cx = px + T / 2 + dx * off * T * 0.85;
        var cy = py + T / 2 + dy * off * T * 0.85;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(b.dir * Math.PI / 2);
        ctx.fillStyle = b.item ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.35)';
        ctx.beginPath();
        ctx.moveTo(3, -3.4);
        ctx.lineTo(7, 0);
        ctx.lineTo(3, 3.4);
        ctx.lineTo(4.6, 0);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      // ТУПИК: впереди пусто / край карты — красный восклицательный знак
      var fx = b.x + dx, fy = b.y + dy;
      var fid = FD.sim.inMap(fx, fy) ? st.bgrid[FD.sim.idx(fx, fy)] : -2;
      var frontEmpty = (fid === -1 || fid === -2);
      if (frontEmpty) {
        if (Math.sin(t * 5) > -0.25) {
          ctx.fillStyle = '#ff4040';
          ctx.fillRect(px + T / 2 - 2, py + 2, 4, 8);
          ctx.fillRect(px + T / 2 - 2, py + 12, 4, 3);
          ctx.fillStyle = '#fff';
          ctx.fillRect(px + T / 2 - 1, py + 3, 2, 5);
        }
      }
      // ПРОБКА: предмет стоит на месте — жёлтая метка
      if (b.item && (b.progress || 0) >= 1) {
        if (Math.sin(t * 7 + b.x) > 0) {
          ctx.fillStyle = '#ffd040';
          ctx.fillRect(px + T / 2 - 2, py + 2, 4, 4);
        }
      }
      return;
    }

    if (C.TURRET_KEYS.indexOf(b.type) !== -1) {
      ctx.drawImage(S[b.type + '_base'], px, py);
      var bx = px + T / 2, by = py + T / 2;
      var lvl = b.level || 1;
      ctx.save();
      ctx.translate(bx, by);
      ctx.rotate(b.angle || -Math.PI / 2);
      var bl = S[b.type + '_barrel'];
      var sc = 0.8 + lvl * 0.12;
      // отдача ствола
      var recoil = b.flash > 0 ? -2.2 : 0;
      ctx.drawImage(bl, -4 + recoil, -4, bl.width * sc, bl.height * sc);
      if (b.flash > 0) {
        ctx.fillStyle = 'rgba(255,240,150,0.95)';
        ctx.beginPath();
        ctx.arc(bl.width * sc - 1 + recoil, 0, 3.5 + b.flash * 18, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      if (lvl > 1) {
        ctx.fillStyle = '#ffe070';
        for (var s = 0; s < lvl - 1; s++) ctx.fillRect(px + 2 + s * 4, py + 1, 3, 3);
      }
      // индикатор бонуса оружейной
      if (st.armories && st.armories.length) {
        for (var ai = 0; ai < st.armories.length; ai++) {
          var ar = st.armories[ai];
          if (dist2(bx, by, ar.x * T + T / 2, ar.y * T + T / 2) <= C.BUILDINGS.armory.radius * T) {
            ctx.fillStyle = '#ff8060';
            ctx.fillRect(px + T - 6, py + T - 6, 5, 5);
            ctx.fillStyle = '#ffe0c0';
            ctx.fillRect(px + T - 5, py + T - 5, 2, 2);
            break;
          }
        }
      }
      // нет патронов — мигающий красный индикатор
      var tdef = C.BUILDINGS[b.type];
      if (b.ammo <= 0 && tdef.ammo) {
        if (Math.sin(t * 6) > 0) {
          ctx.fillStyle = '#ff4040';
          ctx.fillRect(px + T - 5, py + 1, 4, 4);
        }
      } else if (tdef.ammo) {
        // полоса боезапаса
        var cap = tdef.ammoCap * (1 + 0.5 * (lvl - 1));
        ctx.fillStyle = '#222';
        ctx.fillRect(px + 1, py + T - 3, T - 2, 2);
        ctx.fillStyle = '#ffd75e';
        ctx.fillRect(px + 1, py + T - 3, (T - 2) * Math.min(1, b.ammo / cap), 2);
      }
    } else {
      var spr = S[b.type];
      if (spr) ctx.drawImage(spr, px, py);

      // анимации
      if (b.type === 'miner') {
        // бур качается
        var bob = Math.sin(t * 9) * 1.6;
        ctx.fillStyle = '#d8d8e0';
        ctx.fillRect(px + 9, py + 11 + bob, 2, 5);
        ctx.fillStyle = '#888894';
        ctx.fillRect(px + 8, py + 14 + bob, 4, 2);
        // буфер — точки предметов
        if (b.buf && b.buf.length) {
          for (var bi = 0; bi < Math.min(b.buf.length, 4); bi++) {
            var ispr = S['i_' + b.buf[bi]];
            if (ispr) ctx.drawImage(ispr, px + 2 + bi * 4, py + 2);
          }
        }
      }
      if (b.type === 'smelter') {
        // пламя в трубе
        var fl = 0.45 + 0.35 * Math.sin(t * 11) + 0.2 * Math.sin(t * 17 + 1);
        ctx.fillStyle = 'rgba(255,' + (120 + fl * 80 | 0) + ',40,' + (0.5 + fl * 0.4).toFixed(2) + ')';
        ctx.fillRect(px + 13, py - 2, 4, 5);
        ctx.fillStyle = 'rgba(255,200,120,0.35)';
        ctx.fillRect(px + 3, py + 12, 14, 5);
      }
      if (b.type === 'house') {
        // тёплый свет окон
        var glow = 0.55 + 0.35 * Math.sin(t * 2.1 + b.x * 1.3 + b.y);
        ctx.fillStyle = 'rgba(255,216,112,' + (0.25 * glow).toFixed(2) + ')';
        ctx.fillRect(px + 2, py + 8, 8, 8);
        ctx.fillRect(px + 10, py + 8, 8, 8);
        // дымок
        if (Math.sin(t * 1.7 + b.id) > 0.4) {
          ctx.fillStyle = 'rgba(220,220,230,0.35)';
          ctx.fillRect(px + 8 + Math.sin(t * 3) * 2, py - 4 - (t * 6 % 8 | 0), 3, 3);
        }
      }
      if (b.type === 'farm') {
        // качаются всходы
        var sway = Math.sin(t * 2.4 + b.x + b.y) * 1.2;
        ctx.fillStyle = 'rgba(120,255,90,0.55)';
        for (var fr = 0; fr < 3; fr++) {
          ctx.fillRect(px + 3 + fr * 5 + sway, py + 2 + fr * 4, 2, 3);
        }
      }
      if (b.type === 'armory') {
        // пульс ауры
        var ap = 0.5 + 0.5 * Math.sin(t * 3.2);
        ctx.strokeStyle = 'rgba(255,120,90,' + (0.25 + ap * 0.3).toFixed(2) + ')';
        ctx.beginPath();
        ctx.arc(px + T / 2, py + T / 2, 6 + ap * 3, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (b.type === 'container' && b.buf && b.buf.length) {
        // уровень заполнения
        ctx.fillStyle = '#222';
        ctx.fillRect(px + 1, py + T - 3, T - 2, 2);
        ctx.fillStyle = '#7ad6ff';
        ctx.fillRect(px + 1, py + T - 3, (T - 2) * (b.buf.length / 60), 2);
        for (var ci = 0; ci < Math.min(b.buf.length, 3); ci++) {
          var cspr = S['i_' + b.buf[ci]];
          if (cspr) ctx.drawImage(cspr, px + 3 + ci * 5, py + 3);
        }
      }
      if (b.active) {
        var rec = C.RECIPES[b.type];
        var time = (C.BUILDINGS[b.type].recipeTime || (rec && rec.time) || 1);
        // анимированная полоса производства
        var prog = Math.min(1, b.progress / time);
        ctx.fillStyle = 'rgba(20,30,40,0.85)';
        ctx.fillRect(px + 2, py + T - 5, T - 4, 3);
        ctx.fillStyle = '#7ef0ff';
        ctx.fillRect(px + 2, py + T - 5, (T - 4) * prog, 3);
      }
    }

    // стрелка выхода (для производств)
    if (b.outDir >= 0 || b.type === 'miner' || C.RECIPES[b.type] || b.type === 'container') {
      var od = b.outDir != null && b.outDir >= 0 ? b.outDir : b.dir;
      var ax = px + T / 2 + [1, 0, -1, 0][od] * (T / 2 - 2);
      var ay = py + T / 2 + [0, 1, 0, -1][od] * (T / 2 - 2);
      ctx.save();
      ctx.translate(ax, ay);
      ctx.rotate(od * Math.PI / 2);
      ctx.fillStyle = 'rgba(120,255,160,0.9)';
      ctx.beginPath();
      ctx.moveTo(3, -3);
      ctx.lineTo(-1, 0);
      ctx.lineTo(3, 3);
      ctx.lineTo(1.2, 0);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    if (b.flash > 0) {
      ctx.fillStyle = 'rgba(255,80,60,0.4)';
      ctx.fillRect(px, py, T, T);
    }
    if (b.hp < b.hpMax) {
      ctx.fillStyle = '#200';
      ctx.fillRect(px + 1, py - 3, T - 2, 2);
      ctx.fillStyle = '#5c5';
      ctx.fillRect(px + 1, py - 3, (T - 2) * Math.max(0, b.hp / b.hpMax), 2);
    }
  }

  function drawBeltItems(st) {
    var S = FD.sprites;
    var DX4 = [1, 0, -1, 0], DY4 = [0, 1, 0, -1];
    for (var i = 0; i < st.belts.length; i++) {
      var b = st.belts[i];
      if (!b.item) continue;
      var t = Math.min(1, b.progress || 0);
      var ix, iy;
      var cx = b.x * T + T / 2, cy = b.y * T + T / 2;
      var ex = cx + DX4[b.dir] * T / 2, ey = cy + DY4[b.dir] * T / 2;
      // L-интерполяция по углам: сначала к краю своего тайла, потом к центру следующего
      if (t <= 0.5) {
        var k = t * 2;
        ix = cx + (ex - cx) * k;
        iy = cy + (ey - cy) * k;
      } else {
        var nx = b.x + DX4[b.dir], ny = b.y + DY4[b.dir];
        var k2 = (t - 0.5) * 2;
        var ncx = nx * T + T / 2, ncy = ny * T + T / 2;
        // путь: край нашего тайла → центр следующего (корректный поворот)
        ix = ex + (ncx - ex) * k2;
        iy = ey + (ncy - ey) * k2;
      }
      ix -= 5; iy -= 5;
      // тень предмета
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(ix + 1, iy + 1, 10, 10);
      var spr = S['i_' + b.item];
      if (spr) ctx.drawImage(spr, ix, iy, 10, 10);
    }
  }

  function drawEnemy(e, st) {
    var S = FD.sprites;
    var spr = S[e.type];
    if (!spr) return;
    var w = spr.width * e.scale, h = spr.height * e.scale;
    // шаг — лёгкое покачивание
    var bob = Math.sin(st.time * 9 + e.id * 1.7) * 1.3;
    var ex = e.x, ey = e.y + bob;

    // тень
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(e.x, e.y + h / 2 + 3, w * 0.38, h * 0.16, 0, 0, Math.PI * 2);
    ctx.fill();

    if (e.flash > 0) {
      ctx.save();
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = '#fff';
      ctx.fillRect(ex - w / 2, ey - h / 2, w, h);
      ctx.restore();
    }
    ctx.drawImage(spr, ex - w / 2, ey - h / 2, w, h);
    if (e.boss) {
      // корона босса
      ctx.fillStyle = '#ffd050';
      ctx.fillRect(ex - 6, ey - h / 2 - 7, 12, 3);
      ctx.fillRect(ex - 6, ey - h / 2 - 9, 2, 3);
      ctx.fillRect(ex - 1, ey - h / 2 - 10, 2, 4);
      ctx.fillRect(ex + 4, ey - h / 2 - 9, 2, 3);
    }
    if (e.hp < e.hpMax || e.boss) {
      var bw = Math.max(14, w);
      ctx.fillStyle = '#200';
      ctx.fillRect(ex - bw / 2, ey - h / 2 - 5, bw, 3);
      ctx.fillStyle = e.boss ? '#ff6040' : '#5d5';
      ctx.fillRect(ex - bw / 2, ey - h / 2 - 5, bw * Math.max(0, e.hp / e.hpMax), 3);
    }
  }

  function drawGhost(st) {
    if (!ghost.active || !ghost.type) return;
    var px = ghost.x * T, py = ghost.y * T;
    var S = FD.sprites;
    var def = C.BUILDINGS[ghost.type];
    var spr = C.TURRET_KEYS.indexOf(ghost.type) !== -1 ? S[ghost.type + '_base'] : S[ghost.type];

    // подсветка допустимых тайлов для шахты
    if (ghost.type === 'miner') drawOreHighlight(st);

    ctx.save();
    ctx.globalAlpha = 0.65;
    if (spr) {
      if (ghost.type === 'belt' || ghost.type === 'splitter') {
        var ghostBeltSprite = ghost.type === 'splitter' ? S.splitter : S.belt;
        ctx.drawImage(FD.rot(ghostBeltSprite, ghost.dir), px, py);
        // стрелка направления призрака
        ctx.save();
        ctx.translate(px + T / 2, py + T / 2);
        ctx.rotate(ghost.dir * Math.PI / 2);
        ctx.fillStyle = '#fff';
        ctx.fillRect(-6, -2, 9, 4);
        ctx.beginPath();
        ctx.moveTo(6, -5); ctx.lineTo(11, 0); ctx.lineTo(6, 5);
        ctx.fill();
        ctx.restore();
      } else {
        ctx.drawImage(spr, px, py);
      }
    }
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = ghost.valid ? '#40ff70' : '#ff4050';
    ctx.fillRect(px, py, T, T);
    ctx.restore();

    // радиус
    if (def && (def.range || def.radius)) {
      var r = (def.range || def.radius * T);
      ctx.strokeStyle = ghost.valid ? 'rgba(120,255,160,0.75)' : 'rgba(255,120,120,0.75)';
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.arc(px + T / 2, py + T / 2, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    // связь с соседними лентами — подсветить приёмников
    for (var d = 0; d < 4; d++) {
      var nx = ghost.x + [1, 0, -1, 0][d], ny = ghost.y + [0, 1, 0, -1][d];
      var nb = null;
      if (FD.sim.inMap(nx, ny)) {
        var id2 = st.bgrid[FD.sim.idx(nx, ny)];
        if (id2 >= 0) nb = st.buildings[id2];
      }
      if (nb && nb.type === 'belt') {
        ctx.strokeStyle = 'rgba(120,220,255,0.8)';
        ctx.strokeRect(nx * T + 2, ny * T + 2, T - 4, T - 4);
      }
    }
  }

  function drawQuestMarker(st) {
    if (!FD.ui || !FD.ui.getQuest) return;
    var q = FD.ui.getQuest();
    if (!q || !q.marker) return;
    var m = q.marker(st);
    if (!m) return;
    var pulse = 0.5 + 0.5 * Math.sin(st.time * 4.5);
    var cx = m.x * T + T / 2, cy = m.y * T + T / 2;
    ctx.strokeStyle = 'rgba(255,230,90,' + (0.5 + pulse * 0.5) + ')';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(cx, cy, 11 + pulse * 6, 0, Math.PI * 2);
    ctx.stroke();
    // стрелка вниз
    ctx.fillStyle = 'rgba(255,230,90,' + (0.55 + pulse * 0.45) + ')';
    var hy = cy - 18 - pulse * 5;
    ctx.beginPath();
    ctx.moveTo(cx, hy + 9);
    ctx.lineTo(cx - 5, hy);
    ctx.lineTo(cx + 5, hy);
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = 1;
    if (q.text) {
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(20,20,20,0.75)';
      var tw = ctx.measureText(q.short || '').width + 8;
      ctx.fillRect(cx - tw / 2, cy + 14, tw, 12);
      ctx.fillStyle = '#ffe660';
      ctx.fillText(q.short || q.text, cx, cy + 23);
    }
  }

  function draw() {
    if (!ctx) return;
    var st = FD.sim.get();
    if (!st) return;

    // вода: анимация 2 кадра
    ctx.drawImage(terrainCanvas, 0, 0);
    if (Math.sin(st.time * 2.4) > -0.2) {
      ctx.save();
      ctx.globalAlpha = 0.25;
      for (var wy = 0; wy < H; wy++) {
        for (var wx = 0; wx < W; wx++) {
          if (st.terrain[FD.sim.idx(wx, wy)] === 1) {
            ctx.drawImage(FD.sprites.water, wx * T + 1, wy * T);
          }
        }
      }
      ctx.restore();
    }

    // маршрут врагов — виден всегда, ярче при постройке турелей
    var bm = ghost.active ? ghost.type : null;
    var brightPath = bm && (C.TURRET_KEYS.indexOf(bm) !== -1 || bm === 'wall');
    drawPaths(st, brightPath);

    var id, b;
    for (id in st.buildings) {
      b = st.buildings[id];
      if (b.type === 'belt' || b.type === 'splitter') drawBuilding(b, st);
    }
    drawBeltItems(st);
    for (id in st.buildings) {
      b = st.buildings[id];
      if (b.type !== 'belt' && b.type !== 'splitter') drawBuilding(b, st);
    }

    // выделение
    if (selectedId >= 0 && st.buildings[selectedId]) {
      b = st.buildings[selectedId];
      var bx = b.x * T, by = b.y * T;
      var bw = b.type === 'core' ? T * 2 : T, bh = bw;
      var dash = (st.time * 18) % 8;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.lineDashOffset = -dash;
      ctx.strokeRect(bx - 2, by - 2, bw + 4, bh + 4);
      ctx.setLineDash([]);
      ctx.lineWidth = 1;
      var def = C.BUILDINGS[b.type];
      if (def && (def.range || def.radius)) {
        var r = def.range ? def.range * (st.mods.range || 1) * Math.pow(C.TURRET_UPGRADE.rangeMul, (b.level || 1) - 1)
          : def.radius * T * (st.mods.depotRadius || 1);
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.setLineDash([6, 5]);
        ctx.beginPath();
        ctx.arc(bx + T / 2, by + T / 2, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // подсветка тайла под курсором (без режима постройки)
    if (!ghost.active && hoverTile.x >= 0) {
      var hid = st.bgrid[FD.sim.idx(hoverTile.x, hoverTile.y)];
      if (hid >= 0 && st.buildings[hid]) {
        ctx.strokeStyle = 'rgba(120,220,255,0.8)';
        ctx.strokeRect(hoverTile.x * T - 1, hoverTile.y * T - 1, T + 2, T + 2);
      }
    }

    // враги
    for (var i = 0; i < st.enemies.length; i++) drawEnemy(st.enemies[i], st);

    // снаряды со следами
    for (i = 0; i < st.projectiles.length; i++) {
      var p = st.projectiles[i];
      ctx.strokeStyle = p.color;
      ctx.globalAlpha = 0.45;
      ctx.lineWidth = p.r * 1.2;
      ctx.beginPath();
      ctx.moveTo(p.x - p.vx * 0.035, p.y - p.vy * 0.035);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      ctx.lineWidth = 1;
      ctx.globalAlpha = 1;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    // лучи
    for (i = 0; i < st.beams.length; i++) {
      var bmz = st.beams[i];
      ctx.strokeStyle = bmz.color;
      ctx.globalAlpha = Math.max(0, bmz.life / 0.16);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(bmz.x1, bmz.y1);
      ctx.lineTo(bmz.x2, bmz.y2);
      ctx.stroke();
      ctx.lineWidth = 1;
      ctx.globalAlpha = 1;
    }
    // частицы
    for (i = 0; i < st.particles.length; i++) {
      var pt = st.particles[i];
      ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
      ctx.fillStyle = pt.color;
      ctx.fillRect(pt.x, pt.y, pt.size, pt.size);
    }
    ctx.globalAlpha = 1;
    // текст
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    for (i = 0; i < st.texts.length; i++) {
      var tx = st.texts[i];
      ctx.globalAlpha = Math.min(1, tx.life * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillText(tx.text, tx.x + 1, tx.y + 1);
      ctx.fillStyle = tx.color;
      ctx.fillText(tx.text, tx.x, tx.y);
    }
    ctx.globalAlpha = 1;

    // голод — красная вуаль
    if (st.pop && st.pop.hungry) {
      var hv = 0.05 + 0.04 * Math.sin(st.time * 4);
      ctx.fillStyle = 'rgba(255,50,30,' + hv.toFixed(3) + ')';
      ctx.fillRect(0, 0, W * T, H * T);
    }

    drawGhost(st);
    drawQuestMarker(st);
  }

  FD.render = {
    init: init,
    draw: draw,
    rebuild: buildTerrain,
    setGhost: function (g) {
      ghost = g || { active: false, type: null, x: 0, y: 0, dir: 0, valid: true };
    },
    getGhost: function () { return ghost; },
    setSelected: function (id) { selectedId = id; },
    getSelected: function () { return selectedId; },
    setHover: function (x, y) { hoverTile.x = x; hoverTile.y = y; }
  };
})();
