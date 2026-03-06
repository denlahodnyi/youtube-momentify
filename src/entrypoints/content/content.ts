// TODO: fix context loose error
// (https://stackoverflow.com/questions/53939205/how-to-avoid-extension-context-invalidated-errors-when-messaging-after-an-exte)
import {
  typedMessage,
  type Bookmark,
  type ContentTypedMessage,
  type MessagePayload,
  type Theme,
  type Video,
} from '@/api';
import { BOOKMARK_TITLE_CONSTRAINS, COLORS, formatTime } from '@/shared';
import {
  getVideoIdFromUrl,
  getVideoTitle,
  createDomElement,
  resolveTheme,
  applyTheme,
} from './contentUtils';
import type { ContentRendererEvent, State } from './contentTypes';
import './content.css';

const chrome = browser;

const QUICK_SAVE_BTN_ID = 'momentify-save-bookmark-btn';
const SAVE_WITH_EDIT_BTN_ID = 'momentify-save-with-edit-bookmark-btn';
const TIMESTAMPS_OUTER_CONTAINER_ID = 'momentify-bar';
const TIMESTAMPS_INNER_CONTAINER_ID = 'momentify-bookmarks-container';

class ContentRenderer {
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

class BookmarkButton {
  id: string;
  mediator?: InstanceType<typeof ContentRenderer>;
  isQuick = false;
  dom: HTMLElement;
  buttonDom: HTMLButtonElement;

  constructor(isQuick = false) {
    this.isQuick = isQuick;
    this.id = BookmarkButton.createDomId(isQuick);
    const label = isQuick ? 'Save quick bookmark' : 'Edit and save bookmark';
    const $button = isQuick
      ? createDomElement<HTMLButtonElement>(`
          <button id=${this.id} aria-label="${label}" class="momentify-bookmark-btn ytp-button" style="padding: 0; display: flex; align-items: center; justify-content: center;">
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                stroke-width="1" stroke-linecap="round" stroke-linejoin="round" style="padding: 0;">
              <path fill="none" d="M7 3a2 2 0 0 0-2 2v14.5c0 .6.6 1 1.1.7L12 17.2l5.9 3c.5.3 1.1-.1 1.1-.7V5a2 2 0 0 0-2-2H7z"/>
            </svg>
          </button>
      `)
      : createDomElement<HTMLButtonElement>(`
          <button id=${this.id} aria-label="${label}" class="momentify-bookmark-btn ytp-button" style="padding: 0; display: flex; align-items: center; justify-content: center;">
            <svg width="30" height="30" viewBox="0 0 24 24" style="padding: 0;">
              <mask id="pen-cut">
                <rect width="24" height="24" fill="white"/>
                <path fill="black" d="M10 11.5l4-4a1.6 1.6 0 0 1 2.3 2.3l-4 4-3 .7.7-3z"/>
              </mask>
              <path fill="currentColor" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" fill="currentColor"
                mask="url(#pen-cut)"
                d="M7 3a2 2 0 0 0-2 2v14.5c0 .6.6 1 1.1.7L12 17.2l5.9 3c.5.3 1.1-.1 1.1-.7V5a2 2 0 0 0-2-2H7z"/>
            </svg>
          </button>
      `);
    $button.addEventListener('click', this.handleSaveBookmark.bind(this));
    this.buttonDom = $button;
    const $container = createDomElement<HTMLElement>(
      `<div id="${BookmarkButton.createWrapperDomId(isQuick)}" class="momentify-bookmark-btn-container"></div`,
    );
    $container.append($button);
    this.dom = $container;
  }

  setMediator(mediator: InstanceType<typeof ContentRenderer>) {
    this.mediator = mediator;
  }

  handleSaveBookmark() {
    if (this.isQuick) {
      this.buttonDom.disabled = true;
      this.buttonDom.dataset.loading = 'true';
      this.mediator?.notify(this, { type: 'api/save_bookmark' });
    } else {
      this.mediator?.notify(this, {
        type: 'ui/open_bookmark_edit_modal',
        payload: { isNewBookmark: true },
      });
    }
  }

  notify({ type }: { type: 'success' }) {
    if (type === 'success') {
      this.buttonDom.disabled = false;
      this.buttonDom.dataset.loading = 'false';
    }
  }

  static find(isQuick = false): HTMLButtonElement {
    return document.getElementById(
      this.createDomId(isQuick),
    ) as HTMLButtonElement;
  }

