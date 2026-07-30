// React uses this flag to verify that state changes in tests are wrapped in
// `act`. Without it, every rendered course block produces a warning and hides
// the actual failure in thousands of lines of output.
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
