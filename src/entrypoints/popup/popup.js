import {
  applyTheme,
  getSavedTheme,
  getVideoId,
  resolveTheme,
} from './popupUtils.js';
import HomePage from './home.js';
import SettingsPage from './settings.js';
import Services from './services.js';
import Bookmark from './bookmark.js';
import Video from './video.js';
import { setupColorPicker } from './colorPicker.js';

document.addEventListener('DOMContentLoaded', async () => {
  const { theme = 'system' } = await getSavedTheme();
  applyTheme(resolveTheme(theme));

  matchMedia('(prefers-color-scheme: dark)').addEventListener(
    'change',
    async (e) => {
      const { theme = 'system' } = await getSavedTheme();
      if (theme === 'system') {
        applyTheme(e.matches ? 'dark' : 'light');
      }
    },
  );
});

const $root = document.getElementById('root');
const videoId = await getVideoId();
const homePage = new HomePage({ videoId }, { Services, Bookmark, Video });
const settingsPage = new SettingsPage({ Services });
setupColorPicker();

homePage.onNavigate = () => {
  if ($root) {
    $root.replaceChildren();
    settingsPage.render($root);
  }
};
settingsPage.onNavigate = () => {
  if ($root) {
    $root.replaceChildren();
    homePage.render($root);
  }
};

if ($root) {
  homePage.render($root);
}
