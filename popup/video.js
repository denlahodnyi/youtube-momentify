import { getVideoThumbnailUrl } from './popupUtils.js';

export default class Video {
  dom;
  services;
  videoId;
  onVideoDelete;
  onTagDelete;

  constructor({ video, currentVideoId, services }) {
    const { videoId, title } = video;
    this.videoId = videoId;
    this.services = services;
    const $tmpl = document.getElementById('video-template');

    if ($tmpl) {
      this.dom = $tmpl.content.firstElementChild.cloneNode(true);

      if (currentVideoId === videoId) {
        this.dom.querySelector('[data-component="video"]').open = true;
      }

      this.dom.id = Video.getDomId(videoId);
      this.dom.querySelector('[data-component="thumbnail"]').src =
        getVideoThumbnailUrl(videoId);
      this.dom.querySelector('[data-component="video-title"]').textContent =
        title;
      this.dom.querySelector(
        '[data-component="video-tag-select"]',
      ).dataset.videoId = videoId;

      this.bindHandleVideoDelete = this.handleVideoDelete.bind(this);
      this.bindBookmarksDelete = this.handleBookmarksDelete.bind(this);
      this.bindBookmarksSort = this.handleBookmarksSort.bind(this);

      this.dom
        .querySelector('[data-component="delete-video-btn"]')
        .addEventListener('click', this.bindHandleVideoDelete);
      this.dom
        .querySelector('[data-component="clear-bookmarks-btn"]')
        .addEventListener('click', this.bindBookmarksDelete);
      this.dom
        .querySelector('[data-component="bookmarks-sorter"]')
        .addEventListener('change', this.bindBookmarksSort);
      this.dom
        .querySelector('[data-component="bookmarks-sorter"]')
        .addEventListener('change', this.bindBookmarksSort);
      this.dom
        .querySelector('[data-component="video-tag-del-button"]')
        .addEventListener('click', async (e) => {
          const result = await this.services.setTag(this.videoId, null);
          if (result.success) {
            this.onTagDelete?.();
          }
        });
    } else {
      throw new Error('No video template found');
    }
  }

  async handleVideoDelete() {
    const result = await this.services.deleteVideo(this.videoId);
    if (result.success) {
      this.removeVideo();
      this.onVideoDelete?.();
    }
  }

  // TODO: hide clear button if there are no bookmarks
  async handleBookmarksDelete() {
    const result = await this.services.deleteVideoBookmarks(this.videoId);
    if (result.success) {
      Video.setBookmarksCount(this.videoId, 0);
      this.dom
        .querySelector('[data-component="bookmarks-list"]')
        .replaceChildren();
      this.dom.querySelector(
        '[data-component="empty-video-msg"]',
      ).style.display = 'block';
    }
  }

  handleBookmarksSort(e) {
    e.preventDefault();
    const $bmList = this.dom.querySelector('[data-component="bookmarks-list"]');
    const sortedItems = Array.from($bmList.children).sort((a, b) => {
      switch (e.target.value) {
        case 'new': {
          return b.dataset.createdAt - a.dataset.createdAt;
        }
        case 'old': {
          return a.dataset.createdAt - b.dataset.createdAt;
        }
        case 'time_asc': {
          return a.dataset.time - b.dataset.time;
        }
        case 'time_desc': {
          return b.dataset.time - a.dataset.time;
        }
        default:
          return a.dataset.createdAt - b.dataset.createdAt;
      }
    });

    $bmList.replaceChildren(...sortedItems);
  }

  static pushBookmark(videoId, bookmark, $bookmark) {
    const $bmList = Video.find(videoId).querySelector(
      '[data-component="bookmarks-list"]',
    );
    const $li = document.createElement('li');
    $li.id = Video.getBookmarkDomId(bookmark.id);
    $li.dataset.createdAt = bookmark.createdAt;
    $li.dataset.time = bookmark.time;
    $li.append($bookmark);
    $bmList.append($li);
  }

  static removeBookmark(bookmarkId) {
    document.getElementById(Video.getBookmarkDomId(bookmarkId))?.remove();
  }

  static setBookmarksCount(videoId, count = 0) {
    Video.find(videoId).querySelector(
      '[data-component="bookmarks-count"]',
    ).textContent = count;
  }

  removeVideo() {
    this.dom.remove();
  }

  static getVideoIdFromDom($video) {
    return $video?.id.split('video-item-')[1];
  }

  static getDomId(videoId) {
    return `video-item-${videoId}`;
  }

  static getBookmarkDomId(bookmarkId) {
    return `bookmark-item-${bookmarkId}`;
  }

  static find(videoId) {
    return document.getElementById(Video.getDomId(videoId));
  }

  static findAll() {
    return document.querySelectorAll('[data-component="video-container"]');
  }
}
