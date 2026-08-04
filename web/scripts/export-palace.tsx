/**
 * Выгружает комнаты дворца памяти для Flutter-приложения.
 *
 * Комнаты нарисованы React-компонентами (`src/palace/scenes.tsx`) — во Flutter
 * такое не переносится. Перерисовать их вручную второй раз было бы худшим из
 * решений: рисунок и координаты предметов разъехались бы при первой же правке,
 * и слово повисло бы в воздухе рядом со своим предметом.
 *
 * Поэтому источник остаётся один, а этот скрипт делает из него две вещи:
 *
 *   frontend/assets/palace/<id>.svg   — сама комната, картинкой;
 *   frontend/lib/palace/scenes.dart   — подписи и координаты предметов.
 *
 * Запуск (из каталога web/):
 *
 *   npx vite-node scripts/export-palace.tsx
 *
 * Правка комнаты в React означает повторный запуск. Он же и проверка: если
 * файлы после запуска изменились, а вы этого не ждали — значит рисунок и
 * приложение уже разошлись.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderToStaticMarkup } from 'react-dom/server';

import { SCENES, SCENE_HEIGHT, SCENE_WIDTH } from '../src/palace/scenes';

const here = dirname(fileURLToPath(import.meta.url));
const assets = join(here, '..', '..', 'frontend', 'assets', 'palace');
const dartFile = join(here, '..', '..', 'frontend', 'lib', 'palace', 'scenes.dart');

mkdirSync(assets, { recursive: true });
mkdirSync(dirname(dartFile), { recursive: true });

for (const scene of SCENES) {
  const markup = renderToStaticMarkup(
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${SCENE_WIDTH} ${SCENE_HEIGHT}`}
      width={SCENE_WIDTH}
      height={SCENE_HEIGHT}
    >
      {scene.backdrop}
      {scene.objects.map((object) => (
        <g key={object.id} transform={`translate(${object.x} ${object.y})`}>
          {object.art}
        </g>
      ))}
    </svg>,
  );
  writeFileSync(join(assets, `${scene.id}.svg`), `${markup}\n`, 'utf8');
  console.log(`комната ${scene.id}: ${scene.objects.length} предметов`);
}

const quote = (text: string) => `'${text.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

const dart = `// СОЗДАНО АВТОМАТИЧЕСКИ — не править руками.
//
// Источник: web/src/palace/scenes.tsx
// Обновить: cd web && npx vite-node scripts/export-palace.tsx
//
// Здесь только подписи и координаты предметов. Сами комнаты лежат картинками
// в assets/palace/ и выгружаются тем же скриптом, поэтому рисунок и координаты
// не могут разойтись: они получены из одного источника за один проход.

/// Размер комнаты в её собственных координатах. Экранный размер получается
/// масштабированием, а координаты предметов остаются этими.
const double sceneWidth = ${SCENE_WIDTH};
const double sceneHeight = ${SCENE_HEIGHT};

/// Место в комнате, куда вешается слово.
class PalaceSpot {
  const PalaceSpot(this.id, this.label, this.ru, this.x, this.y);

  final String id;

  /// Подпись по-сербски: место запоминается вместе со своим названием.
  final String label;

  /// Перевод подписи — раздел всё-таки для тех, кто язык учит.
  final String ru;

  final double x;
  final double y;
}

/// Комната дворца.
class PalaceScene {
  const PalaceScene(this.id, this.title, this.subtitle, this.asset, this.spots);

  final String id;
  final String title;
  final String subtitle;
  final String asset;
  final List<PalaceSpot> spots;
}

/// Комната по идентификатору. Возвращает null, если сцены с таким именем нет:
/// дворец мог быть построен в версии, где комнат было больше.
PalaceScene? sceneById(String id) {
  for (final scene in palaceScenes) {
    if (scene.id == id) return scene;
  }
  return null;
}

const List<PalaceScene> palaceScenes = [
${SCENES.map(
  (scene) => `  PalaceScene(
    ${quote(scene.id)},
    ${quote(scene.title)},
    ${quote(scene.subtitle)},
    'assets/palace/${scene.id}.svg',
    [
${scene.objects
  .map(
    (object) =>
      `      PalaceSpot(${quote(object.id)}, ${quote(object.label)}, ${quote(object.ru)}, ${object.x}, ${object.y}),`,
  )
  .join('\n')}
    ],
  ),`,
).join('\n')}
];
`;

writeFileSync(dartFile, dart, 'utf8');
console.log(`сцен: ${SCENES.length}`);
