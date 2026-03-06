import type { Theme } from '@/api';
import { getVideoPageUrlParams } from '@/shared';

export function getVideoTitle() {
  return document.title.split(' - YouTube')[0];
}

export function getVideoIdFromUrl(url: string) {
  const params = getVideoPageUrlParams(url);
  return params?.videoId || null;
}

export function createDomElement<TElement extends Element>(
  html: string,
): TElement {
  const dom = new DOMParser().parseFromString(html, 'text/html');
  return dom.body.firstElementChild as TElement;
}

export function resolveTheme(mode: Theme) {
  if (mode === 'system') {
    return matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  }
  return mode;
}

export function applyTheme(mode: Exclude<Theme, 'system'>) {
  document.documentElement.dataset.momentifyTheme = mode;
}
