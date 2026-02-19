export default class SettingsPage {
  services;
  onNavigate;

  constructor({ Services }) {
    this.services = Services;
  }

  render($container) {
    this.renderPageLayout($container);
    this.renderContentSettings();
    this.renderShortcutsSection();
    this.renderResetDataSection();
  }

  renderPageLayout($container) {
    const $tmpl = document.getElementById('settings-template');
    $container.append($tmpl.content.cloneNode(true));
    document.getElementById('home-link').addEventListener('click', () => {
      this.onNavigate?.();
    });
  }

  async renderContentSettings() {
    const settings = await chrome.storage.local.get([
      'showEditedSave',
      'showQuickSave',
    ]);
    const $form = document.getElementById('content-settings-form');
    const $quickSaveInput = document.getElementById('quick-save-input');
    const $quickSaveSwitch = document.getElementById('quick-save-switch');
    const $editedSaveInput = document.getElementById('edited-save-input');
    const $editedSaveSwitch = document.getElementById('edited-save-switch');

    if ($quickSaveSwitch && $quickSaveInput) {
      $quickSaveSwitch.ariaChecked = settings.showEditedSave;
      $quickSaveInput.checked = settings.showQuickSave;
      $quickSaveSwitch.addEventListener('click', (e) => {
        $quickSaveSwitch.setAttribute(
          'aria-checked',
          $quickSaveSwitch.getAttribute('aria-checked') === 'true'
            ? 'false'
            : 'true',
        );
        $quickSaveInput.checked =
          $quickSaveSwitch.getAttribute('aria-checked') === 'true';
        $quickSaveInput.dispatchEvent(new Event('change', { bubbles: true }));
      });
    }
    if ($editedSaveSwitch && $editedSaveInput) {
      $editedSaveSwitch.ariaChecked = settings.showEditedSave;
      $editedSaveInput.checked = settings.showEditedSave;
      $editedSaveSwitch.addEventListener('click', (e) => {
        $editedSaveSwitch.setAttribute(
          'aria-checked',
          $editedSaveSwitch.getAttribute('aria-checked') === 'true'
            ? 'false'
            : 'true',
        );
        $editedSaveInput.checked =
          $editedSaveSwitch.getAttribute('aria-checked') === 'true';
        $editedSaveInput.dispatchEvent(new Event('change', { bubbles: true }));
      });
    }
    if ($form) {
      $form.addEventListener('change', (e) => {
        const data = new FormData(e.currentTarget);
        const showQuickSave = data.get('quick-save');
        const showEditedSave = data.get('edited-save');
        chrome.storage.local.set({
          showQuickSave: showQuickSave === 'on',
          showEditedSave: showEditedSave === 'on',
        });
      });
    }
  }

  async renderShortcutsSection() {
    const $link = document.getElementById('shortcuts-link');
    $link.addEventListener('click', () => {
      chrome.tabs.create({
        url: 'chrome://extensions/shortcuts',
        active: true,
      });
    });

    const commands = await chrome.commands.getAll();

    if (commands.length) {
      const $shortcutsList = document.getElementById('shortcuts');
      const $shortcutsTmpl = document.getElementById('shortcut-template');

      for (const { shortcut, description } of commands) {
        if (shortcut && description) {
          const $shortcut = $shortcutsTmpl.content.cloneNode(true);
          $shortcut.querySelector('[data-component="shortcut"]').textContent =
            shortcut;
          $shortcut.querySelector(
            '[data-component="shortcut-desc"]',
          ).textContent = description;
          $shortcutsList.append($shortcut);
        }
      }
    }
  }

  renderResetDataSection() {
    document
      .getElementById('reset-alert-confirm-button')
      .addEventListener('click', () => {
        this.services.resetData();
      });
  }
}
