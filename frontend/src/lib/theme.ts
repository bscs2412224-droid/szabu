// Konsta UI has two looks: iOS and Material (Android).
// The app picks the one that matches the phone. Add ?theme=ios or ?theme=material to the URL to force one.
export type AppTheme = 'ios' | 'material';

export function detectTheme(): AppTheme {
  if (typeof window === 'undefined') return 'material';
  const forced = new URLSearchParams(window.location.search).get('theme');
  if (forced === 'ios' || forced === 'material') return forced;
  const isApple = /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  return isApple ? 'ios' : 'material';
}
