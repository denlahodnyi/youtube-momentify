import type { Bookmark } from '@/api';
import { BOOKMARK_TITLE_CONSTRAINS, COLORS } from '@/shared';
import type ContentRenderer from './contentRenderer';
import { createDomElement } from './contentUtils';

export default class BookmarkEditModal {
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
