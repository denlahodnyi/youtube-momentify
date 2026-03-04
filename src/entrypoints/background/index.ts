import { runBackground } from './background';

export default defineBackground({
  type: 'module',
  main() {
    runBackground();
  },
});