  static findContainer(isQuick = false): HTMLElement {
    return document.getElementById(
      this.createWrapperDomId(isQuick),
    ) as HTMLElement;
  }

  static createDomId(isQuick = false) {
    return isQuick ? QUICK_SAVE_BTN_ID : SAVE_WITH_EDIT_BTN_ID;
  }

  static createWrapperDomId(isQuick = false) {
    return isQuick
      ? `${QUICK_SAVE_BTN_ID}-wrapper`
      : `${SAVE_WITH_EDIT_BTN_ID}-wrapper`;
  }
}

class ProgressBar {
  dom: HTMLElement;
  innerContainer: HTMLElement;

  constructor() {
    const $container = createDomElement<HTMLElement>(`
      <div id="${TIMESTAMPS_OUTER_CONTAINER_ID}" style="
        position:absolute;
        top:0;
        left:0;
        width:100%;
        height:100%;"></div>
    `);
    this.innerContainer = createDomElement<HTMLElement>(`
        <div id="${TIMESTAMPS_INNER_CONTAINER_ID}" style="
          position:relative;
          width:100%;
          height:100%;"></div>
      `);
    $container.append(this.innerContainer);
    this.dom = $container;
  }

  static find() {
    return document.getElementById(TIMESTAMPS_OUTER_CONTAINER_ID);
  }

  static findMarksContainer() {
    return document.getElementById(TIMESTAMPS_INNER_CONTAINER_ID);
  }

  static clearContent() {
    const $container = this.findMarksContainer();
    if ($container) $container.replaceChildren();
  }

  static pushBookmark(...$bookmarks: HTMLElement[]) {
    ProgressBar.findMarksContainer()?.append(...$bookmarks);
  }
}

class Mark {
  state: { id: null | Bookmark['id'] } = { id: null };
  mediator?: InstanceType<typeof ContentRenderer>;
  dom: HTMLElement;
  markDom: HTMLButtonElement;
  loopSignDom: HTMLElement;

  static wrapperComponentName = 'mark-wrapper';
  static markComponentName = 'mark';
  static loopSignComponentName = 'loop-sign';

  constructor({
    bookmark,
    duration,
  }: {
    bookmark: Bookmark;
    duration: number;
  }) {
    const { id, time, color } = bookmark;
    this.state = { id };

    this.dom = createDomElement(`
      <div id="${Mark.createMarkWrapperDomId(id)}" data-id="${id}" data-component="${Mark.wrapperComponentName}"></div>
    `);

    this.markDom = createDomElement(`
      <button id="${Mark.createMarkDomId(id)}" data-id="${id}" tabindex="0" aria-haspopup="dialog" aria-label="Bookmark at ${formatTime(time)}" data-time="${time}" data-component="${Mark.markComponentName}" class="momentify-mark" style="
        position: absolute;
        top: 50%;
        left: ${Mark.getMarkOffset(time, duration)}%;
        translate: -50% -50%;
        z-index: 1000;
        width: 2px;
        height: 8px;
        padding: 0;
        border: none;
        border-radius: 4px;
        background-color: ${color};
        anchor-name: --mark-${id}
      "></button>
    `);

    this.markDom.addEventListener(
      'mouseenter',
      this.handleMarkHoverOrClick.bind(this),
    );
    this.markDom.addEventListener(
      'click',
      this.handleMarkHoverOrClick.bind(this),
    );

    this.loopSignDom = createDomElement(`
      <div data-component="${Mark.loopSignComponentName}" style="
        display: none;
        width: 5px;
        height: 5px;
        border-radius: 50%;
        border: 1px solid lch(100 0 0 / 0.6);
        background-color: lime;
        position-anchor: --mark-${id};
        position: fixed;
        position-area: block-end;
        inset-block-start: 1px;
        z-index: 1000;
      "></div>
    `);

    this.dom.append(this.markDom);
    this.dom.append(this.loopSignDom);
  }

  static find(bookmarkId: Bookmark['id']) {
    return document.getElementById(this.createMarkWrapperDomId(bookmarkId));
  }

  static findMark(bookmarkId: Bookmark['id']) {
    return document.getElementById(this.createMarkDomId(bookmarkId));
  }

  static findAllBookmarks(withContainer = false) {
    return withContainer
      ? document.querySelectorAll<HTMLElement>(
          `[data-component="${Mark.wrapperComponentName}"]`,
        )
      : document.querySelectorAll<HTMLElement>(
          `[data-component="${Mark.markComponentName}"]`,
        );
  }

