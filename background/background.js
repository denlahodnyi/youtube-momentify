const MARK_COLOR = '#FF7F50';
const BOOKMARKS_INDEX = 'bm_videoId';

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('sw message', message, sender);

  (async () => {
    // TODO: catch errors
    switch (message.action) {
      case 'CREATE_BOOKMARK': {
        const db = await openDatabase();
        const item = await createBookmark(db, message);
        // TODO: rename item to bookmark
        sendResponse({ success: true, item });
        break;
      }
      case 'GET_VIDEOS_WITH_BOOKMARKS': {
        const db = await openDatabase();
        const videosWithBookmarks = await getBookmarks(db);
        sendResponse({ success: true, list: videosWithBookmarks });
        break;
      }
      case 'GET_BOOKMARKS_BY_VIDEO_ID': {
        const db = await openDatabase();
        const bookmarks = await getBookmarksByVideoId(db, message.videoId);
        sendResponse({ success: true, list: bookmarks });
        break;
      }
      case 'GET_BOOKMARK': {
        const db = await openDatabase();
        const bookmark = await getBookmark(db, message.bookmarkId);
        sendResponse({ success: true, bookmark });
        break;
      }
      case 'GET_VIDEOS_TOTAL_COUNT': {
        const db = await openDatabase();
        const count = await getVideosTotalCount(db);
        sendResponse({ success: true, count });
        break;
      }
      case 'UPDATE_BOOKMARK': {
        const db = await openDatabase();
        await updateBookmark(db, message.bookmark);
        sendResponse({ success: true });
        break;
      }
      case 'DELETE_BOOKMARK': {
        const db = await openDatabase();
        await deleteBookmark(db, message.bookmarkId);
        sendResponse({ success: true });
        break;
      }
      case 'DELETE_VIDEO': {
        const db = await openDatabase();
        await deleteVideo(db, message.videoId);
        sendResponse({ success: true });
        break;
      }
      default:
        console.warn('Unknown action:', message.action);
    }
  })();

  return true;
});

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!indexedDB) reject(new Error('IndexedDB not supported'));
    const dbOpenRequest = indexedDB.open('momentify-db', 1);

    dbOpenRequest.onupgradeneeded = (e) => {
      const db = e.target.result;
      console.log(`🚀 -> db:`, db);

      if (!db.objectStoreNames.contains('videos')) {
        const videoObjectStore = db.createObjectStore('videos', {
          keyPath: 'videoId',
        });
        videoObjectStore.createIndex('videoId', 'videoId', { unique: true });
      }
      if (!db.objectStoreNames.contains('bookmarks')) {
        const bmObjectStore = db.createObjectStore('bookmarks', {
          keyPath: 'id', // TODO: use nanoid?
          autoIncrement: true,
        });
        bmObjectStore.createIndex(BOOKMARKS_INDEX, 'videoId', {
          unique: false,
        });
      }
    };

    dbOpenRequest.onerror = (e) => {
      console.error('Error opening IndexedDB', dbOpenRequest.error);
      reject(dbOpenRequest.error);
    };

    dbOpenRequest.onsuccess = (e) => {
      const db = e.target.result;

      db.onerror = (event) => {
        console.error('Database error: ', event.target.error?.message);
      };

      resolve(db);
    };
  });
}

function createBookmark(db, payload) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(['videos', 'bookmarks'], 'readwrite');
    const videoStore = t.objectStore('videos');
    let video;
    let bookmark;

    t.oncomplete = () => {
      resolve({ video, bookmark });
    };

    t.onabort = () => {
      reject();
    };

    videoStore.get(payload.videoId).onsuccess = (event) => {
      video = event.target.result;
      if (!video) {
        const req = videoStore.add({
          videoId: payload.videoId,
          title: payload.title,
          createdAt: new Date().getTime(),
        });
        req.onsuccess = () => {
          console.log('Video added to the store', req.result);
          videoStore.get(req.result).onsuccess = (ev) => {
            video = ev.target.result;
          };
        };
        req.onerror = () => {
          t.abort();
        };
      }
    };
    const req = t.objectStore('bookmarks').add({
      videoId: payload.videoId,
      time: payload.time,
      title: '', // TODO: default title?
      note: '',
      color: MARK_COLOR,
      createdAt: new Date().getTime(),
    });
    req.onsuccess = () => {
      console.log('Bookmark added to the store', req.result);
      t.objectStore('bookmarks').get(req.result).onsuccess = (ev) => {
        bookmark = ev.target.result;
      };
    };
    req.onerror = () => {
      t.abort();
    };
  });
}

