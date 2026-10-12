/* Factory Defense — инициализация, игровой цикл, ввод (протяжка с автонаправлением) */
var FD = window.FD || (window.FD = {});
(function () {
  'use strict';
  var C = FD.config;
  var T = C.TILE;
  var canvas = null;
  var lastTime = 0;
  var drag = { active: false, x0: -1, y0: -1, lastX: -1, lastY: -1, moved: false, placed: false };
  var hoverTile = { x: -1, y: -1 };

  function toTile(ev) {
    var r = canvas.getBoundingClientRect();
    var sx = (ev.clientX - r.left) / r.width * canvas.width;
    var sy = (ev.clientY - r.top) / r.height * canvas.height;
    return { x: Math.floor(sx / T), y: Math.floor(sy / T) };
  }

  function isBeltTool() {
    var bm = FD.ui.getBuildMode();
    return bm && (bm.type === 'belt' || bm.type === 'splitter');
  }

  function updateGhost() {
    var st = FD.sim.get();
    var bm = FD.ui.getBuildMode();
    if (!st || !bm || hoverTile.x < 0) {
      FD.render.setGhost({ active: false });
      FD.render.setHover(hoverTile.x, hoverTile.y);
      return;
    }
    FD.render.setHover(hoverTile.x, hoverTile.y);
    var check = FD.sim.canPlace(bm.type, hoverTile.x, hoverTile.y);
    var valid = check === true || check.ok === true;
    var why = valid ? '' : (check.why || 'Нельзя');
    FD.render.setGhost({
      active: true, type: bm.type,
      x: hoverTile.x, y: hoverTile.y,
      dir: bm.dir || 0,
      valid: valid, why: why
    });
  }

  // авто-направление: по dominant-оси к ядру
  function autoDirToCore(st, x, y) {
    var cx = st.core.x + 0.5, cy = st.core.y + 0.5;
    var dx = cx - x, dy = cy - y;
    if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? 0 : 2;
    return dy > 0 ? 1 : 3;
  }

  function placeAt(tx, ty, dir) {
    var st = FD.sim.get();
    var bm = FD.ui.getBuildMode();
    if (!st || !bm) return false;
    var r = FD.sim.place(bm.type, tx, ty, dir);
    if (r.ok) {
      FD.audio.play('build');
      FD.sim.spawnParticles(tx * T + T / 2, ty * T + T / 2, '#c8e8ff', 4);
      drag.placed = true;
      return true;
    } else {
      FD.audio.play('error');
      FD.ui.toast(r.why, true);
      return false;
    }
  }

  // доориентировать ленту на тайле в сторону dir (для поворотов при протяжке)
  function reorientBelt(x, y, dir) {
    var st = FD.sim.get();
    if (!st || !FD.sim.inMap(x, y)) return;
    var id = st.bgrid[FD.sim.idx(x, y)];
    if (id >= 0 && st.buildings[id]) {
      var b = st.buildings[id];
      if ((b.type === 'belt' || b.type === 'splitter') && b.dir !== dir) {
        b.dir = dir;
      }
    }
  }

  // линия тайлов от (x0,y0) до (x1,y1) — ставим с автонаправлением по шагам
  function layLine(x0, y0, x1, y1) {
    var x = x0, y = y0;
    var guard = 0;
    while ((x !== x1 || y !== y1) && guard++ < 200) {
      var dx = x1 - x, dy = y1 - y;
      var stepX = 0, stepY = 0;
      if (Math.abs(dx) >= Math.abs(dy) && dx !== 0) stepX = dx > 0 ? 1 : -1;
      else if (dy !== 0) stepY = dy > 0 ? 1 : -1;
      else stepX = dx > 0 ? 1 : -1;
      var dir = stepX === 1 ? 0 : stepY === 1 ? 1 : stepX === -1 ? 2 : 3;
      var nx = x + stepX, ny = y + stepY;
      // ГЛАВНОЕ: предыдущий тайл поворачиваем в сторону движения — руда пойдёт по углу!
      reorientBelt(x, y, dir);
      if (x === drag.x0 && y === drag.y0 && !drag.placed) {
        placeAt(x, y, dir);
      }
      if (!placeAt(nx, ny, dir)) break;
      x = nx; y = ny;
      drag.lastX = x; drag.lastY = y;
    }
  }

  function onMove(ev) {
    var t = toTile(ev);
    hoverTile.x = t.x; hoverTile.y = t.y;
    var st = FD.sim.get();
    if (!st) return;

    if (drag.active && drag.remove) {
      // протяжка ПКМ — снос линии лент
      if (t.x !== drag.lastX || t.y !== drag.lastY) {
        var x = drag.lastX, y = drag.lastY;
        var guard = 0;
        while ((x !== t.x || y !== t.y) && guard++ < 200) {
          var dx = t.x - x, dy = t.y - y;
          if (Math.abs(dx) >= Math.abs(dy) && dx !== 0) x += dx > 0 ? 1 : -1;
          else y += dy > 0 ? 1 : -1;
          demolishAt(x, y);
        }
        drag.lastX = t.x; drag.lastY = t.y;
      }
      return;
    }

    if (drag.active && isBeltTool()) {
      if (t.x !== drag.lastX || t.y !== drag.lastY) {
        drag.moved = true;
        layLine(drag.lastX, drag.lastY, t.x, t.y);
      }
    }
    updateGhost();
  }

  function demolishAt(tx, ty) {
    var st = FD.sim.get();
    if (!st || !FD.sim.inMap(tx, ty)) return;
    var id = st.bgrid[FD.sim.idx(tx, ty)];
    if (id >= 0 && st.buildings[id] && st.buildings[id].type !== 'core') {
      FD.sim.sell(tx, ty);
      FD.sim.spawnParticles(tx * T + T / 2, ty * T + T / 2, '#c8c8d4', 5);
      if (FD.render.getSelected() === id) {
        FD.render.setSelected(-1);
        FD.ui.updateInfo();
      }
    }
  }

  function onDown(ev) {
    FD.audio.resume();
    var st = FD.sim.get();
    if (!st) return;
    var t = toTile(ev);
    if (ev.button === 2) {
      // ПРАВАЯ кнопка: отмена режима ИЛИ снос (протяжка — цепной снос лент)
      var bmR = FD.ui.getBuildMode();
      if (bmR) {
        FD.ui.setBuildMode(null);
        FD.render.setGhost({ active: false });
        FD.ui.toast('Режим постройки отменён');
        return;
      }
      drag.active = true;
      drag.remove = true;
      drag.lastX = t.x; drag.lastY = t.y;
      demolishAt(t.x, t.y);
      return;
    }
    var bm = FD.ui.getBuildMode();
    if (!bm) return;

    drag.active = true;
    drag.remove = false;
    drag.x0 = t.x; drag.y0 = t.y;
    drag.lastX = t.x; drag.lastY = t.y;
    drag.moved = false;
    drag.placed = false;

    if (!isBeltTool()) {
      // обычные здания — сразу
      placeAt(t.x, t.y, bm.dir || 0);
      updateGhost();
    }
    // ленты: кладём при движении; клик без движения — на mouseup
  }

  function onUp(ev) {
    if (!drag.active) return;
    drag.active = false;
    drag.remove = false;
    var st = FD.sim.get();
    if (!st) return;
    if (isBeltTool() && !drag.moved && !drag.placed) {
      // одиночный клик лентой — авто-направление к ядру
      var bm = FD.ui.getBuildMode();
      var dir = autoDirToCore(st, drag.x0, drag.y0);
      bm.dir = dir;
      placeAt(drag.x0, drag.y0, dir);
      updateGhost();
    }
  }

  function onClick(ev) {
    var st = FD.sim.get();
    if (!st) return;
    if (ev.button != null && ev.button !== 0) return; // выделение только ЛКМ
    var t = toTile(ev);
    var bm = FD.ui.getBuildMode();
    if (bm) return;
    FD.render.setHover(t.x, t.y);
    var id = st.bgrid[FD.sim.idx(t.x, t.y)];
    if (id >= 0 && st.buildings[id]) {
      FD.render.setSelected(id);
      FD.audio.play('select');
    } else {
      FD.render.setSelected(-1);
    }
    FD.ui.updateInfo();
  }

  function onContext(ev) {
    // снос/отмена обрабатываются в onDown (ПКМ) — здесь только глушим меню браузера
    ev.preventDefault();
  }

  function onKey(ev) {
    var st = FD.sim.get();
    if (!st) return;
    var code = ev.code || '';
    if (code === 'Escape') {
      if (FD.ui.getBuildMode()) {
        FD.ui.setBuildMode(null);
        FD.render.setGhost({ active: false });
      } else if (st.phase === 'gameover' || st.phase === 'victory') {
        // ничего
      } else {
        st.paused = !st.paused;
        if (st.paused) {
          document.getElementById('modal-pause').classList.remove('hidden');
        } else {
          document.getElementById('modal-pause').classList.add('hidden');
        }
      }
    } else if (code === 'Space') {
      ev.preventDefault();
      st.paused = !st.paused;
      FD.ui.toast(st.paused ? 'Пауза' : 'Игра продолжается');
    } else if (code === 'KeyF') {
      FD.sim.callWaveNow();
    } else if (code === 'Digit1') { st.speed = 1; document.getElementById('btn-speed').textContent = '⏩ 1×'; }
    else if (code === 'Digit2') { st.speed = 2; document.getElementById('btn-speed').textContent = '⏩ 2×'; }
    else if (code === 'Digit3') { st.speed = 3; document.getElementById('btn-speed').textContent = '⏩ 3×'; }
    else if (code === 'KeyR') {
      var bm = FD.ui.getBuildMode();
      if (bm) {
        bm.dir = ((bm.dir || 0) + 1) % 4;
        updateGhost();
      }
    } else if (code === 'KeyX') {
      var id = FD.render.getSelected();
      if (id >= 0 && st.buildings[id] && st.buildings[id].type !== 'core') {
        FD.sim.sell(st.buildings[id].x, st.buildings[id].y);
        FD.render.setSelected(-1);
        FD.ui.updateInfo();
      }
    } else {
      // физические клавиши — работают и на русской раскладке
      var map = {
        KeyQ: 'miner', KeyW: 'belt', KeyE: 'splitter', KeyT: 'depot',
        KeyI: 'container',
        KeyS: 'smelter', KeyA: 'ammo_plant', KeyH: 'shell_plant',
        KeyB: 'battery_plant', KeyM: 'missile_plant', KeyL: 'lab',
        KeyV: 'wall', KeyG: 'gun', KeyC: 'cannon', KeyN: 'laser',
        KeyY: 'tesla', KeyK: 'missile_turret', KeyZ: 'flak',
        KeyO: 'house', KeyP: 'farm', KeyJ: 'armory'
      };
      if (map[code]) {
        FD.ui.setBuildMode({ type: map[code], dir: 0 });
        FD.ui.toast('Инструмент: ' + C.BUILDINGS[map[code]].name);
        updateGhost();
      }
    }
  }

  function frame(now) {
    var dt = Math.min(0.1, (now - lastTime) / 1000);
    if (!lastTime) dt = 1 / 60;
    lastTime = now;
    FD.sim.tick(dt);
    FD.render.draw();
    requestAnimationFrame(frame);
  }

  function boot() {
    canvas = document.getElementById('game-canvas');
    FD.render.init(canvas);
    FD.ui.init();

    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('mousedown', onDown);
    window.addEventListener('mouseup', onUp);
    canvas.addEventListener('mouseleave', function () {
      hoverTile.x = -1; hoverTile.y = -1;
      drag.active = false;
    });
    canvas.addEventListener('click', onClick);
    canvas.addEventListener('contextmenu', onContext);
    window.addEventListener('keydown', onKey);

    // тач: тап = постройка/выбор, тяж = протяжка ленты
    canvas.addEventListener('touchstart', function (ev) {
      if (ev.touches.length) {
        var t = ev.touches[0];
        onDown({ clientX: t.clientX, clientY: t.clientY, button: 0 });
      }
    }, { passive: true });
    canvas.addEventListener('touchmove', function (ev) {
      if (ev.touches.length) {
        var t = ev.touches[0];
        onMove({ clientX: t.clientX, clientY: t.clientY });
      }
    }, { passive: true });
    canvas.addEventListener('touchend', function (ev) {
      onUp();
      if (ev.changedTouches && ev.changedTouches.length) {
        var t = ev.changedTouches[0];
        onClick({ clientX: t.clientX, clientY: t.clientY });
      }
    });

    requestAnimationFrame(frame);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
