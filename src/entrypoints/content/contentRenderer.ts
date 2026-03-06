import type { Bookmark, Theme } from '@/api';
import type { ContentRendererEvent, State } from './contentTypes';
import {
  applyTheme,
  createDomElement,
  getVideoIdFromUrl,
  getVideoTitle,
  resolveTheme,
} from './contentUtils';
import BookmarkButton from './bookmarkButton';
import type ProgressBar from './progressBar';
import type Mark from './mark';
import type MarkPopup from './markPopup';
import type BookmarkEditModal from './bookmarkEditModal';
import type Services from './services';

const chrome = browser;

let lastUrl = location.href;
function observeUrlChange(cb: (lastUrl: string) => void) {
  const observer = new MutationObserver(() => {
    if (location.href !== lastUrl) {
      console.log("Observer: urls don't match", lastUrl, location.href);
      lastUrl = location.href;
      cb(lastUrl);
    }
  });

  observer.observe(document, { subtree: true, childList: true });

  return observer;
}

export default class ContentRenderer {
  state: State = {
    videoId: getVideoIdFromUrl(location.href),
    videoDuration: 0,
    loopStartTime: 0,
    loopEndTime: 0,
    bookmarks: {
      byId: new Map(),
      ids: [], // Must be always sorted in ASC (by time)
      suspended: [],
    },
    video: null,
    tempLoopStartId: null,
  };
  static popupsContainerId = 'momentify-bookmark-popups-container';

  bookmarkButtonFactory: typeof BookmarkButton;
  progressBarFactory: typeof ProgressBar;
  markFactory: typeof Mark;
  markPopupFactory: typeof MarkPopup;
  bookmarkEditModalFactory: typeof BookmarkEditModal;
  services: typeof Services;
  bookmarkModal: InstanceType<typeof BookmarkEditModal>;

  boundLoopHandler: (e: Event) => void;
  boundAdjustMarksOnDurChange: (e: Event) => void;

  constructor(params: {
    BookmarkButton: typeof BookmarkButton;
    ProgressBar: typeof ProgressBar;
    Mark: typeof Mark;
    MarkPopup: typeof MarkPopup;
    BookmarkEditModal: typeof BookmarkEditModal;
    Services: typeof Services;
  }) {
    this.bookmarkButtonFactory = params.BookmarkButton;
    this.progressBarFactory = params.ProgressBar;
    this.markFactory = params.Mark;
    this.markPopupFactory = params.MarkPopup;
    this.bookmarkEditModalFactory = params.BookmarkEditModal;
    this.services = params.Services;

    this.boundLoopHandler = this.handleLoop.bind(this);
    this.boundAdjustMarksOnDurChange =
      this.adjustMarksOnDurationChange.bind(this);

    observeUrlChange((newUrl) => {
      this.state.videoId = getVideoIdFromUrl(newUrl);
      this.render();
    });

    this.bookmarkModal = new this.bookmarkEditModalFactory();
    this.bookmarkModal.setMediator(this);
    document.body.append(this.bookmarkModal.dom);

    this.setupTheme();
  }

