/*
 * Второй голос — курс сольфеджио: уроки, нотный стан, упражнения на слух,
 * пение ступеней и интервалов, ритм, пение с листа и диктант.
 */
(function () {
  'use strict';

  const VG = window.VG;
  const { M, engine, $, el, clamp } = VG;

  // ================= Уроки =================
  const UNITS = [
    {
      id: 'notes',
      title: 'Ноты и звукоряд',
      lessons: [
        {
          id: 's-names',
          title: 'Семь нот и октавы',
          theory: [
            'Нот всего семь: до, ре, ми, фа, соль, ля, си. После си снова идёт до, только выше. Отрезок от одного до до следующего называется октавой.',
            'На клавиатуре ноты легко найти по чёрным клавишам: они собраны группами по две и по три. До — белая клавиша слева от пары чёрных. Ми — справа от пары. Фа — слева от тройки.',
            'Октавы имеют названия. Середина клавиатуры — первая октава (в программе пишется цифрой 4: до4). Выше — вторая (до5), ниже — малая (до3). Женские голоса поют в основном в первой и второй октавах, мужские — в малой и первой.',
          ],
          ex: { type: 'piano-find', naturals: true },
        },
        {
          id: 's-staff',
          title: 'Ноты на нотном стане',
          theory: [
            'Ноты записывают на пяти линейках — нотном стане. Чем выше нота, тем выше она стоит. Ноты пишутся на линейках и между ними.',
            'Знак в начале строки — скрипичный ключ. Его завиток обвивает вторую снизу линейку и говорит: здесь соль первой октавы. От неё считают остальные ноты.',
            'Подсказка: на линейках снизу вверх стоят ми, соль, си, ре, фа. Между линейками — фа, ля, до, ми. До первой октавы пишется под станом на маленькой добавочной линейке.',
          ],
          ex: { type: 'staff-read', clef: 'treble', lo: 60, hi: 79 },
        },
        {
          id: 's-bass',
          title: 'Басовый ключ',
          theory: [
            'Для низких голосов и левой руки на фортепиано используют басовый ключ. Его две точки обнимают четвёртую снизу линейку — это фа малой октавы.',
            'На линейках снизу вверх: соль, си, ре, фа, ля (большой и малой октав). Между линейками: ля, до, ми, соль.',
            'Мужские хоровые партии (тенор, бас) часто пишут в басовом ключе. Если у вас низкий голос, этот урок обязателен.',
          ],
          ex: { type: 'staff-read', clef: 'bass', lo: 43, hi: 60 },
        },
        {
          id: 's-acc',
          title: 'Тон, полутон, диезы и бемоли',
          theory: [
            'Самое маленькое расстояние между соседними клавишами — полутон. Два полутона — тон. Между ми и фа, си и до чёрных клавиш нет: там всего полутон.',
            'Диез ♯ повышает ноту на полутон, бемоль ♭ понижает. Фа-диез — чёрная клавиша справа от фа. Си-бемоль — чёрная клавиша слева от си. У одной чёрной клавиши два имени: фа-диез и соль-бемоль — это один и тот же звук.',
          ],
          ex: { type: 'piano-find', naturals: false },
        },
      ],
    },
    {
      id: 'scale',
      title: 'Лад и ступени',
      lessons: [
        {
          id: 's-major',
          title: 'Мажорная гамма и ступени',
          theory: [
            'Гамма — ноты лада по порядку. Мажорная гамма строится по формуле тон-тон-полутон-тон-тон-тон-полутон. От до получаются одни белые клавиши: до ре ми фа соль ля си до.',
            'Ноты гаммы называют ступенями и обозначают римскими цифрами: I — до, II — ре, III — ми и так далее. Главная ступень — I, тоника: на ней мелодия обычно заканчивается и «успокаивается».',
            'Петь ступени — главный навык для второго голоса: вы перестаёте думать «какая это нота» и начинаете слышать «третья ступень над тоникой».',
          ],
          ex: { type: 'sing-degree', degrees: [0, 1, 2] },
        },
        {
          id: 's-stable',
          title: 'Устойчивые ступени: I, III, V',
          theory: [
            'Ступени I, III и V — устойчивые. Вместе они дают тоническое трезвучие: до-ми-соль. На них хочется остановиться.',
            'Остальные ступени неустойчивые: они «тянутся» к соседним устойчивым. VII тянется вверх к I, II — вниз к I или вверх к III.',
            'Второй голос очень часто стоит на устойчивых ступенях, пока мелодия движется. Научитесь находить их на слух.',
          ],
          ex: { type: 'sing-degree', degrees: [0, 2, 4, 7] },
        },
        {
          id: 's-alldeg',
          title: 'Все ступени мажора',
          theory: [
            'Теперь все семь ступеней. Перед заданием программа играет тоническое трезвучие — вы «настраиваетесь» в тональность, потом находите нужную ступень.',
            'Если трудно, мысленно пропойте гамму от тоники до нужной ступени, а потом спойте только её.',
          ],
          ex: { type: 'sing-degree', degrees: [0, 1, 2, 3, 4, 5, 6, 7] },
        },
        {
          id: 's-majmin',
          title: 'Мажор или минор',
          theory: [
            'Минорная гамма: тон-полутон-тон-тон-полутон-тон-тон. От ля получаются белые клавиши: ля си до ре ми фа соль ля.',
            'Главное отличие на слух — третья ступень. В мажоре она на большую терцию выше тоники (звучит светло), в миноре — на малую (звучит грустнее, мягче).',
          ],
          ex: { type: 'ear', task: 'mode' },
        },
      ],
    },
    {
      id: 'intervals',
      title: 'Интервалы',
      lessons: [
        {
          id: 's-int-intro',
          title: 'Что такое интервал',
          theory: [
            'Интервал — расстояние между двумя звуками. Его название показывает, сколько ступеней он охватывает: прима (1), секунда (2), терция (3), кварта (4), квинта (5), секста (6), септима (7), октава (8).',
            'Точный размер считают в полутонах. Поэтому терции бывают малые (3 полутона) и большие (4), кварта и квинта — чистые (5 и 7 полутонов).',
            'Начнём с самых непохожих: большая терция, чистая квинта и октава.',
          ],
          ex: { type: 'ear', task: 'interval', set: [4, 7, 12] },
        },
        {
          id: 's-thirds',
          title: 'Терции: малая и большая',
          theory: [
            'Терция — главный интервал второго голоса: чаще всего он идёт на терцию ниже мелодии.',
            'Большая терция (до–ми) звучит светло и открыто, малая (ми–соль, ля–до) — мягче и грустнее. В мажорной гамме терции чередуются, поэтому второй голос «терциями» использует обе.',
          ],
          ex: { type: 'ear', task: 'interval', set: [3, 4] },
        },
        {
          id: 's-45',
          title: 'Кварта, квинта, октава',
          theory: [
            'Чистая кварта (до–фа) звучит призывно, как начало многих гимнов. Чистая квинта (до–соль) — «пустая», ровная, как настройка скрипки. Октава — тот же звук, только выше: звучит как одна нота.',
            'Квинту и кварту часто путают. Квинта шире и «просторнее», кварта — ближе и напряжённее.',
          ],
          ex: { type: 'ear', task: 'interval', set: [5, 7, 12] },
        },
        {
          id: 's-all-int',
          title: 'Все интервалы',
          theory: [
            'Секунды — соседние звуки: малая (до–ре♭) звучит остро, большая (до–ре) — как шаг гаммы. Сексты — широкие и певучие: малая (ми–до) и большая (до–ля). Септимы — напряжённые, «просят» разрешиться в октаву.',
            'Не бойтесь ошибаться: интервалы на слух учатся месяцами. Возвращайтесь к этому уроку раз в несколько дней.',
          ],
          ex: { type: 'ear', task: 'interval', set: [1, 2, 3, 4, 5, 7, 8, 9, 10, 11, 12] },
        },
        {
          id: 's-harm-int',
          title: 'Интервалы созвучием',
          theory: [
            'Во втором голосе вы слышите интервал не по очереди, а одновременно — созвучием. Это и есть звучание двух голосов.',
            'Терции и сексты звучат мягко и сладко — поэтому второй голос чаще всего идёт ими. Кварта, квинта и октава — «пусто» и прозрачно. Секунды и септимы — резко, их во втором голосе используют для напряжения.',
          ],
          ex: { type: 'ear', task: 'interval', set: [3, 4, 5, 7, 8, 9, 12], harmonic: true },
        },
        {
          id: 's-sing-int',
          title: 'Спой интервал',
          theory: [
            'Программа играет ноту, а вы поёте ноту второго голоса: терцию или сексту вниз, терцию вверх, кварту или квинту вниз. Перед заданием звучит аккорд, чтобы вы слышали тональность.',
            'Продержите нужную ноту чуть меньше секунды — задание засчитано. Если поёте звучащую ноту вместо своей, программа подскажет.',
          ],
          ex: { type: 'sing-interval' },
        },
      ],
    },
    {
      id: 'chords',
      title: 'Аккорды',
      lessons: [
        {
          id: 's-triads',
          title: 'Мажорное и минорное трезвучие',
          theory: [
            'Трезвучие — три звука через терцию: до-ми-соль. Если внизу большая терция, а сверху малая — мажорное (светлое). Если внизу малая, сверху большая — минорное (грустное): ля-до-ми.',
          ],
          ex: { type: 'ear', task: 'triad', set: ['maj', 'min'] },
        },
        {
          id: 's-triads4',
          title: 'Четыре вида трезвучий',
          theory: [
            'Уменьшённое трезвучие — две малые терции (си-ре-фа): напряжённое, тревожное. Увеличенное — две большие (до-ми-соль♯): «волшебное», зависшее.',
          ],
          ex: { type: 'ear', task: 'triad', set: ['maj', 'min', 'dim', 'aug'] },
        },
        {
          id: 's-chordtone',
          title: 'Спой звук аккорда',
          theory: [
            'В ансамбле каждый голос поёт свой звук аккорда. Программа играет трезвучие, а вы поёте его нижний, средний или верхний звук.',
            'Сначала прислушайтесь к аккорду целиком, потом «вытащите» из него нужный звук — как будто ищете один голос в хоре.',
          ],
          ex: { type: 'sing-chord' },
        },
      ],
    },
    {
      id: 'rhythm',
      title: 'Ритм',
      lessons: [
        {
          id: 's-durations',
          title: 'Длительности и такт',
          theory: [
            'Длительности: целая (4 доли), половинная (2), четверть (1), восьмая (половина доли). Точка рядом с нотой добавляет половину её длительности: четверть с точкой — полторы доли.',
            'Такт — группа долей между тактовыми чертами. В размере 4/4 в такте четыре четверти, первая доля — сильная.',
            'Задание: программа отсчитает четыре щелчка, потом хлопайте (нажимайте кнопку или пробел) ритм, который видите, под метроном.',
          ],
          ex: { type: 'tap' },
        },
        {
          id: 's-rdict',
          title: 'Ритмический диктант',
          theory: ['Программа простучит ритм одного такта. Выберите, какая из трёх записей ему соответствует. Считайте доли про себя: «раз-и, два-и, три-и, четыре-и».'],
          ex: { type: 'ear', task: 'rhythm' },
        },
      ],
    },
    {
      id: 'reading',
      title: 'Пение по нотам',
      lessons: [
        {
          id: 's-sight1',
          title: 'Пение с листа: по ступеням',
          theory: [
            'Пение с листа — спеть мелодию по нотам, не слыша её заранее. Нажмите «Дать тон»: прозвучит тоника и первая нота. Потом «Петь» — после отсчёта пойте ноты по порядку, программа отметит каждую.',
            'Мелодии идут поступенно: на соседнюю ноту вверх или вниз. Следите за направлением: нота выше на стане — голос выше.',
          ],
          ex: { type: 'sight', leaps: false },
        },
        {
          id: 's-sight2',
          title: 'Пение с листа: скачки',
          theory: ['Теперь в мелодиях есть скачки по звукам тонического трезвучия (I-III-V). Мысленно держите тонику и слышьте трезвучие — скачки станут проще.'],
          ex: { type: 'sight', leaps: true },
        },
        {
          id: 's-dict',
          title: 'Музыкальный диктант',
          theory: [
            'Программа сыграет тоническое трезвучие, а потом короткую мелодию в до мажоре. Наберите её на клавиатуре. Мелодия начинается с до и движется поступенно.',
            'Слушайте направление (вверх/вниз) и шаги. Можно повторять мелодию сколько угодно раз.',
          ],
          ex: { type: 'dictation' },
        },
      ],
    },
  ];
  const LESSONS = UNITS.flatMap((u) => u.lessons.map((l) => Object.assign({ unit: u }, l)));

  const prog = VG.store.get('vg.solfege.v1', {}) || {};
  const saveProg = () => VG.store.set('vg.solfege.v1', prog);

  const INT_NAMES = {
    1: 'малая секунда',
    2: 'большая секунда',
    3: 'малая терция',
    4: 'большая терция',
    5: 'чистая кварта',
    6: 'тритон',
    7: 'чистая квинта',
    8: 'малая секста',
    9: 'большая секста',
    10: 'малая септима',
    11: 'большая септима',
    12: 'октава',
  };
  const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'I (октавой выше)'];
  const TRIADS = { maj: [0, 4, 7], min: [0, 3, 7], dim: [0, 3, 6], aug: [0, 4, 8] };
  const TRIAD_NAMES = { maj: 'Мажорное', min: 'Минорное', dim: 'Уменьшённое', aug: 'Увеличенное' };

  // ================= Нотный стан =================
  const SHARP_SPELL = [[0, 0], [0, 1], [1, 0], [1, 1], [2, 0], [3, 0], [3, 1], [4, 0], [4, 1], [5, 0], [5, 1], [6, 0]];
  const FLAT_SPELL = [[0, 0], [1, -1], [1, 0], [2, -1], [2, 0], [3, 0], [4, -1], [4, 0], [5, -1], [5, 0], [6, -1], [6, 0]];
  const KEY_SIG = { 0: 0, 7: 1, 2: 2, 9: 3, 4: 4, 11: 5, 6: 6, 5: -1, 10: -2, 3: -3, 8: -4, 1: -5 };
  const SHARP_POS = [38, 35, 39, 36, 33, 37, 34]; // фа до соль ре ля ми си (скрипичный)
  const FLAT_POS = [34, 37, 33, 36, 32, 35, 31];
  const SHARP_ORDER = [3, 0, 4, 1, 5, 2, 6];
  const FLAT_ORDER = [6, 2, 5, 1, 4, 0, 3];
  const SVGNS = 'http://www.w3.org/2000/svg';

  function svgEl(tag, attrs, parent) {
    const e = document.createElementNS(SVGNS, tag);
    for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, v);
    if (parent) parent.appendChild(e);
    return e;
  }

  function keySigCount(key) {
    const majTonic = key.mode === 'minor' ? (key.tonic + 3) % 12 : key.tonic;
    return KEY_SIG[majTonic] || 0;
  }

  /**
   * Рисует нотный стан. notes: [{midi, dur}] (dur в долях; rest: true — пауза).
   * Возвращает { svg, heads: [g элементы нот] }.
   */
  function renderStaff(container, o) {
    const gap = 10;
    const y0 = 34;
    const clef = o.clef || 'treble';
    const key = o.key || M.makeKey(0, 'major');
    const ks = keySigCount(key);
    const flats = ks < 0;
    const spell = flats ? FLAT_SPELL : SHARP_SPELL;
    const bottomD = clef === 'treble' ? 30 : 18;
    const yOf = (d) => y0 + 4 * gap - (d - bottomD) * (gap / 2);
    const keyAcc = {};
    (flats ? FLAT_ORDER : SHARP_ORDER).slice(0, Math.abs(ks)).forEach((l) => (keyAcc[l] = flats ? -1 : 1));
    const barLen = o.barLen || 4;
    let x = 52;
    const notes = o.notes || [];
    const xs = [];
    let beat = 0;
    let width = x + 10 + Math.abs(ks) * 10 + (o.time ? 22 : 0);
    const startX = width;
    for (const n of notes) {
      width += 18 + Math.min(4, n.dur) * 14;
      beat += n.dur;
      if (o.bars !== false && Math.abs(beat % barLen) < 1e-6 && n !== notes[notes.length - 1]) width += 10;
    }
    width = Math.max(o.minWidth || 0, width + 24);
    const height = y0 + 4 * gap + 34;
    const svg = svgEl('svg', { class: 'staff', width, height, viewBox: '0 0 ' + width + ' ' + height, role: 'img', 'aria-label': o.label || 'Нотный стан' });
    for (let i = 0; i < 5; i++) svgEl('line', { class: 'staff-line', x1: 4, x2: width - 4, y1: y0 + i * gap, y2: y0 + i * gap }, svg);
    const c = svgEl('text', { class: 'clef', x: 6, y: clef === 'treble' ? y0 + 3 * gap + 1 : y0 + gap * 1.05, 'font-size': clef === 'treble' ? 44 : 33 }, svg);
    c.textContent = clef === 'treble' ? '𝄞' : '𝄢';
    // ключевые знаки
    const posList = (flats ? FLAT_POS : SHARP_POS).map((d) => (clef === 'bass' ? d - 14 : d));
    for (let i = 0; i < Math.abs(ks); i++) {
      const t = svgEl('text', { class: 'acc', x: x + i * 10, y: yOf(posList[i]) + 5, 'font-size': 18 }, svg);
      t.textContent = flats ? '♭' : '♯';
    }
    x = startX - (o.time ? 22 : 0);
    if (o.time) {
      for (const [i, v] of [o.time[0], o.time[1]].entries()) {
        const t = svgEl('text', { x: x + 4, y: y0 + gap * (i ? 4 : 2) - 2, 'font-size': 19, 'font-weight': 700, fill: 'currentColor', style: 'font-family: var(--font-body)' }, svg);
        t.textContent = String(v);
      }
    }
    x = startX + 8;
    beat = 0;
    const heads = [];
    const midLine = bottomD + 4;
    for (let idx = 0; idx < notes.length; idx++) {
      const n = notes[idx];
      const g = svgEl('g', { class: 'note' }, svg);
      heads.push(g);
      if (n.rest) {
        const r = svgEl('text', { class: 'clef', x: x, y: y0 + 2.6 * gap, 'font-size': 30 }, g);
        r.textContent = n.dur >= 2 ? '𝄼' : n.dur >= 1 ? '𝄽' : '𝄾';
      } else {
        const pc = M.mod(n.midi, 12);
        const [letter, acc] = spell[pc];
        const oct = Math.floor(n.midi / 12) - 1;
        const d = oct * 7 + letter;
        const y = yOf(d);
        // добавочные линейки
        for (let ld = bottomD - 2; ld >= d; ld -= 2) svgEl('line', { class: 'staff-line', x1: x - 9, x2: x + 9, y1: yOf(ld), y2: yOf(ld) }, g);
        for (let ld = bottomD + 10; ld <= d; ld += 2) svgEl('line', { class: 'staff-line', x1: x - 9, x2: x + 9, y1: yOf(ld), y2: yOf(ld) }, g);
        const need = acc !== (keyAcc[letter] || 0);
        if (need) {
          const t = svgEl('text', { class: 'acc', x: x - 20, y: y + 5, 'font-size': 17 }, g);
          t.textContent = acc === 1 ? '♯' : acc === -1 ? '♭' : '♮';
        }
        const hollow = n.dur >= 2;
        svgEl('ellipse', { cx: x, cy: y, rx: 6.4, ry: 4.5, transform: 'rotate(-20 ' + x + ' ' + y + ')', 'stroke-width': hollow ? 2 : 1, fill: hollow ? 'none' : 'currentColor', class: 'head' }, g);
        if (n.dur < 4) {
          const up = d < midLine;
          const sx = up ? x + 5.8 : x - 5.8;
          const sy2 = up ? y - 34 : y + 34;
          svgEl('line', { x1: sx, x2: sx, y1: y, y2: sy2, 'stroke-width': 1.4 }, g);
          if (n.dur === 0.5 || n.dur === 0.75) {
            svgEl('path', { d: up ? `M${sx} ${sy2} q 2 8 9 12 q -3 -6 -9 -6` : `M${sx} ${sy2} q 2 -8 9 -12 q -3 6 -9 6`, 'stroke-width': 1, fill: 'currentColor' }, g);
          }
        }
        if ([3, 1.5, 0.75].includes(n.dur)) svgEl('circle', { cx: x + 11, cy: d % 2 === bottomD % 2 ? y - 3 : y, r: 1.8 }, g);
      }
      x += 18 + Math.min(4, n.dur) * 14;
      beat += n.dur;
      if (o.bars !== false && Math.abs(beat % barLen) < 1e-6) {
        svgEl('line', { class: 'staff-line', x1: x - 8, x2: x - 8, y1: y0, y2: y0 + 4 * gap }, svg);
        x += 10;
      }
      xs.push(x);
    }
    container.appendChild(svg);
    return { svg, heads };
  }

  // ================= Общий ход урока =================
  const S = { lesson: LESSONS[0], quiz: null, readout: null, piano: null, sing: null, session: null, timers: [] };
  const later = (fn, ms) => S.timers.push(setTimeout(fn, ms));
  const clearTimers = () => {
    S.timers.forEach(clearTimeout);
    S.timers = [];
  };

  function renderMap() {
    const nav = $('sol-map');
    nav.textContent = '';
    const sel = el('select', 'lesson-select');
    sel.id = 'sol-select';
    sel.setAttribute('aria-label', 'Урок');
    for (const u of UNITS) {
      nav.appendChild(el('p', 'nav-cap', u.title));
      const box = el('div', 'sol-unit');
      const og = document.createElement('optgroup');
      og.label = u.title;
      for (const l of u.lessons) {
        const p = prog[l.id];
        const b = el('button', 'evt-link' + (p && p.done ? ' is-done' : ''));
        b.type = 'button';
        const t = el('span', 'sol-lesson');
        t.appendChild(el('span', null, l.title));
        b.appendChild(t);
        if (p && p.best != null) b.appendChild(el('span', 'sol-score', p.best + '%'));
        else b.appendChild(el('span', 'done-dot'));
        b.setAttribute('aria-current', String(l.id === S.lesson.id));
        b.addEventListener('click', () => openLesson(l.id));
        box.appendChild(b);
        const o = el('option', null, (p && p.done ? '✓ ' : '') + l.title);
        o.value = l.id;
        og.appendChild(o);
      }
      nav.appendChild(box);
      sel.appendChild(og);
    }
    sel.value = S.lesson.id;
    sel.addEventListener('change', () => openLesson(sel.value));
    nav.prepend(sel);
  }

  function stopAll() {
    clearTimers();
    engine.stopOneShots();
    if (S.session) S.session.stop();
    S.session = null;
    S.sing = null;
    if (S.tap) S.tap.run && S.tap.run.stop();
    S.tap = null;
  }

  function openLesson(id) {
    stopAll();
    const l = LESSONS.find((x) => x.id === id) || LESSONS[0];
    S.lesson = l;
    S.quiz = null;
    const main = $('sol-main');
    main.textContent = '';
    const head = el('header', 'lesson-head');
    head.appendChild(el('p', 'lesson-kicker', l.unit.title));
    head.appendChild(el('h2', null, l.title));
    main.appendChild(head);
    const th = el('section', 'panel lesson-section');
    th.appendChild(el('h3', null, 'Теория'));
    const body = el('div', 'lesson-body');
    for (const p of l.theory) body.appendChild(el('p', null, p));
    th.appendChild(body);
    main.appendChild(th);
    const ex = el('section', 'panel quiz');
    ex.id = 'quiz';
    main.appendChild(ex);
    const p = prog[l.id];
    const intro = el('div', 'lesson-foot');
    intro.appendChild(VG.button('Начать задание', 'btn-primary', startQuiz));
    if (p && p.best != null) intro.appendChild(el('span', 'muted', 'Лучший результат: ' + p.best + ' %' + (p.done ? ' · урок пройден' : '')));
    ex.appendChild(el('h3', null, 'Задание'));
    ex.appendChild(el('p', 'lesson-body', exerciseIntro(l.ex)));
    ex.appendChild(intro);
    renderMap();
    if (VG.current === 'solfege') window.scrollTo(0, 0);
  }

  function exerciseIntro(ex) {
    return {
      'piano-find': '10 вопросов: найдите на клавиатуре названную ноту.',
      'staff-read': '10 вопросов: назовите ноту, которую видите на стане.',
      'sing-degree': '10 вопросов: спойте названную ступень. Нужен микрофон; без него можно проверять себя по подсказке.',
      'sing-interval': '10 вопросов: спойте ноту второго голоса от звучащей ноты.',
      'sing-chord': '10 вопросов: спойте названный звук аккорда.',
      ear: '10 вопросов: послушайте и выберите ответ. Звук можно повторять.',
      tap: '5 ритмов: простучите каждый под метроном.',
      sight: '5 мелодий: спойте каждую по нотам.',
      dictation: '6 мелодий: наберите услышанное на клавиатуре.',
    }[ex.type];
  }

  function startQuiz() {
    stopAll();
    VG.audio();
    const l = S.lesson;
    const total = { tap: 5, sight: 5, dictation: 6 }[l.ex.type] || 10;
    S.quiz = { total, i: 0, results: [], startedAt: Date.now(), last: null };
    const box = $('quiz');
    box.textContent = '';
    const top = el('div', 'quiz-top');
    const dots = el('div', 'quiz-dots');
    for (let i = 0; i < total; i++) dots.appendChild(el('i'));
    top.appendChild(dots);
    const counter = el('span', 'muted num');
    top.appendChild(counter);
    box.appendChild(top);
    const q = el('p', 'quiz-q');
    box.appendChild(q);
    const stage = el('div', 'quiz-stage');
    stage.style.display = 'flex';
    stage.style.flexDirection = 'column';
    stage.style.gap = '12px';
    box.appendChild(stage);
    const fb = el('p', 'quiz-feedback');
    fb.setAttribute('aria-live', 'polite');
    box.appendChild(fb);
    const controls = el('div', 'transport');
    controls.style.marginTop = '0';
    box.appendChild(controls);
    const notice = el('p', 'notice mic-notice');
    notice.hidden = true;
    box.appendChild(notice);
    S.ui = { box, dots, counter, q, stage, fb, controls };
    nextQuestion();
  }

  function updateDots() {
    const Q = S.quiz;
    [...S.ui.dots.children].forEach((d, i) => {
      d.className = Q.results[i] === true ? 'is-ok' : Q.results[i] === false ? 'is-bad' : i === Q.i ? 'is-now' : '';
    });
    S.ui.counter.textContent = Math.min(Q.i + 1, Q.total) + ' / ' + Q.total;
  }

  function nextQuestion() {
    clearTimers();
    const Q = S.quiz;
    if (Q.i >= Q.total) return finishQuiz();
    updateDots();
    S.ui.stage.textContent = '';
    S.ui.controls.textContent = '';
    S.ui.fb.textContent = '';
    S.ui.fb.className = 'quiz-feedback';
    S.sing = null;
    const t = S.lesson.ex.type;
    ({ 'piano-find': qPianoFind, 'staff-read': qStaffRead, 'sing-degree': qSingDegree, 'sing-interval': qSingInterval, 'sing-chord': qSingChord, ear: qEar, tap: qTap, sight: qSight, dictation: qDictation })[t](S.lesson.ex);
  }

  function answer(ok, text) {
    const Q = S.quiz;
    if (!Q || Q.results.length > Q.i) return;
    Q.results.push(!!ok);
    S.ui.fb.textContent = text || (ok ? 'Верно!' : 'Неверно.');
    S.ui.fb.className = 'quiz-feedback ' + (ok ? 'is-ok' : 'is-bad');
    Q.i++;
    updateDots();
    S.ui.controls.appendChild(VG.button(Q.i >= Q.total ? 'Итог' : 'Дальше', 'btn-primary', nextQuestion));
    if (ok) later(nextQuestion, 1500);
  }

  function finishQuiz() {
    stopAll();
    const Q = S.quiz;
    const l = S.lesson;
    const right = Q.results.filter(Boolean).length;
    const pct = Math.round((right / Q.total) * 100);
    const p = prog[l.id] || {};
    const passed = pct >= 80;
    p.best = Math.max(p.best || 0, pct);
    if (passed) p.done = true;
    prog[l.id] = p;
    saveProg();
    VG.journal.add({ kind: 'solfege', title: l.title, score: pct, sec: Math.round((Date.now() - Q.startedAt) / 1000) });
    const box = S.ui.box;
    box.textContent = '';
    const card = el('div', 'quiz-done');
    const sc = el('div', 'res-score');
    sc.appendChild(el('span', 'res-num', String(pct)));
    sc.appendChild(el('span', 'res-pct', '%'));
    card.appendChild(sc);
    card.appendChild(el('h3', 'res-title', passed ? 'Урок пройден' : 'Почти! Нужно 80 %'));
    card.appendChild(el('p', null, 'Верно: ' + right + ' из ' + Q.total + '. ' + (passed ? 'Можно идти дальше, а через несколько дней вернуться и повторить.' : 'Перечитайте теорию и попробуйте ещё раз — с каждым разом проще.')));
    const foot = el('div', 'lesson-foot');
    foot.appendChild(VG.button('Ещё раз', passed ? '' : 'btn-primary', startQuiz));
    const idx = LESSONS.indexOf(l);
    if (idx < LESSONS.length - 1) foot.appendChild(VG.button('Следующий урок: ' + LESSONS[idx + 1].title, passed ? 'btn-primary' : 'btn-ghost', () => openLesson(LESSONS[idx + 1].id)));
    card.appendChild(foot);
    box.appendChild(card);
    renderMap();
  }

  const nameOf = (midi, key, octave) => VG.nn(midi, { key, octave: octave !== false });

  // ---------- Найди ноту ----------
  function qPianoFind(ex) {
    const black = [1, 3, 6, 8, 10];
    let pc;
    let label;
    if (ex.naturals) {
      pc = VG.pick([0, 2, 4, 5, 7, 9, 11]);
      label = M.noteName(pc, { style: VG.settings.names, octave: false });
    } else {
      pc = VG.pick(black.concat([VG.pick([0, 2, 4, 5, 7, 9, 11])]));
      const flat = Math.random() < 0.5;
      label = M.noteName(pc, { style: VG.settings.names, flats: flat, octave: false });
    }
    S.ui.q.textContent = 'Найдите ноту «' + label + '»';
    const box = el('div');
    S.ui.stage.appendChild(box);
    let done = false;
    const piano = new VG.Piano(box, {
      lo: 60,
      hi: 83,
      onPress: (m) => {
        if (done) return;
        done = true;
        const ok = M.mod(m, 12) === pc;
        piano.mark(m, ok ? 'is-ok' : 'is-bad');
        if (!ok) for (let k = 60; k <= 83; k++) if (M.mod(k, 12) === pc) piano.mark(k, 'is-hint');
        answer(ok, ok ? 'Верно!' : 'Это ' + nameOf(m, null, false) + '. Нужная нота подсвечена.');
      },
    });
  }

  // ---------- Назови ноту на стане ----------
  function qStaffRead(ex) {
    const naturals = [];
    for (let m = ex.lo; m <= ex.hi; m++) if ([0, 2, 4, 5, 7, 9, 11].includes(M.mod(m, 12))) naturals.push(m);
    let m = VG.pick(naturals);
    if (S.quiz.last === m) m = VG.pick(naturals);
    S.quiz.last = m;
    S.ui.q.textContent = 'Какая это нота?';
    const box = el('div', 'staff-box');
    S.ui.stage.appendChild(box);
    renderStaff(box, { clef: ex.clef, notes: [{ midi: m, dur: 4 }], bars: false, minWidth: 160, label: 'Нота на стане' });
    const ans = el('div', 'answers');
    for (const pc of [0, 2, 4, 5, 7, 9, 11]) {
      const b = VG.button(M.noteName(pc, { style: VG.settings.names, octave: false }), '', () => {
        if (S.quiz.results.length > S.quiz.i) return;
        const ok = M.mod(m, 12) === pc;
        b.classList.add(ok ? 'is-ok' : 'is-bad');
        engine.playNotes(m, 0.8, { timbre: 'piano', bus: 'piano' });
        answer(ok, ok ? 'Верно: ' + nameOf(m) + '.' : 'Это ' + nameOf(m) + '.');
      });
      ans.appendChild(b);
    }
    S.ui.stage.appendChild(ans);
  }

  // ---------- Пение: общая часть ----------
  function comfortTonic() {
    const c = VG.comfort();
    const hi = Math.max(c.lo, c.hi - 12);
    const tonics = [];
    for (let t = c.lo; t <= hi; t++) if ([0, 2, 5, 7, 10, 3, 9].includes(M.mod(t, 12))) tonics.push(t);
    return tonics.length ? VG.pick(tonics) : c.lo;
  }

  /** Задание «спойте ноту»: контекст звучит, потом слушаем микрофон. */
  function singTask(o) {
    S.ui.q.textContent = o.prompt;
    if (o.sub) S.ui.stage.appendChild(el('p', 'muted', o.sub));
    const slot = el('div');
    S.ui.stage.appendChild(slot);
    S.readout = new VG.Readout(slot, { target: 'Спойте' });
    S.readout.box.style.maxWidth = '420px';
    const hold = el('div', 'iv-hold');
    hold.style.cssText = 'height:10px;border-radius:5px;background:var(--surface-2);overflow:hidden;max-width:420px';
    const bar = el('div');
    bar.style.cssText = 'height:100%;width:0;background:var(--good)';
    hold.appendChild(bar);
    S.ui.stage.appendChild(hold);
    S.sing = { target: o.target, ref: o.ref, key: o.key, hold: 0, bar, hidden: o.hidden, hinted: false, done: false };
    const play = () => {
      engine.stopOneShots();
      o.context();
    };
    S.ui.controls.append(
      VG.micButton(),
      VG.button('Ещё раз', '', play),
      VG.button('Подсказка', '', () => {
        S.sing.hinted = true;
        engine.stopOneShots();
        engine.playNotes(o.target, 1.3, { timbre: 'harmony' });
      }),
    );
    if (!VG.mic.on) {
      S.ui.controls.append(
        VG.button('Получилось', 'btn-ghost', () => singDone(true, true)),
        VG.button('Не получилось', 'btn-ghost', () => singDone(false, true)),
      );
      S.ui.fb.textContent = 'Без микрофона: спойте, нажмите «Подсказка», сравните и ответьте честно.';
    } else {
      S.ui.controls.append(VG.button('Пропустить', 'btn-ghost', () => singDone(false)));
    }
    VG.updateMicUI();
    play();
  }

  function singDone(ok, self) {
    const s = S.sing;
    if (!s || s.done) return;
    s.done = true;
    if (ok && !self) {
      engine.stopOneShots();
      engine.playNotes(s.ref != null ? [s.ref, s.target] : s.target, 1.2, { timbre: 'harmony' });
    }
    answer(ok, ok ? 'Есть! Это ' + nameOf(s.target, s.key) + '.' : 'Нужная нота — ' + nameOf(s.target, s.key) + '. Послушайте подсказку и попробуйте в следующем задании.');
  }

  function singFrame(f, dt) {
    const s = S.sing;
    if (!s || !S.readout) return;
    const midi = f ? f.midi : null;
    const range = { lo: s.target - 7, hi: s.target + 7 };
    const cls = VG.classify(midi, s.target, s.ref, range);
    let hint;
    if (s.done) hint = '';
    else if (!VG.mic.on) hint = 'Включите микрофон или проверяйте себя подсказкой.';
    else if (midi == null) hint = 'Спойте ноту.';
    else if (cls.status === 'ok') hint = 'Держите…';
    else if (cls.status === 'mel') hint = 'Это звучащая нота. Нужна другая, ' + (s.target < s.ref ? 'ниже' : 'выше') + '.';
    else hint = cls.cents > 0 ? 'Выше, чем нужно.' : 'Ниже, чем нужно.';
    S.readout.update({ tgt: s.hidden && !s.hinted && !s.done ? null : s.target, emptyTarget: '?', midi, cls, key: s.key, hint });
    if (s.done || !VG.mic.on) return;
    if (cls && cls.status === 'ok') s.hold += dt;
    else s.hold = Math.max(0, s.hold - dt * 1.5);
    s.bar.style.width = Math.min(100, (s.hold / 0.7) * 100) + '%';
    if (s.hold >= 0.7) singDone(true);
  }

  // ---------- Спой ступень ----------
  function qSingDegree(ex) {
    const tonic = comfortTonic();
    const key = M.makeKey(tonic, 'major');
    let deg = VG.pick(ex.degrees);
    if (S.quiz.last === deg && ex.degrees.length > 1) deg = VG.pick(ex.degrees.filter((d) => d !== deg));
    S.quiz.last = deg;
    const target = M.degreeToMidi(M.midiToDegree(tonic, key).deg + deg, key);
    singTask({
      prompt: 'Спойте ' + ROMAN[deg] + ' ступень',
      sub: 'Тональность: ' + VG.keyName(key) + '. Тоника — ' + nameOf(tonic, key) + '.',
      target,
      ref: null,
      key,
      hidden: true,
      context: () => {
        engine.playNotes([tonic, tonic + 4, tonic + 7], 1, { timbre: 'piano', bus: 'piano' });
        engine.playNotes(tonic, 1.2, { timbre: 'piano', bus: 'piano', delay: 1.1 });
      },
    });
  }

  // ---------- Спой интервал ----------
  const SING_INT = [
    [-2, 'терцию вниз'],
    [2, 'терцию вверх'],
    [-5, 'сексту вниз'],
    [-3, 'кварту вниз'],
    [-4, 'квинту вниз'],
  ];
  function qSingInterval() {
    const c = VG.comfort();
    const [steps, label] = VG.pick(SING_INT);
    const key = M.makeKey(VG.pick([0, 2, 3, 5, 7, 8, 10]), 'major');
    const cands = [];
    for (let m = c.lo; m <= c.hi; m++) {
      if (!M.inKey(m, key)) continue;
      const t = M.shiftDiatonic(m, key, steps);
      if (t < c.lo || t > c.hi || Math.abs(t - m) % 12 === 6) continue;
      cands.push([m, t]);
    }
    const [ref, target] = cands.length ? VG.pick(cands) : [c.lo + 4, c.lo];
    const root = ref - M.mod(ref - key.tonic, 12);
    singTask({
      prompt: 'Спойте ' + label + ' от звучащей ноты',
      sub: 'Звучит ' + nameOf(ref, key) + ' в тональности ' + VG.keyName(key) + '. Это будет ' + INT_NAMES[Math.abs(target - ref)] + '.',
      target,
      ref,
      key,
      hidden: true,
      context: () => {
        engine.playNotes([root, root + 4, root + 7], 0.9, { timbre: 'piano', bus: 'piano' });
        engine.playNotes(ref, 2.6, { timbre: 'melody', delay: 1.05 });
      },
    });
  }

  // ---------- Спой звук аккорда ----------
  function qSingChord() {
    const c = VG.comfort();
    const type = VG.pick(['maj', 'min']);
    const root = clamp(Math.round(c.lo + Math.random() * Math.max(1, c.hi - c.lo - 8)), c.lo, c.hi - 7);
    const chord = TRIADS[type].map((x) => root + x);
    const which = VG.pick([0, 1, 2]);
    const target = chord[which];
    singTask({
      prompt: 'Спойте ' + ['нижний', 'средний', 'верхний'][which] + ' звук аккорда',
      sub: TRIAD_NAMES[type] + ' трезвучие. Аккорд звучит долго — найдите в нём свой звук.',
      target,
      ref: null,
      key: M.makeKey(root, type === 'min' ? 'minor' : 'major'),
      hidden: true,
      context: () => engine.playNotes(chord, 3, { timbre: 'piano', bus: 'piano' }),
    });
  }

  // ---------- На слух ----------
  const RHYTHMS = [
    [1, 1, 1, 1],
    [2, 1, 1],
    [1, 1, 2],
    [2, 2],
    [1, 0.5, 0.5, 1, 1],
    [0.5, 0.5, 1, 0.5, 0.5, 1],
    [1.5, 0.5, 1, 1],
    [1, 1, 0.5, 0.5, 1],
    [3, 1],
    [1, 2, 1],
    [0.5, 0.5, 0.5, 0.5, 1, 1],
    [1, 1.5, 0.5, 1],
  ];

  function playRhythm(pattern, bpm) {
    const ctx = VG.audio();
    const run = engine.startRun();
    const spb = 60 / bpm;
    const t0 = ctx.currentTime + 0.2;
    for (let i = 0; i < 4; i++) run.click(t0 + i * spb, i === 0);
    let b = 0;
    for (const d of pattern) {
      run.note('piano', 72, t0 + (4 + b) * spb, Math.min(d, 0.9) * spb, 'piano');
      b += d;
    }
    engine._keep(run, 10 * spb);
    return run;
  }

  function qEar(ex) {
    let options;
    let correct;
    let play;
    let prompt;
    const c = VG.comfort();
    const base = clamp(c.lo + 3 + Math.floor(Math.random() * 6), 52, 67);
    if (ex.task === 'mode') {
      const mode = VG.pick(['major', 'minor']);
      const sc = M.SCALES[mode];
      prompt = 'Мажор или минор?';
      options = [
        ['major', 'Мажор'],
        ['minor', 'Минор'],
      ];
      correct = mode;
      play = () => {
        const run = engine.startRun();
        const t = engine.now + 0.05;
        [0, 1, 2, 3, 4].forEach((d, i) => run.note('piano', base + sc[d], t + i * 0.32, 0.3, 'piano'));
        run.chord('piano', [base, base + sc[2], base + sc[4]], t + 1.7, 1.4);
        engine._keep(run, 3.5);
      };
    } else if (ex.task === 'interval') {
      let semis = VG.pick(ex.set);
      if (S.quiz.last === semis && ex.set.length > 1) semis = VG.pick(ex.set.filter((x) => x !== semis));
      S.quiz.last = semis;
      prompt = ex.harmonic ? 'Какой интервал звучит созвучием?' : 'Какой это интервал?';
      options = ex.set.map((s) => [s, INT_NAMES[s]]);
      correct = semis;
      play = () => {
        if (ex.harmonic) engine.playNotes([base, base + semis], 1.6, { timbre: 'piano', bus: 'piano' });
        else engine.playNotes([base, base + semis], 0.9, { timbre: 'piano', bus: 'piano', stagger: 0.75 });
      };
    } else if (ex.task === 'triad') {
      const type = VG.pick(ex.set);
      prompt = 'Какое это трезвучие?';
      options = ex.set.map((s) => [s, TRIAD_NAMES[s]]);
      correct = type;
      const ch = TRIADS[type].map((x) => base + x);
      play = () => {
        engine.playNotes(ch, 1.3, { timbre: 'piano', bus: 'piano' });
        engine.playNotes(ch, 0.5, { timbre: 'piano', bus: 'piano', delay: 1.5, stagger: 0.4 });
      };
    } else {
      const picks = VG.shuffle(RHYTHMS).slice(0, 3);
      const k = Math.floor(Math.random() * 3);
      prompt = 'Какой ритм прозвучал?';
      correct = k;
      options = picks.map((p, i) => [i, p]);
      play = () => playRhythm(picks[k], 84);
    }
    S.ui.q.textContent = prompt;
    const ans = el('div', 'answers');
    if (ex.task === 'rhythm') ans.style.gridTemplateColumns = 'repeat(auto-fill, minmax(220px, 1fr))';
    for (const [val, label] of options) {
      const b = VG.button(typeof label === 'string' ? label : '', '', () => {
        if (S.quiz.results.length > S.quiz.i) return;
        const ok = val === correct;
        b.classList.add(ok ? 'is-ok' : 'is-bad');
        if (!ok) {
          const right = [...ans.children][options.findIndex((o) => o[0] === correct)];
          if (right) right.classList.add('is-ok');
        }
        answer(ok);
      });
      if (typeof label !== 'string') {
        b.style.color = 'var(--ink)';
        b.style.minHeight = '96px';
        renderStaff(b, { clef: 'treble', notes: label.map((d) => ({ midi: 71, dur: d })), bars: false, label: 'Ритм' });
      }
      ans.appendChild(b);
    }
    S.ui.stage.appendChild(ans);
    S.ui.controls.appendChild(VG.button('Послушать ещё раз', '', () => {
      engine.stopOneShots();
      play();
    }));
    play();
  }

  // ---------- Простучи ритм ----------
  function qTap() {
    const pattern = VG.pick(RHYTHMS.slice(0, 9));
    S.ui.q.textContent = 'Простучите ритм под метроном';
    const box = el('div', 'staff-box');
    S.ui.stage.appendChild(box);
    renderStaff(box, { clef: 'treble', notes: pattern.map((d) => ({ midi: 71, dur: d })), time: [4, 4], label: 'Ритм для хлопков' });
    const pad = VG.button('Хлопок (или пробел)', 'rhythm-pad');
    pad.disabled = true;
    S.ui.stage.appendChild(pad);
    const bpm = 76;
    const spb = 60 / bpm;
    const startTap = () => {
      engine.stopOneShots();
      const ctx = VG.audio();
      const run = engine.startRun();
      const t0 = ctx.currentTime + 0.3 + 4 * spb;
      for (let i = -4; i < 4; i++) run.click(t0 + i * spb, i % 4 === 0);
      const expected = [];
      let b = 0;
      for (const d of pattern) {
        expected.push(t0 + b * spb);
        b += d;
      }
      S.tap = { run, t0, expected, taps: [], end: t0 + 4 * spb + 0.3 };
      pad.disabled = false;
      pad.focus();
      S.ui.fb.textContent = 'Слушайте отсчёт: раз, два, три, четыре — и хлопайте.';
      later(() => judgeTap(), (S.tap.end - ctx.currentTime) * 1000 + 100);
    };
    const tapNow = () => {
      if (!S.tap) return;
      S.tap.taps.push(engine.now - engine.latency());
    };
    pad.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      tapNow();
    });
    S.tapKey = (e) => {
      if (e.code === 'Space' && S.tap) {
        e.preventDefault();
        if (!e.repeat) tapNow();
      }
    };
    S.ui.controls.append(VG.button('Начать', 'btn-primary', startTap), VG.button('Послушать, как надо', '', () => playRhythm(pattern, bpm)));
    const judgeTap = () => {
      const t = S.tap;
      if (!t) return;
      pad.disabled = true;
      const used = new Set();
      let hits = 0;
      for (const e of t.expected) {
        let best = -1;
        let bd = 0.16;
        t.taps.forEach((x, i) => {
          if (!used.has(i) && Math.abs(x - e) < bd) {
            bd = Math.abs(x - e);
            best = i;
          }
        });
        if (best >= 0) {
          used.add(best);
          hits++;
        }
      }
      const extra = t.taps.length - used.size;
      const ok = hits === t.expected.length && extra <= 1;
      S.tap = null;
      answer(ok, ok ? 'Ровно в ритм!' : 'Попаданий: ' + hits + ' из ' + t.expected.length + (extra > 1 ? ', лишних хлопков: ' + extra : '') + '. Послушайте, как надо.');
    };
  }

  // ---------- Пение с листа ----------
  function makeMelody(leaps) {
    const c = VG.comfort();
    const tonic = comfortTonic();
    const key = M.makeKey(tonic, 'major');
    const d0 = M.midiToDegree(tonic, key).deg;
    const degs = [VG.pick([0, 2, 4])];
    for (let i = 1; i < 5; i++) {
      const prev = degs[i - 1];
      let next;
      for (let tries = 0; tries < 20; tries++) {
        next = leaps && Math.random() < 0.45 ? VG.pick([0, 2, 4, 7]) : prev + VG.pick([-1, 1]);
        if (next !== prev && next >= -1 && next <= 8 && Math.abs(next - prev) <= 4) break;
      }
      degs.push(next);
    }
    degs.push(Math.abs(degs[4] - 7) < Math.abs(degs[4]) ? 7 : 0);
    const notes = degs.map((d, i) => ({ midi: M.degreeToMidi(d0 + d, key), start: i, dur: i === degs.length - 1 ? 2 : 1 }));
    if (notes.some((n) => n.midi < c.lo - 2 || n.midi > c.hi + 2)) return makeMelody(leaps);
    return { key, tonic, notes };
  }

  function qSight(ex) {
    const mel = makeMelody(ex.leaps);
    S.ui.q.textContent = 'Спойте мелодию по нотам';
    S.ui.stage.appendChild(el('p', 'muted', 'Тональность: ' + VG.keyName(mel.key) + '. Слог любой, например «ла».'));
    const box = el('div', 'staff-box');
    S.ui.stage.appendChild(box);
    const low = VG.comfort().lo < 52;
    const staff = renderStaff(box, { clef: low ? 'bass' : 'treble', key: mel.key, notes: mel.notes, time: [4, 4], label: 'Мелодия для пения с листа' });
    const slot = el('div');
    S.ui.stage.appendChild(slot);
    S.readout = new VG.Readout(slot);
    S.readout.box.style.maxWidth = '420px';
    const spb = 60 / 72;
    const tone = () => {
      engine.stopOneShots();
      const t = mel.tonic;
      engine.playNotes([t, t + 4, t + 7], 1, { timbre: 'piano', bus: 'piano' });
      engine.playNotes(mel.notes[0].midi, 1, { timbre: 'piano', bus: 'piano', delay: 1.1 });
    };
    const sing = () => {
      engine.stopOneShots();
      if (S.session) S.session.stop();
      const events = [];
      for (let b = -4; b < 0; b++) events.push({ type: 'click', beat: b, accent: b === -4 });
      const s = new VG.Session({ start: 0, end: 7, spb, countBeats: 4, pulse: 1, events, target: mel.notes, guide: null, range: { lo: mel.tonic - 5, hi: mel.tonic + 14 } });
      S.session = s.begin();
      S.sightStaff = staff;
      S.sightKey = mel.key;
      S.ui.fb.textContent = 'Отсчёт четыре щелчка — и пойте.';
    };
    S.ui.controls.append(
      VG.button('Дать тон', '', tone),
      VG.button('Петь', 'btn-primary', sing),
      VG.micButton(),
      VG.button('Послушать, как надо', 'btn-ghost', () => {
        engine.stopOneShots();
        const run = engine.startRun();
        const t0 = engine.now + 0.1;
        for (const n of mel.notes) run.note('piano', n.midi, t0 + n.start * spb, n.dur * spb, 'piano');
        engine._keep(run, 8 * spb);
      }),
    );
    if (!VG.mic.on) {
      S.ui.controls.append(VG.button('Получилось', 'btn-ghost', () => answer(true)), VG.button('Не получилось', 'btn-ghost', () => answer(false)));
      S.ui.fb.textContent = 'Без микрофона: спойте, потом «Послушать, как надо» и ответьте честно.';
    }
    VG.updateMicUI();
    tone();
  }

  function sightFrame(f) {
    const s = S.session;
    if (!s) return;
    const info = s.update(f);
    const midi = f ? f.midi : null;
    const cur = VG.noteAt(s.target, s.pos);
    S.sightStaff.heads.forEach((g, i) => {
      const st = s.stats[i];
      const done = st && st.frames >= 4 && s.pos > s.target[i].start + s.target[i].dur;
      g.classList.toggle('is-now', i === cur);
      g.classList.toggle('is-ok', !!done && st.ok / st.frames >= 0.6);
      g.classList.toggle('is-bad', !!done && st.ok / st.frames < 0.6);
    });
    S.readout.update({ tgt: info.tgt, midi, cls: info.cls, key: S.sightKey, hint: VG.hintText({ countdown: info.countdown, playing: true, midi, tgt: info.tgt, cls: info.cls }) });
    if (s.ended) {
      s.stop();
      S.session = null;
      const sc = s.micUsed ? s.score() : null;
      if (sc) answer(sc.pct >= 70, 'Точность ' + sc.pct + ' %. ' + (sc.pct >= 70 ? 'Хорошо!' : 'Нужно 70 %. Послушайте, как надо, и попробуйте следующую.'));
      else S.ui.fb.textContent = 'Микрофон выключен — оценить не получилось. Ответьте сами: получилось или нет.';
    }
  }

  // ---------- Диктант ----------
  function qDictation() {
    const len = 4 + Math.floor(Math.random() * 2);
    const degs = [0];
    while (degs.length < len) {
      const p = degs[degs.length - 1];
      const n = p + VG.pick([-1, 1, 1]);
      if (n >= 0 && n <= 7) degs.push(n);
    }
    const key = M.makeKey(0, 'major');
    const d0 = M.midiToDegree(60, key).deg;
    const notes = degs.map((d) => M.degreeToMidi(d0 + d, key));
    S.ui.q.textContent = 'Наберите мелодию на клавиатуре';
    S.ui.stage.appendChild(el('p', 'muted', 'До мажор, ' + len + ' ' + VG.plural(len, 'нота', 'ноты', 'нот') + ', первая — до.'));
    const staffBox = el('div', 'staff-box');
    S.ui.stage.appendChild(staffBox);
    const entered = [];
    const redraw = () => {
      staffBox.textContent = '';
      renderStaff(staffBox, { clef: 'treble', notes: entered.map((m) => ({ midi: m, dur: 1 })), bars: false, minWidth: 260, label: 'Ваши ноты' });
    };
    redraw();
    const pbox = el('div');
    S.ui.stage.appendChild(pbox);
    const piano = new VG.Piano(pbox, {
      lo: 60,
      hi: 74,
      onPress: (m) => {
        if (entered.length < len && S.quiz.results.length <= S.quiz.i) {
          entered.push(m);
          redraw();
        }
      },
    });
    const play = () => {
      engine.stopOneShots();
      engine.playNotes([60, 64, 67], 0.9, { timbre: 'piano', bus: 'piano' });
      const run = engine.startRun();
      const t0 = engine.now + 1.2;
      notes.forEach((m, i) => run.note('piano', m, t0 + i * 0.6, 0.55, 'piano'));
      engine._keep(run, 1.2 + notes.length * 0.6);
    };
    S.ui.controls.append(
      VG.button('Послушать ещё раз', '', play),
      VG.button('Стереть ноту', 'btn-ghost', () => {
        entered.pop();
        redraw();
      }),
      VG.button('Проверить', 'btn-primary', () => {
        if (S.quiz.results.length > S.quiz.i) return;
        const ok = entered.length === notes.length && entered.every((m, i) => M.mod(m, 12) === M.mod(notes[i], 12));
        for (const m of notes) piano.mark(m, 'is-hint');
        answer(ok, ok ? 'Верно!' : 'Правильно: ' + notes.map((m) => nameOf(m, key, false)).join(' — ') + '.');
      }),
    );
    play();
  }

  // ================= Регистрация =================
  VG.register('solfege', {
    init() {
      renderMap();
      openLesson(LESSONS[0].id);
      document.addEventListener('keydown', (e) => {
        if (VG.current === 'solfege' && S.tapKey) S.tapKey(e);
      });
    },
    enter(params) {
      if (params && params.id) openLesson(params.id);
    },
    leave: stopAll,
    frame(f, dt) {
      if (S.sing) singFrame(f, dt);
      else if (S.session) sightFrame(f);
    },
    next(canSing) {
      const l = LESSONS.find((x) => !(prog[x.id] && prog[x.id].done) && (canSing || !/^sing|sight/.test(x.ex.type))) || LESSONS[0];
      return { id: l.id, title: l.title };
    },
    context() {
      return 'Раздел «Сольфеджио», урок «' + S.lesson.title + '». ' + S.lesson.theory.join(' ');
    },
  });

  VG.renderStaff = renderStaff;
})();
