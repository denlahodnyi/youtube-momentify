import { colors } from './popupUtils.js';

export function setupColorPicker() {
  const $form = document.getElementById('color-picker-form');
  const tmpl = document.getElementById('color-picker-template');

  if (tmpl && $form) {
    Object.entries(colors).map(([colorName, hex]) => {
      const templateContent = (tmpl as HTMLTemplateElement).content
        .firstElementChild;
      if (templateContent) {
        const $colorOption = templateContent.cloneNode(true) as HTMLElement;
        $colorOption.style.backgroundColor = hex;
        const $colorName = $colorOption.querySelector<HTMLElement>(
          '[data-component="color-picker-item-name"]',
        );
        const $colorInput = $colorOption.querySelector<HTMLInputElement>(
          '[data-component="color-picker-item-input"]',
        );
        if ($colorName && $colorInput) {
          $colorName.style.backgroundColor = colorName;
          $colorInput.value = hex;
          $form.append($colorOption);
        }
      }
    });
  }
}
