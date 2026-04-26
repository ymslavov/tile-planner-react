/**
 * Bulgarian translations used in the printed cut sheet.
 * The on-screen UI remains in English; only the PDF/print output is translated.
 */
export const t = {
  cutSheetTitle: 'Лист за разкрояване на плочки',
  orientation: 'Ориентация',
  portrait: 'вертикална',
  landscape: 'хоризонтална',
  nicheMode: 'Режим на ниша',
  wrapAround: 'обвиване',
  independent: 'независим',

  walls: 'Стени',
  wall: 'Стена',
  wallPreview: 'Преглед на стена',

  // Translate user-supplied wall names. Names like "Wall 1" → "Стена 1".
  // Anything else passes through unchanged.
  translateWallName: (name: string) =>
    name.replace(/^Wall\b/i, 'Стена'),

  niche: 'Ниша',
  nicheSurfaces: 'Повърхности на ниша',
  nicheBack: 'Заден',
  nicheLeft: 'Ляв',
  nicheRight: 'Десен',
  nicheTop: 'Горен',
  nicheBottom: 'Долен',

  width: 'Ширина',
  height: 'Височина',
  depth: 'Дълбочина',
  fromFloor: 'От пода',
  fromLeft: 'От ляво',

  element: 'Елемент',
  elements: 'Елементи',
  elementList: 'Списък на елементите',
  pieceLabel: 'Парче',
  dimensions: 'Размери',
  position: 'Позиция',
  rotation: 'Ротация',
  offset: 'Отместване',
  source: 'Източник',
  fromTile: 'от плочка',

  cuts: 'Разрези',
  tileCutPlan: 'План за нарязване на плочка',
  cutInstructions: 'Инструкции за рязане',
  noCutsNeeded: 'Без разрези',

  available: 'Налична',
  unplaced: 'непоставена',
  unusedArea: 'Неизползвана площ',
  leftover: 'остатък',

  surfaceLabels: (s: string) => {
    switch (s) {
      case 'back':
        return 'Заден';
      case 'left':
        return 'Ляв';
      case 'right':
        return 'Десен';
      case 'top':
        return 'Горен';
      case 'bottom':
        return 'Долен';
      default:
        return s;
    }
  },
};
