/* Factory Defense — config: вся балансировка и данные */
var FD = window.FD || (window.FD = {});
(function () {
  'use strict';

  var TILE = 20, MAP_W = 48, MAP_H = 32;

  // ---------- Предметы ----------
  var ITEMS = {
    iron_ore:    { name: 'Железная руда',  color: '#b07048', raw: true },
    copper_ore:  { name: 'Медная руда',    color: '#d98a4e', raw: true },
    coal:        { name: 'Уголь',          color: '#3a3a44', raw: true },
    crystal:     { name: 'Кристалл',       color: '#6fd6ff', raw: true },
    iron:        { name: 'Железо',         color: '#c8c8d4', plate: true },
    copper:      { name: 'Медь',           color: '#e8a060', plate: true },
    bullet:      { name: 'Патроны',        color: '#ffd75e', ammo: true },
    shell:       { name: 'Снаряды',        color: '#ff9040', ammo: true },
    battery:     { name: 'Батареи',        color: '#7ef0ff', ammo: true },
    missile:     { name: 'Ракеты',         color: '#ff6070', ammo: true },
    science:     { name: 'Нау-пакеты',     color: '#c07dff', tech: true },
    food:        { name: 'Еда',            color: '#e8c86a', food: true }
  };
  // ключи склада ядра
  var STOCK_KEYS = ['iron', 'copper', 'coal', 'crystal', 'science', 'food'];

  // ---------- Здания ----------
  // cat: добыча / логистика / производство / оборона
  var BUILDINGS = {
    core: {
      name: 'Ядро', cat: 'core', cost: {}, hp: 2200,
      desc: 'Склад и сердце базы.'
    },
    miner: {
      name: 'Шахта', cat: 'mine', cost: { iron: 10 }, hp: 120,
      desc: 'Добыча руды. Ставится на жилу. Выдаёт вперёд (направление).',
      mineTime: 1.1, buffer: 6
    },
    belt: {
      name: 'Конвейер', cat: 'logi', cost: { iron: 1 }, hp: 60,
      desc: 'Транспортирует предметы. Протяжка мышью — линия.',
      beltTime: 0.34
    },
    splitter: {
      name: 'Сплиттер', cat: 'logi', cost: { iron: 4 }, hp: 90,
      desc: 'Делит поток пополам: вперёд и вправо от направления.'
    },
    container: {
      name: 'Контейнер', cat: 'logi', cost: { iron: 8 }, hp: 180,
      desc: 'Буфер на 60 любых предметов. Принимает с лент и отдаёт дальше. Рядом с шахтой без ленты тоже копит.',
      cap: 60
    },
    depot: {
      name: 'Депо снабжения', cat: 'logi', cost: { iron: 20, copper: 10 }, hp: 220,
      desc: 'Принимает боеприпасы с лент и раздаёт турелям в радиусе.',
      radius: 5.2, cap: 240
    },
    smelter: {
      name: 'Плавильня', cat: 'prod', cost: { iron: 15 }, hp: 180,
      desc: 'Руда → слиток. Железо и медь. Уголь/кристалл пропускайте мимо.',
      recipeTime: 1.2, inCap: 12
    },
    ammo_plant: {
      name: 'Патронный цех', cat: 'prod', cost: { iron: 20, copper: 5 }, hp: 180,
      desc: '1 железо → 6 патронов.',
      recipeTime: 0.9, inCap: 12
    },
    shell_plant: {
      name: 'Цех снарядов', cat: 'prod', cost: { iron: 25, copper: 10 }, hp: 180,
      desc: '2 железа + 1 уголь → 3 снаряда.',
      recipeTime: 1.5, inCap: 12
    },
    battery_plant: {
      name: 'Аккумуляторный цех', cat: 'prod', cost: { iron: 15, copper: 15 }, hp: 180,
      desc: '1 медь + 1 уголь → 2 батареи.',
      recipeTime: 1.2, inCap: 12
    },
    missile_plant: {
      name: 'Ракетный цех', cat: 'prod', cost: { iron: 25, copper: 10, coal: 5 }, hp: 180,
      desc: '2 железа + 1 уголь + 1 кристалл → 2 ракеты.',
      recipeTime: 1.9, inCap: 12
    },
    lab: {
      name: 'Лаборатория', cat: 'prod', cost: { iron: 30, copper: 20 }, hp: 200,
      desc: '2 железа + 2 меди + 1 кристалл → 1 нау-пакет. Для исследований.',
      recipeTime: 2.6, inCap: 12
    },
    house: {
      name: 'Жилой дом', cat: 'town', cost: { iron: 12, copper: 4 }, hp: 300,
      desc: '+8 к населению (рабочим). Рабочие ускоряют шахты, фермы и цеха. Без еды работают вполсилы.',
      pop: 8
    },
    farm: {
      name: 'Ферма', cat: 'town', cost: { iron: 10, copper: 6 }, hp: 180,
      desc: 'Производит ЕДУ. Вези еду конвейером в ядро — население ест автоматически.',
      farmTime: 2.4, buffer: 5
    },
    armory: {
      name: 'Оружейная', cat: 'town', cost: { iron: 25, copper: 15, coal: 5 }, hp: 240,
      desc: '+15% урона турелям в радиусе (максимум 2 оружейные). Работает от рабочих.',
      radius: 6.5, dmgMul: 0.15
    },
    wall: {
      name: 'Стена', cat: 'def', cost: { iron: 4 }, hp: 420,
      desc: 'Просто и надёжно. Держит врагов.'
    },
    gun: {
      name: 'Пулемётная', cat: 'def', cost: { iron: 15, copper: 5 }, hp: 200,
      desc: 'Быстрый огонь патронами. Базовая турель.',
      dmg: 9, cooldown: 0.14, range: 88, projSpeed: 420, ammo: 'bullet', ammoUse: 1, ammoCap: 60
    },
    cannon: {
      name: 'Пушка', cat: 'def', cost: { iron: 25, copper: 10 }, hp: 240,
      desc: 'Тяжёлые снаряды, урон по площади, пробивает броню.',
      dmg: 34, cooldown: 1.15, range: 110, projSpeed: 240, ammo: 'shell', ammoUse: 1, ammoCap: 30,
      splash: 34, pierceArmor: 0.5
    },
    laser: {
      name: 'Лазерная', cat: 'def', cost: { iron: 20, copper: 25 }, hp: 190,
      desc: 'Мгновенный луч, игнорирует половину брони.',
      dmg: 16, cooldown: 0.32, range: 105, ammo: 'battery', ammoUse: 1, ammoCap: 40,
      beam: true, pierceArmor: 0.5
    },
    tesla: {
      name: 'Тесла', cat: 'def', cost: { iron: 30, copper: 20, crystal: 5 }, hp: 200,
      desc: 'Цепной разряд по 3 целям, малый радиус.',
      dmg: 18, cooldown: 0.85, range: 72, ammo: 'battery', ammoUse: 1, ammoCap: 40,
      chain: 3
    },
    missile_turret: {
      name: 'Ракетная', cat: 'def', cost: { iron: 30, copper: 15, coal: 10 }, hp: 210,
      desc: 'Самонаводящиеся ракеты, большая дальность. Не бьёт вплотную.',
      dmg: 46, cooldown: 1.6, range: 160, projSpeed: 190, ammo: 'missile', ammoUse: 1, ammoCap: 24,
      splash: 42, minRange: 40, homing: true
    },
    flak: {
      name: 'Зенитная', cat: 'def', cost: { iron: 20, copper: 15 }, hp: 180,
      desc: 'Только по воздушным целям. Очень высокая скорострельность.',
      dmg: 7, cooldown: 0.11, range: 110, projSpeed: 520, ammo: 'bullet', ammoUse: 1, ammoCap: 80,
      antiAir: true
    }
  };

  // турели: ключи
  var TURRET_KEYS = ['gun', 'cannon', 'laser', 'tesla', 'missile_turret', 'flak'];
  // апгрейд турели (3 уровня): стоимость и прирост
  var TURRET_UPGRADE = {
    costs: [
      { iron: 20, copper: 10 },
      { iron: 45, copper: 30, crystal: 5 }
    ],
    dmgMul: 1.45, rateMul: 1.18, rangeMul: 1.12
  };

  // ---------- Рецепты фабрик ----------
  var RECIPES = {
    smelter: {
      // авто: руда -> слиток
      auto: true,
      map: {
        iron_ore: { out: 'iron', qty: 1 },
        copper_ore: { out: 'copper', qty: 1 }
      },
      in: {}, out: {}, time: 1.2
    },
    ammo_plant:  { in: { iron: 1 },               out: { item: 'bullet', qty: 6 },  time: 0.9 },
    shell_plant: { in: { iron: 2, coal: 1 },      out: { item: 'shell', qty: 3 },   time: 1.5 },
    battery_plant: { in: { copper: 1, coal: 1 },  out: { item: 'battery', qty: 2 }, time: 1.2 },
    missile_plant: { in: { iron: 2, coal: 1, crystal: 1 }, out: { item: 'missile', qty: 2 }, time: 1.9 },
    lab: { in: { iron: 2, copper: 2, crystal: 1 }, out: { item: 'science', qty: 1 }, time: 2.6 }
  };

  // ---------- Враги ----------
  var ENEMIES = {
    runner:  { name: 'Бегун',    hp: 34,  speed: 92,  armor: 0,  reward: 1,  scale: 0.85 },
    soldier: { name: 'Солдат',   hp: 70,  speed: 52,  armor: 2,  reward: 1,  scale: 1 },
    armored: { name: 'Броневик', hp: 170, speed: 34,  armor: 8,  reward: 2,  scale: 1.15 },
    flyer:   { name: 'Летун',    hp: 55,  speed: 68,  armor: 1,  reward: 2,  scale: 1, flying: true },
    splitter:{ name: 'Сплиттер', hp: 120, speed: 44,  armor: 3,  reward: 2,  scale: 1.1, split: 2 },
    healer:  { name: 'Ремонтник',hp: 95,  speed: 46,  armor: 2,  reward: 3,  scale: 1.05, heal: 9 },
    sapper:  { name: 'Сапёр',    hp: 110, speed: 48,  armor: 3,  reward: 3,  scale: 1.05, sapper: true },
    boss_titan:  { name: 'Титан',    hp: 2600, speed: 26, armor: 12, reward: 25, scale: 2.1, boss: true },
    boss_shield: { name: 'Щитовой', hp: 1900, speed: 30, armor: 6,  reward: 25, scale: 1.9, boss: true, regen: 14 },
    boss_swarm:  { name: 'Рой',      hp: 1500, speed: 36, armor: 4,  reward: 25, scale: 1.8, boss: true, split: 4 }
  };

  // ---------- Волны ----------
  var WAVES = {
    total: 30,
    prepTime: 45,        // длинная пауза — успеть настроить фабрику
    firstPrepFrozen: true, // первая волна ждёт, пока игрок освоится
    hpGrow: 0.115,     // +11.5% HP за волну
    speedGrow: 0.012,
    callBonus: { iron: 6, copper: 3 }  // за досрочный вызов
  };

  // ---------- Рабочие и население ----------
  var WORKERS = {
    miner: 2, smelter: 3, ammo_plant: 4, shell_plant: 4,
    battery_plant: 4, missile_plant: 5, lab: 5,
    farm: 4, armory: 3
  };
  var POP = {
    start: 6,          // стартовые рабочие
    baseCap: 6,        // базовая вместимость без домов
    houseCap: 8,       // +8 за дом
    growth: 0.35,      // прирост населения в секунду (если есть еда и места)
    eatPerSec: 0.022,  // расход еды на душу в секунду
    hungryPenalty: 0.55, // множитель скорости без еды
    minFactor: 0.35,   // минимальная занятость
    maxFactor: 1.15    // бонус при избытке рабочих
  };

  // ---------- Сложность ----------
  var DIFFICULTY = {
    easy:   { name: 'Легко',       hp: 0.75, speed: 0.92 },
    normal: { name: 'Нормально',   hp: 1.0,  speed: 1.0 },
    hard:   { name: 'Хард',        hp: 1.35, speed: 1.12 },
    insane: { name: 'Кошмар',      hp: 1.8,  speed: 1.22 }
  };

  // ---------- Исследования ----------
  // eff: ключ модификатора -> значение за уровень
  var RESEARCH = {
    dmg1:  { branch: 'weapon', name: 'Калибровка +12%', cost: 12,  mod: { dmg: 0.12 } },
    dmg2:  { branch: 'weapon', name: 'Боеголовки +12%', cost: 30,  mod: { dmg: 0.12 }, req: 'dmg1' },
    dmg3:  { branch: 'weapon', name: 'Сплавы +12%',     cost: 70,  mod: { dmg: 0.12 }, req: 'dmg2' },
    dmg4:  { branch: 'weapon', name: 'Финальный калибр +16%', cost: 150, mod: { dmg: 0.16 }, req: 'dmg3' },
    splash:{ branch: 'weapon', name: 'Осколочные +25% сплеш', cost: 80, mod: { splash: 0.25 }, req: 'dmg2' },

    belt1: { branch: 'logi', name: 'Ленты +20%', cost: 12,  mod: { beltSpeed: 0.2 } },
    belt2: { branch: 'logi', name: 'Ленты +25%', cost: 40,  mod: { beltSpeed: 0.25 }, req: 'belt1' },
    depot1:{ branch: 'logi', name: 'Радиус депо +12%', cost: 25, mod: { depotRadius: 0.12 } },
    depot2:{ branch: 'logi', name: 'Радиус депо +18%', cost: 65, mod: { depotRadius: 0.18 }, req: 'depot1' },
    sell:  { branch: 'logi', name: 'Возврат 85%', cost: 45, mod: { sellMul: 0.15 }, req: 'belt1' },

    mine1: { branch: 'prod', name: 'Добыча +20%', cost: 12,  mod: { mineSpeed: 0.2 } },
    mine2: { branch: 'prod', name: 'Добыча +25%', cost: 45,  mod: { mineSpeed: 0.25 }, req: 'mine1' },
    craft1:{ branch: 'prod', name: 'Цеха +20%',   cost: 20,  mod: { craftSpeed: 0.2 } },
    craft2:{ branch: 'prod', name: 'Цеха +25%',   cost: 60,  mod: { craftSpeed: 0.25 }, req: 'craft1' },
    craft3:{ branch: 'prod', name: 'Цеха +30%',   cost: 120, mod: { craftSpeed: 0.3 }, req: 'craft2' },

    core1: { branch: 'def', name: 'Ядро +500 HP', cost: 15,  mod: { coreHp: 500 } },
    core2: { branch: 'def', name: 'Ядро +750 HP', cost: 50,  mod: { coreHp: 750 }, req: 'core1' },
    regen: { branch: 'def', name: 'Ремонт ядра 3 HP/с', cost: 60, mod: { coreRegen: 3 }, req: 'core1' },
    thp1:  { branch: 'def', name: 'Броня построек +40%', cost: 35, mod: { buildingHp: 0.4 } },
    range: { branch: 'def', name: 'Дальность турелей +10%', cost: 75, mod: { range: 0.1 }, req: 'thp1' }
  };

  var RESEARCH_BRANCHES = {
    weapon: { name: 'Оружие', color: '#ff6d5a' },
    logi:   { name: 'Логистика', color: '#5ab6ff' },
    prod:   { name: 'Производство', color: '#ffc857' },
    def:    { name: 'Оборона', color: '#6dff8a' }
  };

  // ---------- Карты ----------
  var MAPS = [
    {
      id: 0, name: 'Полигон', desc: 'Ровная местность, много руды. Идеально для старта.',
      core: [8, 16], spawns: [[39, 16]],
      water: 0.30, rock: 0.22, oreRich: 1.25, seed: 1337
    },
    {
      id: 1, name: 'Каньон', desc: 'Каменные гряды диктуют маршруты атак.',
      core: [6, 16], spawns: [[41, 8], [41, 24]],
      water: 0.18, rock: 0.52, oreRich: 1.0, seed: 4242
    },
    {
      id: 2, name: 'Болото', desc: 'Вода режет карту на узкие проходы.',
      core: [10, 16], spawns: [[38, 6], [38, 26]],
      water: 0.52, rock: 0.18, oreRich: 1.1, seed: 777
    },
    {
      id: 3, name: 'Архипелаг', desc: 'Острова и мосты. Где строить завод?',
      core: [24, 16], spawns: [[4, 6], [43, 26]],
      water: 0.44, rock: 0.26, oreRich: 1.15, seed: 9001
    },
    {
      id: 4, name: 'Крепость', desc: 'Ядро в центре, атака со всех сторон.',
      core: [23, 15], spawns: [[4, 4], [43, 4], [4, 27], [43, 27]],
      water: 0.26, rock: 0.30, oreRich: 1.35, seed: 2024
    }
  ];

  // ---------- Прочее ----------
  var BAL = {
    coreHp: 2200,
    coreSize: 2,            // 2x2 тайла
    startStock: { iron: 60, copper: 25, coal: 15, crystal: 0, science: 0, food: 12 },
    sellMul: 0.7,
    enemyDamageToCore: 34,
    sapperDps: 42,
    projectileLife: 3,
    maxParticles: 220,
    waveReward: { iron: 12, copper: 6 }
  };

  FD.config = {
    TILE: TILE, MAP_W: MAP_W, MAP_H: MAP_H,
    ITEMS: ITEMS, STOCK_KEYS: STOCK_KEYS,
    BUILDINGS: BUILDINGS, TURRET_KEYS: TURRET_KEYS, TURRET_UPGRADE: TURRET_UPGRADE,
    RECIPES: RECIPES, ENEMIES: ENEMIES, WAVES: WAVES,
    RESEARCH: RESEARCH, RESEARCH_BRANCHES: RESEARCH_BRANCHES,
    MAPS: MAPS, BAL: BAL,
    WORKERS: WORKERS, POP: POP, DIFFICULTY: DIFFICULTY
  };
})();
