import { getVideoId } from './popupUtils.js';
import HomePage from './home.js';
import SettingsPage from './settings.js';
import Services from './services.js';
import Bookmark from './bookmark.js';
import Video from './video.js';

const $root = document.getElementById('root');
const videoId = await getVideoId();
const homePage = new HomePage({ videoId }, { Services, Bookmark, Video });
const settingsPage = new SettingsPage({ Services });

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
