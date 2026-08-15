import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(), startSearch: vi.fn(), stopSearch: vi.fn(),
  createRoom: vi.fn(), getRoom: vi.fn(), addMachine: vi.fn(), saveDraft: vi.fn(),
}));

vi.mock('../state/auth', () => {
  const account = { displayName: 'Денис', serbianLevel: 'A2' };
  return { useAuth: () => ({ account }) };
});
vi.mock('../lib/router', () => ({ useRouter: () => ({ navigate: mocks.navigate }) }));
vi.mock('../state/duelSearch', () => ({
  useDuelSearch: () => ({ state: null, searching: false, room: '', start: mocks.startSearch, stop: mocks.stopSearch }),
}));
vi.mock('./Ornament', () => ({ Ornament: () => <div data-testid="ornament" /> }));
// Звук в тестах не нужен: jsdom всё равно не проигрывает, а Audio шумит в лог.
vi.mock('../lib/duelSounds', () => ({
  duelMuted: () => true,
  setDuelMuted: vi.fn(),
  playDuel: vi.fn(),
  playDuelKey: vi.fn(),
  preloadDuelSounds: vi.fn(),
}));
vi.mock('../api/duel', async (original) => {
  const actual = await original<typeof import('../api/duel')>();
  return {
    ...actual,
    createDuelRoom: mocks.createRoom,
    getDuelRoom: mocks.getRoom,
    addDuelMachine: mocks.addMachine,
    saveDuelDraft: mocks.saveDraft,
  };
});

import { MultiplayerDuel } from './MultiplayerDuel';

const lobby = {
  code: 'ABC123', level: 'A2', direction: 'sr-ru', seats: 3,
  open: false, matched: false, phase: 'lobby', round: 0, rounds: 3,
  you: 'u1', host: true, now: '2026-08-15T12:00:00Z',
  players: [{ id: 'u1', name: 'Денис', host: true, joined: true, ready: false, left: false, score: 0, you: true }],
};

/**
 * Ввод текста так, как его видит React.
 *
 * Присвоение value напрямую React не замечает: у него свой сторож значения на
 * прототипе элемента, и событие приходит с прежним текстом.
 */
function typeInto(field: HTMLTextAreaElement, text: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
  setter?.call(field, text);
  field.dispatchEvent(new Event('input', { bubbles: true }));
}

function button(host: HTMLElement, text: string): HTMLButtonElement {
  const found = [...host.querySelectorAll('button')].find((item) => item.textContent?.includes(text));
  if (!found) throw new Error(`Нет кнопки ${text}`);
  return found;
}

describe('многопользовательская дуэль', () => {
  let host: HTMLElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement('div'); document.body.append(host); root = createRoot(host);
    vi.clearAllMocks();
  });
  afterEach(async () => { await act(async () => root.unmount()); host.remove(); });

  it('показывает три способа начать игру и создаёт комнату для друзей', async () => {
    mocks.createRoom.mockResolvedValue(lobby);
    const solo = vi.fn();
    await act(async () => root.render(<MultiplayerDuel onSolo={solo} />));
    expect(host.textContent).toContain('Позвать друзей');
    expect(host.textContent).toContain('Найти соперников');
    expect(host.textContent).toContain('Играть с DeepL');

    await act(async () => button(host, 'Позвать друзей').click());
    expect(mocks.createRoom).toHaveBeenCalledWith({ level: 'A2', direction: 'sr-ru', seats: 2, name: undefined });
    expect(mocks.navigate).toHaveBeenCalledWith('/trainer/translation-duel/ABC123');

    button(host, 'Играть с DeepL').click();
    expect(solo).toHaveBeenCalledOnce();
  });

  it('в лобби даёт скопировать ссылку, добавить DeepL и начать матч', async () => {
    mocks.getRoom.mockResolvedValue(lobby);
    mocks.addMachine.mockResolvedValue({ ...lobby, players: [...lobby.players, { id: 'bot', name: 'DeepL', machine: 'deepl', host: false, joined: true, ready: false, left: false, score: 0 }] });
    await act(async () => root.render(<MultiplayerDuel code="abc123" />));
    await act(async () => Promise.resolve());

    expect(host.textContent).toContain('Комната ABC123');
    expect(host.querySelector<HTMLInputElement>('input[aria-label="Ссылка-приглашение"]')?.value).toContain('/trainer/translation-duel/ABC123');
    await act(async () => button(host, 'Посадить DeepL').click());
    expect(mocks.addMachine).toHaveBeenCalledWith('ABC123', 'deepl');
    expect(button(host, 'Начать матч').disabled).toBe(false);
  });

  it('в раунде сохраняет черновик сам, не дожидаясь кнопки', async () => {
    vi.useFakeTimers();
    const round = {
      ...lobby,
      phase: 'translate',
      round: 1,
      deadline: '2026-08-15T12:03:20Z',
      sentences: [{ id: 'a2-01', text: 'Prva.' }],
      players: [
        lobby.players[0],
        { id: 'u2', name: 'Аня', host: false, joined: true, ready: false, left: false, score: 0 },
      ],
    };
    mocks.getRoom.mockResolvedValue(round);
    mocks.saveDraft.mockResolvedValue(round);
    await act(async () => root.render(<MultiplayerDuel code="abc123" />));
    await act(async () => Promise.resolve());

    const field = host.querySelector('textarea');
    if (!field) throw new Error('Нет поля перевода');
    await act(async () => { typeInto(field, 'Первая.'); });
    expect(mocks.saveDraft).not.toHaveBeenCalled();

    await act(async () => { vi.advanceTimersByTime(3000); });
    expect(mocks.saveDraft).toHaveBeenCalledWith('ABC123', { 'a2-01': 'Первая.' });
    vi.useRealTimers();
  });
});
