// src/platform.js — capture-flow platform checks. Apple forces every iOS/iPadOS
// browser onto WebKit/WKWebView, where getUserMedia (the LIVE camera) is
// unreliable outside Safari — Chrome/Firefox/Edge on iOS often can't open it at
// all. So on iOS we always offer the native photo-capture fallback (a file input
// with capture=environment), which uses the OS camera and works in every iOS
// browser. Read fresh each call so tests can override the UA per context.
const ua = () => (typeof navigator !== 'undefined' ? navigator.userAgent || '' : '');

export function isIOS() {
  if (/iPad|iPhone|iPod/.test(ua())) return true;
  // iPadOS 13+ reports as desktop Safari; detect via Mac platform + touch.
  return typeof navigator !== 'undefined'
    && navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1;
}

// Chrome / Firefox / Edge / Opera on iOS — WKWebView, live camera usually blocked.
export function isIOSNonSafari() {
  return isIOS() && /CriOS|FxiOS|EdgiOS|OPiOS/.test(ua());
}
