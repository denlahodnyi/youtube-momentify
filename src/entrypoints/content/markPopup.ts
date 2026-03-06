import type { Bookmark } from '@/api';
import type ContentRenderer from './contentRenderer';
import { createDomElement } from './contentUtils';

export default class MarkPopup {
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