  async notify(sender: unknown, event: ContentRendererEvent) {
    switch (event.type) {
      case 'ui/toggle_quick_save': {
        const $buttonWrapper = this.bookmarkButtonFactory.findContainer(true);
        if ($buttonWrapper) $buttonWrapper.hidden = !event.payload.show;
        break;
      }
      case 'ui/toggle_edited_save': {
        const $buttonWrapper = this.bookmarkButtonFactory.findContainer();
        if ($buttonWrapper) $buttonWrapper.hidden = !event.payload.show;
        break;
      }
      case 'ui/play_video': {
        const video = document.body.querySelector('video');

        // TODO: what if there is loop presence?
        if (video) {
          video.currentTime = event.payload.time;
          video.play();
        }

        break;
      }
      case 'ui/to_next_bookmark': {
        const $video = document.querySelector('video');

        if ($video) {
          const timestamps = this.state.bookmarks.ids
            .map((id) => {
              if (!this.state.bookmarks.suspended.includes(id)) {
                return this.state.bookmarks.byId.get(id)?.time;
              }
            })
            .filter((time) => typeof time !== 'undefined');
          console.log(
            `🚀 -> ContentRenderer -> notify -> timestamps:`,
            timestamps,
          );
          let next = timestamps[0];
          let start = 0;
          let end = timestamps.length - 1;

          if (
            $video.currentTime < timestamps[0] ||
            $video.currentTime >= timestamps[timestamps.length - 1]
          ) {
            next = timestamps[0];
          } else {
            while (start !== end) {
              const mid = Math.floor((start + end) / 2);
              if ($video.currentTime >= timestamps[mid]) {
                start = mid + 1;
              } else {
                end = mid;
              }
            }
            next = timestamps[start];
          }

          console.log(`🚀 -> ContentRenderer -> notify -> next:`, next);
          if (next) {
            $video.pause();
            $video.currentTime = next;
          }
        }

        break;
      }
      case 'ui/to_prev_bookmark': {
        const $video = document.querySelector('video');

        if ($video) {
          const timestamps = this.state.bookmarks.ids
            .map((id) => {
              if (!this.state.bookmarks.suspended.includes(id)) {
                return this.state.bookmarks.byId.get(id)?.time;
              }
            })
            .filter((time) => typeof time !== 'undefined');
          let next = timestamps.at(-1);
          let start = 0;
          let end = timestamps.length - 1;

          if (
            $video.currentTime <= timestamps[0] ||
            $video.currentTime > timestamps[timestamps.length - 1]
          ) {
            next = timestamps.at(-1);
          } else {
            while (start !== end) {
              const mid = Math.ceil((start + end) / 2);
              if ($video.currentTime <= timestamps[mid]) {
                end = mid - 1;
              } else {
                start = mid;
              }
            }
            next = timestamps[start];
          }

          if (next) {
            $video.pause();
            $video.currentTime = next;
          }
        }

        break;
      }
      case 'ui/render_bookmarks': {
        const $video = document.body.querySelector('video');

        if ($video) {
          const { bookmarks } = event.payload;

          const marks = bookmarks.map((bm) => {
            if (!this.state.bookmarks.byId.has(bm.id)) {
              this.state.bookmarks.byId.set(bm.id, bm);
              this.state.bookmarks.ids.push(bm.id);
            }
            return this.buildBookmark(bm, $video.duration).dom;
          });
          this.renderNewMarks(...marks);

          if (!this.state.video && this.state.videoId) {
            // Set video if we receive bookmarks for the first time
            const result = await this.services.getVideo({
              videoId: this.state.videoId,
            });
            if (result.success) {
              this.state.video = result.video;
            } else {
              console.error('[momentify] Cannot set video data');
            }
          }
        } else {
          console.error('[momentify] No video element found');
        }

        break;
      }
      case 'api/save_bookmark': {
        const { color = null, title = null, time = null } = event.payload || {};
        const $video = document.querySelector('video');
        const videoTitle = getVideoTitle();

        if ($video && this.state.videoId) {
          const result = await this.services.createBookmark({
            videoTitle,
            videoId: this.state.videoId,
            time: time ?? $video.currentTime,
            title,
            color,
          });
          if (sender instanceof BookmarkButton) {
            sender.notify({ type: 'success' });
          }

          if (result.success && this.state.videoId && !this.state.video) {
            // Set video if we save bookmark for the first time
            const result = await this.services.getVideo({
              videoId: this.state.videoId,
            });
            if (result.success) {
              this.state.video = result.video;
            } else {
              console.error('[momentify] Cannot set video data');
            }
          }
        } else {
          console.error('[momentify] No video element found');
        }

        break;
      }
      case 'api/update_bookmark': {
        await this.services.updateBookmark(event.payload.bookmark);
        break;
      }
      case 'ui/update_bookmark': {
        const { bookmark } = event.payload;
        this.state.bookmarks.byId.set(bookmark.id, bookmark);

        const $mark = this.markFactory.findMark(bookmark.id);
        if ($mark) $mark.style.backgroundColor = bookmark.color;

        const $popupTitle = this.markPopupFactory.findPopupTitle(bookmark.id);
        if ($popupTitle) $popupTitle.textContent = bookmark.title;

        break;
      }
      case 'ui/refresh_bookmarks': {
        this.cleanupBookmarksData();
        this.renderProgressBar();
        break;
      }
      case 'ui/open_bookmark_edit_modal': {
        const $video = document.querySelector('video');
        if ($video) {
          if (event.payload.isNewBookmark) {
            this.bookmarkModal.syncState({
              isNewBookmark: true as const,
              bookmark: {
                title: new Date().toLocaleString(),
                time: $video.currentTime,
              },
            });
          } else {
            const bookmark = this.state.bookmarks.byId.get(
              event.payload.bookmarkId,
            );
            if (bookmark) {
              this.bookmarkModal.syncState({
                isNewBookmark: false as const,
                bookmark,
              });
            }
          }
          $video?.pause();
          this.bookmarkModal.open();
        } else {
          console.error('[momentify] Cannot find video element');
        }
        break;
      }
      case 'ui/open_bookmark_details': {
        const { bookmarkId } = event.payload;
        this.markPopupFactory.closeAllPopups();
        const $popup = this.markPopupFactory.findPopup(bookmarkId);
        this.setMarkLoopUI(bookmarkId);
        $popup.show();
        break;
      }
      case 'api/delete_bookmark': {
        const { bookmarkId } = event.payload;
        await this.services.deleteBookmark({ bookmarkId });
        break;
      }
      case 'ui/delete_bookmark': {
        const { bookmarkId } = event.payload;

        if (
          bookmarkId === this.state.tempLoopStartId ||
          bookmarkId === this.state.video?.loopStartId ||
          bookmarkId === this.state.video?.loopEndId
        ) {
          await this.notify(null, {
            type: 'ui/remove_video_loop',
          });
        }
        this.markFactory.removeMark(bookmarkId);
        this.markPopupFactory.removePopup(bookmarkId);
        this.state.bookmarks.byId.delete(bookmarkId);
        this.state.bookmarks.ids = this.state.bookmarks.ids.filter(
          (id) => id !== bookmarkId,
        );

        break;
      }
      case 'ui/delete_all_bookmarks': {
        this.cleanupBookmarksData();
        break;
      }
      case 'ui/manage_loop': {
        const { action, bookmarkId } = event.payload;

        if (action === 'start') {
          this.state.tempLoopStartId = bookmarkId;
          this.setMarkLoopUI(bookmarkId);
        } else if (action === 'finish') {
          const loopStart =
            this.state.video?.loopStartId || this.state.tempLoopStartId;
          if (loopStart) {
            this.notify(null, {
              type: 'api/save_loop',
              payload: {
                loopStartId: loopStart,
                loopEndId: bookmarkId,
              },
            });
          }
        } else if (action === 'delete') {
          this.notify(null, {
            type: 'api/delete_loop',
            payload: { bookmarkId },
          });
        }
        break;
      }
      case 'api/save_loop': {
        const { loopStartId, loopEndId } = event.payload;
        if (this.state.videoId) {
          await this.services.saveLoop({
            videoId: this.state.videoId,
            loopStartId,
            loopEndId,
          });
        }
        break;
      }
      case 'ui/apply_video_loop': {
        const { loopStartId, loopEndId, videoId } = event.payload;
        const { loopStartId: prevStart, loopEndId: prevEnd } =
          this.state.video || {};

        if (this.state.videoId === videoId && this.state.video) {
          if (prevStart) this.setMarkLoopUI(prevStart, true);
          if (prevEnd) this.setMarkLoopUI(prevEnd, true);
          this.state.video.loopStartId = loopStartId;
          this.state.video.loopEndId = loopEndId;
          this.state.tempLoopStartId = null;
          this.setMarkLoopUI(loopStartId);
          this.setMarkLoopUI(loopEndId);
          this.setupVideoLoop(loopStartId, loopEndId);
        }

        break;
      }
      case 'api/delete_loop': {
        const { loopStartId, loopEndId } = this.state.video || {};

        if (loopStartId && loopEndId) {
          if (this.state.videoId) {
            await this.services.deleteLoop({
              videoId: this.state.videoId,
            });
          }
        } else if (this.state.tempLoopStartId) {
          const startLoopId = this.state.tempLoopStartId;
          this.state.tempLoopStartId = null;
          this.setMarkLoopUI(startLoopId, true);
        }
        break;
      }
      case 'ui/remove_video_loop': {
        const { loopStartId, loopEndId } = this.state.video || {};
        if (this.state.video) this.state.video.loopStartId = null;
        if (this.state.video) this.state.video.loopEndId = null;
        this.state.tempLoopStartId = null;
        this.removeVideoLoop();
        if (loopStartId) this.setMarkLoopUI(loopStartId, true);
        if (loopEndId) this.setMarkLoopUI(loopEndId, true);
        break;
      }
      case 'ui/set_theme': {
        const { theme } = event.payload;
        applyTheme(resolveTheme(theme));
        break;
      }
      default:
        console.warn('[momentify] Unknown mediator event');
        break;
    }
  }

