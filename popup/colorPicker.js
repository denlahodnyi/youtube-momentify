import { colors } from './popupUtils.js';

export function setupColorPicker() {
  const $form = document.getElementById('color-picker-form');
  const tmpl = document.getElementById('color-picker-template');

  if (tmpl && $form) {
    Object.entries(colors).map(([colorName, hex]) => {
      const $colorOption = tmpl.content.firstElementChild.cloneNode(true);
      $colorOption.style.backgroundColor = hex;
      $colorOption.querySelector(
        '[data-component="color-picker-item-name"]',
      ).style.backgroundColor = colorName;
      $colorOption.querySelector(
        '[data-component="color-picker-item-input"]',
      ).value = hex;
      $form.append($colorOption);
    });
  }
}
