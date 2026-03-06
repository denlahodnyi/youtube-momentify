import type { Theme, Video } from '@/api';
import { getVideoPageUrlParams } from '@/shared';

const chrome = browser;

export function getVideoThumbnailUrl(videoId: Video['videoId']) {
  return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
}

export function getVideoUrlWithTime(
  videoId: Video['videoId'],
  timeInSec: number,
) {
  return `https://www.youtube.com/watch?v=${videoId}&t=${timeInSec}s`;
}

export async function getCurrentVideoActiveTab(videoId: Video['videoId']) {
  const [activeTab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });
  const result = getVideoPageUrlParams(activeTab.url ?? '');

  if (result?.videoId === videoId) {
    return activeTab;
  }
}

export async function getVideoId() {
  const [activeTab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });
  return getVideoPageUrlParams(activeTab.url ?? '')?.videoId ?? null;
}

export const THEME_KEY = 'theme';

export function getAppliedTheme() {
  return document.documentElement.dataset.theme;
}

export function applyTheme(mode: Exclude<Theme, 'system'>) {
  document.documentElement.dataset.theme = mode;
}

export function resolveTheme(mode: Theme) {
  if (mode === 'system') {
    return matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  }
  return mode;
}

export async function saveTheme(mode: Theme) {
  return chrome.storage.local.set({ [THEME_KEY]: mode });
}

export function getSavedTheme() {
  return chrome.storage.local.get<{ theme: Theme }>(THEME_KEY);
}