  render() {
    this.cleanupBookmarksData();
    this.renderPopupsContainer();
    this.renderBookmarkButton();
    this.renderProgressBar();
  }

  renderPopupsContainer() {
    // Render out of .ytp-progress-bar to prevent issue with containing block:
    // .ytp-progress-bar may have transform style (on slide up), that affects
    // popup positioning using anchor-positioning
    const $YTprogressBarContainer = document.querySelector(
      '.ytp-progress-bar-container',
    );

    if (!$YTprogressBarContainer) {
      console.error('[momentify] Cannot find YouTube progress bar container');
    }

    const $popupsContainer = document.getElementById(
      ContentRenderer.popupsContainerId,
    );

    if ($YTprogressBarContainer && !$popupsContainer) {
      $YTprogressBarContainer.append(
        createDomElement(`
        <div id="${ContentRenderer.popupsContainerId}"></div>
      `),
      );
    }
  }

  async renderBookmarkButton() {
    const quickSave = this.bookmarkButtonFactory.findContainer(true);

    if (this.state.videoId && !quickSave) {
      const settings = await chrome.storage.local.get([
        'showQuickSave',
        'showEditedSave',
      ]);
      const quickSaveButton = new this.bookmarkButtonFactory(true);
      const saveWithEditButton = new this.bookmarkButtonFactory(false);
      quickSaveButton.setMediator(this);
      saveWithEditButton.setMediator(this);
      quickSaveButton.dom.hidden = !settings.showQuickSave;
      saveWithEditButton.dom.hidden = !settings.showEditedSave;

      const $controlsContainer = document.body.querySelector(
        '#movie_player .ytp-left-controls',
      );

      if ($controlsContainer) {
        $controlsContainer.insertAdjacentElement(
          'beforeend',
          quickSaveButton.dom,
        );
        $controlsContainer.insertAdjacentElement(
          'beforeend',
          saveWithEditButton.dom,
        );
      } else {
        console.error('[momentify] No controls container found');
      }
    }

    // Disable button if data is not ready
    const $video = document.querySelector('video');
    // On loadeddata event we can even not observe status > HAVE_METADATA, so
    // use that flag as a minimal proof of ready data
    let quickSaveButton = this.bookmarkButtonFactory.find(true);
    let editedSaveButton = this.bookmarkButtonFactory.find(true);

    if ($video) {
      quickSaveButton.disabled =
        $video.readyState < HTMLMediaElement.HAVE_METADATA;
      editedSaveButton.disabled =
        $video.readyState < HTMLMediaElement.HAVE_METADATA;
    }

    // Wait for data on every video change
    document.querySelector('video')?.addEventListener(
      'loadstart',
      () => {
        quickSaveButton.disabled = true;
        editedSaveButton.disabled = true;
      },
      { once: true },
    );
    document.querySelector('video')?.addEventListener(
      'loadeddata',
      () => {
        if ($video && $video.readyState >= HTMLMediaElement.HAVE_METADATA) {
          quickSaveButton.disabled = false;
          editedSaveButton.disabled = false;
        }
      },
      { once: true },
    );
  }

