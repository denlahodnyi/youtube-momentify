import type ContentRenderer from './contentRenderer';
import { createDomElement } from './contentUtils';

const QUICK_SAVE_BTN_ID = 'momentify-save-bookmark-btn';
const SAVE_WITH_EDIT_BTN_ID = 'momentify-save-with-edit-bookmark-btn';

export default class BookmarkButton {
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