function getBookmarks(db) {
  return new Promise((resolve) => {
    const t = db.transaction(['videos', 'bookmarks'], 'readonly');
    const videoStore = t.objectStore('videos');
    const bmStore = t.objectStore('bookmarks');
    const cursorReq = videoStore.openCursor();
    const videosWithBookmarks = [];

    t.oncomplete = () => {
      resolve(videosWithBookmarks);
    };

    cursorReq.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) {
        const video = cursor.value;
        bmStore
          .index(BOOKMARKS_INDEX)
          .getAll(IDBKeyRange.only(video.videoId)).onsuccess = (event) => {
          const bookmarks = event.target.result;
          videosWithBookmarks.push({
            ...video,
            bookmarks,
          });
          cursor.continue();
        };
      }
    };
  });
}

function getBookmark(db, bookmarkId) {
  return new Promise((resolve, reject) => {
    const t = db.transaction('bookmarks', 'readonly');
    const bmStore = t.objectStore('bookmarks');
    const req = bmStore.get(bookmarkId);

    req.onsuccess = (e) => {
      resolve(e.target.result);
    };

    req.onerror = (e) => {
      reject(new Error(`Cannot find bookmark: ${bookmarkId}`));
    };
  });
}

function getBookmarksByVideoId(db, videoId) {
  return new Promise((resolve) => {
    const t = db.transaction(['bookmarks'], 'readonly');
    const bmStore = t.objectStore('bookmarks');
    const req = bmStore
      .index(BOOKMARKS_INDEX)
      .getAll(IDBKeyRange.only(videoId));

    req.onsuccess = (event) => {
      resolve(event.target.result);
    };
  });
}

function getVideosTotalCount(db) {
  return new Promise((resolve) => {
    const t = db.transaction(['videos'], 'readonly');
    const videoStore = t.objectStore('videos');
    const req = videoStore.count();

    req.onsuccess = (event) => {
      resolve(event.target.result);
    };
  });
}

function updateBookmark(db, bookmark) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(['bookmarks'], 'readwrite');
    const bmStore = t.objectStore('bookmarks');
    const req = bmStore.put(bookmark);

    req.onsuccess = () => {
      resolve();
    };

    req.onerror = () => {
      reject(new Error('Failed to update bookmark'));
    };
  });
}

function deleteBookmark(db, bookmarkId) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(['bookmarks'], 'readwrite');
    const bmStore = t.objectStore('bookmarks');
    const req = bmStore.delete(bookmarkId);

    req.onsuccess = () => {
      console.log('Bookmark deleted', bookmarkId);
      resolve();
    };

    req.onerror = () => {
      reject(new Error('Failed to delete bookmark'));
    };
  });
}

function deleteVideo(db, videoId) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(['videos', 'bookmarks'], 'readwrite');
    const videoStore = t.objectStore('videos');
    const bmStore = t.objectStore('bookmarks');
    const req = videoStore.delete(videoId);

    req.onsuccess = () => {
      console.log('Video deleted', videoId);
      // Also delete associated bookmarks
      const bmIndex = bmStore.index(BOOKMARKS_INDEX);
      const bmReq = bmIndex.openCursor(IDBKeyRange.only(videoId));

      bmReq.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          bmStore.delete(cursor.primaryKey);
          cursor.continue();
        } else {
          resolve();
        }
      };
      bmReq.onerror = () => {
        reject(new Error('Failed to delete associated bookmarks'));
      };
    };

    req.onerror = () => {
      reject(new Error('Failed to delete video'));
    };
  });
}
