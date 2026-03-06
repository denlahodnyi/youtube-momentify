import { Bookmark as BookmarkEntity } from '@/api/index.js';
import {
  BOOKMARK_TITLE_CONSTRAINS,
  BOOKMARK_NOTE_CONSTRAINS,
  formatTime,
  getCurrentVideoTabs,
} from '@/shared';
import { getCurrentVideoActiveTab, getVideoUrlWithTime } from './popupUtils.js';
import type Services from './services.js';

const chrome = browser;

export default class Bookmark {
  dom: HTMLElement;
  services: typeof Services;
  getBookmark: () => BookmarkEntity | null | undefined;
  onColorPickerInvoke?: (
    $trigger: HTMLButtonElement,
    bookmarkId: BookmarkEntity['id'],
  ) => void;
  onBookmarkDelete?: () => void;
  onBookmarkUpdate?: (bookmark: BookmarkEntity) => void;
  bindHandleDeleteBookmark;
  bindHandleCopyLink;
  bindHandlePlay;

  constructor(args: {
    getBookmark: () => BookmarkEntity | null | undefined;
    services: typeof Services;
  }) {
    const { getBookmark, services } = args;
    this.getBookmark = getBookmark;
    const bookmark = getBookmark();
    this.services = services;
    const $tmpl = document.getElementById('bookmark-template');
    const templateContent = $tmpl
      ? ($tmpl as HTMLTemplateElement).content.firstElementChild
      : null;

    if (bookmark && templateContent) {
      this.dom = templateContent.cloneNode(true) as HTMLElement;

      const $time = this.dom.querySelector(
        '[data-component="bookmark-timestamp"]',
      );
      if ($time) $time.textContent = formatTime(bookmark.time);

      // Title
      const $titleInput = this.dom.querySelector<HTMLInputElement>(
        '[data-component="bookmark-title-input"]',
      );
      const $titleCharsCountMessage = this.dom.querySelector<HTMLElement>(
        '[data-component="bookmark-title-chars-hint"]',
      );
      const $titleCharsCount = this.dom.querySelector<HTMLElement>(
        '[data-component="bookmark-title-chars-count"]',
      );

      if ($titleInput && $titleCharsCount && $titleCharsCountMessage) {
        $titleCharsCountMessage.id = `bm-title-count-${bookmark.id}`;
        $titleInput.value = bookmark.title;
        $titleInput.id = `bm-input-${bookmark.id}`;
        $titleInput.setAttribute(
          'minLength',
          BOOKMARK_TITLE_CONSTRAINS.min.toString(),
        );
        $titleInput.setAttribute(
          'maxLength',
          BOOKMARK_TITLE_CONSTRAINS.max.toString(),
        );
        $titleInput.setAttribute(
          'aria-describedby',
          $titleCharsCountMessage.id,
        );
        this.dom.setAttribute('aria-labeledby', $titleInput.id);
        const $maxChars = this.dom.querySelector(
          '[data-component="bookmark-title-chars-max-count"]',
        );
        if ($maxChars)
          $maxChars.textContent = BOOKMARK_TITLE_CONSTRAINS.max.toString();
        $titleCharsCount.textContent = $titleInput.value.length.toString();
        $titleInput.addEventListener('input', (e) => {
          $titleCharsCount.textContent = (
            e.target as HTMLInputElement
          ).value.length.toString();
        });
        $titleInput.addEventListener('change', async (e) => {
          const bookmark = this.getBookmark();
          (e.target as HTMLInputElement).value = (
            e.target as HTMLInputElement
          ).value.trim();
          const isValid = (e.target as HTMLInputElement).checkValidity();

          if (bookmark) {
            if (isValid) {
              const updatedBookmark = {
                ...bookmark,
                title: (e.target as HTMLInputElement).value,
              };
              const result =
                await this.services.updateBookmark(updatedBookmark);

              if (result.success) {
                this.onBookmarkUpdate?.(updatedBookmark);
              }
            } else {
              const { valueMissing, tooShort } = (e.target as HTMLInputElement)
                .validity;

              if (valueMissing || tooShort) $titleInput.value = bookmark.title;
            }
          }

          $titleCharsCount.textContent = (
            e.target as HTMLInputElement
          ).value.length.toString();
        });
      }

      // Note
      const $noteInput = this.dom.querySelector<HTMLInputElement>(
        '[data-component="bookmark-note-input"]',
      );
      const $noteCharsCountMessage = this.dom.querySelector<HTMLElement>(
        '[data-component="bookmark-note-chars-hint"]',
      );
      const $noteCharsCount = this.dom.querySelector<HTMLElement>(
        '[data-component="bookmark-note-chars-count"]',
      );
      if ($noteInput && $noteCharsCount && $noteCharsCountMessage) {
        $noteCharsCountMessage.id = `bm-note-count-${bookmark.id}`;
        $noteInput.value = bookmark.note || '';
        $noteInput.setAttribute(
          'minLength',
          BOOKMARK_NOTE_CONSTRAINS.min.toString(),
        );
        $noteInput.setAttribute(
          'maxLength',
          BOOKMARK_NOTE_CONSTRAINS.max.toString(),
        );
        $noteInput.setAttribute('aria-describedby', $noteCharsCountMessage.id);
        $noteCharsCount.textContent = (bookmark.note.length || 0).toString();
        const $maxChars = this.dom.querySelector(
          '[data-component="bookmark-note-chars-max-count"]',
        );
        if ($maxChars)
          $maxChars.textContent = BOOKMARK_NOTE_CONSTRAINS.max.toString();
        $noteInput.addEventListener('input', (e) => {
          $noteCharsCount.textContent = (
            e.target as HTMLInputElement
          ).value.length.toString();
        });
        $noteInput.addEventListener('change', async (e) => {
          const bookmark = this.getBookmark();
          if (bookmark) {
            const updatedBookmark = {
              ...bookmark,
              note: (e.target as HTMLInputElement).value,
            };
            const result = await this.services.updateBookmark(updatedBookmark);

            if (result.success) {
              this.onBookmarkUpdate?.(updatedBookmark);
            }
          }
        });
      }

      // Color picker
      const $colorButton = this.dom.querySelector<HTMLButtonElement>(
        '[data-component="bookmark-color"]',
      );
      if ($colorButton) {
        $colorButton.style.backgroundColor = bookmark.color;
        $colorButton.addEventListener('click', () => {
          const $colorPickerPopover = document.getElementById(
            'bookmark-color-picker',
          );
          this.onColorPickerInvoke?.($colorButton, bookmark.id);
          if ($colorPickerPopover) {
            $colorPickerPopover.togglePopover({
              source: $colorButton,
            } as unknown as boolean);
          }
        });
      }

      this.bindHandleDeleteBookmark = this.handleDeleteBookmark.bind(this);
      this.bindHandleCopyLink = this.handleCopyLink.bind(this);
      this.bindHandlePlay = this.handlePlay.bind(this);

      // Buttons
      this.dom
        .querySelector('[data-component="play-btn"]')
        ?.addEventListener('click', this.bindHandlePlay);
      this.dom
        .querySelector('[data-component="delete-bm-btn"]')
        ?.addEventListener('click', this.bindHandleDeleteBookmark);
      this.dom
        .querySelector('[data-component="copy-bm-btn"]')
        ?.addEventListener('click', this.bindHandleCopyLink);
    } else {
      throw new Error('No bookmark template found');
    }
  }

