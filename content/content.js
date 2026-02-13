// TODO: fix context loose error (https://stackoverflow.com/questions/53939205/how-to-avoid-extension-context-invalidated-errors-when-messaging-after-an-exte)
console.log('SCRIPT RUNNING');
const BOOKMARK_BTN_ID = 'momentify-bookmark-btn';
const TIMESTAMPS_OUTER_CONTAINER_ID = 'momentify-bar';
const TIMESTAMPS_INNER_CONTAINER_ID = 'momentify-bookmarks-container';
const MARK_DEFAULT_COLOR = '#FF7F50';

class ContentRenderer {
  state = {
    videoId: getVideoIdFromUrl(location.href),
    loopStart: 0,
    loopEnd: 0,
  };
  popupsContainerId = 'momentify-bookmark-popups-container';

  BookmarkButton;
  ProgressBar;
  Mark;
  services;

  constructor(BookmarkButton, ProgressBar, Mark, Services) {
    this.BookmarkButton = BookmarkButton;
    this.ProgressBar = ProgressBar;
    this.Mark = Mark;
    this.services = Services;

    this.boundLoopHandler = this.handleLoop.bind(this);

    observeUrlChange((newUrl) => {
      this.state.videoId = getVideoIdFromUrl(newUrl);
      this.render();
    });
  }

