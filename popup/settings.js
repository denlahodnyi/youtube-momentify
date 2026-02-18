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
      .getElementById('data-reset-button')
      .addEventListener('click', () => {
        // const confirmed = confirm(
        //   'This decision is irreversible. Are you sure?',
        // );
      });
  }
}
