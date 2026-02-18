export default class SettingsPage {
  services;
  onNavigate;

  constructor({ Services }) {
    this.services = Services;
  }

  render($container) {
    this.renderPageLayout($container);
  }

  renderPageLayout($container) {
    const $tmpl = document.getElementById('settings-template');
    $container.append($tmpl.content.cloneNode(true));
    document.getElementById('home-link').addEventListener('click', () => {
      this.onNavigate?.();
    });
    document
      .getElementById('reset-alert-confirm-button')
      .addEventListener('click', () => {
        this.services.resetData();
      });
  }
}
