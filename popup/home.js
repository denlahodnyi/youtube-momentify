import { colors } from './popupUtils.js';

const TAG_TITLE_CONSTRAINS = { min: 1, max: 20 };

export default class HomePage {
  services;
  bookmarkFactory;
  videoFactory;
  onNavigate;
  state = {
    videoId: null,
    $colorPickerInvoker: null,
    colorPickerBookmarkId: null,
    videos: { byId: new Map(), ids: [] },
    bookmarks: { byId: new Map(), ids: [] },
    tags: { byId: new Map(), ids: [] },
    videoBookmarks: new Map(), // videoId -> bookmarkId[]
    boundBookmarksRenderHandlers: new Map(),
    filteredVideos: null, // null | videoId[]
    renderedVideosCount: 0, // pagination offset
    videosPerPage: 30,
    selectedTagId: null,
    videosEarlyRequest: null,
    tagsEarlyRequest: null,
  };

  static defaultTagLabel = '';

  constructor({ videoId, handleNavToSettings }, { Services, Bookmark, Video }) {
    this.services = Services;
    this.bookmarkFactory = Bookmark;
    this.videoFactory = Video;
    this.state.videoId = videoId;
    this.handleNavToSettings = handleNavToSettings;
    this.state.videosEarlyRequest = this.fetchVideosData();
    this.state.tagsEarlyRequest = this.fetchTags();

    this.prepareColorPicker();
    this.prepareTagPicker();
    this.prepareTagEditPopover();
  }

