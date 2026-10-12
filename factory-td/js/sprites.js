/* Factory Defense — процедурные пиксель-спрайты (рисуются на canvas при загрузке) */
var FD = window.FD || (window.FD = {});
(function () {
  'use strict';

  var T = 20; // тайл
  var sprites = {};
  FD.sprites = sprites;

  function mk(w, h) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    var x = c.getContext('2d');
    x.imageSmoothingEnabled = false;
    return { c: c, x: x, w: w, h: h };
  }

  function px(x, X, Y, w, h, col) {
    x.fillStyle = col;
    x.fillRect(X | 0, Y | 0, w == null ? 1 : w, h == null ? 1 : h);
  }

  // детерминированный "шум" для тайлов
  function hash(x, y, s) {
    var n = (x * 374761393 + y * 668265263 + (s || 0) * 1442695040888963407) % 2147483647;
    n = (n ^ (n >> 13)) * 1274126177;
    return Math.abs(n % 1000) / 1000;
  }

  // ---------- Тайлы ----------
  function tileBase(x, base, speck, s) {
    x.fillStyle = base;
    x.fillRect(0, 0, T, T);
    for (var i = 0; i < 26; i++) {
      var a = hash(i, s || 0, 1), b = hash(i, s || 0, 2);
      x.fillStyle = speck;
      x.globalAlpha = 0.22 + 0.3 * hash(i, s || 0, 3);
      x.fillRect((a * T) | 0, (b * T) | 0, 2, 2);
    }
    x.globalAlpha = 1;
  }

  function makeTile(name, fn) {
    var o = mk(T, T);
    fn(o.x);
    sprites[name] = o.c;
  }

  makeTile('ground', function (x) { tileBase(x, '#4a6b3a', '#3c5a2f', 1); });
  makeTile('ground2', function (x) { tileBase(x, '#456336', '#3a562c', 2); });
  makeTile('ground3', function (x) { tileBase(x, '#507340', '#416135', 3); });

  function oreTile(name, col, dark) {
    makeTile(name, function (x) {
      tileBase(x, '#4a6b3a', '#3c5a2f', 5);
      var i, bx, by, r;
      for (i = 0; i < 7; i++) {
        bx = 2 + (hash(i, 7, 9) * 15) | 0;
        by = 2 + (hash(i, 9, 11) * 15) | 0;
        r = 2 + ((hash(i, 3, 4) * 2) | 0);
        x.fillStyle = dark;
        x.fillRect(bx, by, r + 1, r + 1);
        x.fillStyle = col;
        x.fillRect(bx, by, r, r);
      }
    });
  }
  oreTile('ore_iron', '#c98850', '#8a5a34');
  oreTile('ore_copper', '#e8a060', '#a86a38');
  oreTile('ore_coal', '#4a4a58', '#26262e');
  oreTile('ore_crystal', '#7fe0ff', '#3a86a8');

  makeTile('rock', function (x) {
    tileBase(x, '#6e6e78', '#5a5a64', 6);
    x.fillStyle = '#8a8a96';
    x.fillRect(3, 3, 7, 6);
    x.fillRect(11, 8, 5, 7);
    x.fillStyle = '#55555f';
    x.fillRect(4, 8, 6, 4);
    x.fillRect(12, 13, 4, 3);
    x.fillStyle = '#9a9aa6';
    x.fillRect(4, 3, 4, 2);
    x.fillRect(12, 8, 2, 2);
  });

  makeTile('water', function (x) {
    x.fillStyle = '#2c5f8a';
    x.fillRect(0, 0, T, T);
    x.fillStyle = '#3a76a8';
    x.fillRect(0, 4, 8, 2); x.fillRect(10, 10, 7, 2); x.fillRect(3, 15, 6, 2);
    x.fillStyle = '#24507a';
    x.fillRect(0, 7, 6, 2); x.fillRect(11, 2, 6, 2); x.fillRect(8, 17, 9, 2);
    x.fillStyle = '#5a9ac8';
    x.fillRect(2, 5, 3, 1); x.fillRect(12, 11, 3, 1);
  });

  // ---------- Здания ----------
  function makeSpr(name, w, h, fn) {
    var o = mk(w, h);
    fn(o.x, w, h);
    sprites[name] = o.c;
  }

  function metalBox(x, w, h, base, dark, light) {
    x.fillStyle = dark;
    x.fillRect(0, 0, w, h);
    x.fillStyle = base;
    x.fillRect(1, 1, w - 2, h - 2);
    x.fillStyle = light;
    x.fillRect(1, 1, w - 2, 2);
    x.fillRect(1, 1, 2, h - 2);
    x.fillStyle = dark;
    x.fillRect(w - 3, 3, 2, h - 6);
    x.fillRect(3, h - 3, w - 6, 2);
  }

  makeSpr('core', 40, 40, function (x) {
    x.fillStyle = '#20242e';
    x.fillRect(0, 0, 40, 40);
    x.fillStyle = '#3a4256';
    x.fillRect(2, 2, 36, 36);
    x.fillStyle = '#58647e';
    x.fillRect(4, 4, 32, 32);
    x.fillStyle = '#2c3346';
    x.fillRect(8, 8, 24, 24);
    // ядро-кристалл
    x.fillStyle = '#5ad6ff';
    x.fillRect(16, 10, 8, 8); x.fillRect(12, 16, 16, 8); x.fillRect(16, 22, 8, 8);
    x.fillStyle = '#b0f0ff';
    x.fillRect(17, 13, 6, 6);
    x.fillStyle = '#2c86b8';
    x.fillRect(13, 17, 3, 6); x.fillRect(24, 17, 3, 6);
    // уголки
    x.fillStyle = '#e8c85a';
    x.fillRect(2, 2, 5, 5); x.fillRect(33, 2, 5, 5); x.fillRect(2, 33, 5, 5); x.fillRect(33, 33, 5, 5);
    x.fillStyle = '#8a7430';
    x.fillRect(4, 4, 1, 1); x.fillRect(35, 4, 1, 1); x.fillRect(4, 35, 1, 1); x.fillRect(35, 35, 1, 1);
  });

  makeSpr('miner', T, T, function (x) {
    metalBox(x, T, T, '#7a6a4a', '#4a3e28', '#9a8a62');
    x.fillStyle = '#3a3226';
    x.fillRect(5, 6, 10, 8);
    x.fillStyle = '#c8b878';
    x.fillRect(6, 7, 8, 2);
    // бур
    x.fillStyle = '#d8d8e0';
    x.fillRect(9, 12, 2, 5);
    x.fillStyle = '#888894';
    x.fillRect(8, 15, 4, 2);
    x.fillStyle = '#e0a040';
    x.fillRect(15, 4, 3, 3);
  });

  makeSpr('belt', T, T, function (x) {
    x.fillStyle = '#2e3440';
    x.fillRect(0, 0, T, T);
    x.fillStyle = '#4a5262';
    x.fillRect(0, 3, T, T - 6);
    x.fillStyle = '#343c4a';
    for (var i = -2; i < 8; i++) {
      x.fillRect(i * 4, 3, 2, T - 6);
    }
    x.fillStyle = '#68748a';
    x.fillRect(0, 3, T, 1);
    x.fillRect(0, T - 4, T, 1);
  });

  makeSpr('splitter', T, T, function (x) {
    metalBox(x, T, T, '#5a6a7a', '#343e4a', '#7a8a9a');
    x.fillStyle = '#c8d8e8';
    x.fillRect(8, 4, 4, 6); x.fillRect(8, 4, 8, 3); // стрелка вперёд-вправо
    x.fillRect(12, 8, 3, 3);
  });

  makeSpr('depot', T, T, function (x) {
    metalBox(x, T, T, '#6a7a5a', '#3e4a32', '#8aa070');
    x.fillStyle = '#c8b858';
    x.fillRect(4, 5, 5, 5); x.fillRect(11, 5, 5, 5); x.fillRect(4, 11, 5, 5); x.fillRect(11, 11, 5, 5);
    x.fillStyle = '#8a7a30';
    x.fillRect(5, 6, 3, 1); x.fillRect(12, 6, 3, 1); x.fillRect(5, 12, 3, 1); x.fillRect(12, 12, 3, 1);
  });

  makeSpr('container', T, T, function (x) {
    x.fillStyle = '#3a4250';
    x.fillRect(1, 1, T - 2, T - 2);
    x.fillStyle = '#5a7088';
    x.fillRect(2, 2, T - 4, T - 4);
    x.fillStyle = '#7a94ac';
    x.fillRect(2, 2, T - 4, 3);
    x.fillStyle = '#2c3644';
    x.fillRect(4, 7, T - 8, 9);
    x.fillStyle = '#8ab0c8';
    x.fillRect(5, 8, T - 10, 2);
    x.fillStyle = '#e8c858';
    x.fillRect(8, 10, 4, 4);
    x.fillStyle = '#3a4250';
    x.fillRect(2, T - 5, T - 4, 3);
  });

  makeSpr('house', T, T, function (x) {
    x.fillStyle = '#4a3428';
    x.fillRect(1, 7, T - 2, T - 8);
    x.fillStyle = '#8a5a40';
    x.fillRect(2, 8, T - 4, T - 10);
    // крыша
    x.fillStyle = '#c85038';
    x.fillRect(0, 3, T, 5);
    x.fillRect(3, 0, T - 6, 3);
    x.fillStyle = '#e86848';
    x.fillRect(2, 3, T - 4, 2);
    // окна
    x.fillStyle = '#ffd870';
    x.fillRect(4, 10, 4, 4);
    x.fillRect(12, 10, 4, 4);
    // дверь
    x.fillStyle = '#3a2418';
    x.fillRect(8, 13, 4, 5);
  });

  makeSpr('farm', T, T, function (x) {
    x.fillStyle = '#5a4828';
    x.fillRect(0, 0, T, T);
    // борозды
    x.fillStyle = '#7a6030';
    for (var i = 0; i < 4; i++) x.fillRect(1, 2 + i * 5, T - 2, 3);
    // всходы
    x.fillStyle = '#6ac840';
    for (var j = 0; j < 4; j++) {
      x.fillRect(3, 1 + j * 5, 2, 3);
      x.fillRect(8, 2 + j * 5, 2, 2);
      x.fillRect(13, 1 + j * 5, 2, 3);
    }
    x.fillStyle = '#8ae858';
    x.fillRect(3, 1, 1, 1); x.fillRect(13, 1, 1, 1);
  });

  makeSpr('armory', T, T, function (x) {
    metalBox(x, T, T, '#7a4a4a', '#4a2626', '#a86a6a');
    // мечи-скрещённые
    x.fillStyle = '#e8e8f0';
    x.fillRect(4, 4, 2, 10); x.fillRect(13, 4, 2, 10);
    x.fillRect(4, 4, 11, 2);
    x.fillStyle = '#c8a040';
    x.fillRect(7, 11, 5, 2);
    x.fillRect(8, 3, 3, 2);
  });

  makeSpr('wall', T, T, function (x) {
    x.fillStyle = '#4a4a56';
    x.fillRect(0, 0, T, T);
    x.fillStyle = '#7a7a88';
    x.fillRect(1, 1, 8, 5); x.fillRect(11, 1, 8, 5);
    x.fillRect(1, 8, 5, 5); x.fillRect(8, 8, 11, 5);
    x.fillRect(1, 15, 8, 4); x.fillRect(11, 15, 8, 4);
    x.fillStyle = '#9a9aa8';
    x.fillRect(1, 1, 8, 1); x.fillRect(11, 1, 8, 1); x.fillRect(8, 8, 11, 1);
  });

  // фабрики: база + акцент
  function factorySpr(name, accent, dark, extra) {
    makeSpr(name, T, T, function (x) {
      metalBox(x, T, T, '#5a6272', '#343a46', '#7a8494');
      x.fillStyle = accent;
      x.fillRect(3, 3, 6, 6);
      x.fillStyle = dark;
      x.fillRect(4, 4, 4, 4);
      x.fillStyle = accent;
      x.fillRect(12, 3, 5, 3);
      x.fillStyle = '#2a2e38';
      x.fillRect(3, 12, 14, 5);
      x.fillStyle = accent;
      x.fillRect(4, 13, 12, 1);
      if (extra) extra(x);
    });
  }
  factorySpr('smelter', '#ff8840', '#a84020', function (x) {
    x.fillStyle = '#ffb060';
    x.fillRect(5, 13, 10, 3);
    x.fillStyle = '#3a3028';
    x.fillRect(13, 0, 4, 4); // труба
    x.fillStyle = '#6a5a4a';
    x.fillRect(13, 0, 4, 2);
  });
  factorySpr('ammo_plant', '#7ac860', '#3a6a28');
  factorySpr('shell_plant', '#e8a040', '#8a5a20');
  factorySpr('battery_plant', '#5ad0e8', '#2a7088');
  factorySpr('missile_plant', '#e86060', '#8a2a2a');
  factorySpr('lab', '#b070e8', '#5a2a88', function (x) {
    x.fillStyle = '#e0c0ff';
    x.fillRect(12, 12, 3, 3); x.fillRect(16, 14, 2, 2); x.fillRect(13, 16, 2, 2);
  });

  // турели: база (ствол рисуется в рендере с поворотом)
  function turretBase(name, base, dark, light) {
    makeSpr(name + '_base', T, T, function (x) {
      x.fillStyle = dark;
      x.fillRect(1, 1, T - 2, T - 2);
      x.fillStyle = base;
      x.fillRect(2, 2, T - 4, T - 4);
      x.fillStyle = light;
      x.fillRect(2, 2, T - 4, 2);
      x.fillStyle = dark;
      x.fillRect(T - 5, 3, 2, T - 6);
      x.fillStyle = '#2a2e38';
      x.fillRect(6, 6, 8, 8);
      x.fillStyle = base;
      x.fillRect(7, 7, 6, 6);
    });
    makeSpr(name + '_barrel', 24, 8, function (x) {
      x.fillStyle = dark;
      x.fillRect(2, 2, 20, 4);
      x.fillStyle = light;
      x.fillRect(2, 2, 20, 1);
      x.fillStyle = base;
      x.fillRect(4, 1, 10, 6);
    });
  }
  turretBase('gun', '#6a8a5a', '#3a4a30', '#8aaa72');
  turretBase('cannon', '#8a7a5a', '#4a3e2c', '#a89878');
  turretBase('laser', '#5a7a9a', '#2e4258', '#7aa2c8');
  turretBase('tesla', '#7a5a9a', '#422e58', '#a27ac8');
  turretBase('missile_turret', '#9a5a5a', '#582e2e', '#c87a7a');
  turretBase('flak', '#5a8a8a', '#2e5252', '#7ab8b8');

  // ---------- Враги ----------
  function enemySpr(name, w, h, fn) {
    makeSpr(name, w, h, fn);
  }

  enemySpr('runner', 14, 14, function (x) {
    x.fillStyle = '#3a2a2a';
    x.fillRect(3, 4, 8, 8);
    x.fillStyle = '#e06050';
    x.fillRect(4, 3, 6, 7);
    x.fillStyle = '#ffb0a0';
    x.fillRect(5, 5, 2, 2);
    x.fillStyle = '#c04030';
    x.fillRect(2, 9, 3, 3); x.fillRect(9, 9, 3, 3);
    x.fillStyle = '#fff';
    x.fillRect(5, 5, 2, 2);
    x.fillStyle = '#200';
    x.fillRect(5, 5, 1, 1);
  });

  enemySpr('soldier', 16, 16, function (x) {
    x.fillStyle = '#2e3426';
    x.fillRect(3, 4, 10, 10);
    x.fillStyle = '#6a7a4a';
    x.fillRect(4, 3, 8, 9);
    x.fillStyle = '#8a9a62';
    x.fillRect(5, 2, 6, 4);
    x.fillStyle = '#d8c8a0';
    x.fillRect(6, 6, 4, 3);
    x.fillStyle = '#222';
    x.fillRect(6, 7, 4, 1);
    x.fillStyle = '#4a5a34';
    x.fillRect(3, 12, 4, 3); x.fillRect(9, 12, 4, 3);
    x.fillStyle = '#c8b060';
    x.fillRect(12, 6, 3, 2);
  });

  enemySpr('armored', 18, 18, function (x) {
    x.fillStyle = '#2a2e38';
    x.fillRect(2, 3, 14, 13);
    x.fillStyle = '#5a6272';
    x.fillRect(3, 2, 12, 12);
    x.fillStyle = '#7a8494';
    x.fillRect(5, 4, 8, 4);
    x.fillStyle = '#3a4250';
    x.fillRect(4, 8, 10, 5);
    x.fillStyle = '#e8c050';
    x.fillRect(6, 9, 2, 2); x.fillRect(10, 9, 2, 2);
    x.fillStyle = '#1a1e26';
    x.fillRect(2, 14, 5, 3); x.fillRect(11, 14, 5, 3);
    x.fillStyle = '#8a94a4';
    x.fillRect(3, 2, 12, 1);
  });

  enemySpr('flyer', 16, 14, function (x) {
    x.fillStyle = '#2a2438';
    x.fillRect(4, 4, 8, 7);
    x.fillStyle = '#8a6ac8';
    x.fillRect(5, 3, 6, 7);
    x.fillStyle = '#b08ae8';
    x.fillRect(6, 5, 4, 3);
    // крылья
    x.fillStyle = '#6a4aa8';
    x.fillRect(0, 5, 5, 3); x.fillRect(11, 5, 5, 3);
    x.fillStyle = '#a888e0';
    x.fillRect(1, 4, 3, 1); x.fillRect(12, 4, 3, 1);
    x.fillStyle = '#ff5050';
    x.fillRect(7, 6, 2, 2);
  });

  enemySpr('splitter', 16, 16, function (x) {
    x.fillStyle = '#2a3820';
    x.fillRect(2, 3, 12, 11);
    x.fillStyle = '#6ac840';
    x.fillRect(3, 2, 10, 11);
    x.fillStyle = '#9af070';
    x.fillRect(5, 4, 6, 5);
    x.fillStyle = '#3a7a20';
    x.fillRect(4, 9, 8, 3);
    x.fillStyle = '#1a2a10';
    x.fillRect(6, 6, 2, 2); x.fillRect(9, 6, 2, 2);
  });

  enemySpr('healer', 16, 16, function (x) {
    x.fillStyle = '#28323a';
    x.fillRect(2, 3, 12, 11);
    x.fillStyle = '#4ac8c8';
    x.fillRect(3, 2, 10, 11);
    x.fillStyle = '#e8ffff';
    x.fillRect(7, 4, 2, 8); x.fillRect(4, 7, 8, 2);
    x.fillStyle = '#2a7a7a';
    x.fillRect(3, 12, 10, 2);
  });

  enemySpr('sapper', 16, 16, function (x) {
    x.fillStyle = '#382820';
    x.fillRect(2, 3, 12, 11);
    x.fillStyle = '#c87830';
    x.fillRect(3, 3, 10, 10);
    x.fillStyle = '#f0a050';
    x.fillRect(5, 5, 6, 5);
    // бомба
    x.fillStyle = '#222';
    x.fillRect(6, 7, 5, 5);
    x.fillStyle = '#ff5040';
    x.fillRect(7, 8, 3, 3);
    x.fillStyle = '#e8d060';
    x.fillRect(10, 5, 2, 3);
  });

  enemySpr('boss_titan', 36, 36, function (x) {
    x.fillStyle = '#241a1a';
    x.fillRect(4, 6, 28, 26);
    x.fillStyle = '#8a3a30';
    x.fillRect(6, 4, 24, 26);
    x.fillStyle = '#c85a40';
    x.fillRect(10, 8, 16, 10);
    x.fillStyle = '#e8a080';
    x.fillRect(12, 10, 6, 4);
    x.fillStyle = '#3a1810';
    x.fillRect(8, 18, 20, 10);
    x.fillStyle = '#ff6040';
    x.fillRect(12, 20, 4, 4); x.fillRect(20, 20, 4, 4);
    x.fillStyle = '#5a2418';
    x.fillRect(2, 10, 6, 16); x.fillRect(28, 10, 6, 16);
    x.fillStyle = '#d88060';
    x.fillRect(6, 4, 24, 2);
  });

  enemySpr('boss_shield', 34, 34, function (x) {
    x.fillStyle = '#1a2438';
    x.fillRect(4, 6, 26, 24);
    x.fillStyle = '#3a6ac8';
    x.fillRect(6, 4, 22, 24);
    x.fillStyle = '#6ac0ff';
    x.fillRect(10, 8, 14, 10);
    x.fillStyle = '#b0e8ff';
    x.fillRect(12, 10, 6, 4);
    x.fillStyle = '#20406a';
    x.fillRect(8, 18, 18, 8);
    x.fillStyle = '#8ad0ff';
    x.fillRect(2, 8, 4, 18); x.fillRect(28, 8, 4, 18);
  });

  enemySpr('boss_swarm', 32, 32, function (x) {
    x.fillStyle = '#1a2a18';
    x.fillRect(3, 5, 26, 22);
    x.fillStyle = '#4a9a30';
    x.fillRect(5, 3, 22, 22);
    x.fillStyle = '#8ad060';
    x.fillRect(8, 6, 16, 10);
    x.fillStyle = '#2a5a18';
    x.fillRect(7, 16, 18, 8);
    x.fillStyle = '#ff5050';
    x.fillRect(10, 9, 3, 3); x.fillRect(19, 9, 3, 3);
    x.fillStyle = '#3a7a24';
    x.fillRect(2, 8, 4, 6); x.fillRect(26, 8, 4, 6);
    x.fillRect(2, 18, 4, 6); x.fillRect(26, 18, 4, 6);
  });

  // ---------- Предметы (8x8) ----------
  function itemSpr(name, fn) {
    makeSpr(name, 8, 8, fn);
  }
  itemSpr('i_iron_ore', function (x) {
    x.fillStyle = '#8a5a34'; x.fillRect(1, 1, 6, 6);
    x.fillStyle = '#c98850'; x.fillRect(2, 2, 4, 4);
    x.fillStyle = '#e8b080'; x.fillRect(2, 2, 2, 2);
  });
  itemSpr('i_copper_ore', function (x) {
    x.fillStyle = '#a86a38'; x.fillRect(1, 1, 6, 6);
    x.fillStyle = '#e8a060'; x.fillRect(2, 2, 4, 4);
    x.fillStyle = '#f8c890'; x.fillRect(3, 2, 2, 2);
  });
  itemSpr('i_coal', function (x) {
    x.fillStyle = '#1c1c24'; x.fillRect(1, 1, 6, 6);
    x.fillStyle = '#3a3a44'; x.fillRect(2, 2, 4, 4);
    x.fillStyle = '#5a5a68'; x.fillRect(2, 2, 2, 1);
  });
  itemSpr('i_crystal', function (x) {
    x.fillStyle = '#2a6a8a'; x.fillRect(2, 0, 4, 8); x.fillRect(0, 2, 8, 4);
    x.fillStyle = '#7fe0ff'; x.fillRect(3, 1, 2, 6); x.fillRect(1, 3, 6, 2);
    x.fillStyle = '#d0f8ff'; x.fillRect(3, 2, 2, 2);
  });
  itemSpr('i_iron', function (x) {
    x.fillStyle = '#8a8a98'; x.fillRect(1, 2, 6, 4);
    x.fillStyle = '#c8c8d4'; x.fillRect(2, 3, 4, 2);
    x.fillStyle = '#e8e8f0'; x.fillRect(2, 3, 2, 1);
  });
  itemSpr('i_copper', function (x) {
    x.fillStyle = '#a86a38'; x.fillRect(1, 2, 6, 4);
    x.fillStyle = '#e8a060'; x.fillRect(2, 3, 4, 2);
    x.fillStyle = '#f8c890'; x.fillRect(2, 3, 2, 1);
  });
  itemSpr('i_bullet', function (x) {
    x.fillStyle = '#8a6a20'; x.fillRect(3, 1, 2, 2);
    x.fillStyle = '#ffd75e'; x.fillRect(3, 3, 2, 4);
    x.fillStyle = '#c8a030'; x.fillRect(3, 6, 2, 1);
  });
  itemSpr('i_shell', function (x) {
    x.fillStyle = '#a04020'; x.fillRect(2, 1, 4, 2);
    x.fillStyle = '#ff9040'; x.fillRect(2, 3, 4, 4);
    x.fillStyle = '#e8c070'; x.fillRect(2, 5, 4, 1);
  });
  itemSpr('i_battery', function (x) {
    x.fillStyle = '#2a6a80'; x.fillRect(1, 2, 6, 5);
    x.fillStyle = '#7ef0ff'; x.fillRect(2, 3, 4, 3);
    x.fillStyle = '#d0ffff'; x.fillRect(2, 3, 2, 1);
    x.fillStyle = '#8ad0e0'; x.fillRect(3, 1, 2, 1);
  });
  itemSpr('i_missile', function (x) {
    x.fillStyle = '#8a2a30'; x.fillRect(3, 0, 2, 2);
    x.fillStyle = '#ff6070'; x.fillRect(2, 2, 4, 4);
    x.fillStyle = '#c8c8d0'; x.fillRect(2, 6, 4, 2);
    x.fillStyle = '#ff9090'; x.fillRect(2, 2, 1, 3);
  });
  itemSpr('i_science', function (x) {
    x.fillStyle = '#5a2a88'; x.fillRect(2, 1, 4, 6);
    x.fillStyle = '#c07dff'; x.fillRect(3, 2, 2, 4);
    x.fillStyle = '#e8c0ff'; x.fillRect(3, 2, 1, 2);
  });
  itemSpr('i_food', function (x) {
    x.fillStyle = '#a87830'; x.fillRect(1, 3, 6, 4);
    x.fillStyle = '#e8c86a'; x.fillRect(1, 2, 6, 4);
    x.fillStyle = '#f8e8a0'; x.fillRect(2, 2, 3, 2);
    x.fillStyle = '#c8a040'; x.fillRect(1, 5, 6, 1);
  });

  // ---------- Иконки UI ----------
  makeSpr('icon_hammer', 16, 16, function (x) {
    x.fillStyle = '#c8c8d4'; x.fillRect(3, 2, 8, 4);
    x.fillStyle = '#8a8a98'; x.fillRect(3, 5, 8, 1);
    x.fillStyle = '#a87840'; x.fillRect(7, 6, 3, 8);
    x.fillStyle = '#704a20'; x.fillRect(8, 6, 1, 8);
  });

  // повёрнутая версия спрайта (кэш)
  var rotCache = {};
  FD.rot = function (spr, quarterTurns) {
    var key = spr.__id || (spr.__id = 's' + (++FD.rot._id));
    key += '_' + quarterTurns;
    if (rotCache[key]) return rotCache[key];
    var o = mk(spr.width, spr.height);
    o.x.translate(spr.width / 2, spr.height / 2);
    o.x.rotate(quarterTurns * Math.PI / 2);
    o.x.drawImage(spr, -spr.width / 2, -spr.height / 2);
    rotCache[key] = o.c;
    return o.c;
  };
  FD.rot._id = 0;

  // dataURL для DOM-иконок
  FD.sprURL = function (name) {
    return sprites[name].toDataURL();
  };
})();