  static findLoopSign(bookmarkId: Bookmark['id']) {
    return this.find(bookmarkId)?.querySelector<HTMLElement>(
      `[data-component="${Mark.loopSignComponentName}"]`,
    );
  }

  static findLoopMarks($container = document) {
    const $start = $container.querySelector<HTMLElement>('[data-loop="start"]');
    const $end = $container.querySelector<HTMLElement>('[data-loop="finish"]');

    return [$start, $end];
  }

  static findAllLoopMarks($container = document) {
    return $container.querySelectorAll<HTMLElement>('[data-loop]');
  }

  static createMarkDomId(bookmarkId: Bookmark['id']) {
    return `momentify-bookmark-${bookmarkId}`;
  }

  static createMarkWrapperDomId(bookmarkId: Bookmark['id']) {
    return `momentify-wrapper-bookmark-${bookmarkId}`;
  }

  static getBookmarkIdFromDom($markOrWrapper: HTMLElement) {
    return $markOrWrapper.dataset.id;
  }

  static removeMark(bookmarkId: Bookmark['id']) {
    this.find(bookmarkId)?.remove();
  }

  static getMarkOffset(time: number, duration: number) {
    return (time / duration) * 100;
  }

  static getMarkTime($mark: HTMLElement) {
    return Number($mark.dataset.time);
  }

  static suspendMark($mark: HTMLElement) {
    $mark.style.display = 'none';
    $mark.dataset.suspended = 'true';
  }

  static activateMark($mark: HTMLElement) {
    $mark.style.display = 'block';
    delete $mark.dataset.suspended;
  }

  setMediator(mediator: InstanceType<typeof ContentRenderer>) {
    this.mediator = mediator;
  }

  handleMarkHoverOrClick() {
    if (this.state.id) {
      this.mediator?.notify(this, {
        type: 'ui/open_bookmark_details',
        payload: { bookmarkId: this.state.id },
      });
    }
  }
}

class MarkPopup {
  state: { id: Bookmark['id'] | null } = { id: null };
  mediator?: InstanceType<typeof ContentRenderer>;
  popupsContainerId: string;
  dom: Element;
  popup: HTMLDialogElement;
  boundedHandlePopupClickAway: (e: Event) => void;

  static ytVideoContainerClassname = '.html5-video-player';
  static popupComponentName = 'mark-popup';

