// React uses this flag to verify that state changes in tests are wrapped in
// `act`. Without it, every rendered course block produces a warning and hides
// the actual failure in thousands of lines of output.
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
Object.defineProperty(window, 'scrollTo', { configurable: true, value: () => undefined });

// JSDOM не реализует медиадвижок. Компоненты проверяют именно управление
// плеером, а не декодирование mp3, поэтому в тестах достаточно успешного play.
Object.defineProperty(HTMLMediaElement.prototype, 'play', {
  configurable: true,
  value: () => Promise.resolve(),
});
Object.defineProperty(HTMLMediaElement.prototype, 'pause', {
  configurable: true,
  value: () => undefined,
});
