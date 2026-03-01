import {
  applyTheme,
  getAppliedTheme,
  getSavedTheme,
  resolveTheme,
  saveTheme,
} from './popupUtils.js';

export default class SettingsPage {
  services;
  onNavigate;
  state = {
    settings: {
      showEditedSave: false,
      showQuickSave: false,
    },
    settingsEarlyRequest: null,
  };

  constructor({ Services }) {
    this.services = Services;
    this.state.settingsEarlyRequest = this.fetchSettings();
  }

  render($container) {
    this.renderPageLayout($container);
    (this.state.settingsEarlyRequest ?? this.fetchSettings()).then(() => {
      this.state.settingsEarlyRequest = null;
      this.renderContentSettings();
    });
    this.renderImportExport();
    this.renderShortcutsSection();
    this.renderResetDataSection();
    this.prepareThemeSwitcher();
  }

  async fetchSettings() {
    const settings = await chrome.storage.local.get([
      'showEditedSave',
      'showQuickSave',
    ]);
    this.state.settings = settings;
  }

  renderPageLayout($container) {
    const $tmpl = document.getElementById('settings-template');
    $container.append($tmpl.content.cloneNode(true));
    document.getElementById('home-link').addEventListener('click', () => {
      this.onNavigate?.();
    });
  }

  async renderContentSettings() {
    const { showEditedSave, showQuickSave } = this.state.settings;
    const $form = document.getElementById('content-settings-form');
    const $quickSaveInput = document.getElementById('quick-save-input');
    const $quickSaveSwitch = document.getElementById('quick-save-switch');
    const $editedSaveInput = document.getElementById('edited-save-input');
    const $editedSaveSwitch = document.getElementById('edited-save-switch');

    if ($quickSaveSwitch && $quickSaveInput) {
      $quickSaveSwitch.ariaChecked = showQuickSave;
      $quickSaveInput.checked = showQuickSave;
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
      $editedSaveSwitch.ariaChecked = showEditedSave;
      $editedSaveInput.checked = showEditedSave;
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
          $shortcut
            .querySelector('[data-component="shortcut"]')
            .insertAdjacentHTML(
              'afterbegin',
              shortcut
                .split('')
                .map((sh) => `<kbd>${sh}</kbd>`)
                .join(''),
            );
          $shortcut.querySelector(
            '[data-component="shortcut-desc"]',
          ).textContent = description;
          $shortcutsList.append($shortcut);
        }
      }
    }
  }

  renderImportExport() {
    const $exportButton = document.getElementById('export-action');
    $exportButton?.addEventListener('click', async () => {
      const $link = document.createElement('a');
      const { success, data } = await this.services.exportData();

      if (success) {
        const blob = new Blob([JSON.stringify(data, null, 2)], {
          type: 'application/json',
        });
        $link.href = URL.createObjectURL(blob);
        $link.download = `momentify-bookmarks_${new Date().toLocaleString()}.json`;
        $link.click();
        URL.revokeObjectURL($link.href);
        $link.remove();
      }
    });

    const $importInput = document.getElementById('import-action');
    $importInput?.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = async (event) => {
          try {
            const data = JSON.parse(event.target.result);
            const result = await this.services.importData(data);
            const $alert = document.getElementById('import-alert');

            if (result.success) {
              $alert.dataset.success = true;
              $alert.textContent = 'Data imported successfully!';
            } else {
              $alert.dataset.error = true;
              $alert.textContent = result.error;
            }
          } catch (err) {
            console.error('Failed to import data:', err);
          }
        };
        reader.readAsText(file);
      }
    });
  }

  renderResetDataSection() {
    document
      .getElementById('reset-alert-confirm-button')
      .addEventListener('click', async () => {
        const result = await this.services.resetData();
        if (result.success) {
          document.getElementById('reset-alert-message').dataset.success = true;
          document.getElementById('reset-alert-message').textContent =
            'Success!';
        } else {
          document.getElementById('reset-alert-message').dataset.error = true;
          document.getElementById('reset-alert-message').textContent =
            'Something went wrong!';
        }
      });
  }

  checkThemeOption(theme = 'theme') {
    document
      .querySelectorAll('[data-component="theme-input"]')
      .forEach(($input) => {
        if ($input.value === theme) $input.checked = true;
      });
  }

  prepareThemeSwitcher() {
    this.checkThemeOption(getAppliedTheme());
    getSavedTheme().then(({ theme }) => {
      this.checkThemeOption(theme);
    });
    document
      .getElementById('theme-switcher')
      .addEventListener('change', async (e) => {
        const themeMode = new FormData(e.currentTarget).get('theme');
        await saveTheme(themeMode);
        applyTheme(resolveTheme(themeMode));
      });
  }
}