  async fetchVideosData() {
    const result = await this.services.getVideos(this.state.videoId);
    if (result.success) {
      this.state.videos.byId = new Map(result.list.byId);
      this.state.videos.ids = result.list.ids;
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

  async fetchTags() {
    const result = await this.services.getTags();
    if (result.success) {
      this.state.tags.byId = new Map(result.list.byId);
      this.state.tags.ids = result.list.ids;
    }
  }

  render($container) {
    this.state.renderedVideosCount = 0;
    this.state.filteredVideos = null;
    this.state.selectedTagId = null;
    this.renderPageLayout($container);
    Promise.all([
      this.state.videosEarlyRequest ?? this.fetchVideosData(),
      this.state.tagsEarlyRequest ?? this.fetchTags(),
    ]).then(() => {
      this.state.videosEarlyRequest = null;
      this.state.tagsEarlyRequest = null;
      this.renderVideos();
      this.renderPickerTags();
      this.attachLoadMoreVideos();
      this.attachSearch();
    });
  }

  renderPageLayout($container) {
    $container.append(
      document.getElementById('home-template').content.cloneNode(true),
    );
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

        const createdVideo = new this.videoFactory({
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
        createdVideo.onTagDelete = () => {
          this.state.videos.byId.set(videoId, {
            ...this.state.videos.byId.get(videoId),
            tagId: [],
          });
          if (this.state.selectedTagId) {
            this.videoFactory.find(videoId)?.remove();
          } else {
            this.setVideoTag(videoId, null);
          }
        };

        if (video.tagId && video.tagId[0]) {
          this.setVideoTag(createdVideo.dom, video.tagId[0]);
        } else {
          createdVideo.dom.querySelector('[data-tag-title]').textContent =
            HomePage.defaultTagLabel;
        }

        const $videoItem = createdVideo.dom;

        if ($videoItem) {
          if (i > 10) $videoItem.style.contentVisibility = 'auto';
          $videosList.append($videoItem);
          // const $bmList = $videoItem.querySelector(
          //   '[data-component="bookmarks-list"]',
          // );
          // $bmList.style.display = 'block';

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

  refreshVideos() {
    this.findVideosList()?.replaceChildren();
    this.renderVideos();
  }

  renderBookmarksOnIntent(videoId, e) {
    const $videoItem = document.getElementById(
      this.videoFactory.getDomId(videoId),
    );
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
      '<p data-empty-videos-message class="empty-bookmarks-msg">No bookmarks yet</p>',
    );
  }

  async renderBookmarks(videoId) {
    if (!this.state.videoBookmarks.has(videoId)) {
      await this.fetchBookmarksData(videoId);
    }

    const ids = this.state.videoBookmarks.get(videoId);

    if (ids.length) {
      this.videoFactory.setBookmarksCount(videoId, ids.length);

      for (const bookmarkId of ids) {
        const bookmark = this.state.bookmarks.byId.get(bookmarkId);
        const createdBookmark = new this.bookmarkFactory({
          getBookmark: () => this.state.bookmarks.byId.get(bookmarkId),
          services: this.services,
        });
        createdBookmark.onBookmarkUpdate = async (updatedBookmark) => {
          this.state.bookmarks.byId.set(updatedBookmark.id, updatedBookmark);
        };
        createdBookmark.onBookmarkDelete = async () => {
          this.videoFactory.removeBookmark(bookmark.id);
          this.removeBookmark(bookmark.id);
          createdBookmark.setBookmarksCount(
            this.state.videoBookmarks.get(videoId)?.length || 0,
          );
        };
        createdBookmark.onColorPickerInvoke = ($invoker, bookmarkId) => {
          this.state.$colorPickerInvoker = $invoker;
          this.state.colorPickerBookmarkId = bookmarkId;
        };
        this.videoFactory.pushBookmark(videoId, bookmark, createdBookmark.dom);
      }
    }
  }

  renderPickerTags() {
    const $tagPickerItemsList = document.getElementById('tag-picker-list');
    $tagPickerItemsList.replaceChildren();

    this.state.tags.ids.forEach((tagId) => {
      const tag = this.state.tags.byId.get(tagId);
      $tagPickerItemsList.append(this.createTagPickerItem(tag));
    });
  }

  setVideoTag(videoIdOrDom, tagId) {
    const $video =
      typeof videoIdOrDom === 'string'
        ? this.videoFactory.find(videoIdOrDom)
        : videoIdOrDom;
    if ($video) {
      const tag = this.state.tags.byId.get(tagId);
      const $tag = $video.querySelector('[data-tag-root]');
      const $tagTitle = $video.querySelector('[data-tag-title]');
      const $tagColor = $video.querySelector('[data-tag-color]');
      const $tagDelete = $video.querySelector(
        '[data-component="video-tag-del-button"]',
      );
      $tag.dataset.tagRoot = tagId ?? '';
      $tagTitle.textContent = tag?.title ?? HomePage.defaultTagLabel;
      $tagDelete.hidden = !tagId;
      if (tagId && tag?.color) {
        $tagColor.style.setProperty('--tag-color', tag.color);
      } else {
        $tagColor.style.removeProperty('--tag-color');
      }
      $video.querySelector('[data-tag-empty-title]').hidden = !!tagId;
      $video.querySelector('[data-tag-selected-title-hint]').hidden = !tagId;
    }
  }

  createTagPickerItem(tag) {
    const $itemTmpl = document.getElementById('tag-item-template');
    const $item = $itemTmpl.content.firstElementChild.cloneNode(true);
    $item.dataset.tagRoot = tag.id;
    $item.querySelector('[data-tag-title]').textContent = tag.title;
    $item.querySelector(
      '[data-component="tag-picker-item-select"]',
    ).dataset.tagId = tag.id;
    $item.querySelector(
      '[data-component="tag-picker-item-edit"]',
    ).dataset.tagId = tag.id;
    if (tag.color) {
      $item
        .querySelector('[data-tag-color]')
        .style.setProperty('--tag-color', tag.color);
    }
    return $item;
  }

  createTagToFilterBy(tag) {
    const $tmpl = document.getElementById('selected-filter-tag-template');
    const $tag = $tmpl.content.firstElementChild.cloneNode(true);
    $tag.dataset.tagRoot = tag.id;
    if (tag.color) {
      $tag.style.setProperty('--tag-color', tag.color);
    }
    $tag.querySelector('[data-tag-title]').textContent = tag.title;
    $tag
      .querySelector('[data-component="selected-filter-tag-del-button"]')
      .addEventListener(
        'click',
        () => {
          this.state.selectedTagId = null;
          this.state.filteredVideos = null;
          this.state.renderedVideosCount = 0;
          $tag.remove();
          this.refreshVideos();
          document.getElementById('filters-result-status').textContent = '';
        },
        { once: true },
      );
    return $tag;
  }

  prepareTagPicker() {
    const $tagPickerPopover = document.getElementById('tag-picker');
    const $tagPickerItemsList = document.getElementById('tag-picker-list');
    const $tagPickerNewItemForm = document.getElementById('tag-picker-form');
    const $tagPickerNewItemInput = document.getElementById('tag-picker-input');

    $tagPickerNewItemInput.setAttribute('minLength', TAG_TITLE_CONSTRAINS.min);
    $tagPickerNewItemInput.setAttribute('maxLength', TAG_TITLE_CONSTRAINS.max);

    let action; // select-filter-tag | select-video-tag
    let videoId;

    $tagPickerPopover.addEventListener('beforetoggle', (e) => {
      if (e.newState === 'open' && e.source.dataset.action) {
        action = e.source.dataset.action;
        videoId = e.source.dataset.videoId;
      }
    });

    $tagPickerNewItemForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const tagTitle = new FormData(e.target).get('tag');
      $tagPickerNewItemInput.value = tagTitle.trim();
      const isValid = $tagPickerNewItemInput.checkValidity();
      if (isValid) {
        // TODO: set random color?
        const result = await this.services.createTag({ title: tagTitle });
        if (result.success) {
          this.state.tags.byId.set(result.tag.id, result.tag);
          this.state.tags.ids.push(result.tag.id);
          $tagPickerItemsList.prepend(this.createTagPickerItem(result.tag));
          $tagPickerNewItemInput.value = '';
        }
      }
    });

    $tagPickerItemsList.addEventListener('click', async (e) => {
      const tagId = e.target.closest('[data-tag-picker-action][data-tag-id]')
        ?.dataset.tagId;
      if (!tagId) return;
      if (action === 'select-filter-tag') {
        this.state.selectedTagId = tagId;
        this.state.renderedVideosCount = 0;
        this.state.filteredVideos = this.state.videos.ids.filter(
          (id) => this.state.videos.byId.get(id).tagId?.[0] === tagId,
        );
        const selectedTag = this.state.tags.byId.get(tagId);
        const resultsCount = this.state.filteredVideos.length;
        document
          .getElementById('selected-filter-tag')
          .replaceChildren(this.createTagToFilterBy(selectedTag));
        document.getElementById('filters-result-status').textContent =
          `Applied tag: ${selectedTag.title}. ${resultsCount} result${resultsCount === 1 ? '' : 's'}`;
        this.refreshVideos();

        $tagPickerPopover.hidePopover();
      }
      if (action === 'select-video-tag' && videoId) {
        const result = await this.services.setTag(videoId, tagId);

        if (result.success) {
          this.state.videos.byId.set(videoId, {
            ...this.state.videos.byId.get(videoId),
            tagId: [tagId],
          });

          if (this.state.selectedTagId && this.state.selectedTagId !== tagId) {
            this.videoFactory.find(videoId)?.remove();
          } else {
            this.setVideoTag(videoId, tagId);
          }

          $tagPickerPopover.hidePopover();
        }
      }
    });
  }

  prepareTagEditPopover() {
    const $tagEditPopover = document.getElementById('tag-picker-edit');
    const $tagEditInput = document.getElementById('tag-picker-edit-input');
    const $tagEditForm = document.getElementById('tag-picker-edit-form');
    const $tagDeleteButton = document.getElementById('tag-picker-edit-delete');
    let editedTagId;

    const $tagColors = document.getElementById('tag-picker-edit-colors');
    const $colorTmpl = document.getElementById(
      'tag-picker-color-item-template',
    );
    // Set colors only ones
    Object.entries(colors).map(([colorName, hex]) => {
      const $colorOption = $colorTmpl.content.firstElementChild.cloneNode(true);
      $colorOption.querySelector(
        '[data-component="tag-picker-color"]',
      ).style.backgroundColor = hex;
      $colorOption.querySelector(
        '[data-component="tag-picker-color-name"]',
      ).textContent = colorName;
      $colorOption.querySelector(
        '[data-component="tag-picker-color-item-input"]',
      ).value = hex;
      $tagColors.append($colorOption);
    });

    $tagEditPopover.addEventListener('beforetoggle', (e) => {
      // Trigger button (edit button) must hold data-tag-id
      if (e.newState === 'open' && e.source.dataset.tagId) {
        editedTagId = e.source.dataset.tagId;
        $tagEditInput.value = this.state.tags.byId.get(editedTagId).title;
      }
    });

    $tagEditForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const tag = this.state.tags.byId.get(editedTagId);
      const tagTitle = new FormData(e.target).get('tag');
      $tagEditInput.value = tagTitle.trim();
      const isValid = $tagEditInput.checkValidity();

      if (isValid) {
        const result = await this.services.updateTag({
          ...tag,
          title: tagTitle,
        });
        if (result.success) {
          this.state.tags.byId.set(result.tag.id, result.tag);
          document
            .querySelectorAll(
              `[data-tag-root="${result.tag.id}"] [data-tag-title]`,
            )
            .forEach(($title) => {
              if ($title.textContent === tag.title)
                $title.textContent = tagTitle;
            });
        }
      }
    });

    $tagColors.addEventListener('change', async (e) => {
      if (e.target.value) {
        const tag = this.state.tags.byId.get(editedTagId);
        tag.color = e.target.value;
        const result = await this.services.updateTag(tag);

        if (result.success) {
          this.state.tags.byId.set(result.tag.id, tag);
          document
            .querySelectorAll(
              `[data-tag-root="${result.tag.id}"][data-tag-color], [data-tag-root="${result.tag.id}"] [data-tag-color]`,
            )
            .forEach(($t) => {
              $t.style.setProperty('--tag-color', e.target.value);
            });
        }
      }
    });

    $tagDeleteButton.addEventListener('click', async () => {
      const tagId = editedTagId;
      if (tagId) {
        const result = await this.services.deleteTag(tagId);

        if (result.success) {
          this.state.videos.byId.forEach((video, videoId) => {
            if (video.tagId[0] === tagId) {
              video.tagId = [];
              this.state.videos.byId.set(videoId, video);
            }
          });
          this.state.tags.byId.delete(tagId);
          this.state.tags.ids = this.state.tags.ids.filter(
            (id) => id !== tagId,
          );

          $tagEditPopover.hidePopover();

          document
            .querySelector(`#tag-picker-list [data-tag-root="${tagId}"]`)
            ?.remove();

          if (this.state.selectedTagId) {
            document
              .querySelector('[data-component="selected-filter-tag"]')
              ?.remove();
            this.state.selectedTagId = null;
            this.state.filteredVideos = null;
            this.state.renderedVideosCount = 0;
            this.refreshVideos();
          } else {
            this.videoFactory.findAll().forEach(($v) => {
              if (
                $v.querySelector('[data-tag-root]').dataset.tagRoot === tagId
              ) {
                this.setVideoTag($v, null);
              }
            });
          }
        }
      }
    });
  }

  prepareColorPicker() {
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
    $colorPickerPopover
      .querySelector('#color-picker-form')
      .addEventListener('change', async (e) => {
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
      });
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
          if (
            video.title.toLowerCase().includes(value) &&
            (this.state.selectedTagId
              ? video.tagId?.[0] === this.state.selectedTagId
              : true)
          ) {
            this.state.filteredVideos.push(videoId);
          }
        });
        this.refreshVideos();
      } else {
        this.state.renderedVideosCount = 0;
        this.state.filteredVideos = this.state.selectedTagId
          ? this.state.videos.ids.filter(
              (id) =>
                this.state.videos.byId.get(id).tagId?.[0] ===
                this.state.selectedTagId,
            )
          : null;
        this.refreshVideos();
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
