import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it } from 'vitest';

import { RouterProvider } from '../lib/router';
import { AskDialogHost, askConfirm, askText } from './AskDialog';
import { ButtonLink } from './ui';

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

it('askText возвращает введённое значение без пробелов по краям', async () => {
  await act(async () => root.render(<AskDialogHost />));
  let answer: Promise<string | null> = Promise.resolve(null);
  await act(async () => {
    answer = askText('Новая папка', { initial: '  Романы  ' });
  });
  const form = document.querySelector('form[role="dialog"]') as HTMLFormElement;
  expect(form.querySelector('input')!.value).toBe('  Романы  ');
  await act(async () => form.requestSubmit());
  await expect(answer).resolves.toBe('Романы');
});

it('askConfirm отдаёт false на «Отмена»', async () => {
  await act(async () => root.render(<AskDialogHost />));
  let answer: Promise<boolean> = Promise.resolve(true);
  await act(async () => {
    answer = askConfirm('Удалить?', { danger: true });
  });
  const cancel = [...document.querySelectorAll('button')].find((b) => b.textContent === 'Отмена')!;
  await act(async () => cancel.click());
  await expect(answer).resolves.toBe(false);
});

it('ButtonLink — одна ссылка без вложенной кнопки', async () => {
  await act(async () =>
    root.render(
      <RouterProvider>
        <ButtonLink to="/library">К чтению</ButtonLink>
        <ButtonLink to="#demo" variant="ghost">Демо</ButtonLink>
      </RouterProvider>,
    ),
  );
  const links = host.querySelectorAll('a');
  expect(links).toHaveLength(2);
  expect(host.querySelector('button')).toBeNull();
  expect(links[0]!.getAttribute('href')).toBe('/library');
  expect(links[1]!.getAttribute('href')).toBe('#demo');
});