  async renderProgressBar() {
    if (this.state.videoId) {
      if (!this.progressBarFactory.find()) {
        const $youTubeProgressBar =
          document.body.querySelector('.ytp-progress-bar');

        if ($youTubeProgressBar) {
          $youTubeProgressBar.append(new this.progressBarFactory().dom);
        } else {
          console.error('[momentify] Cannot find YT progress bar element');
        }
      }

      const [bookmarksRes, videoRes] = await Promise.all([
        this.services.getBookmarks({ videoId: this.state.videoId }),
        this.services.getVideo({ videoId: this.state.videoId }),
      ]);

      this.state.video = videoRes.video || null;

      if (bookmarksRes.list && bookmarksRes.list.ids.length > 0) {
        this.state.bookmarks.byId = new Map(bookmarksRes.list.byId);
        this.state.bookmarks.ids = bookmarksRes.list.ids;
        const $video = document.body.querySelector('video');

        if ($video) {
          this.state.videoDuration = $video.duration;

          $video.removeEventListener(
            'durationchange',
            this.boundAdjustMarksOnDurChange,
          );
          $video.addEventListener(
            'durationchange',
            // Update marks position if video duration changes (this can happen
            // after marks was already rendered)
            // Keep in mind: ads also trigger duration change
            this.boundAdjustMarksOnDurChange,
          );

          if (Number.isNaN(this.state.videoDuration)) {
            this.state.videoDuration = await new Promise((resolve) => {
              $video.addEventListener(
                'loadedmetadata',
                () => {
                  resolve($video.duration);
                },
                { once: true },
              );
            });
          }

          const marks = this.state.bookmarks.ids
            .map((bookmarkId) => {
              const bookmark = this.state.bookmarks.byId.get(bookmarkId);
              return bookmark
                ? this.buildBookmark(bookmark, this.state.videoDuration).dom
                : null;
            })
            .filter(($b) => $b !== null);
          this.renderNewMarks(...marks);

          const { loopStartId, loopEndId } = videoRes.video;
          if (loopStartId && loopEndId) {
            this.setMarkLoopUI(loopStartId);
            this.setMarkLoopUI(loopEndId);
            this.setupVideoLoop(loopStartId, loopEndId);
          } else {
            this.removeVideoLoop();
          }
        } else {
          console.error('[momentify] Cannot find video element');
        }
      }
    }
  }

