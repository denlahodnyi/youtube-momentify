// TODO: fix context loose error (https://stackoverflow.com/questions/53939205/how-to-avoid-extension-context-invalidated-errors-when-messaging-after-an-exte)
console.log('SCRIPT RUNNING');
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
  };
  popupsContainerId = 'momentify-bookmark-popups-container';

  BookmarkButton;
  ProgressBar;
  Mark;
  BookmarkEditModalCreator;
  services;
  bookmarkModal;

  constructor({
    BookmarkButton,
    ProgressBar,
    Mark,
    BookmarkEditModal,
    Services,
  }) {
    this.BookmarkButton = BookmarkButton;
    this.ProgressBar = ProgressBar;
    this.Mark = Mark;
    this.BookmarkEditModalCreator = BookmarkEditModal;
    this.services = Services;

    this.boundLoopHandler = this.handleLoop.bind(this);

    observeUrlChange((newUrl) => {
      this.state.videoId = getVideoIdFromUrl(newUrl);
      this.render();
    });
  }

  async notify(sender, event) {
    switch (event.type) {
      case 'ui/play_video': {
        const video = document.body.querySelector('video');

        // TODO: what if there is loop presence?
        if (video) {
          video.currentTime = event.payload.time;
          video.play();
        }

        break;
      }
      case 'ui/render_bookmark': {
        const $video = document.body.querySelector('video');

        if ($video) {
          const { bookmark } = event.payload;
          const mark = this.buildBookmark(bookmark, $video.duration);
          ProgressBar.pushBookmark(mark.dom);
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
          await this.services.createBookmark({
            videoTitle,
            videoId: this.state.videoId,
            time: time ?? $video.currentTime,
            title,
            color,
          });
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
        const markInstance = Mark.getInstance(bookmark.id);

        if (markInstance) markInstance.syncState({ bookmark });

        break;
      }
      case 'ui/open_bookmark_edit_modal': {
        const { bookmark, isNewBookmark = false } = event.payload || {};
        const $video = document.querySelector('video');
        $video?.pause();
        this.bookmarkModal.syncState({
          isNewBookmark,
          bookmark: isNewBookmark
            ? { title: new Date().toLocaleString(), time: $video.currentTime }
            : bookmark,
        });
        this.bookmarkModal.open();
        break;
      }
      case 'api/delete_bookmark': {
        const { bookmarkId } = event.payload;
        await this.services.deleteBookmark({ bookmarkId });
        break;
      }
      case 'ui/delete_bookmark': {
        const { bookmarkId } = event.payload;

        await this.notify(null, {
          type: 'ui/clear_loop_ui_by_bookmarkId',
          payload: { bookmarkId },
        });
        Mark.removeMark(bookmarkId);

        break;
      }
      case 'ui/delete_all_bookmarks': {
        ProgressBar.clearContent();
        this.removeVideoLoop();
        break;
      }
      case 'api/save_loop': {
        const { loopStartId, loopEndId } = event.payload;
        const result = await this.services.saveLoop({
          videoId: this.state.videoId,
          loopStartId,
          loopEndId,
        });

        if (result.success) {
          Array.from(
            this.Mark.findAllLoopMarks(this.ProgressBar.findMarksContainer()),
          )
            .filter(
              ($m) =>
                this.Mark.getBookmarkIdFromDom($m) !== loopStartId &&
                this.Mark.getBookmarkIdFromDom($m) !== loopEndId,
            )
            .forEach(($m) => {
              this.Mark.syncMarkLoopUI($m);
            });
          this.Mark.syncMarkLoopUI(sender.mark, 'finish');
          this.setupVideoLoop(loopStartId, loopEndId);
        }
        break;
      }
      case 'api/delete_loop': {
        const $loopMarks = this.Mark.findLoopMarks(
          this.ProgressBar.findMarksContainer(),
        );

        if ($loopMarks[0] && $loopMarks[1]) {
          const result = await this.services.deleteLoop({
            videoId: this.state.videoId,
          });

          if (result.success) {
            this.notify(null, { type: 'ui/clear_loop_ui' });
          }
        } else {
          this.Mark.syncMarkLoopUI(sender.mark);
        }
        break;
      }
      case 'ui/clear_loop_ui': {
        this.removeVideoLoop();
        const $loopMarks = this.Mark.findLoopMarks(
          this.ProgressBar.findMarksContainer(),
        );

        if ($loopMarks[0]) {
          this.Mark.syncMarkLoopUI($loopMarks[0]);
        }
        if ($loopMarks[1]) {
          this.Mark.syncMarkLoopUI($loopMarks[1]);
        }
        break;
      }
      case 'ui/clear_loop_ui_by_bookmarkId': {
        const { bookmarkId } = event.payload;
        const $loopMarks = this.Mark.findLoopMarks(
          this.ProgressBar.findMarksContainer(),
        );

        if ($loopMarks[0] && $loopMarks[1]) {
          const startId = this.Mark.getBookmarkIdFromDom($loopMarks[0]);
          const endId = this.Mark.getBookmarkIdFromDom($loopMarks[1]);

          if (startId === bookmarkId || endId === bookmarkId) {
            this.removeVideoLoop();
            this.Mark.syncMarkLoopUI($loopMarks[0]);
            this.Mark.syncMarkLoopUI($loopMarks[1]);
          }
        }
        break;
      }
      default:
        break;
    }
  }

  render() {
    this.renderPopupsContainer();
    this.renderBookmarkButton();
    this.renderBookmarkEditModal();
    this.renderProgressBar();
  }

  renderPopupsContainer() {
    // Render out of .ytp-progress-bar to prevent issue with containing block
    const $YTprogressBarContainer = document.querySelector(
      '.ytp-progress-bar-container',
    );
    if ($YTprogressBarContainer) {
      $YTprogressBarContainer.append(
        createDomElement(`
        <div id="${this.popupsContainerId}"></div>
      `),
      );
    } else {
      console.error('[momentify] Cannot find YouTube progress bar container');
    }
  }

  renderBookmarkButton() {
    if (this.state.videoId && !BookmarkButton.find()) {
      const quickSaveButton = new this.BookmarkButton();
      const saveWithEditButton = new this.BookmarkButton(true);
      quickSaveButton.setMediator(this);
      saveWithEditButton.setMediator(this);
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
        console.error('No controls container found');
      }
    }
  }

  async renderProgressBar() {
    if (this.state.videoId) {
      if (ProgressBar.find()) {
        ProgressBar.clearContent();
      } else {
        const $youTubeProgressBar =
          document.body.querySelector('.ytp-progress-bar');

        if ($youTubeProgressBar) {
          const progressBar = new this.ProgressBar();
          $youTubeProgressBar.append(progressBar.dom);
        } else {
          console.error('[momentify] Cannot find YT progress bar element');
        }
      }

      const [bookmarksRes, videoRes] = await Promise.all([
        this.services.getBookmarks({ videoId: this.state.videoId }),
        this.services.getVideo({ videoId: this.state.videoId }),
      ]);

      if (bookmarksRes.list && bookmarksRes.list.length > 0) {
        const $video = document.body.querySelector('video');

        if ($video) {
          let duration = $video.duration;

          if (Number.isNaN(duration)) {
            duration = await new Promise((resolve) => {
              $video.addEventListener('loadedmetadata', () => {
                resolve($video.duration);
              });
            });
          }

          const $marksContainer = ProgressBar.findMarksContainer();

          if ($marksContainer) {
            const { loopStartId, loopEndId } = videoRes.video;

            bookmarksRes.list.forEach((bm) => {
              const mark = this.buildBookmark(
                bm,
                duration,
                loopStartId,
                loopEndId,
              );
              $marksContainer.append(mark.dom);
            });

            if (loopStartId && loopEndId) {
              this.setupVideoLoop(loopStartId, loopEndId);
            } else {
              this.removeVideoLoop();
            }
          }
        } else {
          console.error('[momentify] Cannot find video element');
        }
      }
    }
  }

  renderBookmarkEditModal() {
    if (!this.bookmarkModal) {
      const modal = new this.BookmarkEditModalCreator();
      this.bookmarkModal = modal;
      this.bookmarkModal.setMediator(this);
      document.body.append(modal.dom);
    }
  }

  setupVideoLoop(loopStartId, loopEndId) {
    this.removeVideoLoop();
    const $startMark = this.Mark.findMark(loopStartId);
    const $endMark = this.Mark.findMark(loopEndId);

    if ($startMark && $endMark) {
      const $video = document.querySelector('video');
      const startTime = Number($startMark.dataset.time);
      const endTime = Number($endMark.dataset.time);
      this.state.loopStartTime = Math.min(startTime, endTime);
      this.state.loopEndTime = Math.max(startTime, endTime);

      $video.addEventListener('timeupdate', this.boundLoopHandler);
    }
  }

  removeVideoLoop() {
    const $video = document.querySelector('video');
    $video.removeEventListener('timeupdate', this.boundLoopHandler);
    this.state.loopStartTime = 0;
    this.state.loopEndTime = 0;
  }

  handleLoop(e) {
    if (e.target.currentTime >= this.state.loopEndTime) {
      e.target.currentTime = this.state.loopStartTime;
    } else if (e.target.currentTime < this.state.loopStartTime) {
      e.target.currentTime = this.state.loopStartTime;
    }
  }

  buildBookmark(bookmark, duration, loopStartId, loopEndId) {
    const mark = new this.Mark(
      {
        bookmark,
        duration,
        loopStartId,
        loopEndId,
      },
      { popupsContainerId: this.popupsContainerId },
    );
    mark.setMediator(this);

    return mark;
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
    this.id = isQuick ? QUICK_SAVE_BTN_ID : SAVE_WITH_EDIT_BTN_ID;
    const color = isQuick ? 'red' : 'blue';
    const label = isQuick ? 'Save quick bookmark' : 'Edit and save bookmark';
    const $button = createDomElement(`
        <button id=${this.id} aria-label="${label}" class="ytp-button" style="display: flex; align-items: center; justify-content: center; color: ${color}">
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
      this.mediator?.notify(this, { type: 'api/save_bookmark' });
    } else {
      this.mediator?.notify(this, {
        type: 'ui/open_bookmark_edit_modal',
        payload: { isNewBookmark: true },
      });
    }
  }

  static find() {
    return document.getElementById(this.id);
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
    if ($container) $container.innerHTML = '';
  }

  static pushBookmark($bookmark) {
    ProgressBar.findMarksContainer()?.append($bookmark);
  }
}

class Mark {
  static youtubeVideContainerClassname = '.html5-video-player';
  mediator;
  popupsContainerId;
  state = { id: null, bookmark: null };

  constructor(
    { bookmark, duration, loopStartId, loopEndId },
    { popupsContainerId },
  ) {
    const { id, time, title, color } = bookmark;
    this.state = { id, bookmark };
    this.popupsContainerId = popupsContainerId;

    this.dom = createDomElement(`
      <div id="${Mark.createMarkWrapperDomId(id)}" data-component="mark-wrapper"></div>
    `);

    this.mark = createDomElement(`
      <button id="${Mark.createMarkDomId(id)}" tabindex="0" aria-haspopup="dialog" aria-label="Bookmark" data-time="${time}" data-component="mark" class="momentify-mark" style="
        position: absolute;
        top: 50%;
        left: ${(time / duration) * 100}%;
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

    this.mark.addEventListener(
      'mouseenter',
      this.handleMarkHoverOrClick.bind(this),
    );
    this.mark.addEventListener('click', this.handleMarkHoverOrClick.bind(this));

    this.popup = createDomElement(`
      <dialog id="${Mark.createPopupDomId(id)}"
        data-component="mark-popup"
        aria-label="Bookmark settings"
        class="momentify-mark-popup"
        style="position-anchor: --mark-${id};"
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

    this.loopSign = createDomElement(`
      <div data-component="loop-sign" style="
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

    this.dom.append(this.mark);
    this.dom.append(this.loopSign);

    if (loopStartId === id) {
      Mark.syncLoopUI(this.mark, this.popup, this.loopSign, 'start');
    } else if (loopEndId === id) {
      Mark.syncLoopUI(this.mark, this.popup, this.loopSign, 'finish');
    } else {
      Mark.syncLoopUI(this.mark, this.popup, this.loopSign);
    }

    // This wrapper is just to reset some inherited styles
    const $popupWrapper = createDomElement(`
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
    $popupWrapper.append(this.popup);
    document.getElementById(this.popupsContainerId)?.append($popupWrapper);

    this.boundedHandlePopupClickAway = this.handlePopupClickAway.bind(this);

    this.#setDomState();
  }

  static find(bookmarkId) {
    return document.getElementById(this.createMarkWrapperDomId(bookmarkId));
  }

  static findMark(bookmarkId) {
    return document.getElementById(this.createMarkDomId(bookmarkId));
  }

  static findPopup(bookmarkId) {
    return document.getElementById(this.createPopupDomId(bookmarkId));
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

  static createPopupDomId(bookmarkId) {
    return `momentify-bookmark-popup-${bookmarkId}`;
  }

  static createMarkWrapperDomId(bookmarkId) {
    return `momentify-wrapper-bookmark-${bookmarkId}`;
  }

  static getBookmarkIdFromDom($mark) {
    return Number($mark.id.split('momentify-bookmark-')[1]);
  }

  static removeMark(bookmarkId) {
    this.find(bookmarkId)?.remove();
    this.findPopup(bookmarkId)?.parentElement.remove();
  }

  static isInPopup($el) {
    const $openedPopup = document.querySelector(
      '[data-component="mark-popup"][open]',
    );
    return Boolean(
      $openedPopup && ($el === $openedPopup || $openedPopup.contains($el)),
    );
  }

  static closeAllPopups() {
    document.querySelectorAll('[data-component="mark-popup"]').forEach(($p) => {
      $p.close();
    });
  }

  static getInstance(bookmarkId) {
    return Mark.find(bookmarkId)?._state?.instance;
  }

  setMediator(mediator) {
    this.mediator = mediator;
  }

  #setDomState() {
    this.dom._state = { instance: this };
  }

  syncState({ bookmark }) {
    this.state = { id: bookmark.id, bookmark };
    this.mark.style.backgroundColor = bookmark.color;
    const $popupTitle = this.popup.querySelector(
      '[data-component="bookmark-title"]',
    );
    if ($popupTitle) $popupTitle.textContent = bookmark.title;
    this.#setDomState();
  }

  static syncMarkLoopUI($mark, loopPartType) {
    const { mark, popup, loopSign } = this.getInstance(
      this.getBookmarkIdFromDom($mark),
    );
    Mark.syncLoopUI(mark, popup, loopSign, loopPartType);
  }

  static syncLoopUI($mark, $popup, $loopSign, loopPartType) {
    const $loopButton = $popup.querySelector('[data-component="loop-btn"]');
    const $loopLabel = $popup.querySelector('[data-component="loop-label"]');

    if (loopPartType === 'start' || loopPartType === 'finish') {
      $mark.dataset.loop = loopPartType;
    } else {
      delete $mark.dataset.loop;
    }

    const $loopMarks = this.findLoopMarks();

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
    } else if ($loopMarks[0]) {
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

  handleMarkHoverOrClick(e) {
    document.querySelectorAll('[data-component="mark-popup"]').forEach(($p) => {
      $p.close();
    });
    this.popup.show();
    document
      .querySelector(Mark.youtubeVideContainerClassname)
      ?.addEventListener('click', this.boundedHandlePopupClickAway, {
        capture: true,
      });
    Mark.syncMarkLoopUI(this.mark, this.mark.dataset.loop);
  }

  handleClosePopup(e) {
    e.preventDefault();
    e.stopPropagation();
    this.popup.close();
  }

  handlePopupClickAway(e) {
    if (!Mark.isInPopup(e.target)) {
      Mark.closeAllPopups();
      document
        .querySelector(Mark.youtubeVideContainerClassname)
        ?.removeEventListener('click', this.boundedHandlePopupClickAway, {
          capture: true,
        });
    }
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
      payload: { bookmark: this.state.bookmark },
    });
  }

  handleLoopSet(e) {
    const action = e.currentTarget.dataset.action;

    if (action === 'start') {
      Mark.syncMarkLoopUI(this.mark, 'start');
      return;
    }

    const $loopMarks = Mark.findLoopMarks();

    if (action === 'finish' && $loopMarks[0]) {
      this.mediator.notify(this, {
        type: 'api/save_loop',
        payload: {
          loopStartId: Mark.getBookmarkIdFromDom($loopMarks[0]),
          loopEndId: this.state.id,
        },
      });
    }
  }

  handleLoopDelete() {
    this.mediator.notify(this, {
      type: 'api/delete_loop',
    });
  }

  disablePopupTouchEventsLeak() {
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
  BookmarkEditModal,
  Services,
});
contentRenderer.render();

chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  switch (message.action) {
    case 'CONTENT/PLAY_VIDEO_AT': {
      await contentRenderer.notify(null, {
        type: 'ui/play_video',
        payload: { time: message.time },
      });
      break;
    }
    case 'CONTENT/CREATE_BOOKMARK': {
      await contentRenderer.notify(null, {
        type: 'ui/render_bookmark',
        payload: { bookmark: message.bookmark },
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
      console.warn('Unknown action:', message.action);
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