  constructor({
    bookmark,
    popupsContainerId,
  }: {
    bookmark: Bookmark;
    popupsContainerId: string;
  }) {
    const { title, id } = bookmark;
    this.state.id = id;
    this.popupsContainerId = popupsContainerId;

    // This wrapper is just to reset some inherited styles
    this.dom = createDomElement(`
      <div style="
          font: initial;
          shadow: initial;
          position: initial;
          text-shadow: initial;
          text-decoration: initial;
          cursor: initial;
          margin: initial;
          padding: initial;
          background: initial;"></div>
    `);
    this.popup = createDomElement(`
      <dialog id="${MarkPopup.createPopupDomId(this.state.id)}"
        data-component="${MarkPopup.popupComponentName}"
        aria-label="Bookmark details"
        class="momentify-mark-popup"
        style="--anchor: --mark-${this.state.id};"
      >
        <div>
          <button aria-label="Close popup" data-action="close" class="momentify-btn momentify-mark-popup__close-btn">
            <svg aria-hidden xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-x-icon lucide-x"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </button>
          <h2 data-component="bookmark-title" class="momentify-mark-popup__title">${title}</h2>
          <button data-component="loop-btn" data-action="momentify-mark-popup__title" class="full-w momentify-btn momentify-mark-popup__loop-btn" hidden>
            <svg aria-hidden xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-repeat2-icon lucide-repeat-2"><path d="m2 9 3-3 3 3"/><path d="M13 18H7a2 2 0 0 1-2-2V6"/><path d="m22 15-3 3-3-3"/><path d="M11 6h6a2 2 0 0 1 2 2v10"/></svg>
            <span></span>
          </button>
          <span data-component="loop-label" class="momentify-mark-popup__loop-label" hidden>
            <span></span>
            <button aria-label="Remove loop" data-component="loop-del-btn" data-action="remove-loop" class="momentify-btn momentify-mark-popup__del-loop-btn">
              <svg aria-hidden xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-delete-icon lucide-delete"><path d="M10 5a2 2 0 0 0-1.344.519l-6.328 5.74a1 1 0 0 0 0 1.481l6.328 5.741A2 2 0 0 0 10 19h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z"/><path d="m12 9 6 6"/><path d="m18 9-6 6"/></svg>
            </button>
          </span>
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px;">
            <button aria-label="Edit bookmark" data-action="edit" class="full-w momentify-btn">
              <svg aria-hidden xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-square-pen-icon lucide-square-pen"><path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z"/></svg>
            </button>
            <button aria-label="Remove bookmark" data-action="delete" class="full-w momentify-btn momentify-mark-popup__del-btn">
              <svg aria-hidden xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-trash2-icon lucide-trash-2"><path d="M10 11v6"/><path d="M14 11v6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </div>
        </div>
      </dialog>
    `);

    this.disablePopupTouchEventsLeak();

    this.popup
      .querySelector('[data-action="close"]')
      ?.addEventListener('click', this.handleClosePopup.bind(this));
    this.popup
      .querySelector('[data-action="delete"]')
      ?.addEventListener('click', this.handleDeleteBookmark.bind(this));
    this.popup
      .querySelector('[data-action="edit"]')
      ?.addEventListener('click', this.handleEditBookmark.bind(this));
    this.popup
      .querySelector('[data-component="loop-del-btn"]')
      ?.addEventListener('click', this.handleLoopDelete.bind(this));
    this.popup
      .querySelector('[data-component="loop-btn"]')
      ?.addEventListener('click', this.handleLoopSet.bind(this));

    this.boundedHandlePopupClickAway = this.handlePopupClickAway.bind(this);

    this.popup.addEventListener('beforetoggle', (e) => {
      if (e.newState === 'open') {
        document
          .querySelector(MarkPopup.ytVideoContainerClassname)
          ?.addEventListener('click', this.boundedHandlePopupClickAway, {
            capture: true, // Use capture phase, so that popup opened on the click (e.g. using keyboard) wont be closed immediately
          });
      }
    });

    this.dom.append(this.popup);
  }

  setMediator(mediator: InstanceType<typeof ContentRenderer>) {
    this.mediator = mediator;
  }

  static findPopup(bookmarkId: Bookmark['id']): HTMLDialogElement {
    return document.getElementById(
      this.createPopupDomId(bookmarkId),
    ) as HTMLDialogElement;
  }

  static findPopupTitle(bookmarkId: Bookmark['id']) {
    const $popup = this.findPopup(bookmarkId);
    if ($popup) {
      return $popup.querySelector('[data-component="bookmark-title"]');
    }
  }

  static findLoopButton(bookmarkId: Bookmark['id']) {
    return this.findPopup(bookmarkId)?.querySelector<HTMLButtonElement>(
      '[data-component="loop-btn"]',
    );
  }

  static findLoopLabel(bookmarkId: Bookmark['id']) {
    return this.findPopup(bookmarkId)?.querySelector<HTMLElement>(
      '[data-component="loop-label"]',
    );
  }

  static createPopupDomId(bookmarkId: Bookmark['id']) {
    return `momentify-bookmark-popup-${bookmarkId}`;
  }

  static removePopup(bookmarkId: Bookmark['id']) {
    this.findPopup(bookmarkId)?.parentElement?.remove();
  }

  static closeAllPopups() {
    document
      .querySelectorAll<HTMLDialogElement>(
        `[data-component="${MarkPopup.popupComponentName}"]`,
      )
      .forEach(($p) => {
        $p.close();
      });
  }

  static isInPopup($el: Element) {
    const $openedPopup = document.querySelector(
      `[data-component="${MarkPopup.popupComponentName}"][open]`,
    );
    return Boolean(
      $openedPopup && ($el === $openedPopup || $openedPopup.contains($el)),
    );
  }

  handlePopupClickAway(e: Event) {
    if (!MarkPopup.isInPopup(e.target as Element)) {
      MarkPopup.closeAllPopups();
      document
        .querySelector(MarkPopup.ytVideoContainerClassname)
        ?.removeEventListener('click', this.boundedHandlePopupClickAway, {
          capture: true,
        });
    }
  }

  handleClosePopup(e: Event) {
    e.preventDefault();
    e.stopPropagation();
    this.popup.close();
  }

