export interface Video {
  videoId: string;
  title: string;
  tagId: string[];
  loopStartId: null | string;
  loopEndId: null | string;
  createdAt: number;
}

export interface Bookmark {
  id: string;
  videoId: string;
  time: number;
  title: string;
  note: string;
  color: string;
  createdAt: number;
}

export interface Tag {
  id: string;
  title: string;
  color: null | string;
}

export interface CreateBookmark extends Omit<
  Bookmark,
  'id' | 'title' | 'color' | 'note' | 'createdAt'
> {
  videoTitle: Video['title'];
  title?: null | Bookmark['title'];
  color?: null | Bookmark['color'];
}
export interface CreateTag extends Omit<Tag, 'id' | 'color'> {}

export interface Backup {
  version: number;
  exportedAt: string;
  videos: (Video & { bookmarks: Bookmark[] })[];
  tags: Tag[];
}

export type Theme = 'light' | 'dark' | 'system';

export interface MessagePayload {
  CREATE_BOOKMARK: {
    in: CreateBookmark;
    out:
      | { success: true; video: Video; bookmark: Bookmark }
      | { success: false; error: string };
  };
  CREATE_TAG: {
    in: { tag: CreateTag };
    out: { success: true; tag: Tag } | { success: false; error: string };
  };
  UPDATE_TAG: {
    in: { tag: Tag };
    out: { success: true; tag: Tag } | { success: false; error: string };
  };
  GET_TAGS: {
    in: { normalized: boolean };
    out:
      | { success: true; normalized: false; list: Tag[] }
      | {
          success: true;
          normalized: true;
          list: { byId: [Tag['id'], Tag][]; ids: Tag['id'][] };
        };
  };
  DELETE_TAG: {
    in: { tagId: Tag['id'] };
    out: { success: true };
  };
  DELETE_TAGS: {
    in: {};
    out: { success: true };
  };
  SET_VIDEO_TAG: {
    in: { videoId: Video['videoId']; tagId?: Tag['id'] };
    out: { success: true };
  };
  GET_VIDEOS_WITH_BOOKMARKS: {
    in: {
      topmostVideoId?: Video['videoId'];
      includeBookmarks?: boolean;
      normalized?: boolean;
    };
    out:
      | { success: true; normalized: false; list: Video[] }
      | {
          success: true;
          normalized: true;
          list: { byId: [Video['videoId'], Video][]; ids: Video['videoId'][] };
        };
  };
  GET_BOOKMARKS_BY_VIDEO_ID: {
    in: {
      videoId: Video['videoId'];
      normalized: boolean;
      order?: 'new' | 'time_asc';
    };
    out:
      | { success: true; normalized: false; list: Bookmark[] }
      | {
          success: true;
          normalized: true;
          list: {
            byId: [Bookmark['id'], Bookmark][];
            ids: Bookmark['id'][];
          };
        };
  };
  GET_BOOKMARK: {
    in: { bookmarkId: Bookmark['id'] };
    out: { success: true; bookmark: Bookmark };
  };
  GET_VIDEO: {
    in: { videoId: Video['videoId'] };
    out: { success: true; video: Video };
  };
  GET_VIDEOS_TOTAL_COUNT: {
    in: {};
    out: { success: true; count: number };
  };
  GET_BOOKMARKS_COUNT_BY_VIDEO_ID: {
    in: { videoId: Video['videoId'] };
    out: { success: true; count: number };
  };
  UPDATE_BOOKMARK: {
    in: { bookmark: Bookmark };
    out:
      | { success: true; bookmark: Bookmark }
      | { success: false; error: string };
  };
  SAVE_VIDEO_LOOP: {
    in: {
      videoId: Video['videoId'];
      loopStartId: Bookmark['id'];
      loopEndId: Bookmark['id'];
    };
    out: { success: true };
  };
  DELETE_VIDEO_LOOP: {
    in: {
      videoId: Video['videoId'];
    };
    out: { success: true };
  };
  DELETE_BOOKMARK: {
    in: { bookmarkId: Bookmark['id'] };
    out: { success: true };
  };
  DELETE_BOOKMARKS_BY_VIDEO_ID: {
    in: { videoId: Video['videoId'] };
    out: { success: true };
  };
  DELETE_VIDEO: {
    in: { videoId: Video['videoId'] };
    out: { success: true };
  };
  RESET: {
    in: {};
    out: { success: true };
  };
  EXPORT_DATA: {
    in: {};
    out: {
      success: true;
      data: Backup;
    };
  };
  IMPORT_DATA: {
    in: { data: Backup };
    out: { success: true } | { success: false; error: string };
  };
  'CONTENT/CREATE_BOOKMARKS': {
    in: { bookmarks: Bookmark[] };
    out: never;
  };
  'CONTENT/UPDATE_BOOKMARK': {
    in: { bookmark: Bookmark };
    out: never;
  };
  'CONTENT/SET_VIDEO_LOOP': {
    in: {
      videoId: Video['videoId'];
      loopStartId: Video['videoId'];
      loopEndId: Video['videoId'];
    };
    out: never;
  };
  'CONTENT/REMOVE_VIDEO_LOOP': {
    in: {};
    out: never;
  };
  'CONTENT/DELETE_BOOKMARK': {
    in: { bookmarkId: Bookmark['id'] };
    out: never;
  };
  'CONTENT/DELETE_ALL_BOOKMARKS': {
    in: {};
    out: never;
  };
  'CONTENT/REFRESH_BOOKMARKS': {
    in: {};
    out: never;
  };
  'CONTENT/TOGGLE_QUICK_SAVE': {
    in: { show: boolean };
    out: never;
  };
  'CONTENT/TOGGLE_EDITED_SAVE': {
    in: { show: boolean };
    out: never;
  };
  'CONTENT/QUICK_SAVE': {
    in: {};
    out: never;
  };
  'CONTENT/EDITED_SAVE': {
    in: {};
    out: never;
  };
  'CONTENT/NEXT_BOOKMARK': {
    in: {};
    out: never;
  };
  'CONTENT/PREVIOUS_BOOKMARK': {
    in: {};
    out: never;
  };
  'CONTENT/PLAY_VIDEO_AT': {
    in: { time: number };
    out: never;
  };
  'CONTENT/SET_THEME': {
    in: { theme: Theme };
    out: never;
  };
}

export type BackgroundMessagePayload = {
  [Key in keyof MessagePayload as Exclude<
    Key,
    `CONTENT/${string}`
  >]: MessagePayload[Key];
};

export type ContentMessagePayload = {
  [Key in keyof MessagePayload as Extract<
    Key,
    `CONTENT/${string}`
  >]: MessagePayload[Key];
};

export type MessageType = keyof MessagePayload;

export type BackgroundTypedMessage = {
  [Key in keyof BackgroundMessagePayload]: {
    action: Key;
  } & BackgroundMessagePayload[Key]['in'];
}[keyof BackgroundMessagePayload];

export type ContentTypedMessage = {
  [Key in keyof ContentMessagePayload]: {
    action: Key;
  } & ContentMessagePayload[Key]['in'];
}[keyof ContentMessagePayload];

export function typedMessage<
  TType extends keyof MessagePayload,
  TPayloadType extends 'in' | 'out',
  TPayload extends MessagePayload[TType][TPayloadType],
>(
  action: TType,
  payloadType: TPayloadType,
  payload: TPayload,
): { action: TType } & TPayload {
  return { action, ...payload };
}
