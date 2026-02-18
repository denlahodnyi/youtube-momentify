export default class Services {
  static async getVideos(topmostVideoId = null) {
    return chrome.runtime.sendMessage({
      action: 'GET_VIDEOS_WITH_BOOKMARKS',
      topmostVideoId,
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
    console.log('RESET');
  }
}
