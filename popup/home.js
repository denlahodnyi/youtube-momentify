export default class HomePage {
  services;
  Bookmark;
  Video;
  onNavigate;
  state = {
    videoId: null,
    $currentColorPickerInvoker: null,
    currentColorPickerBookmark: null,
  };

  constructor({ videoId, handleNavToSettings }, { Services, Bookmark, Video }) {
    this.services = Services;
    this.Bookmark = Bookmark;
    this.Video = Video;
    this.state.videoId = videoId;
    this.handleNavToSettings = handleNavToSettings;
    this.attachColorPickerListeners();
  }

  render($container) {
    this.renderPageLayout($container);
    this.renderVideos();
    this.attachSearchListeners();
  }

  renderPageLayout($container) {
    const $tmpl = document.getElementById('home-template');
    $container.append($tmpl.content.cloneNode(true));
    document.getElementById('settings-link').addEventListener('click', () => {
      this.onNavigate?.();
    });
  }

  async renderVideos() {
    const result = await this.services.getVideos(this.state.videoId);

    if (result.success && result.list.length) {
      this.setVideosCount(result.list.length);
      const $videosContainer = document.getElementById('videos-list');

      for (const video of result.list) {
        const createdVideo = new this.Video({
          video,
          currentVideoId: this.state.videoId,
          services: this.services,
        });
        createdVideo.onVideoDelete = async () => {
          const { count } = await this.services.getVideosCount();
          this.setVideosCount(count);
          if (count === 0) {
            this.renderEmptyVideosMessage();
          }
        };
        const $videoItem = createdVideo.dom;

        if ($videoItem) {
          $videosContainer.append($videoItem);
          createdVideo.setBookmarksCount(video.bookmarks.length);
          const $bmList = $videoItem.querySelector(
            '[data-component="bookmarks-list"]',
          );
          $bmList.style.display = 'block';

          for (const bookmark of video.bookmarks) {
            const createdBookmark = new this.Bookmark({
              bookmark,
              services: this.services,
            });
            createdBookmark.onBookmarkDelete = async () => {
              createdVideo.removeBookmark(bookmark.id);
              const { count } = await this.services.getVideoBookmarksCount(
                bookmark.videoId,
              );
              createdBookmark.setBookmarksCount(count);
            };
            createdBookmark.onColorPickerInvoke = ($invoker, bookmark) => {
              this.state.$currentColorPickerInvoker = $invoker;
              this.state.currentColorPickerBookmark = bookmark;
            };
            createdVideo.pushBookmark(bookmark, createdBookmark.dom);
          }
        }
      }
    } else {
      this.renderEmptyVideosMessage();
    }
  }

  renderEmptyVideosMessage() {
    const $videosContainer = document.getElementById('videos-list');
    $videosContainer?.insertAdjacentHTML(
      'beforeend',
      '<p class="empty-bookmarks-msg">No bookmarks yet</p>',
    );
  }

  attachColorPickerListeners() {
    const $colorPickerPopover = document.getElementById(
      'bookmark-color-picker',
    );

    $colorPickerPopover.addEventListener('beforetoggle', (e) => {
      if (e.newState === 'open') {
        $colorPickerPopover.querySelectorAll('input').forEach(($input) => {
          $input.checked = false;
          if ($input.value === this.state.currentColorPickerBookmark.color) {
            $input.checked = true;
          }
        });
      }
    });
    $colorPickerPopover.firstElementChild.addEventListener(
      'change',
      async (e) => {
        this.state.$currentColorPickerInvoker.style.backgroundColor =
          e.target.value;
        const getRes = await this.services.getBookmark(
          this.state.currentColorPickerBookmark.id,
        );

        if (getRes.bookmark) {
          const result = await this.services.updateBookmark({
            ...getRes.bookmark,
            color: e.target.value,
          });

          if (result.success) {
            this.state.currentColorPickerBookmark.color = e.target.value;
          }
        }
      },
    );
  }

  attachSearchListeners() {
    const $searchForm = document.getElementById('search');
    $searchForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const value = e.target.elements[0].value.trim().toLowerCase();
      const $videoItems = document.querySelectorAll(
        '[data-component="video-container"]',
      );
      $videoItems.forEach(($item) => {
        // TODO: show something if no results found?
        const title = $item
          .querySelector('[data-component="video-title"]')
          .textContent.toLowerCase();
        if (title.includes(value)) {
          $item.style.removeProperty('display');
        } else {
          $item.style.display = 'none';
        }
      });
    });
  }

  setVideosCount(count = 0) {
    document.getElementById('videos-count').textContent = count;
  }
}
