import { getVideoThumbnailUrl } from './popupUtils.js';

export default class Video {
  dom;
  services;
  onVideoDelete;

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

      this.dom.querySelector('[data-component="thumbnail"]').src =
        getVideoThumbnailUrl(videoId);
      this.dom.querySelector('[data-component="video-title"]').textContent =
        title;

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
      this.setBookmarksCount(0);
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

  pushBookmark(bookmark, $bookmark) {
    const $bmList = this.dom.querySelector('[data-component="bookmarks-list"]');
    const $li = document.createElement('li');
    $li.id = `bookmark-item-${bookmark.id}`;
    $li.dataset.createdAt = bookmark.createdAt;
    $li.dataset.time = bookmark.time;
    $li.append($bookmark);
    $bmList.append($li);
  }

  removeBookmark(bookmarkId) {
    document.getElementById(`bookmark-item-${bookmarkId}`)?.remove();
  }

  setBookmarksCount(count = 0) {
    this.dom.querySelector('[data-component="bookmarks-count"]').textContent =
      count;
  }

  removeVideo() {
    this.dom.remove();
  }
}
