import type { Bookmark, Tag, Video } from '@/api/index.js';
import { colors } from './popupUtils.js';
import type Services from './services.js';
import type BookmarkComponent from './bookmark.js';
import type VideoComponent from './video.js';

const TAG_TITLE_CONSTRAINS = { min: 1, max: 20 };

interface State {
  videoId: null | Video['videoId'];
  $colorPickerInvoker: null | HTMLElement;
  colorPickerBookmarkId: null | Bookmark['id'];
  videos: {
    byId: Map<Video['videoId'], Video>;
    ids: Video['videoId'][];
  };
  bookmarks: {
    byId: Map<Bookmark['id'], Bookmark>;
    ids: Bookmark['id'][];
  };
  tags: {
    byId: Map<Tag['id'], Tag>;
    ids: Tag['id'][];
  };
  videoBookmarks: Map<Video['videoId'], Bookmark['id'][]>;
  boundBookmarksRenderHandlers: Map<Video['videoId'], (e: Event) => void>;
  filteredVideos: null | Video['videoId'][];
  renderedVideosCount: number;
  videosPerPage: number;
  selectedTagId: null | Tag['id'];
  videosEarlyRequest: null | Promise<void>;
  tagsEarlyRequest: null | Promise<void>;
}

export default class HomePage {
  services: typeof Services;
  bookmarkFactory: typeof BookmarkComponent;
  videoFactory: typeof VideoComponent;
  onNavigate?: () => void;
  state: State = {
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

  constructor(
    args: { videoId: Video['videoId'] | null },
    components: {
      Services: typeof Services;
      Bookmark: typeof BookmarkComponent;
      Video: typeof VideoComponent;
    },
  ) {
    const { videoId } = args;
    const { Services, Bookmark, Video } = components;
    this.services = Services;
    this.bookmarkFactory = Bookmark;
    this.videoFactory = Video;
    this.state.videoId = videoId;
    this.state.videosEarlyRequest = this.fetchVideosData();
    this.state.tagsEarlyRequest = this.fetchTags();

    this.prepareColorPicker();
    this.prepareTagPicker();
    this.prepareTagEditPopover();
  }

  async fetchVideosData() {
    if (this.state.videoId) {
      const result = await this.services.getVideos(this.state.videoId);
      if (result.success && result.normalized) {
        this.state.videos.byId = new Map(result.list.byId);
        this.state.videos.ids = result.list.ids;
      }
    }
  }

  async fetchBookmarksData(videoId: Video['videoId']) {
    if (!this.state.videoBookmarks.get(videoId)) {
      const result = await this.services.getVideoBookmarks(videoId);
      if (result.success && result.normalized) {
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

  render($container: HTMLElement) {
    this.state.renderedVideosCount = 0;
    this.state.filteredVideos = null;
    this.state.selectedTagId = null;
    this.state.videoBookmarks.clear();
    this.state.boundBookmarksRenderHandlers.clear();
    this.state.bookmarks.byId.clear();
    this.state.bookmarks.ids = [];
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

  renderPageLayout($container: HTMLElement) {
    const templateContent = (
      document.getElementById('home-template') as HTMLTemplateElement
    ).content;
    $container.append(templateContent.cloneNode(true));
    document.getElementById('settings-link')?.addEventListener('click', () => {
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

        if (video) {
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
            const vid = this.state.videos.byId.get(videoId);
            if (vid) {
              this.state.videos.byId.set(videoId, { ...vid, tagId: [] });
              if (this.state.selectedTagId) {
                this.videoFactory.find(videoId)?.remove();
              } else {
                this.setVideoTag(videoId, null);
              }
            }
          };

          if (video.tagId && video.tagId[0]) {
            this.setVideoTag(createdVideo.dom, video.tagId[0]);
          } else {
            const $tagTitle =
              createdVideo.dom.querySelector('[data-tag-title]');
            if ($tagTitle) $tagTitle.textContent = HomePage.defaultTagLabel;
          }

          const $videoItem = createdVideo.dom;

          if ($videoItem && $videosList) {
            if (i > 10) $videoItem.style.contentVisibility = 'auto';
            $videosList.append($videoItem);

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
              this.state.boundBookmarksRenderHandlers.set(
                videoId,
                renderHandler,
              );
              $videoItem.addEventListener('mouseenter', renderHandler);
              $videoItem.addEventListener('focusin', renderHandler);
            }
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

  renderBookmarksOnIntent(videoId: Video['videoId'], e: Event) {
    const $videoItem = document.getElementById(
      this.videoFactory.getDomId(videoId),
    );

    if ($videoItem) {
      const $details = $videoItem.querySelector('details');

      if (e.type === 'mouseenter') {
        $videoItem.dataset.hovered = 'true';
      }

      const duplicateEvent =
        e.type === 'focusin' && $videoItem.dataset.hovered === 'true';

      if (!this.state.videoBookmarks.has(videoId) && !duplicateEvent) {
        const clearInteractionListeners = () => {
          const handler = this.state.boundBookmarksRenderHandlers.get(videoId);
          if (handler) {
            $videoItem.removeEventListener('mouseenter', handler);
            $videoItem.removeEventListener('focusin', handler);
            this.state.boundBookmarksRenderHandlers.delete(videoId);
          }
        };

        let isRendering = false;
        const timer = setTimeout(() => {
          if (!isRendering) {
            isRendering = true;
            clearInteractionListeners();
            this.renderBookmarks(videoId);
          }
        }, 250);

        const toggleEvent = (ev: Event) => {
          if ((ev.target as HTMLDetailsElement).open && !isRendering) {
            isRendering = true;
            clearTimeout(timer);
            clearInteractionListeners();
            this.renderBookmarks(videoId);
          }
        };
        $details?.addEventListener('toggle', toggleEvent, { once: true });

        const leaveEvent = () => {
          clearTimeout(timer);
          $details?.removeEventListener('toggle', toggleEvent);
          delete $videoItem.dataset.hovered;
        };

        if (e.type === 'mouseenter') {
          $videoItem.addEventListener('mouseleave', leaveEvent, { once: true });
        } else if (e.type === 'focusin') {
          $videoItem.addEventListener('focusout', leaveEvent, { once: true });
        }
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

  async renderBookmarks(videoId: Video['videoId']) {
    if (!this.state.videoBookmarks.has(videoId)) {
      await this.fetchBookmarksData(videoId);
    }

    const ids = this.state.videoBookmarks.get(videoId);

    if (ids?.length) {
      this.videoFactory.setBookmarksCount(videoId, ids.length);

      for (const bookmarkId of ids) {
        const bookmark = this.state.bookmarks.byId.get(bookmarkId);
        if (bookmark) {
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
            this.videoFactory.setBookmarksCount(
              bookmark.videoId,
              this.state.videoBookmarks.get(videoId)?.length || 0,
            );
          };
          createdBookmark.onColorPickerInvoke = ($invoker, bookmarkId) => {
            this.state.$colorPickerInvoker = $invoker;
            this.state.colorPickerBookmarkId = bookmarkId;
          };
          this.videoFactory.pushBookmark(
            videoId,
            bookmark,
            createdBookmark.dom,
          );
        }
      }
    }
  }

  renderPickerTags() {
    const $tagPickerItemsList = document.getElementById('tag-picker-list');
    $tagPickerItemsList?.replaceChildren();

    this.state.tags.ids.forEach((tagId) => {
      const tag = this.state.tags.byId.get(tagId);
      if (tag) {
        const $tagPickerItem = this.createTagPickerItem(tag);
        if ($tagPickerItem) $tagPickerItemsList?.append($tagPickerItem);
      }
    });
  }

  setVideoTag(
    videoIdOrDom: Video['videoId'] | HTMLElement,
    tagId: Tag['id'] | null,
  ) {
    const $video =
      typeof videoIdOrDom === 'string'
        ? this.videoFactory.find(videoIdOrDom)
        : videoIdOrDom;

    if ($video) {
      const $tag = $video.querySelector<HTMLElement>('[data-tag-root]');
      const $tagTitle = $video.querySelector<HTMLElement>('[data-tag-title]');
      const $tagColor = $video.querySelector<HTMLElement>('[data-tag-color]');
      const $tagDelete = $video.querySelector<HTMLButtonElement>(
        '[data-component="video-tag-del-button"]',
      );
      let tag: Tag | null = tagId
        ? (this.state.tags.byId.get(tagId) ?? null)
        : null;

      if ($tag) $tag.dataset.tagRoot = tagId ?? '';
      if ($tagTitle)
        $tagTitle.textContent = tag?.title ?? HomePage.defaultTagLabel;
      if ($tagDelete) $tagDelete.hidden = !tagId;
      if ($tagColor) {
        if (tag?.color) {
          $tagColor.style.setProperty('--tag-color', tag.color);
        } else {
          $tagColor.style.removeProperty('--tag-color');
        }
      }
      const $empty = $video.querySelector<HTMLElement>(
        '[data-tag-empty-title]',
      );
      if ($empty) $empty.hidden = !!tag;
      const $hint = $video.querySelector<HTMLElement>(
        '[data-tag-selected-title-hint]',
      );
      if ($hint) $hint.hidden = !tag;
    }
  }

  createTagPickerItem(tag: Tag) {
    const $itemTmpl = document.getElementById(
      'tag-item-template',
    ) as HTMLTemplateElement | null;
    const templateContent = $itemTmpl
      ? $itemTmpl.content.firstElementChild
      : null;
    if (templateContent) {
      const $item = templateContent.cloneNode(true) as HTMLElement;
      $item.dataset.tagRoot = tag.id;
      const $title = $item.querySelector('[data-tag-title]');
      if ($title) $title.textContent = tag.title;
      const $select = $item.querySelector<HTMLElement>(
        '[data-component="tag-picker-item-select"]',
      );
      if ($select) $select.dataset.tagId = tag.id;
      const $edit = $item.querySelector<HTMLElement>(
        '[data-component="tag-picker-item-edit"]',
      );
      if ($edit) $edit.dataset.tagId = tag.id;
      if (tag.color) {
        const $color = $item.querySelector<HTMLElement>('[data-tag-color]');
        if ($color) $color.style.setProperty('--tag-color', tag.color);
      }
      return $item;
    }
  }

  createTagToFilterBy(tag: Tag) {
    const $tmpl = document.getElementById(
      'selected-filter-tag-template',
    ) as HTMLTemplateElement | null;
    const templateContent = $tmpl ? $tmpl.content.firstElementChild : null;
    if (templateContent) {
      const $tag = templateContent.cloneNode(true) as HTMLElement;
      $tag.dataset.tagRoot = tag.id;
      if (tag.color) {
        $tag.style.setProperty('--tag-color', tag.color);
      }
      const $title = $tag.querySelector('[data-tag-title]');
      if ($title) $title.textContent = tag.title;
      $tag
        .querySelector('[data-component="selected-filter-tag-del-button"]')
        ?.addEventListener(
          'click',
          () => {
            this.state.selectedTagId = null;
            this.state.filteredVideos = null;
            this.state.renderedVideosCount = 0;
            $tag.remove();
            this.refreshVideos();
            const $status = document.getElementById('filters-result-status');
            if ($status) $status.textContent = '';
          },
          { once: true },
        );
      return $tag;
    }
  }

  prepareTagPicker() {
    const $tagPickerPopover = document.getElementById('tag-picker');
    const $tagPickerItemsList = document.getElementById('tag-picker-list');
    const $tagPickerNewItemForm = document.getElementById('tag-picker-form');
    const $tagPickerNewItemInput = document.getElementById(
      'tag-picker-input',
    ) as HTMLInputElement | null;

    if (
      $tagPickerPopover &&
      $tagPickerItemsList &&
      $tagPickerNewItemForm &&
      $tagPickerNewItemInput
    ) {
      $tagPickerNewItemInput.setAttribute(
        'minLength',
        TAG_TITLE_CONSTRAINS.min.toString(),
      );
      $tagPickerNewItemInput.setAttribute(
        'maxLength',
        TAG_TITLE_CONSTRAINS.max.toString(),
      );

      let action: 'select-filter-tag' | 'select-video-tag'; // select-filter-tag | select-video-tag
      let videoId: Video['videoId'] | null;

      $tagPickerPopover.addEventListener('beforetoggle', (e) => {
        const trigger = (e as any).source as HTMLElement;
        if (
          e.newState === 'open' &&
          (trigger.dataset.action === 'select-filter-tag' ||
            trigger.dataset.action === 'select-video-tag')
        ) {
          action = trigger.dataset.action;
          videoId = trigger.dataset.videoId ?? null;
        }
      });

      $tagPickerNewItemForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const tagTitle = new FormData(e.target as HTMLFormElement).get(
          'tag',
        ) as string;
        $tagPickerNewItemInput.value = tagTitle.trim();
        const isValid = $tagPickerNewItemInput.checkValidity();
        if (isValid) {
          const result = await this.services.createTag({ title: tagTitle });
          if (result.success) {
            this.state.tags.byId.set(result.tag.id, result.tag);
            this.state.tags.ids.push(result.tag.id);
            const $tag = this.createTagPickerItem(result.tag);
            if ($tag) $tagPickerItemsList.prepend($tag);
            $tagPickerNewItemInput.value = '';
          }
        }
      });

      $tagPickerItemsList.addEventListener('click', async (e) => {
        const tagId = (e.target as HTMLElement).closest<HTMLElement>(
          '[data-tag-picker-action][data-tag-id]',
        )?.dataset.tagId;
        if (!tagId) return;
        if (action === 'select-filter-tag') {
          this.state.selectedTagId = tagId;
          this.state.renderedVideosCount = 0;
          this.state.filteredVideos = this.state.videos.ids.filter(
            (id) => this.state.videos.byId.get(id)?.tagId?.[0] === tagId,
          );
          const selectedTag = this.state.tags.byId.get(tagId);
          const resultsCount = this.state.filteredVideos.length;
          if (selectedTag) {
            const $tag = this.createTagToFilterBy(selectedTag);
            if ($tag) {
              document
                .getElementById('selected-filter-tag')
                ?.replaceChildren($tag);
            }
            const $status = document.getElementById('filters-result-status');
            if ($status) {
              $status.textContent = `Applied tag: ${selectedTag.title}. ${resultsCount} result${resultsCount === 1 ? '' : 's'}`;
            }
            this.refreshVideos();

            $tagPickerPopover.hidePopover();
          }
        }
        if (action === 'select-video-tag' && videoId) {
          const result = await this.services.setTag(videoId, tagId);

          if (result.success) {
            const video = this.state.videos.byId.get(videoId);
            if (video) {
              this.state.videos.byId.set(videoId, { ...video, tagId: [tagId] });
            }

            if (
              this.state.selectedTagId &&
              this.state.selectedTagId !== tagId
            ) {
              this.videoFactory.find(videoId)?.remove();
            } else {
              this.setVideoTag(videoId, tagId);
            }

            $tagPickerPopover.hidePopover();
          }
        }
      });
    }
  }

  prepareTagEditPopover() {
    const $tagEditPopover = document.getElementById(
      'tag-picker-edit',
    ) as HTMLElement | null;
    const $tagEditInput = document.getElementById(
      'tag-picker-edit-input',
    ) as HTMLInputElement | null;
    const $tagEditForm = document.getElementById(
      'tag-picker-edit-form',
    ) as HTMLFormElement | null;
    const $tagDeleteButton = document.getElementById(
      'tag-picker-edit-delete',
    ) as HTMLButtonElement | null;
    let editedTagId: Tag['id'];

    const $tagColors = document.getElementById('tag-picker-edit-colors');
    const $colorTmpl = document.getElementById(
      'tag-picker-color-item-template',
    ) as HTMLTemplateElement | null;
    const templateContent = $colorTmpl
      ? $colorTmpl.content.firstElementChild
      : null;
    // Set colors only ones
    if ($tagColors && templateContent) {
      Object.entries(colors).map(([colorName, hex]) => {
        const $colorOption = templateContent.cloneNode(true) as HTMLElement;
        const $color = $colorOption.querySelector<HTMLElement>(
          '[data-component="tag-picker-color"]',
        );
        if ($color) $color.style.backgroundColor = hex;
        const $colorName = $colorOption.querySelector<HTMLElement>(
          '[data-component="tag-picker-color-name"]',
        );
        if ($colorName) $colorName.textContent = colorName;
        const $input = $colorOption.querySelector<HTMLInputElement>(
          '[data-component="tag-picker-color-item-input"]',
        );
        if ($input) $input.value = hex;
        $tagColors.append($colorOption);
      });
    }

    $tagEditPopover?.addEventListener('beforetoggle', (e) => {
      // Trigger button (edit button) must hold data-tag-id
      const trigger = (e as any).source as HTMLElement;
      if (e.newState === 'open' && trigger.dataset.tagId) {
        editedTagId = trigger.dataset.tagId;
        if ($tagEditInput) {
          const tag = this.state.tags.byId.get(editedTagId);
          $tagEditInput.value = tag?.title || '';
        }
      }
    });

    $tagEditForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const tag = this.state.tags.byId.get(editedTagId);
      const tagTitle = new FormData(e.target as HTMLFormElement).get(
        'tag',
      ) as string;

      if ($tagEditInput) {
        $tagEditInput.value = tagTitle.trim();
        const isValid = $tagEditInput.checkValidity();

        if (isValid && tag) {
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
      }
    });

    $tagColors?.addEventListener('change', async (e) => {
      if ((e.target as HTMLInputElement).value) {
        const tag = this.state.tags.byId.get(editedTagId);
        if (tag) {
          tag.color = (e.target as HTMLInputElement).value;
          const result = await this.services.updateTag(tag);

          if (result.success) {
            this.state.tags.byId.set(result.tag.id, tag);
            document
              .querySelectorAll<HTMLElement>(
                `[data-tag-root="${result.tag.id}"][data-tag-color], [data-tag-root="${result.tag.id}"] [data-tag-color]`,
              )
              .forEach(($t) => {
                $t.style.setProperty(
                  '--tag-color',
                  (e.target as HTMLInputElement).value,
                );
              });
          }
        }
      }
    });

    $tagDeleteButton?.addEventListener('click', async () => {
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

          $tagEditPopover?.hidePopover();

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
              const $tag = $v.querySelector<HTMLElement>('[data-tag-root]');
              if ($tag && $tag.dataset.tagRoot === tagId) {
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

    $colorPickerPopover?.addEventListener('beforetoggle', (e) => {
      if (e.newState === 'open' && this.state.colorPickerBookmarkId) {
        const selectedBookmark = this.state.bookmarks.byId.get(
          this.state.colorPickerBookmarkId,
        );
        $colorPickerPopover.querySelectorAll('input').forEach(($input) => {
          $input.checked = false;
          if ($input.value === selectedBookmark?.color) {
            $input.checked = true;
          }
        });
      }
    });
    $colorPickerPopover
      ?.querySelector('#color-picker-form')
      ?.addEventListener('change', async (e) => {
        if (this.state.$colorPickerInvoker) {
          this.state.$colorPickerInvoker.style.backgroundColor = (
            e.target as HTMLInputElement
          ).value;
        }

        if (this.state.colorPickerBookmarkId) {
          const getRes = await this.services.getBookmark(
            this.state.colorPickerBookmarkId,
          );

          if (getRes.bookmark) {
            const result = await this.services.updateBookmark({
              ...getRes.bookmark,
              color: (e.target as HTMLInputElement).value,
            });

            if (result.success) {
              // const bookmark = this.state.bookmarks.byId.get(
              //   this.state.colorPickerBookmarkId,
              // );
              // this.state.bookmarks.byId.set(bookmark.id, {
              //   ...bookmark,
              //   color: (e.target as HTMLInputElement).value,
              // });
              this.state.bookmarks.byId.set(
                result.bookmark.id,
                result.bookmark,
              );
            }
          }
        }
      });
  }

  searchVideos(title: string) {
    if (title) {
      this.state.renderedVideosCount = 0;
      this.state.filteredVideos = [];
      this.state.videos.byId.forEach((video, videoId) => {
        if (
          video.title.toLowerCase().includes(title) &&
          (this.state.selectedTagId
            ? video.tagId?.[0] === this.state.selectedTagId
            : true)
        ) {
          this.state.filteredVideos!.push(videoId);
        }
      });
      this.refreshVideos();
    } else {
      this.state.renderedVideosCount = 0;
      this.state.filteredVideos = this.state.selectedTagId
        ? this.state.videos.ids.filter(
            (id) =>
              this.state.videos.byId.get(id)?.tagId?.[0] ===
              this.state.selectedTagId,
          )
        : null;
      this.refreshVideos();
    }
  }

  searchTimer?: ReturnType<typeof setTimeout>;

  attachSearch() {
    const $searchForm = document.getElementById('search');
    $searchForm?.addEventListener('input', (e) => {
      clearTimeout(this.searchTimer);
      this.searchTimer = setTimeout(() => {
        clearTimeout(this.searchTimer);
        this.searchVideos(
          (e.target as HTMLInputElement).value.trim().toLowerCase(),
        );
      }, 1200);
    });
    $searchForm?.addEventListener('submit', (e) => {
      e.preventDefault();
      clearTimeout(this.searchTimer);
      const formData = new FormData($searchForm as HTMLFormElement);
      const value = (formData.get('search') as string).trim().toLowerCase();
      this.searchVideos(value);
    });
  }

  attachLoadMoreVideos() {
    this.findVideosList()?.addEventListener('scroll', (e) => {
      const scrollable = e.target as HTMLElement;
      if (
        scrollable.scrollTop + scrollable.clientHeight >=
        scrollable.scrollHeight - 100
      ) {
        const ids = this.state.filteredVideos || this.state.videos.ids;
        if (this.state.renderedVideosCount < ids.length) {
          this.renderVideos();
        }
      }
    });
  }

  setVideosCount(count = 0) {
    const $count = document.getElementById('videos-count');
    if ($count) $count.textContent = count.toString();
  }

  findVideosList() {
    return document.getElementById('videos-list');
  }

  addVideo(videoId: Video['videoId'], video: Video) {
    this.state.videos.byId.set(videoId, video);
    this.state.videos.ids.push(videoId);
  }

  removeVideo(videoId: Video['videoId']) {
    this.state.videos.byId.delete(videoId);
    this.state.videos.ids = this.state.videos.ids.filter(
      (id) => id !== videoId,
    );
    this.state.videoBookmarks.delete(videoId);
  }

  addBookmark(bookmarkId: Bookmark['id'], bookmark: Bookmark) {
    this.state.bookmarks.byId.set(bookmarkId, bookmark);
    this.state.bookmarks.ids.push(bookmarkId);
  }

  removeBookmark(bookmarkId: Bookmark['id']) {
    const bookmark = this.state.bookmarks.byId.get(bookmarkId);
    this.state.bookmarks.byId.delete(bookmarkId);
    this.state.bookmarks.ids = this.state.bookmarks.ids.filter(
      (id) => id !== bookmarkId,
    );
    if (bookmark) {
      const videoBookmarks = this.state.videoBookmarks.get(bookmark.videoId);
      if (videoBookmarks) {
        this.state.videoBookmarks.set(
          bookmark.videoId,
          videoBookmarks.filter((id) => id !== bookmark.id),
        );
      }
    }
  }
}