  handleDeleteBookmark() {
    if (this.state.id) {
      this.mediator?.notify(this, {
        type: 'api/delete_bookmark',
        payload: { bookmarkId: this.state.id },
      });
    }
  }

  handleEditBookmark() {
    if (this.state.id) {
      this.popup.close();
      this.mediator?.notify(this, {
        type: 'ui/open_bookmark_edit_modal',
        payload: { isNewBookmark: false, bookmarkId: this.state.id },
      });
    }
  }

  handleLoopSet(e: Event) {
    const action = (e.currentTarget as HTMLElement).dataset.action as
      | 'start'
      | 'finish'
      | 'delete';
    if (this.state.id) {
      this.mediator?.notify(this, {
        type: 'ui/manage_loop',
        payload: {
          bookmarkId: this.state.id,
          action,
        },
      });
    }
  }

  handleLoopDelete() {
    if (this.state.id) {
      this.mediator?.notify(this, {
        type: 'ui/manage_loop',
        payload: {
          bookmarkId: this.state.id,
          action: 'delete',
        },
      });
    }
  }

  disablePopupTouchEventsLeak() {
    // Prevent triggering video events after clicking on popup
    [
      'mousedown',
      'mouseenter',
      // 'mouseleave',
      'mousemove',
      'mouseover',
      // 'mouseout',
      'mouseup',
      'pointerdown',
      'pointerenter',
      // 'pointerleave',
      'pointermove',
      'pointerover',
      // 'pointerout',
    ].forEach((event) => {
      this.popup.addEventListener(
        event,
        (e) => {
          e.preventDefault();
          e.stopPropagation();
        },
        { capture: true },
      );
    });
  }
}

class BookmarkEditModal {
  state:
    | { bookmark: Partial<Bookmark> & { time: Bookmark['time'] }; isNew: true }
    | { bookmark: Bookmark; isNew: false } = {
    bookmark: { time: 0 },
    isNew: true,
  };
  mediator?: InstanceType<typeof ContentRenderer>;
  dom: HTMLDialogElement;

  constructor() {
    this.dom = createDomElement(`
      <dialog id="momentify-edit-modal" closedby="any" aria-label="Edit bookmark details" class="momentify-edit-modal">
        <form id="momentify-edit-modal-form" method="dialog" class="momentify-edit-modal__form">
          <div class="momentify-edit-modal__text-field">
            <label for="momentify-edit-modal-title" class="momentify-edit-modal__label">Title</label>
            <input
              id="momentify-edit-modal-title"
              aria-describedby="momentify-edit-modal-title-chars"
              name="title"
              minlength="${BOOKMARK_TITLE_CONSTRAINS.min}"
              maxlength="${BOOKMARK_TITLE_CONSTRAINS.max}"
              required
              class="momentify-edit-modal__input"
            />
            <p id="momentify-edit-modal-title-chars" aria-live="polite" aria-atomic="false" class="momentify-edit-modal__helper-message">
              <span class="scr-only">Characters remaining</span>
              <span data-component="momentify-edit-modal-title-chars-count">0</span>/<span>${BOOKMARK_TITLE_CONSTRAINS.max}</span>
            </p>
          </div>
          <fieldset data-component="color-picker" class="momentify-edit-modal__color-picker">
            <legend class="momentify-edit-modal__label">Color</legend>
            <template id="momentify-color-picker-template">
              <label
                data-component="color-picker-item-label"
                class="momentify-edit-modal__color-option"
              >
                <span data-component="color-picker-item-name" class="scr-only"></span>
                <input type="radio" name="color" value="" required class="scr-only" data-component="color-picker-item-input" />
              </label>
            </template>
          </fieldset>
          <div class="momentify-edit-modal__footer">
            <button id="momentify-edit-modal-save" type="submit" class="momentify-btn momentify-edit-modal__action">Save</button>
            <button id="momentify-edit-modal-cancel" type="button" command="close" commandfor="momentify-edit-modal" class="momentify-btn momentify-edit-modal__action">Cancel</button>
          </div>
        </form>
      </dialog>
    `);

    const colorOptions = Object.entries(COLORS).map(([color, hex]) => {
      const $colorOption = this.dom
        .querySelector<HTMLTemplateElement>('#momentify-color-picker-template')
        ?.content.firstElementChild?.cloneNode(true) as HTMLElement;
      $colorOption.style.backgroundColor = hex;
      const $colorName = $colorOption.querySelector<HTMLElement>(
        '[data-component="color-picker-item-name"]',
      );
      if ($colorName) $colorName.style.backgroundColor = color;
      const $colorInput = $colorOption.querySelector<HTMLInputElement>(
        '[data-component="color-picker-item-input"]',
      );
      if ($colorInput) $colorInput.value = hex;
      return $colorOption;
    });

    this.dom
      .querySelector('[data-component="color-picker"]')
      ?.append(...colorOptions);

    const $titleInput = this.dom.querySelector('#momentify-edit-modal-title');
    const $titleCharsCount = this.dom.querySelector(
      '[data-component="momentify-edit-modal-title-chars-count"]',
    );
    $titleInput?.addEventListener('input', (e) => {
      if ($titleCharsCount)
        $titleCharsCount.textContent = (
          e.target as HTMLInputElement
        ).value.length.toString();
    });

    this.dom
      .querySelector<HTMLFormElement>('#momentify-edit-modal-form')
      ?.addEventListener('submit', this.handleSubmit.bind(this));
  }