  async handlePlay() {
    const bookmark = this.getBookmark();

    if (bookmark) {
      const activeTab = await getCurrentVideoActiveTab(bookmark.videoId);

      if (activeTab?.id) {
        this.services.playVideo(activeTab.id, bookmark.time);
        return;
      }

      const tabs = await getCurrentVideoTabs(bookmark.videoId);

      if (tabs[0]?.id) {
        this.services.playVideo(tabs[0].id, bookmark.time);
        await chrome.tabs.update(tabs[0].id, { active: true });
        await chrome.windows.update(tabs[0].windowId, { focused: true });
        return;
      }

      await chrome.tabs.create({
        url: getVideoUrlWithTime(bookmark.videoId, bookmark.time),
        active: true,
      });
    }
  }

  async handleDeleteBookmark() {
    const bookmark = this.getBookmark();
    if (bookmark) {
      // TODO: show some loader?
      const result = await this.services.deleteBookmark(bookmark.id);

      if (result.success) {
        this.onBookmarkDelete?.();
      }
    }
  }

  async handleCopyLink() {
    const bookmark = this.getBookmark();
    if (bookmark) {
      try {
        await navigator.clipboard.writeText(
          getVideoUrlWithTime(bookmark.videoId, bookmark.time),
        );
      } catch (error) {
        console.error(error);
      }
    }
  }
}
