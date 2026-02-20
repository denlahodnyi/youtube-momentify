export default class Services {
  static async getVideos(topmostVideoId = null) {
    return chrome.runtime.sendMessage({
      action: 'GET_VIDEOS_WITH_BOOKMARKS',
      topmostVideoId,
      includeBookmarks: false,
      normalized: true,
    });
  }

  static async getVideosCount() {
    return chrome.runtime.sendMessage({
      action: 'GET_VIDEOS_TOTAL_COUNT',
    });
  }

  static async getVideoBookmarksCount(videoId) {
    return chrome.runtime.sendMessage({
      action: 'GET_BOOKMARKS_COUNT_BY_VIDEO_ID',
      videoId,
    });
  }

  static async getVideoBookmarks(videoId, order = 'new') {
    return chrome.runtime.sendMessage({
      action: 'GET_BOOKMARKS_BY_VIDEO_ID',
      videoId,
      normalized: true,
      order,
    });
  }

  static async getBookmark(bookmarkId) {
    return chrome.runtime.sendMessage({
      action: 'GET_BOOKMARK',
      bookmarkId,
    });
  }

  static async updateBookmark(bookmark) {
    return chrome.runtime.sendMessage({
      action: 'UPDATE_BOOKMARK',
      bookmark,
    });
  }

  static async playVideo(tabId, time) {
    return chrome.tabs.sendMessage(tabId, {
      action: 'CONTENT/PLAY_VIDEO_AT',
      time,
    });
  }

  static async deleteVideo(videoId) {
    return chrome.runtime.sendMessage({
      action: 'DELETE_VIDEO',
      videoId,
    });
  }

  static async deleteVideoBookmarks(videoId) {
    return chrome.runtime.sendMessage({
      action: 'DELETE_BOOKMARKS_BY_VIDEO_ID',
      videoId,
    });
  }

  static async deleteBookmark(bookmarkId) {
    return chrome.runtime.sendMessage({
      action: 'DELETE_BOOKMARK',
      bookmarkId,
    });
  }

  static async resetData() {
    return chrome.runtime.sendMessage({
      action: 'RESET',
    });
  }

  static async exportData() {
    return chrome.runtime.sendMessage({
      action: 'EXPORT_DATA',
    });
  }

  static async importData(data) {
    return chrome.runtime.sendMessage({
      action: 'IMPORT_DATA',
      data,
    });
  }
}
