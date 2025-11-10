import { Platform } from './types.js';

export function detectPlatform(url: string): Platform {
  const hostname = new URL(url).hostname.toLowerCase();
  
  if (hostname.includes('reggiebeer.com')) {
    return Platform.REGGIE;
  }
  
  if (hostname.includes('beerawardsplatform.com')) {
    return Platform.BAP;
  }
  
  // Default to BCOEM if hostname doesn't match known platforms
  return Platform.BCOEM;
}
