// TODO: sw must broadcast changes to all tabs
const DEFAULT_MARK_COLOR = '#FF7F50';
const BOOKMARKS_BY_VIDEO_ID_IDX = 'bookmarks_idx/by_videoId';
const VIDEOS_BY_CREATED_AT_IDX = 'videos_idx/by_createdAt';
const BOOKMARK_TITLE_CONSTRAINS = { min: 1, max: 80 };
const BOOKMARK_NOTE_CONSTRAINS = { min: 0, max: 200 };

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('sw message', message, sender);

  (async () => {
    try {
      const db = await openDatabase();

      switch (message.action) {
        case 'CREATE_BOOKMARK': {
          const { video, bookmark, error } = await createBookmark(db, message);
          const tabs = await getCurrentVideoTabs(video.videoId);

          if (!error && tabs.length) {
            for (const tab of tabs) {
              chrome.tabs.sendMessage(tab.id, {
                action: 'CONTENT/CREATE_BOOKMARK',
                bookmark,
              });
            }
          }

          sendResponse({ success: !!error, video, bookmark, error });
          break;
        }
        case 'GET_VIDEOS_WITH_BOOKMARKS': {
          const videosWithBookmarks = await getBookmarks(
            db,
            message.topmostVideoId,
          );
          sendResponse({ success: true, list: videosWithBookmarks });
          break;
        }
        case 'GET_BOOKMARKS_BY_VIDEO_ID': {
          const bookmarks = await getBookmarksByVideoId(db, message.videoId);
          sendResponse({ success: true, list: bookmarks });
          break;
        }
        case 'GET_BOOKMARK': {
          const bookmark = await getBookmark(db, message.bookmarkId);
          sendResponse({ success: true, bookmark });
          break;
        }
        case 'GET_VIDEO': {
          const video = await getVideo(db, message.videoId);
          sendResponse({ success: true, video });
          break;
        }
        case 'GET_VIDEOS_TOTAL_COUNT': {
          const count = await getVideosTotalCount(db);
          sendResponse({ success: true, count });
          break;
        }
        case 'GET_BOOKMARKS_COUNT_BY_VIDEO_ID': {
          const count = await getBookmarksPerVideoTotalCount(
            db,
            message.videoId,
          );
          sendResponse({ success: true, count });
          break;
        }
        case 'UPDATE_BOOKMARK': {
          const { bookmark } = message;
          const result = await updateBookmark(db, bookmark);

          if (!result?.error) {
            const tabs = await getCurrentVideoTabs(bookmark.videoId);

            if (tabs.length) {
              for (const tab of tabs) {
                chrome.tabs.sendMessage(tab.id, {
                  action: 'CONTENT/UPDATE_BOOKMARK',
                  bookmark: result.bookmark,
                });
              }
            }
          }

          sendResponse(
            result?.error
              ? { success: false, error: result.error }
              : { success: true, bookmark: result.bookmark },
          );
          break;
        }
        case 'SAVE_VIDEO_LOOP': {
          await saveVideoLoop(
            db,
            message.videoId,
            message.loopStartId,
            message.loopEndId,
          );
          sendResponse({ success: true });
          break;
        }
        case 'DELETE_VIDEO_LOOP': {
          await deleteVideoLoop(db, message.videoId);
          sendResponse({ success: true });
          break;
        }
        case 'DELETE_BOOKMARK': {
          const { videoId } = await deleteBookmark(db, message.bookmarkId);
          const tabs = await getCurrentVideoTabs(videoId);

          if (tabs) {
            for (const tab of tabs) {
              chrome.tabs.sendMessage(tab.id, {
                action: 'CONTENT/DELETE_BOOKMARK',
                bookmarkId: message.bookmarkId,
              });
            }
          }

          sendResponse({ success: true });
          break;
        }
        case 'DELETE_BOOKMARKS_BY_VIDEO_ID': {
          await deleteBookmarksByVideoId(db, message.videoId);
          const tabs = await getCurrentVideoTabs(message.videoId);

          if (tabs) {
            for (const tab of tabs) {
              chrome.tabs.sendMessage(tab.id, {
                action: 'CONTENT/DELETE_ALL_BOOKMARKS',
              });
            }
          }

          sendResponse({ success: true });
          break;
        }
        case 'DELETE_VIDEO': {
          const { videoId } = message;
          await deleteVideo(db, videoId);
          const tabs = await getCurrentVideoTabs(videoId);

          if (tabs.length) {
            for (const tab of tabs) {
              chrome.tabs.sendMessage(tab.id, {
                action: 'CONTENT/DELETE_ALL_BOOKMARKS',
              });
            }
          }

          sendResponse({ success: true });
          break;
        }
        default:
          console.warn('Unknown action:', message.action);
      }
    } catch (err) {
      console.error('Messages listener error', err);
    }
  })();

  return true;
});

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!indexedDB) reject(new Error('IndexedDB is not supported'));
    const dbOpenRequest = indexedDB.open('momentify-db', 1);

    dbOpenRequest.onblocked = () => {
      reject(new Error('DB is blocked'));
    };

    dbOpenRequest.onupgradeneeded = (e) => {
      const db = e.target.result;

      if (!db.objectStoreNames.contains('videos')) {
        const videoObjectStore = db.createObjectStore('videos', {
          keyPath: 'videoId',
        });
        videoObjectStore.createIndex(
          'videos_idx/by_unique_videoId',
          'videoId',
          {
            unique: true,
          },
        );
        videoObjectStore.createIndex(VIDEOS_BY_CREATED_AT_IDX, 'createdAt', {
          unique: false,
        });
      }

      if (!db.objectStoreNames.contains('bookmarks')) {
        const bmObjectStore = db.createObjectStore('bookmarks', {
          keyPath: 'id',
          autoIncrement: true,
        });
        bmObjectStore.createIndex(BOOKMARKS_BY_VIDEO_ID_IDX, 'videoId', {
          unique: false,
        });
        bmObjectStore.createIndex(
          'bookmarks_idx/by_unique_videoId_time',
          ['videoId', 'time'],
          {
            unique: true,
          },
        );
      }
    };

    dbOpenRequest.onerror = () => {
      reject(dbOpenRequest.error);
    };

    dbOpenRequest.onsuccess = () => {
      const db = dbOpenRequest.result;

      db.onerror = (e) => {
        console.error('Database error: ', e.target.error);
      };

      db.onversionchange = () => {
        db.close();
        console.warn('Database is outdated');
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
      reject(t.error);
    };

    videoStore.get(payload.videoId).onsuccess = (event) => {
      video = event.target.result;

      if (!video) {
        videoStore.add({
          videoId: payload.videoId,
          title: payload.videoTitle,
          loopStartId: null,
          loopEndId: null,
          createdAt: new Date().getTime(),
        }).onsuccess = (e) => {
          videoStore.get(e.target.result).onsuccess = (ev) => {
            video = ev.target.result;
          };
        };
      }
    };

    if (
      payload.title &&
      (payload.title.length < BOOKMARK_TITLE_CONSTRAINS.min ||
        payload.title.length > BOOKMARK_TITLE_CONSTRAINS.max)
    ) {
      resolve({
        error: `Bookmark title must be between ${BOOKMARK_TITLE_CONSTRAINS.min} and ${BOOKMARK_TITLE_CONSTRAINS.max} characters`,
      });
    }

    t.objectStore('bookmarks').add({
      videoId: payload.videoId,
      time: payload.time,
      title: payload.title ?? new Date().toLocaleString(),
      note: '',
      color: payload.color ?? DEFAULT_MARK_COLOR,
      createdAt: new Date().getTime(),
    }).onsuccess = (e) => {
      t.objectStore('bookmarks').get(e.target.result).onsuccess = (ev) => {
        bookmark = ev.target.result;
      };
    };
  });
}

