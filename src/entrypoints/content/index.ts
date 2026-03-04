export default defineContentScript({
  matches: ['https://*.youtube.com/*'],
  main(ctx) {
    import('./content.js');
  },
});
