import { getVideoId } from './popupUtils.js';
import HomePage from './home.js';
import Services from './services.js';
import Bookmark from './bookmark.js';
import Video from './video.js';

const videoId = await getVideoId();
const homePage = new HomePage({ videoId }, { Services, Bookmark, Video });
const $root = document.getElementById('root');

if ($root) {
  homePage.render($root);
}