function getBookmarks(db, topVideoId = null) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(['videos', 'bookmarks'], 'readonly');
    const videoStore = t.objectStore('videos');
    const bmStore = t.objectStore('bookmarks');
    const cursorReq = videoStore
      .index(VIDEOS_BY_CREATED_AT_IDX)
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

    t.onabort = () => {
      reject(t.error);
    };

    cursorReq.onsuccess = (e) => {
      const cursor = e.target.result;

      if (cursor) {
        const video = cursor.value;
        bmStore.index(BOOKMARKS_BY_VIDEO_ID_IDX).getAll({
          query: IDBKeyRange.only(video.videoId),
          direction: 'prev', // show newest first
        }).onsuccess = (ev) => {
          videosWithBookmarks.set(video.videoId, {
            ...video,
            bookmarks: ev.target.result,
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

    req.onerror = () => {
      reject(req.error);
    };
  });
}

function getBookmarksByVideoId(db, videoId) {
  return new Promise((resolve) => {
    const t = db.transaction(['bookmarks'], 'readonly');
    const bmStore = t.objectStore('bookmarks');
    const req = bmStore
      .index(BOOKMARKS_BY_VIDEO_ID_IDX)
      .getAll(IDBKeyRange.only(videoId));

    req.onsuccess = (event) => {
      const sortedByAscTime = event.target.result.toSorted(
        (a, b) => a.time - b.time,
      );
      resolve(sortedByAscTime);
    };

    req.onerror = () => {
      reject(req.error);
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
      reject(req.error);
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

    req.onerror = () => {
      reject(req.error);
    };
  });
}

function getBookmarksPerVideoTotalCount(db, videoId) {
  return new Promise((resolve) => {
    const t = db.transaction(['bookmarks'], 'readonly');
    const bmStore = t.objectStore('bookmarks');
    const req = bmStore
      .index(BOOKMARKS_BY_VIDEO_ID_IDX)
      .count(IDBKeyRange.only(videoId));

    req.onsuccess = (event) => {
      resolve(event.target.result);
    };

    req.onerror = () => {
      reject(req.error);
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
      resolve({
        error: `Bookmark title must be between ${BOOKMARK_TITLE_CONSTRAINS.min} and ${BOOKMARK_TITLE_CONSTRAINS.max} characters`,
      });
    }
    if (bookmark.note.length > BOOKMARK_TITLE_CONSTRAINS.max) {
      resolve({
        error: `Bookmark note must be less than ${BOOKMARK_NOTE_CONSTRAINS.max} characters`,
      });
    }
    if (!bookmark.color) {
      // TODO: validate hex?
      resolve({ error: 'Bookmark color must present' });
    }

    const req = bmStore.put(bookmark);

    req.onsuccess = () => {
      bmStore.get(req.result).onsuccess = (e) => {
        resolve({ bookmark: e.target.result });
      };
    };

    req.onerror = () => {
      reject(req.error);
    };
  });
}

function saveVideoLoop(db, videoId, loopStartId, loopEndId) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(['videos'], 'readwrite');
    const videosStore = t.objectStore('videos');

    t.oncomplete = () => {
      resolve();
    };

    t.onabort = () => {
      reject(t.error);
    };

    videosStore.get(videoId).onsuccess = (e) => {
      const video = e.target.result;
      video.loopStartId = loopStartId;
      video.loopEndId = loopEndId;
      videosStore.put(video);
    };
  });
}

