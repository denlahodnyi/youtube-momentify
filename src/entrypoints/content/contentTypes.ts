import type { Bookmark, Theme, Video } from '@/api';

export type ContentRendererEvent =
  | {
      type: 'ui/apply_video_loop';
      payload: { loopStartId: string; loopEndId: string; videoId: string };
    }
  | {
      type: 'ui/remove_video_loop';
      payload?: never;
    }
  | {
      type: 'ui/manage_loop';
      payload: {
        bookmarkId: Bookmark['id'];
        action: 'start' | 'finish' | 'delete';
      };
    }
  | {
      type: 'api/save_loop';
      payload: {
        loopStartId: Bookmark['id'];
        loopEndId: Bookmark['id'];
      };
    }
  | {
      type: 'api/delete_loop';
      payload: {
        bookmarkId: Bookmark['id'];
      };
    }
  | {
      type: 'ui/toggle_quick_save';
      payload: { show: boolean };
    }
  | {
      type: 'ui/toggle_edited_save';
      payload: { show: boolean };
    }
  | {
      type: 'api/save_bookmark';
      payload?: { title: string; color: string; time: number };
    }
  | {
      type: 'api/update_bookmark';
      payload: { bookmark: Bookmark };
    }
  | {
      type: 'ui/open_bookmark_details';
      payload: { bookmarkId: Bookmark['id'] };
    }
  | {
      type: 'ui/open_bookmark_edit_modal';
      payload:
        | { isNewBookmark: true }
        | { isNewBookmark: false; bookmarkId: Bookmark['id'] };
    }
  | {
      type: 'ui/to_next_bookmark';
      payload?: never;
    }
  | {
      type: 'ui/to_prev_bookmark';
      payload?: never;
    }
  | {
      type: 'ui/play_video';
      payload: { time: number };
    }
  | {
      type: 'ui/render_bookmarks';
      payload: { bookmarks: Bookmark[] };
    }
  | {
      type: 'ui/refresh_bookmarks';
      payload?: never;
    }
  | {
      type: 'ui/update_bookmark';
      payload: { bookmark: Bookmark };
    }
  | {
      type: 'ui/delete_bookmark';
      payload: { bookmarkId: Bookmark['id'] };
    }
  | {
      type: 'api/delete_bookmark';
      payload: { bookmarkId: Bookmark['id'] };
    }
  | {
      type: 'ui/delete_all_bookmarks';
      payload?: never;
    }
  | {
      type: 'ui/set_theme';
      payload: { theme: Theme };
    };

export interface State {
  videoId: string | null;
  videoDuration: number;
  loopStartTime: number;
  loopEndTime: number;
  bookmarks: {
    byId: Map<Bookmark['id'], Bookmark>;
    ids: Bookmark['id'][];
    suspended: Bookmark['id'][];
  };
  video: Video | null;
  tempLoopStartId: Bookmark['id'] | null;
}
