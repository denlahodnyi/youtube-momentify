import {
  typedMessage,
  type Backup,
  type Bookmark,
  type CreateTag,
  type MessagePayload,
  type Tag,
  type Video,
} from '@/api';

const chrome = browser;

export default class Services {
  static async getVideos(
    topmostVideoId?: Video['videoId'],
  ): Promise<MessagePayload['GET_VIDEOS_WITH_BOOKMARKS']['out']> {
    return chrome.runtime.sendMessage(
      typedMessage('GET_VIDEOS_WITH_BOOKMARKS', 'in', {
        topmostVideoId,
        includeBookmarks: false,
        normalized: true,
      }),
    );
  }

  static async getVideosCount() {
    return chrome.runtime.sendMessage(
      typedMessage('GET_VIDEOS_TOTAL_COUNT', 'in', {}),
    );
  }

  static async getVideoBookmarksCount(videoId: Video['videoId']) {
    return chrome.runtime.sendMessage(
      typedMessage('GET_BOOKMARKS_COUNT_BY_VIDEO_ID', 'in', {
        videoId,
      }),
    );
  }

  static async getVideoBookmarks(
    videoId: Video['videoId'],
    order = 'new' as const,
  ): Promise<MessagePayload['GET_BOOKMARKS_BY_VIDEO_ID']['out']> {
    return chrome.runtime.sendMessage(
      typedMessage('GET_BOOKMARKS_BY_VIDEO_ID', 'in', {
        videoId,
        normalized: true,
        order,
      }),
    );
  }

  static async getBookmark(
    bookmarkId: Bookmark['id'],
  ): Promise<MessagePayload['GET_BOOKMARK']['out']> {
    return chrome.runtime.sendMessage(
      typedMessage('GET_BOOKMARK', 'in', {
        bookmarkId,
      }),
    );
  }

  static async getTags() {
    return chrome.runtime.sendMessage(
      typedMessage('GET_TAGS', 'in', {
        normalized: true,
      }),
    );
  }

  static async createTag(
    tag: CreateTag,
  ): Promise<MessagePayload['CREATE_TAG']['out']> {
    return chrome.runtime.sendMessage(
      typedMessage('CREATE_TAG', 'in', {
        tag,
      }),
    );
  }

  static async updateTag(tag: Tag) {
    return chrome.runtime.sendMessage(
      typedMessage('UPDATE_TAG', 'in', {
        tag,
      }),
    );
  }

  static async deleteTag(tagId: Tag['id']) {
    return chrome.runtime.sendMessage(
      typedMessage('DELETE_TAG', 'in', {
        tagId,
      }),
    );
  }

  static async setTag(videoId: Video['videoId'], tagId?: Tag['id']) {
    return chrome.runtime.sendMessage(
      typedMessage('SET_VIDEO_TAG', 'in', {
        videoId,
        tagId,
      }),
    );
  }

  static async updateBookmark(
    bookmark: Bookmark,
  ): Promise<MessagePayload['UPDATE_BOOKMARK']['out']> {
    return chrome.runtime.sendMessage(
      typedMessage('UPDATE_BOOKMARK', 'in', {
        bookmark,
      }),
    );
  }

  static async playVideo(tabId: number, time: number) {
    return chrome.tabs.sendMessage(
      tabId,
      typedMessage('CONTENT/PLAY_VIDEO_AT', 'in', {
        time,
      }),
    );
  }

  static async deleteVideo(videoId: Video['videoId']) {
    return chrome.runtime.sendMessage(
      typedMessage('DELETE_VIDEO', 'in', {
        videoId,
      }),
    );
  }

  static async deleteVideoBookmarks(videoId: Video['videoId']) {
    return chrome.runtime.sendMessage(
      typedMessage('DELETE_BOOKMARKS_BY_VIDEO_ID', 'in', {
        videoId,
      }),
    );
  }

  static async deleteBookmark(bookmarkId: Bookmark['id']) {
    return chrome.runtime.sendMessage(
      typedMessage('DELETE_BOOKMARK', 'in', {
        bookmarkId,
      }),
    );
  }

  static async resetData() {
    return chrome.runtime.sendMessage(typedMessage('RESET', 'in', {}));
  }

  static async exportData() {
    return chrome.runtime.sendMessage(typedMessage('EXPORT_DATA', 'in', {}));
  }

  static async importData(data: Backup) {
    return chrome.runtime.sendMessage(
      typedMessage('IMPORT_DATA', 'in', {
        data,
      }),
    );
  }
}
