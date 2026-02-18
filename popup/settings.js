export default class SettingsPage {
  services;
  onNavigate;

  constructor({ Services }) {
    this.services = Services;
  }

  render($container) {
    this.renderPageLayout($container);
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