  static find() {
    return document.getElementById('momentify-edit-modal') as HTMLDialogElement;
  }

  setMediator(mediator: InstanceType<typeof ContentRenderer>) {
    this.mediator = mediator;
  }

  syncState<TNew extends boolean>(
    state: TNew extends true
      ? {
          isNewBookmark: TNew;
          bookmark: Partial<Bookmark> & { time: Bookmark['time'] };
        }
      : { isNewBookmark: TNew; bookmark: Bookmark },
  ) {
    this.state.isNew = state.isNewBookmark;

    if (state.bookmark) {
      this.state.bookmark = state.bookmark;
      const $title = this.dom.querySelector<HTMLInputElement>(
        '#momentify-edit-modal-title',
      );
      if ($title) $title.value = state.bookmark.title ?? '';
      const $chars = this.dom.querySelector(
        '[data-component="momentify-edit-modal-title-chars-count"]',
      );
      if ($chars)
        $chars.textContent = state.bookmark.title?.length.toString() ?? '0';
      const isAvailableColor = state.bookmark.color
        ? Object.values(COLORS).includes(state.bookmark.color.toLowerCase())
        : false;
      this.dom
        .querySelectorAll<HTMLInputElement>(
          '[data-component="color-picker-item-input"]',
        )
        .forEach(($input, i) => {
          $input.checked = false;

          if (isAvailableColor) {
            if ($input.value === state.bookmark.color!.toLowerCase()) {
              $input.checked = true;
            }
          } else if (i === 0) {
            $input.checked = true;
          }
        });
    }
  }

  open() {
    this.dom.showModal();
  }

  close() {
    this.dom.close();
  }

  handleSubmit(e: SubmitEvent) {
    const data = new FormData(e.target as HTMLFormElement);
    const title = data.get('title') as string;
    const color = data.get('color') as string;

    if (this.mediator) {
      if (this.state.isNew === true) {
        this.mediator.notify(this, {
          type: 'api/save_bookmark',
          payload: { title, color, time: this.state.bookmark.time },
        });
      } else {
        this.mediator.notify(this, {
          type: 'api/update_bookmark',
          payload: { bookmark: { ...this.state.bookmark, title, color } },
        });
      }
    } else {
      console.error('[momentify] Please, set mediator');
    }
  }

  handleCancel() {
    this.close();
  }
}

class Services {
  static async createBookmark(
    payload: MessagePayload['CREATE_BOOKMARK']['in'],
  ) {
    return await chrome.runtime.sendMessage({
      action: 'CREATE_BOOKMARK',
      ...payload,
    });
  }
  static async updateBookmark(bookmark: Bookmark) {
    return await chrome.runtime.sendMessage(
      typedMessage('UPDATE_BOOKMARK', 'in', { bookmark }),
    );
  }

  static async getBookmarks({ videoId }: { videoId: Video['videoId'] }) {
    return await chrome.runtime.sendMessage(
      typedMessage('GET_BOOKMARKS_BY_VIDEO_ID', 'in', {
        videoId,
        normalized: true,
      }),
    );
  }

  static async getVideo({
    videoId,
  }: {
    videoId: Video['videoId'];
  }): Promise<MessagePayload['GET_VIDEO']['out']> {
    return await chrome.runtime.sendMessage(
      typedMessage('GET_VIDEO', 'in', {
        videoId,
      }),
    );
  }

