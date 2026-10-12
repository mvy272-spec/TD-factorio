/* Factory Defense — UI: HUD, панели, меню, модалки, сохранения */
var FD = window.FD || (window.FD = {});
(function () {
  'use strict';
  var C = FD.config;
  var $ = function (id) { return document.getElementById(id); };
  var currentCat = 'mine';
  var buildMode = null; // {type}
  var hudT = 0;

  // ---------------- сохранения ----------------
  var FD_io = {
    save: function (slot) {
      var st = FD.sim.get();
      if (!st) return false;
      try {
        localStorage.setItem('fd_save_' + slot, JSON.stringify(FD.sim.serialize()));
        return true;
      } catch (e) { return false; }
    },
    load: function (slot) {
      try {
        var raw = localStorage.getItem('fd_save_' + slot);
        if (!raw) return false;
        FD.sim.deserialize(JSON.parse(raw));
        return true;
      } catch (e) { return false; }
    },
    autoSave: function () { FD_io.save(0); },
    hasSave: function (slot) {
      try { return !!localStorage.getItem('fd_save_' + slot); } catch (e) { return false; }
    },
    slotInfo: function (slot) {
      try {
        var raw = localStorage.getItem('fd_save_' + slot);
        if (!raw) return null;
        var d = JSON.parse(raw);
        return { map: C.MAPS[d.mapId].name, wave: d.wave, time: d.stats ? d.stats.time : 0 };
      } catch (e) { return null; }
    },
    clear: function (slot) {
      try { localStorage.removeItem('fd_save_' + slot); } catch (e) {}
    }
  };
  FD.io = FD_io;

  // ---------------- утилиты DOM ----------------
  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  function costStr(cost) {
    var parts = [];
    var icons = { iron: '⬛', copper: '🟧', coal: '◼', crystal: '🔷' };
    for (var k in cost) parts.push((icons[k] || '') + ' ' + cost[k]);
    return parts.join(' ');
  }
  function fmtTime(s) {
    s = Math.floor(s);
    var m = (s / 60) | 0, ss = s % 60;
    return m + ':' + (ss < 10 ? '0' : '') + ss;
  }

  // ---------------- экраны ----------------
  function show(id) {
    var screens = ['screen-menu', 'screen-maps', 'screen-game'];
    for (var i = 0; i < screens.length; i++) {
      var s = $(screens[i]);
      if (s) s.classList.toggle('hidden', screens[i] !== id);
    }
  }
  function showModal(id) {
    var m = $(id);
    if (m) m.classList.remove('hidden');
  }
  function hideModal(id) {
    var m = $(id);
    if (m) m.classList.add('hidden');
  }

  // ---------------- построение панели построек ----------------
  function renderBuildPanel() {
    var wrap = $('build-list');
    wrap.innerHTML = '';
    for (var type in C.BUILDINGS) {
      var def = C.BUILDINGS[type];
      if (type === 'core') continue;
      if (def.cat !== currentCat) continue;
      var btn = el('button', 'build-btn');
      btn.dataset.type = type;
      var icon = C.TURRET_KEYS.indexOf(type) !== -1 ? type + '_base' : type;
      var imgUrl = FD.sprURL(icon);
      var wNeed = C.WORKERS[type];
      btn.innerHTML =
        '<img src="' + imgUrl + '" alt="">' +
        '<div class="bb-name">' + def.name + (wNeed ? ' <span class="bb-workers" title="Нужно рабочих">👷' + wNeed + '</span>' : '') + '</div>' +
        '<div class="bb-cost">' + costStr(def.cost) + '</div>';
      btn.title = def.desc || '';
      btn.addEventListener('click', function () {
        var t = this.dataset.type;
        buildMode = { type: t };
        FD.audio.play('select');
        updateBuildButtons();
        $('hint-text').textContent = TOOL_HINTS[t] || ((C.BUILDINGS[t].desc || '') + ' — ЛКМ поставить, ПКМ отмена/снести');
      });
      wrap.appendChild(btn);
    }
    updateBuildButtons();
  }

  function updateBuildButtons() {
    var st = FD.sim.get();
    var btns = document.querySelectorAll('.build-btn');
    for (var i = 0; i < btns.length; i++) {
      var t = btns[i].dataset.type;
      btns[i].classList.toggle('active', buildMode && buildMode.type === t);
      if (st) {
        btns[i].classList.toggle('poor', !FD.sim.canAfford(C.BUILDINGS[t].cost));
      }
    }
  }

  // ---------------- инфо-панель ----------------
  function updateInfo() {
    var st = FD.sim.get();
    var panel = $('info-content');
    if (!st) { panel.innerHTML = ''; return; }
    var id = FD.render.getSelected();
    var b = id >= 0 ? st.buildings[id] : null;
    if (!b) {
      panel.innerHTML = '<div class="info-empty">Ничего не выбрано.<br>Кликните по постройке.</div>';
      return;
    }
    var def = C.BUILDINGS[b.type];
    var html = '<div class="info-title">' + (b.type === 'core' ? 'Ядро' : def.name) + '</div>';
    if (def.desc) html += '<div class="info-row" style="color:#aab4c8;margin-bottom:8px">' + def.desc + '</div>';
    html += '<div class="info-row">Прочность: <b>' + Math.ceil(b.hp) + ' / ' + b.hpMax + '</b></div>';
    if (C.TURRET_KEYS.indexOf(b.type) !== -1) {
      var tdef = def;
      html += '<div class="info-row">Уровень: <b>' + b.level + ' / 3</b></div>';
      html += '<div class="info-row">Урон: <b>' + Math.round(tdef.dmg * st.mods.dmg * Math.pow(C.TURRET_UPGRADE.dmgMul, b.level - 1)) + '</b></div>';
      html += '<div class="info-row">Дальность: <b>' + Math.round(tdef.range * st.mods.range * Math.pow(C.TURRET_UPGRADE.rangeMul, b.level - 1)) + '</b></div>';
      html += '<div class="info-row">Боезапас: <b>' + b.ammo + ' / ' + Math.round(tdef.ammoCap * (1 + 0.5 * (b.level - 1))) + '</b> (' + (C.ITEMS[tdef.ammo] ? C.ITEMS[tdef.ammo].name : tdef.ammo) + ')</div>';
      html += '<div class="info-actions">';
      if (b.level < 3) {
        html += '<button class="btn btn-up" id="btn-upgrade">⬆ Улучшить (' + costStr(C.TURRET_UPGRADE.costs[b.level - 1]) + ')</button>';
      }
      html += '<button class="btn btn-sell" id="btn-sell">Продать</button></div>';
    } else if (b.type === 'depot') {
      html += '<div class="info-row">Радиус: <b>' + (def.radius * st.mods.depotRadius).toFixed(1) + '</b></div>';
      html += '<div class="info-row">Патроны: <b>' + b.ammo.bullet + '</b> · Снаряды: <b>' + b.ammo.shell + '</b></div>';
      html += '<div class="info-row">Батареи: <b>' + b.ammo.battery + '</b> · Ракеты: <b>' + b.ammo.missile + '</b></div>';
      html += '<div class="info-actions"><button class="btn btn-sell" id="btn-sell">Продать</button></div>';
    } else if (b.type === 'miner') {
      html += '<div class="info-row">Руда: <b>' + (C.ITEMS[b.oreType === 1 ? 'iron_ore' : b.oreType === 2 ? 'copper_ore' : b.oreType === 3 ? 'coal' : 'crystal'].name) + '</b></div>';
      html += '<div class="info-row">Буфер: <b>' + (b.buf ? b.buf.length : 0) + '</b></div>';
      html += '<div class="info-actions"><button class="btn btn-sell" id="btn-sell">Продать</button></div>';
    } else if (b.type === 'house') {
      var houses = 0;
      for (var hid in st.buildings) if (st.buildings[hid].type === 'house') houses++;
      html += '<div class="info-row">Население: <b>+' + (C.BUILDINGS.house.pop) + ' рабочих</b></div>';
      html += '<div class="info-row">Всего домов: <b>' + houses + '</b></div>';
      html += '<div class="info-row">Занятость фабрик: <b>' + Math.round((st.wf || 1) * 100) + '%</b></div>';
      html += '<div class="info-actions"><button class="btn btn-sell" id="btn-sell">Продать</button></div>';
    } else if (b.type === 'farm') {
      html += '<div class="info-row">Производит: <b>Еда</b> каждые ' + C.BUILDINGS.farm.farmTime + 'с</div>';
      html += '<div class="info-row">Буфер: <b>' + (b.buf ? b.buf.length : 0) + '</b></div>';
      html += '<div class="info-actions"><button class="btn btn-sell" id="btn-sell">Продать</button></div>';
    } else if (b.type === 'armory') {
      html += '<div class="info-row">Аура: <b>+15% урона</b> турелям в радиусе ' + C.BUILDINGS.armory.radius + '</div>';
      html += '<div class="info-row">Максимум 2 оружейных на турель.</div>';
      html += '<div class="info-actions"><button class="btn btn-sell" id="btn-sell">Продать</button></div>';
    } else if (b.type !== 'core') {
      if (C.RECIPES[b.type]) {
        var rec = C.RECIPES[b.type];
        if (rec.auto) {
          html += '<div class="info-row">Рецепт: <b>руда → слиток</b></div>';
        } else {
          var ins = [];
          for (var k in rec.in) ins.push(rec.in[k] + '× ' + C.ITEMS[k].name);
          html += '<div class="info-row">Рецепт: <b>' + ins.join(' + ') + '</b></div>';
          html += '<div class="info-row">Выход: <b>' + rec.out.qty + '× ' + C.ITEMS[rec.out.item].name + '</b></div>';
        }
        if (b.inStore) {
          var inv = [];
          for (var k2 in b.inStore) if (b.inStore[k2] > 0) inv.push(C.ITEMS[k2].name + ': ' + b.inStore[k2]);
          html += '<div class="info-row">Внутри: <b>' + (inv.join(', ') || '—') + '</b></div>';
        }
      }
      html += '<div class="info-actions"><button class="btn btn-sell" id="btn-sell">Продать</button></div>';
    } else {
      html += '<div class="info-row">Защита базы. Если ядро падёт — игра окончена.</div>';
    }
    panel.innerHTML = html;
    var up = $('btn-upgrade');
    if (up) up.addEventListener('click', function () {
      var r = FD.sim.upgradeTurret(b);
      if (!r.ok) toast(r.why);
      updateInfo();
    });
    var sell = $('btn-sell');
    if (sell) sell.addEventListener('click', function () {
      var t = b.x, ty = b.y;
      FD.sim.sell(t, ty);
      FD.render.setSelected(-1);
      updateInfo();
    });
  }

  // ---------------- HUD ----------------
  function updateHUD() {
    var st = FD.sim.get();
    if (!st) return;
    $('hud-iron').textContent = Math.floor(st.stock.iron);
    $('hud-copper').textContent = Math.floor(st.stock.copper);
    $('hud-coal').textContent = Math.floor(st.stock.coal);
    $('hud-crystal').textContent = Math.floor(st.stock.crystal);
    $('hud-science').textContent = Math.floor(st.stock.science || 0);
    $('hud-food').textContent = Math.floor(st.stock.food || 0);
    // население и рабочие
    var need = st.pop.need || 0;
    var wfPct = Math.round((st.wf || 1) * 100);
    $('hud-pop').innerHTML = '👷 ' + Math.floor(st.pop.current) + '/' + Math.floor(st.pop.capacity) +
      ' <span style="color:' + (st.pop.hungry ? '#e85040' : (st.wf || 1) < 0.85 ? '#e8c840' : '#4dd86a') + '">' +
      (st.pop.hungry ? '🍞 ГОЛОД' : wfPct + '%') + '</span>';
    if (st.pop.capacity < need + 6 && st.wave > 0 && !st._houseHint) {
      st._houseHint = true;
      toast('🏘 Мало мест для рабочих — построй ещё ЖИЛЫХ ДОМОВ (категория «Город»)');
    }
    var hpPct = Math.max(0, st.core.hp / st.core.hpMax * 100);
    $('core-bar-fill').style.width = hpPct + '%';
    $('core-bar-fill').style.background = hpPct > 50 ? '#4dd86a' : hpPct > 25 ? '#e8c840' : '#e85040';
    $('core-hp-text').textContent = Math.ceil(st.core.hp) + ' / ' + st.core.hpMax;
    $('hud-wave').textContent = st.wave + (st.phase === 'wave' ? '' : ' (подготовка)');
    if (st.phase === 'prep') {
      if (st.tutorialFrozen && st.wave < 1) {
        $('hud-wave-timer').innerHTML = '❄ <b style="color:#7ad6ff">Обучение</b> — первая волна только по твоему сигналу';
      } else {
        $('hud-wave-timer').textContent = '⏱ ' + Math.ceil(st.prepTimer) + 'с';
      }
    } else if (st.phase === 'wave') {
      $('hud-wave-timer').textContent = 'Врагов: ' + (st.enemies.length + st.spawnQueue.length);
    } else {
      $('hud-wave-timer').textContent = '';
    }
    // превью следующей волны
    try {
      var pv = FD.sim.previewWave(st.wave + 1);
      var parts = [];
      for (var pk in pv) {
        var eDef = C.ENEMIES[pk];
        if (eDef) parts.push(eDef.name + ' ×' + pv[pk]);
      }
      var pvEl = $('wave-preview');
      if (pvEl) pvEl.textContent = 'Следующая волна: ' + (parts.join(', ') || '—');
    } catch (e) {}
    $('btn-call-wave').style.display = st.phase === 'prep' ? '' : 'none';
    updateBuildButtons();
  }

  // ---------------- тосты / подсказки ----------------
  var toastTimer = null;
  function toast(msg, isWarn) {
    var t = $('toast');
    t.textContent = msg;
    t.classList.toggle('warn', !!isWarn);
    t.classList.remove('hidden');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.add('hidden'); }, 2600);
  }

  // ---------------- исследования ----------------
  function renderResearch() {
    var st = FD.sim.get();
    var wrap = $('research-grid');
    wrap.innerHTML = '';
    for (var branch in C.RESEARCH_BRANCHES) {
      var col = el('div', 'res-col');
      var bd = C.RESEARCH_BRANCHES[branch];
      col.appendChild(el('div', 'res-branch', bd.name));
      col.style.borderColor = bd.color;
      for (var id in C.RESEARCH) {
        var def = C.RESEARCH[id];
        if (def.branch !== branch) continue;
        var node = el('div', 'res-node');
        var done = !!st.research[id];
        var locked = def.req && !st.research[def.req];
        if (done) node.classList.add('done');
        else if (locked) node.classList.add('locked');
        node.innerHTML = '<div class="res-name">' + def.name + '</div>' +
          '<div class="res-cost">🔬 ' + def.cost + '</div>';
        (function (nid) {
          node.addEventListener('click', function () {
            var r = FD.sim.research(nid);
            toast(r.ok ? 'Исследовано!' : r.why, !r.ok);
            renderResearch();
          });
        })(id);
        col.appendChild(node);
      }
      wrap.appendChild(col);
    }
  }

  // ---------------- сохранения UI ----------------
  function renderSaves() {
    var wrap = $('saves-list');
    wrap.innerHTML = '';
    var names = ['Автосохранение', 'Слот 1', 'Слот 2', 'Слот 3'];
    for (var slot = 0; slot < 4; slot++) {
      var info = FD_io.slotInfo(slot);
      var row = el('div', 'save-row');
      row.innerHTML = '<div class="save-name">' + names[slot] + '</div>' +
        '<div class="save-info">' + (info ? info.map + ' · волна ' + info.wave + ' · ' + fmtTime(info.time) : '— пусто —') + '</div>';
      var btns = el('div', 'save-btns');
      if (info) {
        (function (sl) {
          var bLoad = el('button', 'btn', 'Загрузить');
          bLoad.addEventListener('click', function () {
            if (FD_io.load(sl)) {
              hideModal('modal-saves');
              startGameUI();
              FD.render.rebuild();
              toast('Игра загружена');
            }
          });
          var bDel = el('button', 'btn btn-sell', 'Удалить');
          bDel.addEventListener('click', function () {
            FD_io.clear(sl);
            renderSaves();
          });
          btns.appendChild(bLoad);
          btns.appendChild(bDel);
        })(slot);
      }
      row.appendChild(btns);
      wrap.appendChild(row);
    }
    // ручные слоты
    var row2 = el('div', 'save-row');
    row2.innerHTML = '<div class="save-name">Сохранить сейчас</div><div class="save-info">в свободный слот</div>';
    var b2 = el('div', 'save-btns');
    for (var s = 1; s < 4; s++) {
      (function (sl) {
        var b = el('button', 'btn', 'Слот ' + sl);
        b.addEventListener('click', function () {
          if (FD_io.save(sl)) { toast('Сохранено в слот ' + sl); renderSaves(); }
        });
        b2.appendChild(b);
      })(s);
    }
    row2.appendChild(b2);
    wrap.appendChild(row2);
  }

  // ---------------- выбор карты ----------------
  var diffChoice = 'normal';
  function renderMaps() {
    var wrap = $('maps-grid');
    wrap.innerHTML = '';
    // сложность
    var dRow = $('diff-row');
    if (dRow) {
      dRow.innerHTML = '';
      for (var dk in C.DIFFICULTY) {
        (function (key) {
          var d = C.DIFFICULTY[key];
          var b = el('button', 'diff-btn' + (key === diffChoice ? ' active' : ''),
            d.name + ' <small>(×' + d.hp + ' HP)</small>');
          b.addEventListener('click', function () {
            diffChoice = key;
            FD.audio.play('click');
            renderMaps();
          });
          dRow.appendChild(b);
        })(dk);
      }
    }
    for (var i = 0; i < C.MAPS.length; i++) {
      (function (mi) {
        var m = C.MAPS[mi];
        var card = el('div', 'map-card');
        card.innerHTML = '<div class="map-name">' + m.name + '</div>' +
          '<div class="map-desc">' + m.desc + '</div>' +
          '<div class="map-info">Точек атаки: <b>' + m.spawns.length + '</b></div>';
        card.addEventListener('click', function () {
          FD.audio.play('select');
          FD.sim.newGame(mi, diffChoice);
          startGameUI();
        });
        wrap.appendChild(card);
      })(i);
    }
  }

  function startGameUI() {
    show('screen-game');
    $('overlay-gameover').classList.add('hidden');
    $('overlay-victory').classList.add('hidden');
    hideModal('modal-pause');
    hideModal('modal-research');
    hideModal('modal-saves');
    hideModal('modal-settings');
    hideModal('modal-help');
    FD.render.rebuild();
    FD.render.setSelected(-1);
    buildMode = null;
    renderBuildPanel();
    updateInfo();
    var st = FD.sim.get();
    if (st && st.stats.built <= 1 && st.wave === 0) {
      toast('Добро пожаловать! Сначала поставь первую ТУРЕЛЬ у красного маршрута (G или категория «Оборона»). Боеприпасы наладим дальше.');
    }
  }

  // ---------------- обучение: квесты ----------------
  function nearestOreTile(st, type) {
    var best = null, bd = 1e9;
    for (var y = 0; y < C.MAP_H; y++) for (var x = 0; x < C.MAP_W; x++) {
      var o = st.ore[FD.sim.idx(x, y)];
      if (!o) continue;
      if (type && o !== type) continue;
      var d = Math.abs(x - st.core.x) + Math.abs(y - st.core.y);
      if (d < bd) { bd = d; best = { x: x, y: y }; }
    }
    return best;
  }
  function firstBuilding(st, type) {
    for (var id in st.buildings) if (st.buildings[id].type === type) return st.buildings[id];
    return null;
  }

  var QUESTS = [
    {
      id: 'turret', short: '🛡 Поставь первую ТУРЕЛЬ',
      text: 'Поставь турель рядом с красным маршрутом. Пулемётная (G) — быстрый старт; даже тяжёлую пушку можно выбрать сразу. Патроны наладим следом.',
      done: function (st) { return !!st.flags.turret; },
      marker: function (st) {
        var p = st.paths && st.paths[0];
        return p && p.length ? p[Math.min(3, p.length - 1)] : null;
      }
    },
    {
      id: 'miner', short: '⛏ Поставь ШАХТУ на руду',
      text: 'Нажми «⛏ Добыча» → «Шахта» (или клавиша Q) и поставь на рудную жилу — она подсвечена.',
      done: function (st) { return !!st.flags.miner; },
      marker: function (st) { return nearestOreTile(st, 1) || nearestOreTile(st, 0); }
    },
    {
      id: 'belt', short: '➡ Проведи КОНВЕЙЕР к ядру',
      text: 'Возьми «Конвейер» (W), зажми ЛКМ на шахте и веди курсор к ядру — лента сама повернёт.',
      done: function (st) { return !!st.flags.belt; },
      marker: function (st) {
        var m = firstBuilding(st, 'miner');
        return m ? { x: m.x, y: m.y } : null;
      }
    },
    {
      id: 'flow', short: '📦 Дождись руду в ядре',
      text: 'Руда с шахты должна доехать до ядра. В ядре руда медленно плавится 2:1, либо поставь ПЛАВИЛЬНЮ (S) на линию.',
      done: function (st) { return !!st.flags.itemToCore; },
      marker: function (st) { return { x: st.core.x, y: st.core.y }; }
    },
    {
      id: 'smelter', short: '🔥 Поставь ПЛАВИЛЬНЮ',
      text: 'Плавильня (S) на пути ленты превращает руду в слитки. Слитки вези в ядро.',
      done: function (st) { return !!st.flags.smelter; },
      marker: function (st) {
        var m = firstBuilding(st, 'miner');
        return m ? { x: m.x, y: m.y } : null;
      }
    },
    {
      id: 'ammo', short: '🎯 Снабди турели патронами',
      text: 'Патронный цех (A) → лента → ДЕПО (T) рядом с турелью. Депо само кормит турели в радиусе.',
      done: function (st) { return !!st.flags.ammo && !!st.flags.depot; },
      marker: function (st) {
        var t = firstBuilding(st, 'gun');
        return t ? { x: t.x, y: t.y } : null;
      }
    },
    {
      id: 'wave', short: '⚔ Вызови волну (F)',
      text: 'Всё готово! Жми «⚔ Волна сейчас» и отбей атаку. Побеждай — получай ресурсы.',
      done: function (st) { return !!st.flags.waveDone; },
      marker: function (st) {
        return st.mapDef.spawns[0] ? { x: st.mapDef.spawns[0][0], y: st.mapDef.spawns[0][1] } : null;
      }
    }
  ];
  var questDismissed = false;

  function updateQuests() {
    var st = FD.sim.get();
    if (!st || questDismissed) {
      var qp = $('quest-panel');
      if (qp) qp.classList.add('hidden');
      return;
    }
    // все ли пройдены
    var allDone = QUESTS.every(function (q) { return q.done(st); });
    if (allDone) {
      $('quest-panel').classList.add('hidden');
      return;
    }
    $('quest-panel').classList.remove('hidden');
    var html = '';
    for (var i = 0; i < QUESTS.length; i++) {
      var q = QUESTS[i];
      var done = q.done(st);
      if (done) {
        html += '<div class="quest done">✓ ' + q.short.replace(/^[^\s]+\s/, '') + '</div>';
      } else {
        html += '<div class="quest current">' + q.text + '</div>';
        break; // показываем только текущий + пройденные выше
      }
    }
    html += '<button class="quest-close" id="quest-close">✕ скрыть</button>';
    $('quest-list').innerHTML = html;
    var qc = $('quest-close');
    if (qc) qc.addEventListener('click', function () {
      questDismissed = true;
      updateQuests();
    });
  }

  var TOOL_HINTS = {
    miner: '⛏ Шахта ставится ТОЛЬКО на рудную жилу (зелёная подсветка). Руда сама уйдёт на любую соседнюю ленту — направление не важно.',
    belt: '➡ ЗАЖМИ ЛКМ и веди — конвейер строится линией с автоповоротом. Одиночный клик направит ленту к ядру.',
    splitter: '➗ Сплиттер делит поток: вперёд и вбок.',
    container: '📦 Контейнер копит 60 предметов — буфер между шахтой и лентой. Ставится рядом с шахтой даже БЕЗ ленты.',
    depot: '🏪 Депо принимает патроны/ракеты с лент и кормит турели в радиусе. Ставь у турелей.',
    smelter: '🔥 Плавильня: руда → слиток. Лента входит с любой стороны, выходит с любой свободной.',
    ammo_plant: '🎯 Патронный цех: 1 железо → 6 патронов. Веди выход к депо.',
    shell_plant: '💥 Цех снарядов: 2 железа + 1 уголь → 3 снаряда для пушек.',
    battery_plant: '🔋 Аккумуляторный цех: 1 медь + 1 уголь → 2 батареи (лазер, тесла).',
    missile_plant: '🚀 Ракетный цех: 2 железа + 1 уголь + 1 кристалл → 2 ракеты.',
    lab: '🔬 Лаборатория: 2 железа + 2 меди + 1 кристалл → нау-пакет. Нау вези в ядро.',
    wall: '🧱 Стена держит врагов. Замкнуть путь полностью нельзя!',
    gun: '🔫 Пулемётная: быстрая, только по наземным. Нужны патроны через депо или ленту.',
    cannon: '💣 Пушка: сплеш по площади, бьёт броню. Снаряды.',
    laser: '✨ Лазер: мгновенный луч, игнорирует броню. Батареи.',
    tesla: '⚡ Тесла: цепь на 3 цели. Батареи.',
    missile_turret: '🚀 Ракетная: большая дальность, самонаведение. Не бьёт вплотную!',
    flak: '🎈 Зенитная: только по летающим. Патроны.',
    house: '🏘 Жилой дом: +8 рабочих. Рабочие ускоряют добычу и цеха. Без домов фабрики ползут!',
    farm: '🌾 Ферма: производит ЕДУ (без вложений). Вези еду конвейером в ядро — население ест автоматически.',
    armory: '⚔ Оружейная: +15% урона турелям в радиусе (до 2 оружейных). Требует рабочих.'
  };

  // ---------------- публичные хуки от симуляции ----------------
  var UI = {
    init: function () {
      // категории
      var cats = [
        ['mine', '⛏ Добыча'], ['logi', '🚚 Логистика'],
        ['prod', '🏭 Производство'], ['def', '🛡 Оборона'],
        ['town', '🏘 Город']
      ];
      var catWrap = $('build-cats');
      catWrap.innerHTML = '';
      for (var i = 0; i < cats.length; i++) {
        (function (cat) {
          var b = el('button', 'cat-btn', cat[1]);
          b.addEventListener('click', function () {
            currentCat = cat[0];
            var all = document.querySelectorAll('.cat-btn');
            for (var j = 0; j < all.length; j++) all[j].classList.remove('active');
            b.classList.add('active');
            renderBuildPanel();
            FD.audio.play('click');
          });
          if (i === 0) b.classList.add('active');
          catWrap.appendChild(b);
        })(cats[i]);
      }
      renderBuildPanel();

      // кнопки HUD
      $('btn-pause').addEventListener('click', function () {
        var st = FD.sim.get();
        if (!st) return;
        st.paused = true;
        showModal('modal-pause');
        FD.audio.play('click');
      });
      $('btn-call-wave').addEventListener('click', function () {
        FD.sim.callWaveNow();
        FD.audio.play('click');
      });
      $('btn-speed').addEventListener('click', function () {
        var st = FD.sim.get();
        if (!st) return;
        st.speed = st.speed >= 3 ? 1 : st.speed + 1;
        $('btn-speed').textContent = '⏩ ' + st.speed + '×';
        FD.audio.play('click');
      });
      $('btn-research').addEventListener('click', function () {
        var st = FD.sim.get();
        if (!st) return;
        st.paused = true;
        renderResearch();
        showModal('modal-research');
        FD.audio.play('click');
      });

      // модалка паузы
      $('btn-resume').addEventListener('click', function () {
        hideModal('modal-pause');
        var st = FD.sim.get();
        if (st) st.paused = false;
      });
      $('btn-open-saves').addEventListener('click', function () {
        renderSaves();
        showModal('modal-saves');
      });
      $('btn-open-settings').addEventListener('click', function () {
        showModal('modal-settings');
      });
      $('btn-open-help').addEventListener('click', function () {
        showModal('modal-help');
      });
      $('btn-to-menu').addEventListener('click', function () {
        hideModal('modal-pause');
        show('screen-menu');
        var st = FD.sim.get();
        if (st) st.paused = true;
      });

      // исследование — закрыть
      $('btn-close-research').addEventListener('click', function () {
        hideModal('modal-research');
        var st = FD.sim.get();
        if (st) st.paused = false;
      });
      $('btn-close-saves').addEventListener('click', function () {
        hideModal('modal-saves');
      });
      $('btn-close-settings').addEventListener('click', function () {
        hideModal('modal-settings');
      });
      $('btn-close-help').addEventListener('click', function () {
        hideModal('modal-help');
      });

      // настройки
      $('set-sfx').addEventListener('change', function () {
        FD.audio.setSfx(this.checked);
      });
      $('set-music').addEventListener('change', function () {
        FD.audio.setMusic(this.checked);
      });

      // меню
      $('mm-new').addEventListener('click', function () {
        FD.audio.play('select');
        renderMaps();
        show('screen-maps');
      });
      $('mm-continue').addEventListener('click', function () {
        if (FD_io.load(0)) {
          startGameUI();
          FD.audio.play('select');
        } else {
          toast('Нет автосохранения', true);
        }
      });
      $('mm-load').addEventListener('click', function () {
        renderSaves();
        showModal('modal-saves');
      });
      $('mm-settings').addEventListener('click', function () {
        showModal('modal-settings');
      });
      $('mm-help').addEventListener('click', function () {
        showModal('modal-help');
      });
      $('btn-back-maps').addEventListener('click', function () {
        show('screen-menu');
      });

      // победа/поражение
      $('btn-go-menu').addEventListener('click', function () {
        $('overlay-gameover').classList.add('hidden');
        $('overlay-victory').classList.add('hidden');
        show('screen-menu');
      });
      $('btn-go-menu2').addEventListener('click', function () {
        $('overlay-gameover').classList.add('hidden');
        $('overlay-victory').classList.add('hidden');
        show('screen-menu');
      });
      $('btn-endless').addEventListener('click', function () {
        FD.sim.setEndless();
        $('overlay-victory').classList.add('hidden');
        toast('Бесконечный режим! Волны будут только жёстче.');
      });
      $('btn-retry').addEventListener('click', function () {
        var st = FD.sim.get();
        if (st) {
          FD.sim.newGame(st.mapId, st.diffKey);
          startGameUI();
        }
      });

      $('btn-close-info') && $('btn-close-info').addEventListener('click', function () {
        FD.render.setSelected(-1);
        updateInfo();
      });

      // тик HUD
      setInterval(function () {
        if (!$('screen-game').classList.contains('hidden')) {
          updateHUD();
          updateQuests();
          hudT++;
          if (hudT % 5 === 0) updateInfo();
        }
      }, 200);
    },

    onWaveStart: function (n, isBoss) {
      toast(isBoss ? '⚠ БОСС: волна ' + n + '!' : 'Волна ' + n + ' началась!', isBoss);
      if (n === 1) setTimeout(function () {
        toast('Турели едят патроны: ПАТРОННЫЙ ЦЕХ (A) → ДЕПО (T) → турели в радиусе!');
      }, 3500);
      if (n === 3) setTimeout(function () {
        toast('Слитки и нау-пакеты вези конвейером в ЯДРО — это твой склад. Исследования: кнопка 🔬');
      }, 3500);
    },
    onWaveDone: function (n) {
      toast('Волна ' + n + ' отбита! +ресурсы');
    },
    onGameOver: function () {
      var st = FD.sim.get();
      $('go-stats').innerHTML =
        'Волна: <b>' + st.wave + '</b><br>' +
        'Убито врагов: <b>' + st.stats.kills + '</b><br>' +
        'Добыто руды: <b>' + st.stats.mined + '</b><br>' +
        'Построено: <b>' + st.stats.built + '</b><br>' +
        'Время: <b>' + fmtTime(st.stats.time) + '</b>';
      $('overlay-gameover').classList.remove('hidden');
    },
    onVictory: function () {
      var st = FD.sim.get();
      $('vic-stats').innerHTML =
        'Все ' + C.WAVES.total + ' волн отбиты!<br>' +
        'Убито врагов: <b>' + st.stats.kills + '</b><br>' +
        'Время: <b>' + fmtTime(st.stats.time) + '</b>';
      $('overlay-victory').classList.remove('hidden');
    },
    toast: toast,
    updateInfo: updateInfo,
    updateHUD: updateHUD,
    getQuest: function () {
      var st = FD.sim.get();
      if (!st || questDismissed) return null;
      for (var i = 0; i < QUESTS.length; i++) {
        if (!QUESTS[i].done(st)) return QUESTS[i];
      }
      return null;
    },
    setBuildMode: function (m) {
      buildMode = m;
      updateBuildButtons();
    },
    getBuildMode: function () { return buildMode; },
    showGame: startGameUI
  };
  FD.ui = UI;
})();
