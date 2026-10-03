import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '../..');
const nginx = readFileSync(resolve(root, 'deploy/nginx-site.conf'), 'utf8');
const app = readFileSync(resolve(root, 'src/App.tsx'), 'utf8');

/** Регулярка из `location @app`: адреса, которые отдают заготовку приложения. */
function appRoute(): RegExp {
  const match = /location @app \{[\s\S]*?if \(\$uri !~ "([^"]+)"\)/.exec(nginx);
  if (!match?.[1]) throw new Error('в nginx-site.conf нет location @app');
  return new RegExp(match[1]);
}

describe('nginx: настоящий 404 вместо копии главной', () => {
  const route = appRoute();

  it('каждый маршрут App.tsx открывается как раздел приложения', () => {
    const patterns = [...app.matchAll(/pattern:\s*["']([^"']+)["']/g)].map((m) => m[1]!).filter((p) => p !== '/*');
    expect(patterns.length).toBeGreaterThan(30);
    for (const pattern of patterns) {
      const sample = pattern.replace(/:[A-Za-z]+/g, 'x');
      expect(route.test(sample), pattern).toBe(true);
    }
  });

  it('опечатки и чужие адреса получают 404', () => {
    for (const path of ['/wp-login.php', '/courses', '/audiobook-kostana', '/learn-serbian-Buzzsprout-1', '/index.php', '/listen']) {
      expect(route.test(path), path).toBe(false);
    }
  });
});
