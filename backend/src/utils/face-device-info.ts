export type FaceBrowser = 'edge' | 'chrome' | 'firefox' | 'safari' | 'opera' | 'samsung' | 'unknown';
export type FacePlatform = 'windows' | 'macos' | 'android' | 'ios' | 'linux' | 'unknown';
export type FaceDeviceInfo = { browser: FaceBrowser; platform: FacePlatform };

// Informational labels only: never use User-Agent to authorize a device.
export function faceDeviceInfo(userAgent?: string): FaceDeviceInfo {
  const ua = (userAgent || '').slice(0, 1024);
  const browser: FaceBrowser = /Edg(?:e|A|iOS)?\//i.test(ua) ? 'edge'
    : /(?:OPR|Opera|OPiOS)\//i.test(ua) ? 'opera'
    : /SamsungBrowser\//i.test(ua) ? 'samsung'
    : /(?:Firefox|FxiOS)\//i.test(ua) ? 'firefox'
    : /(?:Chrome|CriOS)\//i.test(ua) ? 'chrome'
    : /Safari\//i.test(ua) ? 'safari' : 'unknown';
  const platform: FacePlatform = /(?:iPhone|iPad|iPod)/i.test(ua) ? 'ios'
    : /Android/i.test(ua) ? 'android' : /Windows/i.test(ua) ? 'windows'
    : /Macintosh|Mac OS X/i.test(ua) ? 'macos' : /Linux/i.test(ua) ? 'linux' : 'unknown';
  return { browser, platform };
}

export function validFaceDeviceInfo(value: unknown): value is FaceDeviceInfo {
  if (!value || typeof value !== 'object') return false;
  const info = value as FaceDeviceInfo;
  return ['edge', 'chrome', 'firefox', 'safari', 'opera', 'samsung', 'unknown'].includes(info.browser)
    && ['windows', 'macos', 'android', 'ios', 'linux', 'unknown'].includes(info.platform);
}
