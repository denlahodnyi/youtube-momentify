export default class HomePage {
  services;
  Bookmark;
  Video;
  onNavigate;
  state = {
    videoId: null,
    $colorPickerInvoker: null,
    colorPickerBookmarkId: null,
    videos: { byId: new Map(), ids: [] },
    bookmarks: { byId: new Map(), ids: [] },
    videoBookmarks: new Map(), // videoId -> bookmarkId[]
    boundBookmarksRenderHandlers: new Map(),
    filteredVideos: null, // null | videoId[]
    renderedVideosCount: 0,
    videosPerPage: 30,
  };

  constructor({ videoId, handleNavToSettings }, { Services, Bookmark, Video }) {
    this.services = Services;
    this.Bookmark = Bookmark;
    this.Video = Video;
    this.state.videoId = videoId;
    this.handleNavToSettings = handleNavToSettings;
    this.attachColorPickerListeners();
  }

  async fetchVideosData() {
    if (!this.state.videos.byId.size) {
      const result = await this.services.getVideos(this.state.videoId);
      if (result.success) {
        this.state.videos.byId = new Map(result.list.byId);
        this.state.videos.ids = result.list.ids;
      }
    }
  }

  async fetchBookmarksData(videoId) {
    if (!this.state.videoBookmarks.get(videoId)) {
      const result = await this.services.getVideoBookmarks(videoId);
      if (result.success) {
        this.state.bookmarks.byId = new Map([
          ...result.list.byId,
          ...this.state.bookmarks.byId.entries(),
        ]);
        this.state.bookmarks.ids.push(...result.list.ids);
        this.state.videoBookmarks.set(videoId, result.list.ids);
      }
    }
  }

  render($container) {
    this.state.renderedVideosCount = 0;
    this.state.filteredVideos = null;
    this.renderPageLayout($container);
    this.fetchVideosData().then(() => {
      this.renderVideos();
      this.attachLoadMoreVideos();
      this.attachSearch();
    });
  }

  renderPageLayout($container) {
    const $tmpl = document.getElementById('home-template');
    $container.append($tmpl.content.cloneNode(true));
    document.getElementById('settings-link').addEventListener('click', () => {
      this.onNavigate?.();
    });
  }

  async renderVideos() {
    this.setVideosCount(this.state.videos.ids.length);
    let ids = this.state.filteredVideos || this.state.videos.ids;
    ids = ids.slice(
      this.state.renderedVideosCount,
      this.state.renderedVideosCount + this.state.videosPerPage,
    );
    this.state.renderedVideosCount += ids.length;

    if (ids.length) {
      const $videosList = this.findVideosList();

      ids.forEach((videoId, i) => {
        const video = this.state.videos.byId.get(videoId);

        const createdVideo = new this.Video({
          video,
          currentVideoId: this.state.videoId,
          services: this.services,
        });
        createdVideo.onVideoDelete = async () => {
          this.removeVideo(videoId);
          this.setVideosCount(this.state.videos.ids.length);
          if (this.state.videos.ids.length === 0) {
            this.renderEmptyVideosMessage();
          }
        };
        const $videoItem = createdVideo.dom;

        if ($videoItem) {
          if (i > 10) $videoItem.style.contentVisibility = 'auto';
          $videosList.append($videoItem);
          const $bmList = $videoItem.querySelector(
            '[data-component="bookmarks-list"]',
          );
          $bmList.style.display = 'block';

          if (
            this.state.videoId === videoId ||
            this.state.videoBookmarks.has(videoId)
          ) {
            // Render bookmarks immediately for the topmost video or if already fetched
            this.renderBookmarks(videoId);
          } else {
            const renderHandler = this.renderBookmarksOnIntent.bind(
              this,
              videoId,
            );
            this.state.boundBookmarksRenderHandlers.set(videoId, renderHandler);
            $videoItem.addEventListener('mouseenter', renderHandler);
            $videoItem.addEventListener('focusin', renderHandler);
          }
        }
      });
    } else {
      this.renderEmptyVideosMessage();
    }
  }

  renderBookmarksOnIntent(videoId, e) {
    const $videoItem = document.getElementById(this.Video.getDomId(videoId));
    const $details = $videoItem.querySelector('details');

    if (e.type === 'mouseenter') {
      $videoItem.dataset.hovered = 'true';
    }

    const duplicateEvent =
      e.type === 'focusin' && $videoItem.dataset.hovered === 'true';

    if (!this.state.videoBookmarks.has(videoId) && !duplicateEvent) {
      const clearInteractionListeners = () => {
        $videoItem.removeEventListener(
          'mouseenter',
          this.state.boundBookmarksRenderHandlers.get(videoId),
        );
        $videoItem.removeEventListener(
          'focusin',
          this.state.boundBookmarksRenderHandlers.get(videoId),
        );
        this.state.boundBookmarksRenderHandlers.delete(videoId);
      };

      let isRendering = false;
      const timer = setTimeout(() => {
        if (!isRendering) {
          isRendering = true;
          clearInteractionListeners();
          this.renderBookmarks(videoId);
        }
      }, 250);

      const toggleEvent = (ev) => {
        if (ev.target.open && !isRendering) {
          isRendering = true;
          clearTimeout(timer);
          clearInteractionListeners();
          this.renderBookmarks(videoId);
        }
      };
      $details.addEventListener('toggle', toggleEvent, { once: true });

      const leaveEvent = () => {
        clearTimeout(timer);
        $details.removeEventListener('toggle', toggleEvent);
        delete $videoItem.dataset.hovered;
      };

      if (e.type === 'mouseenter') {
        $videoItem.addEventListener('mouseleave', leaveEvent, { once: true });
      } else if (e.type === 'focusin') {
        $videoItem.addEventListener('focusout', leaveEvent, { once: true });
      }
    }
  }

  renderEmptyVideosMessage() {
    const $videosContainer = document.getElementById('videos-list');
    $videosContainer?.insertAdjacentHTML(
      'beforeend',
      '<p class="empty-bookmarks-msg">No bookmarks yet</p>',
    );
  }

  async renderBookmarks(videoId) {
    if (!this.state.videoBookmarks.has(videoId)) {
      await this.fetchBookmarksData(videoId);
    }

    const ids = this.state.videoBookmarks.get(videoId);

    if (ids.length) {
      this.Video.setBookmarksCount(videoId, ids.length);

      for (const bookmarkId of ids) {
        const bookmark = this.state.bookmarks.byId.get(bookmarkId);
        const createdBookmark = new this.Bookmark({
          getBookmark: () => this.state.bookmarks.byId.get(bookmarkId),
          services: this.services,
        });
        createdBookmark.onBookmarkUpdate = async (updatedBookmark) => {
          this.state.bookmarks.byId.set(updatedBookmark.id, updatedBookmark);
        };
        createdBookmark.onBookmarkDelete = async () => {
          this.Video.removeBookmark(bookmark.id);
          this.removeBookmark(bookmark.id);
          createdBookmark.setBookmarksCount(
            this.state.videoBookmarks.get(videoId)?.length || 0,
          );
        };
        createdBookmark.onColorPickerInvoke = ($invoker, bookmarkId) => {
          this.state.$colorPickerInvoker = $invoker;
          this.state.colorPickerBookmarkId = bookmarkId;
        };
        this.Video.pushBookmark(videoId, bookmark, createdBookmark.dom);
      }
    }
  }

  attachColorPickerListeners() {
    const $colorPickerPopover = document.getElementById(
      'bookmark-color-picker',
    );

    $colorPickerPopover.addEventListener('beforetoggle', (e) => {
      if (e.newState === 'open') {
        const selectedBookmark = this.state.bookmarks.byId.get(
          this.state.colorPickerBookmarkId,
        );
        $colorPickerPopover.querySelectorAll('input').forEach(($input) => {
          $input.checked = false;
          if ($input.value === selectedBookmark.color) {
            $input.checked = true;
          }
        });
      }
    });
    $colorPickerPopover.firstElementChild.addEventListener(
      'change',
      async (e) => {
        this.state.$colorPickerInvoker.style.backgroundColor = e.target.value;
        const getRes = await this.services.getBookmark(
          this.state.colorPickerBookmarkId,
        );

        if (getRes.bookmark) {
          const result = await this.services.updateBookmark({
            ...getRes.bookmark,
            color: e.target.value,
          });

          if (result.success) {
            const bookmark = this.state.bookmarks.byId.get(
              this.state.colorPickerBookmarkId,
            );
            this.state.bookmarks.byId.set(bookmark.id, {
              ...bookmark,
              color: e.target.value,
            });
          }
        }
      },
    );
  }

  attachSearch() {
    const $searchForm = document.getElementById('search');
    $searchForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const formData = new FormData($searchForm);
      const value = formData.get('search').trim().toLowerCase();

      if (value) {
        // TODO: show something if no results found?
        this.state.renderedVideosCount = 0;
        this.state.filteredVideos = [];
        this.state.videos.byId.forEach((video, videoId) => {
          if (video.title.toLowerCase().includes(value)) {
            this.state.filteredVideos.push(videoId);
          } else {
          }
        });
        this.findVideosList()?.replaceChildren();
        this.renderVideos();
      } else {
        this.state.renderedVideosCount = 0;
        this.state.filteredVideos = null;
        this.findVideosList()?.replaceChildren();
        this.renderVideos();
      }
    });
  }

  attachLoadMoreVideos() {
    this.findVideosList().addEventListener('scroll', (e) => {
      if (
        e.target.scrollTop + e.target.clientHeight >=
        e.target.scrollHeight - 100
      ) {
        const ids = this.state.filteredVideos || this.state.videos.ids;
        if (this.state.renderedVideosCount < ids.length) {
          this.renderVideos();
        }
      }
    });
  }

  setVideosCount(count = 0) {
    document.getElementById('videos-count').textContent = count;
  }

  findVideosList() {
    return document.getElementById('videos-list');
  }

  addVideo(videoId, video) {
    this.state.videos.byId.set(videoId, video);
    this.state.videos.ids.push(videoId);
  }

  removeVideo(videoId) {
    this.state.videos.byId.delete(videoId);
    this.state.videos.ids = this.state.videos.ids.filter(
      (id) => id !== videoId,
    );
    this.state.videoBookmarks.delete(videoId);
  }

  addBookmark(bookmarkId, bookmark) {
    this.state.bookmarks.byId.set(bookmarkId, bookmark);
    this.state.bookmarks.ids.push(bookmarkId);
  }

  removeBookmark(bookmarkId) {
    const bookmark = this.state.bookmarks.byId.get(bookmarkId);
    this.state.bookmarks.byId.delete(bookmarkId);
    this.state.bookmarks.ids = this.state.bookmarks.ids.filter(
      (id) => id !== bookmarkId,
    );
    const videoBookmarks = this.state.videoBookmarks.get(bookmark.videoId);
    this.state.videoBookmarks.set(
      bookmark.videoId,
      videoBookmarks.filter((id) => id !== bookmark.id),
    );
  }
}
