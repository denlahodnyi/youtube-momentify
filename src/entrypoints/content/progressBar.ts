import { createDomElement } from './contentUtils';

const TIMESTAMPS_OUTER_CONTAINER_ID = 'momentify-bar';
const TIMESTAMPS_INNER_CONTAINER_ID = 'momentify-bookmarks-container';

export default class ProgressBar {
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