function deleteVideoLoop(db, videoId) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(['videos'], 'readwrite');
    const videosStore = t.objectStore('videos');

    t.oncomplete = () => {
      resolve();
    };

    t.onabort = () => {
      reject(t.error);
    };

    videosStore.get(videoId).onsuccess = (e) => {
      const video = e.target.result;
      video.loopStartId = null;
      video.loopEndId = null;
      videosStore.put(video);
    };
  });
}

function deleteBookmark(db, bookmarkId) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(['bookmarks', 'videos'], 'readwrite');
    const bmStore = t.objectStore('bookmarks');
    const result = { bookmarkId: null, videoId: null };

    t.oncomplete = () => {
      resolve(result);
    };

    t.onabort = () => {
      reject(t.error);
    };

    bmStore.get(bookmarkId).onsuccess = (e) => {
      const bookmark = e.target.result;

      if (bookmark) {
        const videoGetReq = t.objectStore('videos').get(bookmark.videoId);

        videoGetReq.onsuccess = (e) => {
          const video = e.target.result;
          result.bookmarkId = bookmarkId;
          result.videoId = bookmark.videoId;

          if (
            video.loopStartId === bookmarkId ||
            video.loopEndId === bookmarkId
          ) {
            t
              .objectStore('videos')
              .put({ ...video, loopStartId: null, loopEndId: null }).onsuccess =
              () => {
                bmStore.delete(bookmarkId);
              };
          } else {
            bmStore.delete(bookmarkId);
          }
        };
      }
    };
  });
}

function deleteBookmarksByVideoId(db, videoId) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(['bookmarks', 'videos'], 'readwrite');
    const bmStore = t.objectStore('bookmarks');
    const cursorReq = bmStore
      .index(BOOKMARKS_BY_VIDEO_ID_IDX)
      .openCursor(IDBKeyRange.only(videoId));

    t.oncomplete = () => {
      resolve();
    };

    t.onabort = () => {
      reject(t.error);
    };

    cursorReq.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };

    t.objectStore('videos').get(videoId).onsuccess = (e) => {
      const video = e.target.result;
      t.objectStore('videos').put({
        ...video,
        loopStartId: null,
        loopEndId: null,
      });
    };
  });
}

function deleteVideo(db, videoId) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(['videos', 'bookmarks'], 'readwrite');
    const videoStore = t.objectStore('videos');
    const bmStore = t.objectStore('bookmarks');

    t.oncomplete = () => {
      resolve();
    };

    t.onabort = () => {
      reject(t.error);
    };

    videoStore.delete(videoId).onsuccess = () => {
      bmStore
        .index(BOOKMARKS_BY_VIDEO_ID_IDX)
        .openCursor(IDBKeyRange.only(videoId)).onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          bmStore.delete(cursor.primaryKey);
          cursor.continue();
        }
      };
    };
  });
}

async function getCurrentVideoTabs(videoId) {
  const tabs = await chrome.tabs.query({
    url: `https://*.youtube.com/watch?v=${videoId}*`,
  });

  return tabs;
}
