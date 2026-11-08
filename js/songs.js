/*
 * Второй голос — библиотека упражнений и песен.
 *
 * Формат записи — тот же, что в разделе «Мои песни»:
 *   нота[знак][октава][:длительность]
 *   C4 = до первой октавы, длительность в четвертях (0.5 — восьмая, 2 — половинная);
 *   без длительности нота — четверть.
 *   «|» — тактовая черта, только для удобства чтения.
 *
 * key: "тоника:лад", тоника — номер звука от до (0) до си (11).
 * harmony — готовая партия второго голоса; без неё партия строится автоматически.
 * Все мелодии — народные или давно перешедшие в общественное достояние.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SongLibrary = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  return [
    {
      id: 'ex-drone',
      group: 'exercise',
      title: 'Держим ноту',
      subtitle: 'Мелодия движется, второй голос стоит на месте',
      key: '0:major',
      meter: [4, 4],
      bpm: 72,
      phraseBars: 2,
      melody: 'E4 F4 G4 F4 | E4 D4 E4:2 | G4 F4 E4 D4 | E4:4',
      harmony: 'C4:4 | C4:4 | C4:4 | C4:4',
    },
    {
      id: 'ex-thirds',
      group: 'exercise',
      title: 'Терции по ступеням',
      subtitle: 'Голоса идут рядом, на терцию друг от друга',
      key: '0:major',
      meter: [4, 4],
      bpm: 76,
      phraseBars: 2,
      melody: 'E4 F4 G4 A4 | G4 F4 E4:2 | G4 F4 E4 D4 | E4:4',
      harmony: 'C4 D4 E4 F4 | E4 D4 C4:2 | E4 D4 C4 B3 | C4:4',
    },
    {
      id: 'ex-meet',
      group: 'exercise',
      title: 'Сходимся и расходимся',
      subtitle: 'Голоса идут навстречу, встречаются в унисоне и снова расходятся',
      key: '0:major',
      meter: [4, 4],
      bpm: 72,
      phraseBars: 2,
      melody: 'G4 F4 E4:2 | F4 G4 A4:2 | G4 F4 E4 D4 | C4:4',
      harmony: 'C4 D4 E4:2 | D4 C4 C4:2 | E4 D4 C4 B3 | C4:4',
    },
    {
      id: 'silent-night',
      group: 'song',
      title: 'Тихая ночь',
      subtitle: 'Франц Грубер, 1818',
      key: '0:major',
      meter: [6, 8],
      bpm: 76,
      phraseBars: 4,
      melody:
        'G4:0.75 A4:0.25 G4:0.5 E4:1.5 | G4:0.75 A4:0.25 G4:0.5 E4:1.5 | D5 D5:0.5 B4:1.5 | C5 C5:0.5 G4:1.5 | ' +
        'A4 A4:0.5 C5:0.75 B4:0.25 A4:0.5 | G4:0.75 A4:0.25 G4:0.5 E4:1.5 | A4 A4:0.5 C5:0.75 B4:0.25 A4:0.5 | G4:0.75 A4:0.25 G4:0.5 E4:1.5 | ' +
        'D5 D5:0.5 F5:0.75 D5:0.25 B4:0.5 | C5:1.5 E5:1.5 | C5:0.75 G4:0.25 E4:0.5 G4:0.75 F4:0.25 D4:0.5 | C4:3',
    },
    {
      id: 'amazing-grace',
      group: 'song',
      title: 'О, благодать',
      subtitle: 'Amazing Grace, народная мелодия',
      key: '7:major',
      meter: [3, 4],
      bpm: 84,
      anacrusis: 1,
      phraseBars: 4,
      melody:
        'D4 | G4:2 B4:0.5 G4:0.5 | B4:2 A4 | G4:2 E4 | D4:2 D4 | G4:2 B4:0.5 G4:0.5 | B4:2 A4 | D5:5 B4 | ' +
        'D5:1.5 B4:0.5 D5:0.5 B4:0.5 | G4:2 D4 | E4:1.5 G4:0.5 G4:0.5 E4:0.5 | D4:2 D4 | G4:2 B4:0.5 G4:0.5 | B4:2 A4 | G4:5',
    },
    {
      id: 'ode-to-joy',
      group: 'song',
      title: 'Ода к радости',
      subtitle: 'Людвиг ван Бетховен, 9-я симфония',
      key: '0:major',
      meter: [4, 4],
      bpm: 100,
      phraseBars: 4,
      melody:
        'E4 E4 F4 G4 | G4 F4 E4 D4 | C4 C4 D4 E4 | E4:1.5 D4:0.5 D4:2 | ' +
        'E4 E4 F4 G4 | G4 F4 E4 D4 | C4 C4 D4 E4 | D4:1.5 C4:0.5 C4:2 | ' +
        'D4 D4 E4 C4 | D4 E4:0.5 F4:0.5 E4 C4 | D4 E4:0.5 F4:0.5 E4 D4 | C4 D4 G3:2 | ' +
        'E4 E4 F4 G4 | G4 F4 E4 D4 | C4 C4 D4 E4 | D4:1.5 C4:0.5 C4:2',
    },
    {
      id: 'jingle-bells',
      group: 'song',
      title: 'Бубенчики',
      subtitle: 'Jingle Bells, Джеймс Пирпонт, 1857',
      key: '0:major',
      meter: [4, 4],
      bpm: 112,
      phraseBars: 4,
      melody:
        'E4 E4 E4:2 | E4 E4 E4:2 | E4 G4 C4:1.5 D4:0.5 | E4:4 | ' +
        'F4 F4 F4:1.5 F4:0.5 | F4 E4 E4 E4:0.5 E4:0.5 | E4 D4 D4 E4 | D4:2 G4:2 | ' +
        'E4 E4 E4:2 | E4 E4 E4:2 | E4 G4 C4:1.5 D4:0.5 | E4:4 | ' +
        'F4 F4 F4:1.5 F4:0.5 | F4 E4 E4 E4:0.5 E4:0.5 | G4 G4 F4 D4 | C4:4',
    },
  ];
});
