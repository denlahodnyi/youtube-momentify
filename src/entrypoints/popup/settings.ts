import type { Theme } from '@/api/index.js';
import { applyTheme, resolveTheme, saveTheme } from './popupUtils.js';
import type Services from './services.js';

const chrome = browser;

interface State {
  settings: {
    showEditedSave: boolean;
    showQuickSave: boolean;
    theme: Theme;
  };
  shortcuts: globalThis.Browser.commands.Command[];
  settingsEarlyRequest: Promise<void> | null;
  shortcutsEarlyRequest: Promise<void> | null;
}

export default class SettingsPage {
  services: typeof Services;
  onNavigate?: () => void;
  state: State = {
    settings: {
      showEditedSave: false,
      showQuickSave: false,
      theme: 'system',
    },
    shortcuts: [],
    settingsEarlyRequest: null,
    shortcutsEarlyRequest: null,
  };

  constructor(args: { Services: typeof Services }) {
    const { Services } = args;
    this.services = Services;
    this.state.settingsEarlyRequest = this.fetchSettings();
    this.state.shortcutsEarlyRequest = this.fetchShortcuts();
  }

  render($container: HTMLElement) {
    this.renderPageLayout($container);
    this.state.settingsEarlyRequest?.then(() => {
      this.renderContentSettings();
      this.prepareThemeSwitcher();
    });
    this.state.shortcutsEarlyRequest?.then(() => {
      this.renderShortcutsSection();
    });
    this.renderImportExport();
    this.renderResetDataSection();
  }

  async fetchSettings() {
    const settings = await chrome.storage.local.get<{
      showEditedSave: boolean;
      showQuickSave: boolean;
      theme: Theme;
    }>(['showEditedSave', 'showQuickSave', 'theme']);
    this.state.settings = settings;
  }

  async fetchShortcuts() {
    const commands = await chrome.commands.getAll();
    this.state.shortcuts = commands;
  }

  renderPageLayout($container: HTMLElement) {
    const $tmpl = document.getElementById(
      'settings-template',
    ) as HTMLTemplateElement | null;
    if ($tmpl) {
      $container.append($tmpl.content.cloneNode(true));
      document.getElementById('home-link')?.addEventListener('click', () => {
        this.onNavigate?.();
      });
    }
  }

  async renderContentSettings() {
    const { showEditedSave, showQuickSave } = this.state.settings;
    const $form = document.getElementById(
      'content-settings-form',
    ) as HTMLFormElement | null;
    const $quickSaveInput = document.getElementById(
      'quick-save-input',
    ) as HTMLInputElement | null;
    const $quickSaveSwitch = document.getElementById('quick-save-switch');
    const $editedSaveInput = document.getElementById(
      'edited-save-input',
    ) as HTMLInputElement | null;
    const $editedSaveSwitch = document.getElementById('edited-save-switch');

    if ($quickSaveSwitch && $quickSaveInput) {
      $quickSaveSwitch.ariaChecked = showQuickSave + '';
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
      $editedSaveSwitch.ariaChecked = showEditedSave + '';
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
      $form.addEventListener('change', async (e) => {
        if (e.currentTarget instanceof HTMLFormElement) {
          const data = new FormData(e.currentTarget);
          const showQuickSave = data.get('quick-save');
          const showEditedSave = data.get('edited-save');
          await chrome.storage.local.set({
            showQuickSave: showQuickSave === 'on',
            showEditedSave: showEditedSave === 'on',
          });
          this.state.settings.showQuickSave = showQuickSave === 'on';
          this.state.settings.showEditedSave = showEditedSave === 'on';
        }
      });
    }
  }

  async renderShortcutsSection() {
    const $link = document.getElementById('shortcuts-link');
    $link?.addEventListener('click', () => {
      chrome.tabs.create({
        url: 'chrome://extensions/shortcuts',
        active: true,
      });
    });

    if (this.state.shortcuts.length) {
      const $shortcutsList = document.getElementById('shortcuts');
      const $shortcutsTmpl = document.getElementById(
        'shortcut-template',
      ) as HTMLTemplateElement | null;

      if ($shortcutsList && $shortcutsTmpl) {
        for (const { shortcut, description } of this.state.shortcuts) {
          if (shortcut && description) {
            const $shortcut = $shortcutsTmpl.content.cloneNode(
              true,
            ) as HTMLElement;
            const $sh = $shortcut.querySelector('[data-component="shortcut"]');
            $sh?.insertAdjacentHTML(
              'afterbegin',
              shortcut
                .split('')
                .map((sh) => `<kbd>${sh}</kbd>`)
                .join(''),
            );
            const $desc = $shortcut.querySelector(
              '[data-component="shortcut-desc"]',
            );
            if ($desc) $desc.textContent = description;
            $shortcutsList.append($shortcut);
          }
        }
      }
    }
  }

  renderImportExport() {
    const $exportButton = document.getElementById('export-action');
    $exportButton?.addEventListener('click', async () => {
      const $link = document.createElement('a');
      const result = await this.services.exportData();

      if (result.success) {
        const blob = new Blob([JSON.stringify(result.data, null, 2)], {
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
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = async (event) => {
          try {
            const readFile = event.target?.result;
            if (!readFile || typeof readFile !== 'string') {
              throw new Error('Invalid file');
            }
            const data = JSON.parse(readFile);
            const result = await this.services.importData(data);
            const $alert = document.getElementById('import-alert');

            if ($alert && result.success) {
              $alert.dataset.success = 'true';
              $alert.textContent = 'Data imported successfully!';
            } else if ($alert && !result.success) {
              $alert.dataset.error = 'true';
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
      ?.addEventListener('click', async () => {
        const result = await this.services.resetData();
        const $alert = document.getElementById(
          'reset-alert-message',
        ) as HTMLElement | null;

        if ($alert) {
          if (result.success) $alert.dataset.success = true + '';
          else $alert.dataset.error = true + '';
          $alert.textContent = result.success
            ? 'Success!'
            : 'Something went wrong!';
        }
      });
  }

  checkThemeOption(theme = 'theme') {
    document
      .querySelectorAll<HTMLInputElement>('[data-component="theme-input"]')
      .forEach(($input) => {
        if ($input.value === theme) $input.checked = true;
      });
  }

  prepareThemeSwitcher() {
    this.checkThemeOption(this.state.settings.theme);
    document
      .getElementById('theme-switcher')
      ?.addEventListener('change', async (e) => {
        if (e.currentTarget instanceof HTMLFormElement) {
          const themeMode = new FormData(e.currentTarget).get('theme') as Theme;
          await saveTheme(themeMode);
          applyTheme(resolveTheme(themeMode));
          this.state.settings.theme = themeMode;
        }
      });
  }
}
