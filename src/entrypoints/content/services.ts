import {
  typedMessage,
  type Bookmark,
  type MessagePayload,
  type Video,
} from '@/api';

const chrome = browser;

export default class Services {
  static async createBookmark(
    payload: MessagePayload['CREATE_BOOKMARK']['in'],
  ) {
    return await chrome.runtime.sendMessage({
      action: 'CREATE_BOOKMARK',
      ...payload,
    });
  }
  static async updateBookmark(bookmark: Bookmark) {
    return await chrome.runtime.sendMessage(
      typedMessage('UPDATE_BOOKMARK', 'in', { bookmark }),
    );
  }

  static async getBookmarks({ videoId }: { videoId: Video['videoId'] }) {
    return await chrome.runtime.sendMessage(
      typedMessage('GET_BOOKMARKS_BY_VIDEO_ID', 'in', {
        videoId,
        normalized: true,
      }),
    );
  }

  static async getVideo({
    videoId,
  }: {
    videoId: Video['videoId'];
  }): Promise<MessagePayload['GET_VIDEO']['out']> {
    return await chrome.runtime.sendMessage(
      typedMessage('GET_VIDEO', 'in', {
        videoId,
      }),
    );
  }

  static async deleteBookmark({ bookmarkId }: { bookmarkId: Bookmark['id'] }) {
    return await chrome.runtime.sendMessage(
      typedMessage('DELETE_BOOKMARK', 'in', {
        bookmarkId,
      }),
    );
  }

  static async saveLoop({
    videoId,
    loopStartId,
    loopEndId,
  }: {
    videoId: Video['videoId'];
    loopStartId: Bookmark['id'];
    loopEndId: Bookmark['id'];
  }) {
    return await chrome.runtime.sendMessage(
      typedMessage('SAVE_VIDEO_LOOP', 'in', {
        videoId,
        loopStartId,
        loopEndId,
      }),
    );
  }

  static async deleteLoop({ videoId }: { videoId: Video['videoId'] }) {
    return await chrome.runtime.sendMessage(
      typedMessage('DELETE_VIDEO_LOOP', 'in', {
        videoId,
      }),
    );
  }
}
