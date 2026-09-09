import { describe, expect, it } from 'vitest';
import { VideoWatch, videoSwipe } from './videoWatch';
describe('video watch signals', () => {
  it('counts only playback, excludes buffering/background, finishes once', () => {
    const watch = new VideoWatch();
    watch.playing(100); watch.playing(200); watch.pause(2100);
    watch.playing(100000); watch.pause(108000);
    expect(watch.finish(200000, 12)).toEqual([{event:'view',dwellMs:10000},{event:'complete',dwellMs:10000}]);
    expect(watch.finish(300000,12)).toEqual([]);
  });
  it('does not count loading time or failed playback as a dislike', () => {
    expect(new VideoWatch().finish(100000,30)).toEqual([]);
    const watch = new VideoWatch(); watch.playing(0); watch.fail(800);
    expect(watch.finish(50000,30)).toEqual([]);
  });
  it('distinguishes skip, partial view and actual completion', () => {
    for (const [ms, expected] of [[1200,['quick_skip']],[2000,['view']],[12000,['view']], [24000,['view','complete']]] as const) {
      const watch=new VideoWatch(); watch.playing(0);
      expect(watch.finish(ms,30).map(e=>e.event)).toEqual(expected);
    }
  });
});
it('only intentional vertical swipes change videos', () => {
  expect(videoSwipe(4,-90)).toBe(1); expect(videoSwipe(4,90)).toBe(-1);
  expect(videoSwipe(70,60)).toBe(0); expect(videoSwipe(4,20)).toBe(0);
});
