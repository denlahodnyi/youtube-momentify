export const colors = {
  'Kiwi Pulp': '#9CEF43'.toLowerCase(),
  'Deep Sky Blue': '#00bfff'.toLowerCase(),
  'Bright Indigo': '#6F00FE'.toLowerCase(),
  Clover: '#008F00'.toLowerCase(),
  Azul: '#1D5DEC'.toLowerCase(),
  'Peach Damask': '#F6C4A6'.toLowerCase(),
  'Distilled Rose': '#FFBBFF'.toLowerCase(),
  'Banana King': '#FFFB08'.toLowerCase(),
};

export function formatTime(timeInSec) {
  const seconds = Math.max(0, Math.floor(timeInSec));

  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;

  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  return `${m}:${String(s).padStart(2, '0')}`;
}

export function getVideoThumbnailUrl(videoId) {
  return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
}

export function getVideoUrlWithTime(videoId, timeInSec) {
  return `https://www.youtube.com/watch?v=${videoId}&t=${timeInSec}s`;
}

export function checkVideoPageByUrl(url) {
  const videoPagePattern = new URLPattern({
    baseUrl: 'https://www.youtube.com',
    pathname: '/watch',
  });

  if (videoPagePattern.test(url)) {
    const urlObj = new URL(url);
    const videoId = urlObj.searchParams.get('v');
    const time =
      urlObj.searchParams.get('t') ?? urlObj.searchParams.get('start');

    return { videoId, time };
  }
}

export async function getCurrentVideoActiveTab(videoId) {
  const [activeTab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });
  const result = checkVideoPageByUrl(activeTab.url);

  if (result?.videoId === videoId) {
    return activeTab;
  }
}

function getYoutubeVideoTabPattern(videoId) {
  return `https://*.youtube.com/watch?v=${videoId}*`;
}

export async function getCurrentVideoTabs(videoId, ...ids) {
  const tabs = await chrome.tabs.query({
    url: [
      getYoutubeVideoTabPattern(videoId),
      ...(ids.length ? ids.map(getYoutubeVideoTabPattern) : []),
    ],
  });
  return tabs;
}

export async function getVideoId() {
  const [activeTab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });
  return checkVideoPageByUrl(activeTab.url)?.videoId;
}

export const THEME_KEY = 'theme';

export function getAppliedTheme() {
  return document.documentElement.dataset.theme;
}

export function applyTheme(mode) {
  document.documentElement.dataset.theme = mode;
}

export function resolveTheme(mode) {
  if (mode === 'system') {
    return matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  }
  return mode;
}

export async function saveTheme(mode) {
  return chrome.storage.local.set({ [THEME_KEY]: mode });
}

export function getSavedTheme() {
  return chrome.storage.local.get(THEME_KEY);
}
