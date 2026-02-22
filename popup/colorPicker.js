const colors = {
  DarkCyan: '#008b8b'.toLowerCase(),
  DeepSkyBlue: '#00bfff'.toLowerCase(),
  MediumSlateBlue: '#7b68ee'.toLowerCase(),
  LightGreen: '#90ee90'.toLowerCase(),
  Coral: '#ff7f50'.toLowerCase(),
  NavajoWhite: '#FFDEAD'.toLowerCase(),
  Violet: '#ee82ee'.toLowerCase(),
  Yellow: '#FFFF00'.toLowerCase(),
};

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