  async notify(sender, event) {
    switch (event.type) {
      case 'renderer/save_bookmark': {
        const video = document.body.querySelector('video');
        const title = document.title.split(' - YouTube')[0];

        if (video) {
          const { currentTime, duration } = video;
          const result = await this.services.createBookmark({
            time: currentTime,
            title,
            videoId: this.state.videoId,
          });

          if (result.success) {
            const { id, time, color } = result.item.bookmark;
            const mark = new Mark(
              { id, time, color, duration },
              { popupsContainerId: this.popupsContainerId },
            );
            mark.setMediator(this);
            ProgressBar.findMarksContainer()?.append(mark.dom);
          }
        } else {
          console.error('[momentify] No video element found');
        }
        break;
      }
      case 'renderer/delete_bookmark': {
        const { bookmarkId } = event.payload;
        const result = await this.services.deleteBookmark({ bookmarkId });

        if (result.success) {
          await this.notify(null, {
            type: 'renderer/clear_loop_ui_by_bookmarkId',
            payload: { bookmarkId },
          });

          Mark.removeMark(bookmarkId);
        }
        break;
      }
      case 'renderer/save_loop': {
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
              delete $m.dataset.loop;
              this.Mark.syncMarkLoopUI($m);
            });
          sender.mark.dataset.loop = 'finish';
          this.Mark.syncMarkLoopUI(sender.mark);
          this.setupDomLoop(loopStartId, loopEndId);
        }
        break;
      }
      case 'renderer/delete_loop': {
        const $loopMarks = this.Mark.findLoopMarks(
          this.ProgressBar.findMarksContainer(),
        );

        if ($loopMarks[0] && $loopMarks[1]) {
          const result = await this.services.deleteLoop({
            videoId: this.state.videoId,
          });

          if (result.success) {
            this.notify(null, { type: 'renderer/clear_loop_ui' });
          }
        } else {
          delete sender.mark.dataset.loop;
          this.Mark.syncMarkLoopUI(sender.mark);
        }
        break;
      }
      case 'renderer/clear_loop_ui': {
        this.removeDomLoop();
        const $loopMarks = this.Mark.findLoopMarks(
          this.ProgressBar.findMarksContainer(),
        );
        if ($loopMarks[0]) {
          delete $loopMarks[0].dataset.loop;
          this.Mark.syncMarkLoopUI($loopMarks[0]);
        }
        if ($loopMarks[1]) {
          delete $loopMarks[1].dataset.loop;
          this.Mark.syncMarkLoopUI($loopMarks[1]);
        }
        break;
      }
      case 'renderer/clear_loop_ui_by_bookmarkId': {
        const { bookmarkId } = event.payload;
        const $loopMarks = this.Mark.findLoopMarks(
          this.ProgressBar.findMarksContainer(),
        );

        if ($loopMarks[0] && $loopMarks[1]) {
          const startId = this.Mark.getBookmarkIdFromDom($loopMarks[0]);
          const endId = this.Mark.getBookmarkIdFromDom($loopMarks[1]);

          if (startId === bookmarkId || endId === bookmarkId) {
            this.removeDomLoop();
            delete $loopMarks[0].dataset.loop;
            delete $loopMarks[1].dataset.loop;
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
      const button = new this.BookmarkButton();
      button.setMediator(this);
      const $controlsContainer = document.body.querySelector(
        '#movie_player .ytp-right-controls',
      );

      if ($controlsContainer) {
        $controlsContainer.insertAdjacentElement('afterbegin', button.dom);
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
            const { loopStart, loopEnd } = videoRes.video;

            bookmarksRes.list.forEach((bm) => {
              const mark = new this.Mark(
                {
                  id: bm.id,
                  time: bm.time,
                  color: bm.color,
                  duration,
                  loopStartId: loopStart,
                  loopEndId: loopEnd,
                },
                { popupsContainerId: this.popupsContainerId },
              );
              mark.setMediator(this);
              $marksContainer.append(mark.dom);
            });

            if (loopStart && loopEnd) {
              this.setupDomLoop(loopStart, loopEnd);
            } else {
              this.removeDomLoop();
            }
          }
        } else {
          console.error('[momentify] Cannot find video element');
        }
      }
    }
  }

  setupDomLoop(loopStartId, loopEndId) {
    const $startMark = this.Mark.findMark(loopStartId);
    const $endMark = this.Mark.findMark(loopEndId);

    if ($startMark && $endMark) {
      const $video = document.querySelector('video');
      const startTime = Number($startMark.dataset.time);
      const endTime = Number($endMark.dataset.time);
      this.state.loopStart = Math.min(startTime, endTime);
      this.state.loopEnd = Math.max(startTime, endTime);

      $video.addEventListener('timeupdate', this.boundLoopHandler);
    }
  }

  removeDomLoop() {
    const $video = document.querySelector('video');
    $video.removeEventListener('timeupdate', this.boundLoopHandler);
    this.state.loopStart = 0;
    this.state.loopEnd = 0;
  }

  handleLoop(e) {
    if (e.target.currentTime >= this.state.loopEnd) {
      e.target.currentTime = this.state.loopStart;
    } else if (e.target.currentTime < this.state.loopStart) {
      e.target.currentTime = this.state.loopStart;
    }
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
  constructor() {
    const $button = createDomElement(`
        <button id=${BOOKMARK_BTN_ID} aria-label="Save bookmark" class="ytp-button" style="display: flex; align-items: center; justify-content: center;">
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
    this.mediator?.notify(this, { type: 'renderer/save_bookmark' });
  }

  static find() {
    return document.getElementById(BOOKMARK_BTN_ID);
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
}

class Mark {
  constructor(
    { id, time, color, duration, loopStartId, loopEndId },
    { popupsContainerId },
  ) {
    this.id = id;
    this.popupsContainerId = popupsContainerId;

    this.dom = createDomElement(`
      <div id="${Mark.createMarkWrapperDomId(id)}" data-component="mark-wrapper"></div>
    `);

    this.mark = createDomElement(`
      <div id="${Mark.createMarkDomId(
        id,
      )}" data-time="${time}" data-component="mark" style="
        position: absolute;
        top: 50%;
        left: ${(time / duration) * 100}%;
        translate: 0 -50%;
        z-index: 1000;
        width: 1px;
        height: 8px;
        border-radius: 4px;
        background-color: ${color};
        anchor-name: --mark-${id}
      "></div>
    `);

    this.mark.addEventListener('mouseenter', this.handleMarkHover.bind(this));

    this.popup = createDomElement(`
      <div id="${Mark.createPopupDomId(id)}" data-component="mark-popup" data-open="false" style="
        font: initial;
        shadow: initial;
        position: initial;
        text-shadow: initial;
        text-decoration: initial;
        cursor: initial;
        margin: initial;
        padding: initial;
        background: initial;
        display: none;"
      >
        <div class="momentify-mark-popup" style="position-anchor: --mark-${id};">
          <button aria-label="Close popup" data-action="close" class="momentify-default-btn momentify-mark-popup__close-btn">
            <svg aria-hidden xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-x-icon lucide-x"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </button>
          <button data-component="loop-btn" data-action="" class="momentify-default-btn momentify-mark-popup__loop-btn" hidden>
            <svg aria-hidden xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-repeat2-icon lucide-repeat-2"><path d="m2 9 3-3 3 3"/><path d="M13 18H7a2 2 0 0 1-2-2V6"/><path d="m22 15-3 3-3-3"/><path d="M11 6h6a2 2 0 0 1 2 2v10"/></svg>
            <span></span>
          </button>
          <span data-component="loop-label" class="momentify-mark-popup__loop-label" hidden>
            <span></span>
            <button aria-label="Remove loop" data-component="loop-del-btn" data-action="remove-loop" class="momentify-default-btn momentify-mark-popup__del-loop-btn">
              <svg aria-hidden xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-delete-icon lucide-delete"><path d="M10 5a2 2 0 0 0-1.344.519l-6.328 5.74a1 1 0 0 0 0 1.481l6.328 5.741A2 2 0 0 0 10 19h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z"/><path d="m12 9 6 6"/><path d="m18 9-6 6"/></svg>
            </button>
          </span>
          <button data-action="delete" class="momentify-default-btn momentify-mark-popup__del-btn">
            <svg aria-hidden xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-trash2-icon lucide-trash-2"><path d="M10 11v6"/><path d="M14 11v6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            Remove bookmark
          </button>
        </div>
      </div>
    `);

    this.disablePopupTouchEventsLeak();

    this.popup
      .querySelector('[data-action="close"]')
      .addEventListener('click', this.handleClosePopup.bind(this));
    this.popup
      .querySelector('[data-action="delete"]')
      .addEventListener('click', this.handleDeleteBookmark.bind(this));
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

    if (loopStartId === id) {
      this.mark.dataset.loop = 'start';
      this.loopSign.style.display = 'block';
    } else if (loopEndId === id) {
      this.mark.dataset.loop = 'finish';
      this.loopSign.style.display = 'block';
    }

    this.dom.append(this.mark);
    this.dom.append(this.loopSign);
    document.getElementById(this.popupsContainerId)?.append(this.popup);

    this.boundedHandlePopupClickAway = this.handlePopupClickAway.bind(this);
  }

  setMediator(mediator) {
    this.mediator = mediator;
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
    document.getElementById(this.createMarkWrapperDomId(bookmarkId))?.remove();
  }

  static isInPopup($el) {
    const $openedPopup = document.querySelector(
      '[data-component="mark-popup"][data-open="true"]',
    );
    return Boolean(
      $openedPopup && ($el === $openedPopup || $openedPopup.contains($el)),
    );
  }

  static closeAllPopups() {
    document.querySelectorAll('[data-component="mark-popup"]').forEach(($p) => {
      $p.style.display = 'none';
      $p.dataset.open = 'false';
    });
  }

  static syncMarkLoopUI($mark) {
    const id = this.getBookmarkIdFromDom($mark);
    const $loopMarks = this.findLoopMarks();
    const $markContainer = document.getElementById(
      this.createMarkWrapperDomId(id),
    );
    const $popup = this.findPopup(id);
    const $loopButton = $popup.querySelector('[data-component="loop-btn"]');
    const $loopLabel = $popup.querySelector('[data-component="loop-label"]');
    const $loopSign = $markContainer.querySelector(
      '[data-component="loop-sign"]',
    );

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

  handleMarkHover() {
    document.querySelectorAll('[data-component="mark-popup"]').forEach(($p) => {
      $p.style.display = 'none';
      $p.dataset.open = 'false';
    });
    this.popup.style.display = 'block';
    this.popup.dataset.open = 'true';
    document
      .querySelector('video')
      ?.addEventListener('click', this.boundedHandlePopupClickAway, {
        capture: true,
      });
    Mark.syncMarkLoopUI(this.mark);
  }

  handleClosePopup(e) {
    e.preventDefault();
    e.stopPropagation();
    this.popup.style.display = 'none';
    this.popup.dataset.open = 'false';
  }

  handlePopupClickAway(e) {
    if (!Mark.isInPopup(e.target)) {
      Mark.closeAllPopups();
      document
        .querySelector('video')
        ?.removeEventListener('click', this.boundedHandlePopupClickAway, {
          capture: true,
        });
    }
  }

  handleDeleteBookmark(e) {
    this.mediator.notify(this, {
      type: 'renderer/delete_bookmark',
      payload: { bookmarkId: this.id },
    });
  }

  handleLoopSet(e) {
    const action = e.currentTarget.dataset.action;

    if (action === 'start') {
      this.mark.dataset.loop = 'start';
      Mark.syncMarkLoopUI(this.mark);
      return;
    }

    const $loopMarks = Mark.findLoopMarks();

    if (action === 'finish' && $loopMarks[0]) {
      this.mediator.notify(this, {
        type: 'renderer/save_loop',
        payload: {
          loopStartId: Mark.getBookmarkIdFromDom($loopMarks[0]),
          loopEndId: this.id,
        },
      });
    }
  }

  handleLoopDelete() {
    this.mediator.notify(this, {
      type: 'renderer/delete_loop',
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

class Services {
  static async createBookmark({ time, videoId, title }) {
    return await chrome.runtime.sendMessage({
      action: 'CREATE_BOOKMARK',
      time,
      videoId,
      title,
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
      loopStart: loopStartId,
      loopEnd: loopEndId,
    });
  }

  static async deleteLoop({ videoId }) {
    return await chrome.runtime.sendMessage({
      action: 'DELETE_VIDEO_LOOP',
      videoId,
    });
  }
}

const contentRenderer = new ContentRenderer(
  BookmarkButton,
  ProgressBar,
  Mark,
  Services,
);
contentRenderer.render();

chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  switch (message.action) {
    case 'CONTENT/PLAY_VIDEO_AT': {
      // TODO: what if there is loop presence?
      const video = document.body.querySelector('video');

      if (video) {
        video.currentTime = message.time;
        video.play();
      }
      break;
    }
    case 'CONTENT/UPDATE_BOOKMARK_COLOR': {
      const $mark = Mark.findMark(message.bookmarkId);

      if ($mark) {
        $mark.style.backgroundColor = message.color;
      }
      break;
    }
    case 'CONTENT/DELETE_BOOKMARK': {
      await contentRenderer.notify(null, {
        type: 'renderer/clear_loop_ui_by_bookmarkId',
        payload: { bookmarkId: message.bookmarkId },
      });
      Mark.removeMark(message.bookmarkId);
      break;
    }
    case 'CONTENT/DELETE_ALL_BOOKMARKS': {
      ProgressBar.clearContent();
      contentRenderer.removeDomLoop();
      break;
    }
    default:
      console.warn('Unknown action:', message.action);
  }
});

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
