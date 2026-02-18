import {
  formatTime,
  getCurrentVideoActiveTab,
  getCurrentVideoTabs,
  getVideoUrlWithTime,
} from './popupUtils.js';

export default class Bookmark {
  dom;
  services;
  onColorPickerInvoke;
  onBookmarkDelete;

  constructor({ bookmark, services }) {
    this.bookmark = bookmark;
    this.services = services;
    const $tmpl = document.getElementById('bookmark-template');

    if ($tmpl) {
      this.dom = $tmpl.content.firstElementChild.cloneNode(true);

      this.dom.querySelector(
        '[data-component="bookmark-timestamp"]',
      ).textContent = formatTime(bookmark.time);

      // Title
      const $title = this.dom.querySelector(
        '[data-component="bookmark-title"]',
      );
      const $titleInput = this.dom.querySelector(
        '[data-component="bookmark-title-input"]',
      );
      const $titleCharsCount = $title.querySelector(
        '[data-component="bookmark-title-chars-count"]',
      );
      $titleInput.value = bookmark.title;
      $titleCharsCount.textContent = $titleInput.value.length;
      $titleInput.addEventListener('input', (e) => {
        $titleCharsCount.textContent = e.target.value.length;
      });
      $titleInput.addEventListener('change', async (e) => {
        e.target.value = e.target.value.trim();
        const isValid = e.target.checkValidity();

        if (isValid) {
          const result = await this.services.updateBookmark({
            ...bookmark,
            title: e.target.value,
          });

          // if (result.success) bookmark.title = e.target.value;
        } else {
          const { valueMissing, tooShort } = e.target.validity;

          if (valueMissing || tooShort) $titleInput.value = bookmark.title;
        }

        $titleCharsCount.textContent = e.target.value.length;
      });

      // Note
      const $noteInput = this.dom.querySelector(
        '[data-component="bookmark-note-input"]',
      );
      const $noteCharsCount = this.dom.querySelector(
        '[data-component="bookmark-note-chars-count"]',
      );
      $noteInput.value = bookmark.note || '';
      $noteCharsCount.textContent = bookmark.note.length || 0;
      $noteInput.addEventListener('input', (e) => {
        $noteCharsCount.textContent = e.target.value.length;
      });
      $noteInput.addEventListener('change', async (e) => {
        const result = await this.services.updateBookmark({
          ...bookmark,
          note: e.target.value,
        });

        // if (result.success) bookmark.note = e.target.value;
      });

      // Color picker
      const $colorButton = this.dom.querySelector(
        '[data-component="bookmark-color"]',
      );
      $colorButton.style.backgroundColor = bookmark.color;
      $colorButton.addEventListener('click', () => {
        const $colorPickerPopover = document.getElementById(
          'bookmark-color-picker',
        );
        this.onColorPickerInvoke?.($colorButton, bookmark);
        $colorPickerPopover.togglePopover({ source: $colorButton });
      });

      this.bindHandleDeleteBookmark = this.handleDeleteBookmark.bind(this);
      this.bindHandleCopyLink = this.handleCopyLink.bind(this);
      this.bindHandlePlay = this.handlePlay.bind(this);

      // Buttons
      this.dom
        .querySelector('[data-component="play-btn"]')
        .addEventListener('click', this.bindHandlePlay);
      this.dom
        .querySelector('[data-component="delete-bm-btn"]')
        .addEventListener('click', this.bindHandleDeleteBookmark);
      this.dom
        .querySelector('[data-component="copy-bm-btn"]')
        .addEventListener('click', this.bindHandleCopyLink);
    } else {
      throw new Error('No bookmark template found');
    }
  }

  async handlePlay() {
    const activeTab = await getCurrentVideoActiveTab(this.bookmark.videoId);

    if (activeTab) {
      this.services.playVideo(activeTab.id, this.bookmark.time);
      return;
    }

    const tabs = await getCurrentVideoTabs(this.bookmark.videoId);

    if (tabs.length) {
      const [tab] = tabs;
      this.services.playVideo(tab.id, this.bookmark.time);
      await chrome.tabs.update(tab.id, { active: true });
      await chrome.windows.update(tab.windowId, { focused: true });
      return;
    }

    // TODO: check this later
    await chrome.tabs.create({
      url: getVideoUrlWithTime(this.bookmark.videoId, this.bookmark.time),
      active: true,
    });
  }

  async handleDeleteBookmark() {
    // TODO: show some loader?
    const result = await this.services.deleteBookmark(this.bookmark.id);

    if (result.success) {
      this.onBookmarkDelete?.();
    }
  }

  async handleCopyLink() {
    try {
      await navigator.clipboard.writeText(
        getVideoUrlWithTime(this.bookmark.videoId, this.bookmark.time),
      );
    } catch (error) {
      console.error(error);
    }
  }
}
