// TODO: fix context loose error (https://stackoverflow.com/questions/53939205/how-to-avoid-extension-context-invalidated-errors-when-messaging-after-an-exte)
const QUICK_SAVE_BTN_ID = 'momentify-save-bookmark-btn';
const SAVE_WITH_EDIT_BTN_ID = 'momentify-save-with-edit-bookmark-btn';
const TIMESTAMPS_OUTER_CONTAINER_ID = 'momentify-bar';
const TIMESTAMPS_INNER_CONTAINER_ID = 'momentify-bookmarks-container';
const BOOKMARK_TITLE_CONSTRAINS = { min: 1, max: 80 };

class ContentRenderer {
  state = {
    videoId: getVideoIdFromUrl(location.href),
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

  bookmarkButtonFactory;
  progressBarFactory;
  markFactory;
  markPopupFactory;
  bookmarkEditModalFactory;
  services;
  bookmarkModal;

  constructor({
    BookmarkButton,
    ProgressBar,
    Mark,
    MarkPopup,
    BookmarkEditModal,
    Services,
  }) {
    this.bookmarkButtonFactory = BookmarkButton;
    this.progressBarFactory = ProgressBar;
    this.markFactory = Mark;
    this.markPopupFactory = MarkPopup;
    this.bookmarkEditModalFactory = BookmarkEditModal;
    this.services = Services;

    this.boundLoopHandler = this.handleLoop.bind(this);

    observeUrlChange((newUrl) => {
      this.state.videoId = getVideoIdFromUrl(newUrl);
      this.render();
    });
  }

  async notify(sender, event) {
    switch (event.type) {
      case 'ui/toggle_quick_save': {
        const $button = this.bookmarkButtonFactory.find(true);
        if ($button) $button.hidden = !event.payload.show;
        break;
      }
      case 'ui/toggle_edited_save': {
        const $button = this.bookmarkButtonFactory.find();
        if ($button) $button.hidden = !event.payload.show;
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
                return this.state.bookmarks.byId.get(id).time;
              }
            })
            .filter((time) => typeof time !== 'undefined');
          let next = timestamps[0];

          for (let a = 0, b = timestamps.length - 1; a <= b; a++, b--) {
            if (timestamps[a] > $video.currentTime) {
              next = timestamps[a];
              break;
            }
            if (timestamps.length === 2 && timestamps[b] > $video.currentTime) {
              next = timestamps[b];
              break;
            }
            if (timestamps[b] <= $video.currentTime) {
              next = timestamps[b === timestamps.length - 1 ? 0 : b + 1];
              break;
            }
          }

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
                return this.state.bookmarks.byId.get(id).time;
              }
            })
            .filter((time) => typeof time !== 'undefined');
          let next = timestamps.at(-1);

          for (let a = 0, b = timestamps.length - 1; a <= b; a++, b--) {
            if (timestamps[a] >= $video.currentTime) {
              next = timestamps.at(a === 0 ? -1 : a - 1);
              break;
            }
            if (
              timestamps.length === 2 &&
              timestamps[b] >= $video.currentTime
            ) {
              next = timestamps[a];
              break;
            }
            if (timestamps[b] < $video.currentTime) {
              next = timestamps[b];
              break;
            }
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

          if (!this.state.video) {
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

        if ($video) {
          const result = await this.services.createBookmark({
            videoTitle,
            videoId: this.state.videoId,
            time: time ?? $video.currentTime,
            title,
            color,
          });
          sender?.notify?.({ type: 'success' });

          if (result.success) {
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
        const { bookmarkId, isNewBookmark = false } = event.payload || {};
        const $video = document.querySelector('video');
        $video?.pause();
        this.bookmarkModal.syncState({
          isNewBookmark,
          bookmark: isNewBookmark
            ? { title: new Date().toLocaleString(), time: $video.currentTime }
            : this.state.bookmarks.byId.get(bookmarkId),
        });
        this.bookmarkModal.open();
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
          bookmarkId === this.state.video.loopStartId ||
          bookmarkId === this.state.video.loopEndId
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
          this.notify(null, {
            type: 'api/save_loop',
            payload: {
              loopStartId:
                this.state.video.loopStartId || this.state.tempLoopStartId,
              loopEndId: bookmarkId,
            },
          });
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
        await this.services.saveLoop({
          videoId: this.state.videoId,
          loopStartId,
          loopEndId,
        });
        break;
      }
      case 'ui/apply_video_loop': {
        const { loopStartId, loopEndId, videoId } = event.payload;
        const { loopStartId: prevStart, loopEndId: prevEnd } = this.state.video;

        if (this.state.videoId === videoId) {
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
          await this.services.deleteLoop({
            videoId: this.state.videoId,
          });
        } else {
          const startLoopId = this.state.tempLoopStartId;
          this.state.tempLoopStartId = null;
          this.setMarkLoopUI(startLoopId, true);
        }
        break;
      }
      case 'ui/remove_video_loop': {
        const { loopStartId, loopEndId } = this.state.video || {};
        this.state.video.loopStartId = null;
        this.state.video.loopEndId = null;
        this.state.tempLoopStartId = null;
        this.removeVideoLoop();
        this.setMarkLoopUI(loopStartId, true);
        this.setMarkLoopUI(loopEndId, true);
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
    this.renderBookmarkEditModal();
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
    let quickSave = BookmarkButton.find(true);
    let editedSave = BookmarkButton.find(false);

    if (this.state.videoId && !quickSave) {
      const settings = await chrome.storage.local.get([
        'showQuickSave',
        'showEditedSave',
      ]);
      const quickSaveButton = new this.bookmarkButtonFactory(true);
      const saveWithEditButton = new this.bookmarkButtonFactory(false);
      quickSaveButton.setMediator(this);
      saveWithEditButton.setMediator(this);
      quickSave = quickSaveButton.dom;
      editedSave = saveWithEditButton.dom;
      quickSaveButton.dom.hidden = !settings.showQuickSave;
      saveWithEditButton.dom.hidden = !settings.showEditedSave;

      const $controlsContainer = document.body.querySelector(
        '#movie_player .ytp-right-controls',
      );

      if ($controlsContainer) {
        $controlsContainer.insertAdjacentElement(
          'afterbegin',
          quickSaveButton.dom,
        );
        $controlsContainer.insertAdjacentElement(
          'afterbegin',
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
    quickSave.disabled = $video.readyState < HTMLMediaElement.HAVE_METADATA;
    editedSave.disabled = $video.readyState < HTMLMediaElement.HAVE_METADATA;

    // Wait for data on every video change
    document.querySelector('video').addEventListener(
      'loadstart',
      (e) => {
        quickSave.disabled = true;
        editedSave.disabled = true;
      },
      { once: true },
    );
    document.querySelector('video').addEventListener(
      'loadeddata',
      (e) => {
        if ($video.readyState >= HTMLMediaElement.HAVE_METADATA) {
          quickSave.disabled = false;
          editedSave.disabled = false;
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
          let duration = $video.duration;

          if (Number.isNaN(duration)) {
            duration = await new Promise((resolve) => {
              $video.addEventListener(
                'loadedmetadata',
                () => {
                  resolve($video.duration);
                },
                { once: true },
              );
            });
          }

          $video.addEventListener(
            'loadstart',
            () => {
              // Update marks position if video duration changes (this can be
              // after marks was already rendered)
              $video.addEventListener(
                'loadedmetadata',
                this.adjustMarksOnDurationChange.bind(this),
                { once: true },
              );
            },
            { once: true },
          );

          const marks = this.state.bookmarks.ids.map((bookmarkId) => {
            return this.buildBookmark(
              this.state.bookmarks.byId.get(bookmarkId),
              duration,
            ).dom;
          });
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

  renderBookmarkEditModal() {
    if (!this.bookmarkModal) {
      const modal = new this.bookmarkEditModalFactory();
      this.bookmarkModal = modal;
      this.bookmarkModal.setMediator(this);
      document.body.append(modal.dom);
    }
  }

  setupVideoLoop(loopStartId, loopEndId) {
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

  handleLoop(e) {
    if (e.target.currentTime >= this.state.loopEndTime) {
      e.target.currentTime = this.state.loopStartTime;
    } else if (e.target.currentTime < this.state.loopStartTime) {
      e.target.currentTime = this.state.loopStartTime;
    }
  }

  setMarkLoopUI(bookmarkId, deleteLoop = false) {
    const { loopStartId, loopEndId } = this.state.video || {};
    const { tempLoopStartId } = this.state;
    const $mark = this.markFactory.findMark(bookmarkId);
    const $loopSign = this.markFactory.findLoopSign(bookmarkId);
    const $loopButton = this.markPopupFactory.findLoopButton(bookmarkId);
    const $loopLabel = this.markPopupFactory.findLoopLabel(bookmarkId);

    if (!$mark) return;

    if (bookmarkId === loopStartId || bookmarkId === tempLoopStartId) {
      $mark.dataset.loop = 'start';
    } else if (bookmarkId === loopEndId) {
      $mark.dataset.loop = 'finish';
    }

    if (deleteLoop) delete $mark.dataset.loop;

    if ($mark.dataset.loop === 'start' || $mark.dataset.loop === 'finish') {
      if ($mark.dataset.loop === 'start') {
        $loopLabel.firstElementChild.textContent = 'Loop starts here';
      } else {
        $loopLabel.firstElementChild.textContent = 'Loop ends here';
      }

      $loopButton.dataset.action = '';
      $loopButton.hidden = true;
      $loopLabel.hidden = false;
      $loopSign.style.display = 'block';
    } else if (tempLoopStartId || loopStartId) {
      $loopButton.querySelector('span').textContent = 'Set loop end';
      $loopButton.dataset.action = 'finish';
      $loopButton.hidden = false;
      $loopLabel.hidden = true;
      $loopSign.style.display = 'none';
    } else {
      $loopButton.querySelector('span').textContent = 'Set loop start';
      $loopButton.dataset.action = 'start';
      $loopButton.hidden = false;
      $loopLabel.hidden = true;
      $loopSign.style.display = 'none';
    }
  }

  buildBookmark(bookmark, duration) {
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

  adjustMarksOnDurationChange(e) {
    const marks = this.markFactory.findAllBookmarks();

    if (marks) {
      marks.forEach(($m) => {
        const time = this.markFactory.getMarkTime($m);
        const id = this.markFactory.getBookmarkIdFromDom($m);
        if (time > e.target.duration) {
          console.warn(
            `[momentify] Bookmark was removed, cause it exceeds video duration:`,
            id,
          );
          if (!this.state.bookmarks.suspended.includes(id)) {
            this.markFactory.suspendMark($m);
            this.state.bookmarks.suspended.push(id);
          }
        } else {
          // Reactivate suspended mark
          this.markFactory.activateMark($m);
          if (this.state.bookmarks.suspended.includes(id)) {
            this.state.bookmarks.suspended =
              this.state.bookmarks.suspended.filter((bId) => bId !== id);
          }
          $m.style.left = `${this.markFactory.getMarkOffset(time, e.target.duration)}%`;
        }
      });
    }
  }

  sortMarks() {
    this.state.bookmarks.ids = this.state.bookmarks.ids.toSorted(
      (a, b) =>
        this.state.bookmarks.byId.get(a).time -
        this.state.bookmarks.byId.get(b).time,
    );
    const marks = Array.from(this.markFactory.findAllBookmarks(true));
    const sorted = this.state.bookmarks.ids
      .map((id) =>
        marks.find(($m) => id === this.markFactory.getBookmarkIdFromDom($m)),
      )
      .filter(Boolean);
    return sorted;
  }

  reorderRenderedMarks() {
    const $container = this.progressBarFactory.findMarksContainer();
    if ($container) $container.replaceChildren(...this.sortMarks());
    else console.error('[momentify] Cannot find marks container');
  }

  renderNewMarks(...$marks) {
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
}

let lastUrl = location.href;
function observeUrlChange(cb) {
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
  id;
  isQuick = false;

  constructor(isQuick = false) {
    this.isQuick = isQuick;
    this.id = BookmarkButton.createDomId(isQuick);
    // TODO: change or remove color?
    const color = isQuick ? 'red' : 'blue';
    const label = isQuick ? 'Save quick bookmark' : 'Edit and save bookmark';
    const specialClass = isQuick ? 'ytp-quick-save-btn' : 'ytp-edited-save-btn';
    const $button = createDomElement(`
        <button id=${this.id} aria-label="${label}" class="${specialClass} momentify-bookmark-btn ytp-button" style="display: flex; align-items: center; justify-content: center; color: ${color}">
          <svg aria-hidden xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-bookmark-icon lucide-bookmark"><path d="M17 3a2 2 0 0 1 2 2v15a1 1 0 0 1-1.496.868l-4.512-2.578a2 2 0 0 0-1.984 0l-4.512 2.578A1 1 0 0 1 5 20V5a2 2 0 0 1 2-2z"/></svg>
        </button>
      `);
    $button.addEventListener('click', this.handleSaveBookmark.bind(this));
    this.dom = $button;
  }

  setMediator(mediator) {
    this.mediator = mediator;
  }

  handleSaveBookmark() {
    if (this.isQuick) {
      this.dom.disabled = true;
      this.dom.dataset.loading = true;
      this.mediator?.notify(this, { type: 'api/save_bookmark' });
    } else {
      this.mediator?.notify(this, {
        type: 'ui/open_bookmark_edit_modal',
        payload: { isNewBookmark: true },
      });
    }
  }

  notify({ type }) {
    if (type === 'success') {
      this.dom.disabled = false;
      this.dom.dataset.loading = false;
    }
  }

  static find(isQuick = false) {
    return document.getElementById(this.createDomId(isQuick));
  }

  static createDomId(isQuick = false) {
    return isQuick ? QUICK_SAVE_BTN_ID : SAVE_WITH_EDIT_BTN_ID;
  }
}

class ProgressBar {
  constructor() {
    const $container = createDomElement(`
      <div id="${TIMESTAMPS_OUTER_CONTAINER_ID}" style="
        position:absolute;
        top:0;
        left:0;
        width:100%;
        height:100%;"></div>
    `);
    this.innerContainer = createDomElement(`
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

  static pushBookmark(...$bookmarks) {
    ProgressBar.findMarksContainer()?.append(...$bookmarks);
  }
}

class Mark {
  mediator;
  state = { id: null };

  static wrapperComponentName = 'mark-wrapper';
  static markComponentName = 'mark';
  static loopSignComponentName = 'loop-sign';

  constructor({ bookmark, duration }) {
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
        translate: 0 -50%;
        z-index: 1000;
        width: 1px;
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

  static find(bookmarkId) {
    return document.getElementById(this.createMarkWrapperDomId(bookmarkId));
  }

  static findMark(bookmarkId) {
    return document.getElementById(this.createMarkDomId(bookmarkId));
  }

  static findAllBookmarks(withContainer = false) {
    return withContainer
      ? document.querySelectorAll(
          `[data-component="${Mark.wrapperComponentName}"]`,
        )
      : document.querySelectorAll(
          `[data-component="${Mark.markComponentName}"]`,
        );
  }

  static findLoopSign(bookmarkId) {
    return this.find(bookmarkId)?.querySelector(
      `[data-component="${Mark.loopSignComponentName}"]`,
    );
  }

  static findLoopMarks($container = document) {
    const $start = $container.querySelector('[data-loop="start"]');
    const $end = $container.querySelector('[data-loop="finish"]');

    return [$start, $end];
  }

  static findAllLoopMarks($container = document) {
    return $container.querySelectorAll('[data-loop]');
  }

  static createMarkDomId(bookmarkId) {
    return `momentify-bookmark-${bookmarkId}`;
  }

  static createMarkWrapperDomId(bookmarkId) {
    return `momentify-wrapper-bookmark-${bookmarkId}`;
  }

  static getBookmarkIdFromDom($markOrWrapper) {
    return $markOrWrapper.dataset.id;
  }

  static removeMark(bookmarkId) {
    this.find(bookmarkId)?.remove();
  }

  static getMarkOffset(time, duration) {
    return (time / duration) * 100;
  }

  static getMarkTime($mark) {
    return Number($mark.dataset.time);
  }

  static suspendMark($mark) {
    $mark.style.display = 'none';
    $mark.dataset.suspended = 'true';
  }

  static activateMark($mark) {
    $mark.style.display = 'block';
    delete $mark.dataset.suspended;
  }

  setMediator(mediator) {
    this.mediator = mediator;
  }

  handleMarkHoverOrClick(e) {
    this.mediator.notify(this, {
      type: 'ui/open_bookmark_details',
      payload: { bookmarkId: this.state.id },
    });
  }
}

class MarkPopup {
  mediator;
  popupsContainerId;
  state = { id: null };

  static ytVideoContainerClassname = '.html5-video-player';
  static popupComponentName = 'mark-popup';

  constructor({ bookmark, popupsContainerId }) {
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
        style="position-anchor: --mark-${this.state.id};"
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
      .addEventListener('click', this.handleClosePopup.bind(this));
    this.popup
      .querySelector('[data-action="delete"]')
      .addEventListener('click', this.handleDeleteBookmark.bind(this));
    this.popup
      .querySelector('[data-action="edit"]')
      .addEventListener('click', this.handleEditBookmark.bind(this));
    this.popup
      .querySelector('[data-component="loop-del-btn"]')
      .addEventListener('click', this.handleLoopDelete.bind(this));
    this.popup
      .querySelector('[data-component="loop-btn"]')
      .addEventListener('click', this.handleLoopSet.bind(this));

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

  setMediator(mediator) {
    this.mediator = mediator;
  }

  static findPopup(bookmarkId) {
    return document.getElementById(this.createPopupDomId(bookmarkId));
  }

  static findPopupTitle(bookmarkId) {
    const $popup = this.findPopup(bookmarkId);
    if ($popup) {
      return $popup.querySelector('[data-component="bookmark-title"]');
    }
  }

  static findLoopButton(bookmarkId) {
    return this.findPopup(bookmarkId)?.querySelector(
      '[data-component="loop-btn"]',
    );
  }

  static findLoopLabel(bookmarkId) {
    return this.findPopup(bookmarkId)?.querySelector(
      '[data-component="loop-label"]',
    );
  }

  static createPopupDomId(bookmarkId) {
    return `momentify-bookmark-popup-${bookmarkId}`;
  }

  static removePopup(bookmarkId) {
    this.findPopup(bookmarkId)?.parentElement.remove();
  }

  static closeAllPopups() {
    document
      .querySelectorAll(`[data-component="${MarkPopup.popupComponentName}"]`)
      .forEach(($p) => {
        $p.close();
      });
  }

  static isInPopup($el) {
    const $openedPopup = document.querySelector(
      `[data-component="${MarkPopup.popupComponentName}"][open]`,
    );
    return Boolean(
      $openedPopup && ($el === $openedPopup || $openedPopup.contains($el)),
    );
  }

  handlePopupClickAway(e) {
    if (!MarkPopup.isInPopup(e.target)) {
      MarkPopup.closeAllPopups();
      document
        .querySelector(MarkPopup.ytVideoContainerClassname)
        ?.removeEventListener('click', this.boundedHandlePopupClickAway, {
          capture: true,
        });
    }
  }

  handleClosePopup(e) {
    e.preventDefault();
    e.stopPropagation();
    this.popup.close();
  }

  handleDeleteBookmark(e) {
    this.mediator.notify(this, {
      type: 'api/delete_bookmark',
      payload: { bookmarkId: this.state.id },
    });
  }

  handleEditBookmark() {
    this.popup.close();
    this.mediator.notify(this, {
      type: 'ui/open_bookmark_edit_modal',
      payload: { bookmarkId: this.state.id },
    });
  }

  handleLoopSet(e) {
    const action = e.currentTarget.dataset.action;
    this.mediator.notify(this, {
      type: 'ui/manage_loop',
      payload: {
        bookmarkId: this.state.id,
        action,
      },
    });
  }

  handleLoopDelete() {
    this.mediator.notify(this, {
      type: 'ui/manage_loop',
      payload: {
        bookmarkId: this.state.id,
        action: 'delete',
      },
    });
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
  static colors = {
    DarkCyan: '#008b8b'.toLowerCase(),
    DeepSkyBlue: '#00bfff'.toLowerCase(),
    MediumSlateBlue: '#7b68ee'.toLowerCase(),
    LightGreen: '#90ee90'.toLowerCase(),
    Coral: '#ff7f50'.toLowerCase(),
    NavajoWhite: '#FFDEAD'.toLowerCase(),
    Violet: '#ee82ee'.toLowerCase(),
    Yellow: '#FFFF00'.toLowerCase(),
  };

  state = { bookmark: null, isNew: false };
  mediator;

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

    const colorOptions = Object.entries(BookmarkEditModal.colors).map(
      ([color, hex]) => {
        const $colorOption = this.dom
          .querySelector('#momentify-color-picker-template')
          .content.firstElementChild.cloneNode(true);
        $colorOption.style.backgroundColor = hex;
        $colorOption.querySelector(
          '[data-component="color-picker-item-name"]',
        ).style.backgroundColor = color;
        $colorOption.querySelector(
          '[data-component="color-picker-item-input"]',
        ).value = hex;
        return $colorOption;
      },
    );

    this.dom
      .querySelector('[data-component="color-picker"]')
      .append(...colorOptions);

    const $titleInput = this.dom.querySelector('#momentify-edit-modal-title');
    const $titleCharsCount = this.dom.querySelector(
      '[data-component="momentify-edit-modal-title-chars-count"]',
    );
    $titleInput.addEventListener('input', (e) => {
      $titleCharsCount.textContent = e.target.value.length;
    });

    this.dom
      .querySelector('#momentify-edit-modal-form')
      .addEventListener('submit', this.handleSubmit.bind(this));
  }

  static find() {
    return document.getElementById('momentify-edit-modal');
  }

  setMediator(mediator) {
    this.mediator = mediator;
  }

  syncState(state) {
    this.state.isNew = state.isNewBookmark;

    if (state.bookmark) {
      this.state.bookmark = state.bookmark;
      this.dom.querySelector('#momentify-edit-modal-title').value =
        state.bookmark.title;
      this.dom.querySelector(
        '[data-component="momentify-edit-modal-title-chars-count"]',
      ).textContent = state.bookmark.title.length;
      const isAvailableColor = Object.values(BookmarkEditModal.colors).includes(
        state.bookmark.color?.toLowerCase(),
      );
      this.dom
        .querySelectorAll('[data-component="color-picker-item-input"]')
        .forEach(($input, i) => {
          $input.checked = false;

          if (isAvailableColor) {
            if ($input.value === state.bookmark.color.toLowerCase()) {
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

  handleSubmit(e) {
    const data = new FormData(e.target);
    const title = data.get('title');
    const color = data.get('color');

    if (this.mediator) {
      if (this.state.isNew) {
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
  static async createBookmark(payload) {
    return await chrome.runtime.sendMessage({
      action: 'CREATE_BOOKMARK',
      ...payload,
    });
  }
  static async updateBookmark(bookmark) {
    return await chrome.runtime.sendMessage({
      action: 'UPDATE_BOOKMARK',
      bookmark,
    });
  }

  static async getBookmarks({ videoId }) {
    return await chrome.runtime.sendMessage({
      action: 'GET_BOOKMARKS_BY_VIDEO_ID',
      videoId,
      normalized: true,
    });
  }

  static async getVideo({ videoId }) {
    return await chrome.runtime.sendMessage({
      action: 'GET_VIDEO',
      videoId,
    });
  }

  static async deleteBookmark({ bookmarkId }) {
    return await chrome.runtime.sendMessage({
      action: 'DELETE_BOOKMARK',
      bookmarkId,
    });
  }

  static async saveLoop({ videoId, loopStartId, loopEndId }) {
    return await chrome.runtime.sendMessage({
      action: 'SAVE_VIDEO_LOOP',
      videoId,
      loopStartId,
      loopEndId,
    });
  }

  static async deleteLoop({ videoId }) {
    return await chrome.runtime.sendMessage({
      action: 'DELETE_VIDEO_LOOP',
      videoId,
    });
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

chrome.runtime.onMessage.addListener(async (message) => {
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
    default:
      console.warn('[momentify] Unknown action:', message.action);
  }
});

function getVideoTitle() {
  return document.title.split(' - YouTube')[0];
}

function getVideoIdFromUrl(url) {
  const params = getVideoPageUrlParams(url);
  return params?.videoId;
}

function getVideoPageUrlParams(url) {
  const videoPagePattern = new URLPattern({
    baseUrl: 'https://www.youtube.com',
    pathname: '/watch',
  });

  if (videoPagePattern.test(url)) {
    const urlObj = new URL(url);
    const videoId = urlObj.searchParams.get('v');
    const time =
      urlObj.searchParams.get('t') ?? urlObj.searchParams.get('start');

    return { videoId, time };
  }
}

function createDomElement(html) {
  const dom = new DOMParser().parseFromString(html, 'text/html');
  return dom.body.firstElementChild;
}

function formatTime(timeInSec) {
  const seconds = Math.max(0, Math.floor(timeInSec));

  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;

  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  return `${m}:${String(s).padStart(2, '0')}`;
}
