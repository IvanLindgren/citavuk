import { copyFile, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const repo = dirname(root);
const frontend = join(repo, 'frontend', 'assets');
const output = join(root, 'public', 'course');

const files = [
  ['course/course_bundle.json', 'course_bundle.json'],
  ['course/trainer_catalog.json', 'trainer_catalog.json'],
  ['course/dialogues/drinkit.json', 'dialogues/drinkit.json'],
  ['animations/generated/manifest.json', 'animations/manifest.json'],
  ['animations/generated/citavuk_learning.png', 'animations/citavuk_learning.png'],
  ['animations/generated/citavuk_surprise.png', 'animations/citavuk_surprise.png'],
  ['sounds/correct.wav', 'sounds/correct.wav'],
  ['sounds/incorrect.wav', 'sounds/incorrect.wav'],
  ['sounds/lesson_complete.wav', 'sounds/lesson_complete.wav'],
];

await Promise.all(
  files.map(async ([source, target]) => {
    const destination = join(output, target);
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(join(frontend, source), destination);
  }),
);

// Путешествие собирается в один файл. Flutter читает те же исходники по
// отдельности, вебу тридцать три запроса на открытие карты ни к чему.
const travel = join(frontend, 'travel');
const kinds = JSON.parse(await readFile(join(travel, 'kinds.json'), 'utf8'));
const cities = JSON.parse(await readFile(join(travel, 'cities.json'), 'utf8'));
const places = {};
for (const kind of kinds.kinds) {
  places[kind.id] = JSON.parse(
    await readFile(join(travel, 'places', `${kind.id}.json`), 'utf8'),
  );
}
// Значки едут в том же файле: это десяток строк разметки на каждый, а
// отдельными картинками они превратились бы в тридцать три запроса и в мигание
// пустых меток на карте.
const icons = {};
for (const name of await readdir(join(travel, 'icons'))) {
  if (!name.endsWith('.svg')) continue;
  const svg = await readFile(join(travel, 'icons', name), 'utf8');
  const body = svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
  icons[name.replace(/\.svg$/, '')] = body.trim();
}

const bundlePath = join(root, 'public', 'travel', 'bundle.json');
await mkdir(dirname(bundlePath), { recursive: true });
await writeFile(
  bundlePath,
  `${JSON.stringify({
    version: kinds.version,
    kinds: kinds.kinds,
    cities: cities.cities,
    places,
    icons,
  })}\n`,
);

// Пути Flutter в manifest начинаются с assets/. Вебу нужен URL внутри public.
const manifestPath = join(output, 'animations', 'manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
for (const animation of manifest.animations ?? []) {
  const name = String(animation.asset ?? '').split('/').at(-1);
  animation.asset = `/course/animations/${name}`;
}
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

console.log('Course bundle, travel bundle, sprites and sounds prepared.');
