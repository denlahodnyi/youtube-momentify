import { getVideoThumbnailUrl } from './popupUtils.js';
import type Services from './services.js';
import { Video as VideoEntity, type Bookmark } from '@/api/index.js';

export default class Video {
  dom: HTMLElement;
  services: typeof Services;
  videoId: VideoEntity['videoId'];
  onVideoDelete?: () => void;
  onTagDelete?: () => void;
  bindHandleVideoDelete: () => Promise<void>;
  bindBookmarksDelete: () => Promise<void>;
  bindBookmarksSort: (e: Event) => void;

  constructor(args: {
    services: typeof Services;
    video: VideoEntity;
    currentVideoId: VideoEntity['videoId'] | null;
  }) {
    const { video, currentVideoId, services } = args;
    const { videoId, title } = video;
    this.videoId = videoId;
    this.services = services;
    const $tmpl = document.getElementById('video-template');
    const templateContent = $tmpl
      ? ($tmpl as HTMLTemplateElement).content.firstElementChild
      : null;

    if (templateContent) {
      this.dom = templateContent.cloneNode(true) as HTMLElement;

      if (currentVideoId === videoId) {
        const $collapsibleEl = this.dom.querySelector<HTMLDetailsElement>(
          '[data-component="video"]',
        );
        if ($collapsibleEl) $collapsibleEl.open = true;
      }

      this.dom.id = Video.getDomId(videoId);
      const $image = this.dom.querySelector<HTMLImageElement>(
        '[data-component="thumbnail"]',
      );
      if ($image) $image.src = getVideoThumbnailUrl(videoId);
      const $title = this.dom.querySelector('[data-component="video-title"]');
      if ($title) $title.textContent = title;
      const $tag = this.dom.querySelector<HTMLElement>(
        '[data-component="video-tag-select"]',
      );
      if ($tag) $tag.dataset.videoId = videoId;

      this.bindHandleVideoDelete = this.handleVideoDelete.bind(this);
      this.bindBookmarksDelete = this.handleBookmarksDelete.bind(this);
      this.bindBookmarksSort = this.handleBookmarksSort.bind(this);

      this.dom
        .querySelector('[data-component="delete-video-btn"]')
        ?.addEventListener('click', this.bindHandleVideoDelete);
      this.dom
        .querySelector('[data-component="clear-bookmarks-btn"]')
        ?.addEventListener('click', this.bindBookmarksDelete);
      this.dom
        .querySelector('[data-component="bookmarks-sorter"]')
        ?.addEventListener('change', this.bindBookmarksSort);
      this.dom
        .querySelector('[data-component="bookmarks-sorter"]')
        ?.addEventListener('change', this.bindBookmarksSort);
      this.dom
        .querySelector('[data-component="video-tag-del-button"]')
        ?.addEventListener('click', async () => {
          const result = await this.services.setTag(this.videoId);
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

  async handleBookmarksDelete() {
    const result = await this.services.deleteVideoBookmarks(this.videoId);
    if (result.success) {
      Video.setBookmarksCount(this.videoId, 0);
      this.dom
        .querySelector('[data-component="bookmarks-list"]')
        ?.replaceChildren();
    }
  }

  handleBookmarksSort(e: Event) {
    e.preventDefault();
    const $bmList = this.dom.querySelector<HTMLElement>(
      '[data-component="bookmarks-list"]',
    );
    if ($bmList) {
      const sortedItems = (Array.from($bmList.children) as HTMLElement[]).sort(
        (a, b) => {
          switch ((e.target as HTMLInputElement).value) {
            case 'new': {
              return Number(b.dataset.createdAt) - Number(a.dataset.createdAt);
            }
            case 'old': {
              return Number(a.dataset.createdAt) - Number(b.dataset.createdAt);
            }
            case 'time_asc': {
              return Number(a.dataset.time) - Number(b.dataset.time);
            }
            case 'time_desc': {
              return Number(b.dataset.time) - Number(a.dataset.time);
            }
            default:
              return Number(a.dataset.createdAt) - Number(b.dataset.createdAt);
          }
        },
      );

      $bmList.replaceChildren(...sortedItems);
    }
  }

  static pushBookmark(
    videoId: VideoEntity['videoId'],
    bookmark: Bookmark,
    $bookmark: HTMLElement,
  ) {
    const $bmList = Video.find(videoId)?.querySelector(
      '[data-component="bookmarks-list"]',
    );
    if ($bmList) {
      const $li = document.createElement('li');
      $li.id = Video.getBookmarkDomId(bookmark.id);
      $li.dataset.createdAt = bookmark.createdAt.toString();
      $li.dataset.time = bookmark.time.toString();
      $li.append($bookmark);
      $bmList.append($li);
    }
  }

  static removeBookmark(bookmarkId: Bookmark['id']) {
    document.getElementById(Video.getBookmarkDomId(bookmarkId))?.remove();
  }

  static setBookmarksCount(videoId: VideoEntity['videoId'], count = 0) {
    const $count = Video.find(videoId)?.querySelector<HTMLElement>(
      '[data-component="bookmarks-count"]',
    );
    if ($count) $count.textContent = count.toString();
  }

  removeVideo() {
    this.dom.remove();
  }

  static getVideoIdFromDom($video: HTMLElement) {
    return $video?.id.split('video-item-')[1];
  }

  static getDomId(videoId: VideoEntity['videoId']) {
    return `video-item-${videoId}`;
  }

  static getBookmarkDomId(bookmarkId: Bookmark['id']) {
    return `bookmark-item-${bookmarkId}`;
  }

  static find(videoId: VideoEntity['videoId']) {
    return document.getElementById(Video.getDomId(videoId));
  }

  static findAll() {
    return document.querySelectorAll<HTMLElement>(
      '[data-component="video-container"]',
    );
  }
}
