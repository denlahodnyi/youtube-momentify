// TODO: fix context loose error
// (https://stackoverflow.com/questions/53939205/how-to-avoid-extension-context-invalidated-errors-when-messaging-after-an-exte)
import { type ContentTypedMessage } from '@/api';
import ContentRenderer from './contentRenderer';
import BookmarkButton from './bookmarkButton';
import ProgressBar from './progressBar';
import Mark from './mark';
import MarkPopup from './markPopup';
import BookmarkEditModal from './bookmarkEditModal';
import Services from './services';
import './content.css';

const chrome = browser;

const contentRenderer = new ContentRenderer({
  BookmarkButton,
  ProgressBar,
  Mark,
  MarkPopup,
  BookmarkEditModal,
  Services,
});
contentRenderer.render();

chrome.runtime.onMessage.addListener(async (message: ContentTypedMessage) => {
  switch (message.action) {
    case 'CONTENT/SET_VIDEO_LOOP': {
      await contentRenderer.notify(null, {
        type: 'ui/apply_video_loop',
        payload: {
          loopStartId: message.loopStartId,
          loopEndId: message.loopEndId,
          videoId: message.videoId,
        },
      });
      break;
    }
    case 'CONTENT/REMOVE_VIDEO_LOOP': {
      await contentRenderer.notify(null, {
        type: 'ui/remove_video_loop',
      });
      break;
    }
    case 'CONTENT/TOGGLE_QUICK_SAVE': {
      await contentRenderer.notify(null, {
        type: 'ui/toggle_quick_save',
        payload: { show: message.show },
      });
      break;
    }
    case 'CONTENT/TOGGLE_EDITED_SAVE': {
      await contentRenderer.notify(null, {
        type: 'ui/toggle_edited_save',
        payload: { show: message.show },
      });
      break;
    }
    case 'CONTENT/QUICK_SAVE': {
      await contentRenderer.notify(null, {
        type: 'api/save_bookmark',
      });
      break;
    }
    case 'CONTENT/EDITED_SAVE': {
      await contentRenderer.notify(null, {
        type: 'ui/open_bookmark_edit_modal',
        payload: { isNewBookmark: true },
      });
      break;
    }
    case 'CONTENT/NEXT_BOOKMARK': {
      await contentRenderer.notify(null, {
        type: 'ui/to_next_bookmark',
      });
      break;
    }
    case 'CONTENT/PREVIOUS_BOOKMARK': {
      await contentRenderer.notify(null, {
        type: 'ui/to_prev_bookmark',
      });
      break;
    }
    case 'CONTENT/PLAY_VIDEO_AT': {
      await contentRenderer.notify(null, {
        type: 'ui/play_video',
        payload: { time: message.time },
      });
      break;
    }
    case 'CONTENT/CREATE_BOOKMARKS': {
      await contentRenderer.notify(null, {
        type: 'ui/render_bookmarks',
        payload: { bookmarks: message.bookmarks },
      });
      break;
    }
    case 'CONTENT/REFRESH_BOOKMARKS': {
      await contentRenderer.notify(null, {
        type: 'ui/refresh_bookmarks',
      });
      break;
    }
    case 'CONTENT/UPDATE_BOOKMARK': {
      await contentRenderer.notify(null, {
        type: 'ui/update_bookmark',
        payload: { bookmark: message.bookmark },
      });
      break;
    }
    case 'CONTENT/DELETE_BOOKMARK': {
      await contentRenderer.notify(null, {
        type: 'ui/delete_bookmark',
        payload: { bookmarkId: message.bookmarkId },
      });
      break;
    }
    case 'CONTENT/DELETE_ALL_BOOKMARKS': {
      await contentRenderer.notify(null, {
        type: 'ui/delete_all_bookmarks',
      });
      break;
    }
    case 'CONTENT/SET_THEME': {
      await contentRenderer.notify(null, {
        type: 'ui/set_theme',
        payload: { theme: message.theme },
      });
    }
    default:
      console.warn('[momentify] Unknown action:', message);
  }
});
