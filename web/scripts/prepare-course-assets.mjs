import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const repo = dirname(root);
const frontend = join(repo, 'frontend', 'assets');
const output = join(root, 'public', 'course');

const files = [
  ['course/course_bundle.json', 'course_bundle.json'],
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

// Пути Flutter в manifest начинаются с assets/. Вебу нужен URL внутри public.
const manifestPath = join(output, 'animations', 'manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
for (const animation of manifest.animations ?? []) {
  const name = String(animation.asset ?? '').split('/').at(-1);
  animation.asset = `/course/animations/${name}`;
}
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

console.log('Course bundle, sprites and sounds prepared.');
