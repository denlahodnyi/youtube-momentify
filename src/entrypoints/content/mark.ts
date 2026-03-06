import type { Bookmark } from '@/api';
import { formatTime } from '@/shared';
import type ContentRenderer from './contentRenderer';
import { createDomElement } from './contentUtils';

export default class Mark {
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
