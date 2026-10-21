import { Platform } from './types.js';

// Ignores case and a trailing dot
export function isHostOrSubdomain(hostname: string, domain: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  return host === domain || host.endsWith(`.${domain}`);
}

export function isBapHost(hostname: string): boolean {
  return isHostOrSubdomain(hostname, 'beerawardsplatform.com');
}

export function detectPlatform(url: string): Platform {
  const { hostname } = new URL(url);

  if (isHostOrSubdomain(hostname, 'reggiebeer.com')) {
    return Platform.REGGIE;
  }

  if (isBapHost(hostname)) {
    return Platform.BAP;
  }

  // Default to BCOEM if hostname doesn't match known platforms
  return Platform.BCOEM;
}