  setupVideoLoop(loopStartId: Bookmark['id'], loopEndId: Bookmark['id']) {
    this.removeVideoLoop();
    const $startMark = this.markFactory.findMark(loopStartId);
    const $endMark = this.markFactory.findMark(loopEndId);

    if ($startMark && $endMark) {
      const $video = document.querySelector('video');
      const startTime = this.markFactory.getMarkTime($startMark);
      const endTime = this.markFactory.getMarkTime($endMark);
      this.state.loopStartTime = Math.min(startTime, endTime);
      this.state.loopEndTime = Math.max(startTime, endTime);

      if ($video) {
        $video.addEventListener('timeupdate', this.boundLoopHandler);
      } else {
        console.error('[momentify] Cannot find video element');
      }
    }
  }

  removeVideoLoop() {
    const $video = document.querySelector('video');
    if ($video) {
      $video.removeEventListener('timeupdate', this.boundLoopHandler);
      this.state.loopStartTime = 0;
      this.state.loopEndTime = 0;
    } else {
      console.error('[momentify] Cannot find video element');
    }
  }

  handleLoop(e: Event) {
    if ((e.target as HTMLVideoElement).currentTime > this.state.loopEndTime) {
      (e.target as HTMLVideoElement).currentTime = this.state.loopStartTime;
    } else if (
      (e.target as HTMLVideoElement).currentTime < this.state.loopStartTime
    ) {
      (e.target as HTMLVideoElement).currentTime = this.state.loopStartTime;
    }
  }

  setMarkLoopUI(bookmarkId: Bookmark['id'], deleteLoop = false) {
    const { loopStartId, loopEndId } = this.state.video || {};
    const { tempLoopStartId } = this.state;
    const $mark = this.markFactory.findMark(bookmarkId);
    const $loopSign = this.markFactory.findLoopSign(bookmarkId);
    const $loopButton = this.markPopupFactory.findLoopButton(bookmarkId);
    const $loopLabel = this.markPopupFactory.findLoopLabel(bookmarkId);

    if (!$mark || !$loopLabel || !$loopButton || !$loopSign) return;

    if (bookmarkId === loopStartId || bookmarkId === tempLoopStartId) {
      $mark.dataset.loop = 'start';
    } else if (bookmarkId === loopEndId) {
      $mark.dataset.loop = 'finish';
    }

    if (deleteLoop) delete $mark.dataset.loop;

    if ($mark.dataset.loop === 'start' || $mark.dataset.loop === 'finish') {
      if ($loopLabel && $mark.dataset.loop === 'start') {
        if ($loopLabel.firstElementChild)
          $loopLabel.firstElementChild.textContent = 'Loop starts here';
      } else {
        if ($loopLabel.firstElementChild)
          $loopLabel.firstElementChild.textContent = 'Loop ends here';
      }

      $loopButton.dataset.action = '';
      $loopButton.hidden = true;
      $loopLabel.hidden = false;
      $loopSign.style.display = 'block';
    } else if (tempLoopStartId || loopStartId) {
      const $btnTitle = $loopButton.querySelector('span');
      if ($btnTitle) $btnTitle.textContent = 'Set loop end';
      $loopButton.dataset.action = 'finish';
      $loopButton.hidden = false;
      $loopLabel.hidden = true;
      $loopSign.style.display = 'none';
    } else {
      const $btnTitle = $loopButton.querySelector('span');
      if ($btnTitle) $btnTitle.textContent = 'Set loop start';
      $loopButton.dataset.action = 'start';
      $loopButton.hidden = false;
      $loopLabel.hidden = true;
      $loopSign.style.display = 'none';
    }
  }

