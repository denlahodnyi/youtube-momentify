// TODO: refactor error handling
// TODO: sw must broadcast changes to all tabs
const MARK_COLOR = '#FF7F50';
const BOOKMARKS_INDEX = 'bookmarks_idx/by_videoId';
const VIDEOS_CREATED_AT_INDEX = 'videos_idx/by_createdAt';
const BOOKMARK_TITLE_CONSTRAINS = { min: 1, max: 80 };
const BOOKMARK_NOTE_CONSTRAINS = { min: 0, max: 200 };

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
        const videosWithBookmarks = await getBookmarks(
          db,
          message.topmostVideoId
        );
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
      case 'GET_VIDEO': {
        const db = await openDatabase();
        const video = await getVideo(db, message.videoId);
        sendResponse({ success: true, video });
        break;
      }
      case 'GET_VIDEOS_TOTAL_COUNT': {
        const db = await openDatabase();
        const count = await getVideosTotalCount(db);
        sendResponse({ success: true, count });
        break;
      }
      case 'GET_BOOKMARKS_COUNT_BY_VIDEO_ID': {
        const db = await openDatabase();
        const count = await getBookmarksPerVideoTotalCount(db, message.videoId);
        sendResponse({ success: true, count });
        break;
      }
      case 'UPDATE_BOOKMARK': {
        const db = await openDatabase();
        await updateBookmark(db, message.bookmark);
        sendResponse({ success: true });
        break;
      }
      case 'SAVE_VIDEO_LOOP': {
        const db = await openDatabase();
        await saveVideoLoop(
          db,
          message.videoId,
          message.loopStart,
          message.loopEnd
        );
        sendResponse({ success: true });
        break;
      }
      case 'DELETE_VIDEO_LOOP': {
        const db = await openDatabase();
        await deleteVideoLoop(db, message.videoId);
        sendResponse({ success: true });
        break;
      }
      case 'DELETE_VIDEO_LOOP': {
        const db = await openDatabase();
      }
      case 'DELETE_BOOKMARK': {
        const db = await openDatabase();
        await deleteBookmark(db, message.bookmarkId);
        sendResponse({ success: true });
        break;
      }
      case 'DELETE_BOOKMARKS_BY_VIDEO_ID': {
        const db = await openDatabase();
        await deleteBookmarksByVideoId(db, message.videoId);
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
    const dbOpenRequest = indexedDB.open('momentify-db', 1); // TODO: rest db version

    dbOpenRequest.onupgradeneeded = (e) => {
      const db = e.target.result;
      console.log(`🚀 -> db:`, db);

      if (!db.objectStoreNames.contains('videos')) {
        const videoObjectStore = db.createObjectStore('videos', {
          keyPath: 'videoId',
        });
        videoObjectStore.createIndex(
          'videos_idx/by_unique_videoId',
          'videoId',
          {
            unique: true,
          }
        );
        videoObjectStore.createIndex(VIDEOS_CREATED_AT_INDEX, 'createdAt', {
          unique: false,
        });
      }
      if (!db.objectStoreNames.contains('bookmarks')) {
        const bmObjectStore = db.createObjectStore('bookmarks', {
          keyPath: 'id', // TODO: use nanoid?
          autoIncrement: true,
        });
        bmObjectStore.createIndex(BOOKMARKS_INDEX, 'videoId', {
          unique: false,
        });
        bmObjectStore.createIndex(
          'bookmarks_idx/by_unique_videoId_time',
          ['videoId', 'time'],
          {
            unique: true,
          }
        );
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
          loopStart: null, // TODO: rename to loopStartId
          loopEnd: null, // TODO: rename to loopEndId
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
      title: new Date().toLocaleString(),
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

function getBookmarks(db, topVideoId) {
  return new Promise((resolve) => {
    const t = db.transaction(['videos', 'bookmarks'], 'readonly');
    const videoStore = t.objectStore('videos');
    const bmStore = t.objectStore('bookmarks');
    const cursorReq = videoStore
      .index(VIDEOS_CREATED_AT_INDEX)
      .openCursor(null, 'prev'); // newest videos first
    const videosWithBookmarks = new Map();

    t.oncomplete = () => {
      let result = [];
      if (topVideoId && videosWithBookmarks.has(topVideoId)) {
        result.push(videosWithBookmarks.get(topVideoId));
        videosWithBookmarks.delete(topVideoId);
        result.push(...videosWithBookmarks.values());
      } else {
        result = Array.from(videosWithBookmarks.values());
      }
      resolve(result);
    };

    cursorReq.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) {
        const video = cursor.value;
        bmStore.index(BOOKMARKS_INDEX).getAll({
          query: IDBKeyRange.only(video.videoId),
          direction: 'prev', // show newest first
        }).onsuccess = (event) => {
          const bookmarks = event.target.result;
          videosWithBookmarks.set(video.videoId, {
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

function getVideo(db, videoId) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(['videos'], 'readonly');
    const req = t.objectStore('videos').get(videoId);

    req.onsuccess = (e) => {
      resolve(e.target.result);
    };

    req.onerror = () => {
      reject(new Error(`Cannot get video: ${videoId}`));
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

function getBookmarksPerVideoTotalCount(db, videoId) {
  return new Promise((resolve) => {
    const t = db.transaction(['bookmarks'], 'readonly');
    const bmStore = t.objectStore('bookmarks');
    const req = bmStore.index(BOOKMARKS_INDEX).count(IDBKeyRange.only(videoId));

    req.onsuccess = (event) => {
      resolve(event.target.result);
    };
  });
}

function updateBookmark(db, bookmark) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(['bookmarks'], 'readwrite');
    const bmStore = t.objectStore('bookmarks');

    if (
      bookmark.title.length < BOOKMARK_TITLE_CONSTRAINS.min ||
      bookmark.title.length > BOOKMARK_TITLE_CONSTRAINS.max
    ) {
      reject(
        new Error(
          `Bookmark title must be between ${BOOKMARK_TITLE_CONSTRAINS.min} and ${BOOKMARK_TITLE_CONSTRAINS.max} characters`
        )
      );
    }
    if (bookmark.note.length > BOOKMARK_TITLE_CONSTRAINS.max) {
      reject(
        new Error(
          `Bookmark note must be less than ${BOOKMARK_NOTE_CONSTRAINS.max} characters`
        )
      );
    }

    const req = bmStore.put(bookmark);

    req.onsuccess = () => {
      resolve();
    };

    req.onerror = () => {
      reject(new Error('Failed to update bookmark'));
    };
  });
}

function saveVideoLoop(db, videoId, loopStartId, loopEndId) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(['videos'], 'readwrite');
    const videosStore = t.objectStore('videos');
    const req = videosStore.get(videoId);

    req.onsuccess = (e) => {
      const video = e.target.result;
      video.loopStart = loopStartId;
      video.loopEnd = loopEndId;

      const updReq = videosStore.put(video);

      updReq.onsuccess = () => {
        resolve();
      };
      updReq.onerror = () => {
        reject(new Error('Cannot update video'));
      };
    };

    req.onerror = () => {
      reject(new Error('Cannot get video'));
    };
  });
}

function deleteVideoLoop(db, videoId) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(['videos'], 'readwrite');
    const videosStore = t.objectStore('videos');
    const req = videosStore.get(videoId);

    req.onsuccess = (e) => {
      const video = e.target.result;
      video.loopStart = null;
      video.loopEnd = null;

      const updReq = videosStore.put(video);

      updReq.onsuccess = () => {
        resolve();
      };
      updReq.onerror = () => {
        reject(new Error('Cannot update video'));
      };
    };

    req.onerror = () => {
      reject(new Error('Cannot get video'));
    };
  });
}

function deleteBookmark(db, bookmarkId) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(['bookmarks', 'videos'], 'readwrite');
    const bmStore = t.objectStore('bookmarks');
    const req = bmStore.get(bookmarkId);

    req.onsuccess = (e) => {
      const bookmark = e.target.result;

      if (bookmark) {
        const videoGetReq = t.objectStore('videos').get(bookmark.videoId);

        videoGetReq.onsuccess = (e) => {
          const video = e.target.result;

          if (video.loopStart === bookmarkId || video.loopEnd === bookmarkId) {
            const videoPutReq = t
              .objectStore('videos')
              .put({ ...video, loopStart: null, loopEnd: null });
            videoPutReq.onsuccess = () => {
              const bmDelReq = bmStore.delete(bookmarkId);
              bmDelReq.onsuccess = () => {
                resolve();
              };
              bmDelReq.onerror = () => {
                reject(new Error('Failed to delete bookmark'));
              };
            };
            videoPutReq.onerror = () => {
              reject(new Error('Failed to delete bookmark'));
            };
          } else {
            const bmDelReq = bmStore.delete(bookmarkId);
            bmDelReq.onsuccess = () => {
              resolve();
            };
            bmDelReq.onerror = () => {
              reject(new Error('Failed to delete bookmark'));
            };
          }
        };

        videoGetReq.onerror = () => {
          reject(new Error('Failed to delete bookmark'));
        };
      }
    };

    req.onerror = () => {
      reject(new Error('Failed to delete bookmark'));
    };
  });
}

function deleteBookmarksByVideoId(db, videoId) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(['bookmarks', 'videos'], 'readwrite');
    const bmStore = t.objectStore('bookmarks');
    const cursorReq = bmStore
      .index(BOOKMARKS_INDEX)
      .openCursor(IDBKeyRange.only(videoId));

    t.oncomplete = () => {
      resolve();
    };

    cursorReq.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };

    cursorReq.onerror = () => {
      reject(new Error('Failed to delete bookmarks'));
    };

    const videoGetReq = t.objectStore('videos').get(videoId);

    videoGetReq.onsuccess = (e) => {
      const video = e.target.result;
      const videoPutReq = t
        .objectStore('videos')
        .put({ ...video, loopStart: null, loopEnd: null });

      videoPutReq.onerror = () => {
        console.error('Cannot update video');
      };
    };

    videoGetReq.onerror = (e) => {
      console.error('Cannot get video');
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