  static async deleteBookmark({ bookmarkId }: { bookmarkId: Bookmark['id'] }) {
    return await chrome.runtime.sendMessage(
      typedMessage('DELETE_BOOKMARK', 'in', {
        bookmarkId,
      }),
    );
  }

  static async saveLoop({
    videoId,
    loopStartId,
    loopEndId,
  }: {
    videoId: Video['videoId'];
    loopStartId: Bookmark['id'];
    loopEndId: Bookmark['id'];
  }) {
    return await chrome.runtime.sendMessage(
      typedMessage('SAVE_VIDEO_LOOP', 'in', {
        videoId,
        loopStartId,
        loopEndId,
      }),
    );
  }

  static async deleteLoop({ videoId }: { videoId: Video['videoId'] }) {
    return await chrome.runtime.sendMessage(
      typedMessage('DELETE_VIDEO_LOOP', 'in', {
        videoId,
      }),
    );
  }
}

const contentRenderer = new ContentRenderer({
  BookmarkButton,
  ProgressBar,
  Mark,
  MarkPopup,
  BookmarkEditModal,
  Services,
});
contentRenderer.render();

chrome.runtime.onMessage.addListener(async (message: ContentTypedMessage) => {
  switch (message.action) {
    case 'CONTENT/SET_VIDEO_LOOP': {
      await contentRenderer.notify(null, {
        type: 'ui/apply_video_loop',
        payload: {
          loopStartId: message.loopStartId,
          loopEndId: message.loopEndId,
          videoId: message.videoId,
        },
      });
      break;
    }
    case 'CONTENT/REMOVE_VIDEO_LOOP': {
      await contentRenderer.notify(null, {
        type: 'ui/remove_video_loop',
      });
      break;
    }
    case 'CONTENT/TOGGLE_QUICK_SAVE': {
      await contentRenderer.notify(null, {
        type: 'ui/toggle_quick_save',
        payload: { show: message.show },
      });
      break;
    }
    case 'CONTENT/TOGGLE_EDITED_SAVE': {
      await contentRenderer.notify(null, {
        type: 'ui/toggle_edited_save',
        payload: { show: message.show },
      });
      break;
    }
    case 'CONTENT/QUICK_SAVE': {
      await contentRenderer.notify(null, {
        type: 'api/save_bookmark',
      });
      break;
    }
    case 'CONTENT/EDITED_SAVE': {
      await contentRenderer.notify(null, {
        type: 'ui/open_bookmark_edit_modal',
        payload: { isNewBookmark: true },
      });
      break;
    }
    case 'CONTENT/NEXT_BOOKMARK': {
      await contentRenderer.notify(null, {
        type: 'ui/to_next_bookmark',
      });
      break;
    }
    case 'CONTENT/PREVIOUS_BOOKMARK': {
      await contentRenderer.notify(null, {
        type: 'ui/to_prev_bookmark',
      });
      break;
    }
    case 'CONTENT/PLAY_VIDEO_AT': {
      await contentRenderer.notify(null, {
        type: 'ui/play_video',
        payload: { time: message.time },
      });
      break;
    }
    case 'CONTENT/CREATE_BOOKMARKS': {
      await contentRenderer.notify(null, {
        type: 'ui/render_bookmarks',
        payload: { bookmarks: message.bookmarks },
      });
      break;
    }
    case 'CONTENT/REFRESH_BOOKMARKS': {
      await contentRenderer.notify(null, {
        type: 'ui/refresh_bookmarks',
      });
      break;
    }
    case 'CONTENT/UPDATE_BOOKMARK': {
      await contentRenderer.notify(null, {
        type: 'ui/update_bookmark',
        payload: { bookmark: message.bookmark },
      });
      break;
    }
    case 'CONTENT/DELETE_BOOKMARK': {
      await contentRenderer.notify(null, {
        type: 'ui/delete_bookmark',
        payload: { bookmarkId: message.bookmarkId },
      });
      break;
    }
    case 'CONTENT/DELETE_ALL_BOOKMARKS': {
      await contentRenderer.notify(null, {
        type: 'ui/delete_all_bookmarks',
      });
      break;
    }
    case 'CONTENT/SET_THEME': {
      await contentRenderer.notify(null, {
        type: 'ui/set_theme',
        payload: { theme: message.theme },
      });
    }
    default:
      console.warn('[momentify] Unknown action:', message);
  }
});