  buildBookmark(bookmark: Bookmark, duration: number) {
    const mark = new this.markFactory({
      bookmark,
      duration,
    });
    mark.setMediator(this);

    if (bookmark.time > duration) {
      console.warn(`[momentify] Bookmark exceeds video duration:`, bookmark.id);
      // 1. It can be adjusted later on loadedmetadata (see
      //    adjustMarksOnDurationChange), until that, suspend mark
      // 2. Edge case: new video duration is less then mark time, but at that point new
      //    video metadata haven't been loaded yet, so we have previous video
      //    duration (which is > time – false positive). In that case,
      //    adjustMarksOnDurationChange should still suspend that mark
      this.markFactory.suspendMark(mark.markDom);
      this.state.bookmarks.suspended.push(bookmark.id);
    }

    const popup = new this.markPopupFactory({
      bookmark,
      popupsContainerId: ContentRenderer.popupsContainerId,
    });
    popup.setMediator(this);
    document
      .getElementById(ContentRenderer.popupsContainerId)
      ?.append(popup.dom);

    return mark;
  }

  adjustMarksOnDurationChange(e: Event) {
    const $video = e.target as HTMLVideoElement;
    if (this.state.videoDuration === $video.duration || isNaN($video.duration))
      return;
    this.state.videoDuration = $video.duration;
    const marks = this.markFactory.findAllBookmarks();

    if (marks) {
      marks.forEach(($m) => {
        const time = this.markFactory.getMarkTime($m);
        const id = this.markFactory.getBookmarkIdFromDom($m);

        if (id && time > $video.duration) {
          console.warn(
            `[momentify] Bookmark was removed, cause it exceeds video duration:`,
            id,
          );
          if (!this.state.bookmarks.suspended.includes(id)) {
            this.markFactory.suspendMark($m);
            this.state.bookmarks.suspended.push(id);
          }
        } else if (id) {
          // Reactivate suspended mark
          this.markFactory.activateMark($m);
          if (this.state.bookmarks.suspended.includes(id)) {
            this.state.bookmarks.suspended =
              this.state.bookmarks.suspended.filter((bId) => bId !== id);
          }
          $m.style.left = `${this.markFactory.getMarkOffset(time, $video.duration)}%`;
        }
      });
    }
  }

  sortMarks() {
    this.state.bookmarks.ids = this.state.bookmarks.ids.toSorted((a, b) => {
      const b1 = this.state.bookmarks.byId.get(a);
      const b2 = this.state.bookmarks.byId.get(b);
      return b1 && b2 ? b1.time - b2.time : 0;
    });
    const marks = Array.from(this.markFactory.findAllBookmarks(true));
    const sorted = this.state.bookmarks.ids
      .map((id) =>
        marks.find(($m) => id === this.markFactory.getBookmarkIdFromDom($m)),
      )
      .filter(($m) => !!$m);
    return sorted;
  }

  reorderRenderedMarks() {
    const $container = this.progressBarFactory.findMarksContainer();
    if ($container) $container.replaceChildren(...this.sortMarks());
    else console.error('[momentify] Cannot find marks container');
  }

  renderNewMarks(...$marks: HTMLElement[]) {
    this.progressBarFactory.pushBookmark(...$marks);
    this.reorderRenderedMarks();
  }

  clearPopups() {
    document
      .getElementById(ContentRenderer.popupsContainerId)
      ?.replaceChildren();
  }

  cleanupBookmarksData() {
    this.state.bookmarks.byId = new Map();
    this.state.bookmarks.ids = [];
    this.state.bookmarks.suspended = [];
    if (this.state.video) {
      this.state.video.loopStartId = null;
      this.state.video.loopEndId = null;
    }
    this.state.tempLoopStartId = null;
    this.progressBarFactory.clearContent();
    this.clearPopups();
    this.removeVideoLoop();
  }

  async setupTheme() {
    const { theme = 'system' } = await chrome.storage.local.get<{
      theme: Theme;
    }>('theme');
    applyTheme(resolveTheme(theme));

    matchMedia('(prefers-color-scheme: dark)').addEventListener(
      'change',
      async (e) => {
        const { theme = 'system' } = await chrome.storage.local.get('theme');
        if (theme === 'system') {
          applyTheme(e.matches ? 'dark' : 'light');
        }
      },
    );
  }
}
