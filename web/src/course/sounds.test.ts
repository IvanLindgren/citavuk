import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

class FakeAudio {
  static created: FakeAudio[] = [];

  preload = '';
  volume = 1;
  played = false;
  paused = false;

  constructor(readonly src = '') {
    FakeAudio.created.push(this);
  }

  load() {}

  cloneNode(): FakeAudio {
    return new FakeAudio(this.src);
  }

  play(): Promise<void> {
    this.played = true;
    return Promise.resolve();
  }

  pause() {
    this.paused = true;
  }

  addEventListener() {}
}

beforeEach(() => {
  localStorage.clear();
  FakeAudio.created = [];
  vi.resetModules();
  vi.stubGlobal('Audio', FakeAudio);
});

afterEach(() => vi.unstubAllGlobals());

describe('course sounds', () => {
  it('preloads templates and uses a fresh player for every effect', async () => {
    const { playCourseSound, preloadCourseSounds } = await import('./sounds');

    preloadCourseSounds();
    expect(FakeAudio.created).toHaveLength(3);

    playCourseSound('correct');
    playCourseSound('correct');

    const played = FakeAudio.created.filter((audio) => audio.played);
    expect(played).toHaveLength(2);
    expect(played[0]).not.toBe(played[1]);
  });

  it('stops active effects when sound is muted', async () => {
    const { playCourseSound, setCourseSoundsMuted } = await import('./sounds');

    playCourseSound('incorrect');
    const active = FakeAudio.created.find((audio) => audio.played);
    expect(active).toBeDefined();

    setCourseSoundsMuted(true);
    expect(active?.paused).toBe(true);
  });
});
