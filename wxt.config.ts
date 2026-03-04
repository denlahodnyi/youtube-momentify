import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  outDir: 'dist',
  manifest: {
    name: 'YouTube Momentify',
    description:
      'Bookmark and organize your favorite YouTube video moments with smart timestamps.',
    minimum_chrome_version: '135',
    icons: {
      16: '/logo-16.png',
      32: '/logo-32.png',
      48: '/logo-48.png',
      128: '/logo-128.png',
    },
    permissions: ['activeTab', 'tabs', 'storage'],
    commands: {
      'quick-save': {
        suggested_key: {
          default: 'Shift+Alt+Q',
        },
        description: 'Quick save',
      },
      'edited-save': {
        suggested_key: {
          default: 'Shift+Alt+E',
        },
        description: 'Edit & save',
      },
      'next-bookmark': {
        suggested_key: {
          default: 'Shift+Alt+Up',
        },
        description: 'Go to next bookmark',
      },
      'previous-bookmark': {
        suggested_key: {
          default: 'Shift+Alt+Down',
        },
        description: 'Go to previous bookmark',
      },
    },
  },
});
