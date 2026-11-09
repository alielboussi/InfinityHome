/**
 * Expo Go (RN bridgeless) may log codegen fallback warnings for third-party native views.
 * Harmless in dev; EAS/dev builds run full codegen. Suppress noise in Metro / LogBox.
 */
import { LogBox } from 'react-native';

const CODEGEN_WARN = /Codegen didn't run for/;

if (typeof __DEV__ !== 'undefined' && __DEV__) {
  LogBox.ignoreLogs([CODEGEN_WARN]);

  const previousWarn = console.warn.bind(console);
  console.warn = (...args) => {
    const first = args[0];
    if (typeof first === 'string' && CODEGEN_WARN.test(first)) {
      return;
    }
    previousWarn(...args);
  };
}
