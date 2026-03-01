import {
  getCurrentVideoTabs,
  getYoutubeVideoTabPattern,
  validateBookmark,
  validateImportedData,
  validateTag,
  ValidationError,
} from './backgroundUtils.js';

const DEFAULT_MARK_COLOR = '#FF7F50';
const BOOKMARKS_BY_VIDEO_ID_IDX = 'bookmarks_idx/by_videoId';
const VIDEOS_BY_CREATED_AT_IDX = 'videos_idx/by_createdAt';
const VIDEOS_BY_TAG_IDX = 'videos_idx/by_tag';
const VIDEO_TITLE_CONSTRAINS = { min: 1, max: 100 };
const BOOKMARK_TITLE_CONSTRAINS = { min: 1, max: 80 };
const BOOKMARK_NOTE_CONSTRAINS = { min: 0, max: 200 };
const TAG_TITLE_CONSTRAINS = { min: 1, max: 20 };
const DATA_VERSION = 1;

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === chrome.runtime.OnInstalledReason.INSTALL) {
    chrome.storage.local.set({
      showQuickSave: true,
      showEditedSave: true,
    });
  }
});

chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area === 'local' && changes) {
    const { showQuickSave, showEditedSave, theme } = changes;
    const tabs = await chrome.tabs.query({
      url: getYoutubeVideoTabPattern(''),
    });

    for (const tab of tabs) {
      if (showQuickSave) {
        chrome.tabs.sendMessage(tab.id, {
          action: 'CONTENT/TOGGLE_QUICK_SAVE',
          show: showQuickSave.newValue,
        });
      }
      if (showEditedSave) {
        chrome.tabs.sendMessage(tab.id, {
          action: 'CONTENT/TOGGLE_EDITED_SAVE',
          show: showEditedSave.newValue,
        });
      }
      if (theme) {
        chrome.tabs.sendMessage(tab.id, {
          action: 'CONTENT/SET_THEME',
          theme: theme.newValue,
        });
      }
    }
  }
});

chrome.commands.onCommand.addListener(async (command) => {
  const [activeVideoTab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
    url: 'https://*.youtube.com/watch?v=*',
  });

  if (activeVideoTab) {
    switch (command) {
      case 'quick-save': {
        chrome.tabs.sendMessage(activeVideoTab.id, {
          action: 'CONTENT/QUICK_SAVE',
        });
        break;
      }
      case 'edited-save': {
        chrome.tabs.sendMessage(activeVideoTab.id, {
          action: 'CONTENT/EDITED_SAVE',
        });
        break;
      }
      case 'next-bookmark': {
        chrome.tabs.sendMessage(activeVideoTab.id, {
          action: 'CONTENT/NEXT_BOOKMARK',
        });
        break;
      }
      case 'previous-bookmark': {
        chrome.tabs.sendMessage(activeVideoTab.id, {
          action: 'CONTENT/PREVIOUS_BOOKMARK',
        });
        break;
      }
      default:
        console.warn('Unknown command:', command);
        break;
    }
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('sw message', message, sender?.url);

  (async () => {
    try {
      const db = await openDatabase();

      switch (message.action) {
        case 'CREATE_BOOKMARK': {
          try {
            validateBookmark(message, {
              bookmarkTitle: {
                ...BOOKMARK_TITLE_CONSTRAINS,
                required: !!message.title,
              },
              bookmarkNote: BOOKMARK_NOTE_CONSTRAINS,
              bookmarkColor: { required: !!message.color },
            });
            const { video, bookmark } = await createBookmark(db, message);
            const tabs = await getCurrentVideoTabs(video.videoId);
            if (tabs.length) {
              for (const tab of tabs) {
                chrome.tabs.sendMessage(tab.id, {
                  action: 'CONTENT/CREATE_BOOKMARKS',
                  bookmarks: [bookmark],
                });
              }
            }

            sendResponse({ success: true, video, bookmark });
          } catch (err) {
            const errorMessage =
              err instanceof ValidationError
                ? err.message
                : 'Failed to create new bookmark';
            sendResponse({ success: false, error: errorMessage });
          }
          break;
        }
        case 'CREATE_TAG': {
          try {
            validateTag(message.tag, {
              tagTitle: {
                ...TAG_TITLE_CONSTRAINS,
                required: true,
              },
              tagColor: { required: !!message.tag.color },
            });
            const { tag } = await createTag(db, message.tag);
            sendResponse({ success: true, tag });
          } catch (err) {
            const errorMessage =
              err instanceof ValidationError
                ? err.message
                : 'Failed to create new tag';
            sendResponse({ success: false, error: errorMessage });
          }
          break;
        }
        case 'UPDATE_TAG': {
          const { tag: updTag } = message;
          try {
            validateTag(updTag, {
              tagTitle: {
                ...TAG_TITLE_CONSTRAINS,
                required: true,
              },
              tagColor: { required: !!updTag.color },
            });
            const { tag } = await updateTag(db, updTag);
            sendResponse({ success: true, tag });
          } catch (err) {
            const errorMessage =
              err instanceof ValidationError
                ? err.message
                : 'Failed to update tag';
            sendResponse({ success: false, error: errorMessage });
          }
          break;
        }
        case 'GET_TAGS': {
          const tags = await getTags(db, { normalized: message?.normalized });
          sendResponse({ success: true, list: tags });
          break;
        }
        case 'DELETE_TAG': {
          await deleteTag(db, message.tagId);
          sendResponse({ success: true });
          break;
        }
        case 'DELETE_TAGS': {
          await deleteTags(db);
          sendResponse({ success: true });
          break;
        }
        case 'SET_VIDEO_TAG': {
          await setVideoTag(db, message.videoId, message.tagId || null);
          sendResponse({ success: true });
          break;
        }
        case 'GET_VIDEOS_WITH_BOOKMARKS': {
          const videosWithBookmarks = await getVideosWithBookmarks(db, {
            topVideoId: message?.topmostVideoId,
            includeBookmarks: message?.includeBookmarks,
            normalized: message?.normalized,
          });
          sendResponse({ success: true, list: videosWithBookmarks });
          break;
        }
        case 'GET_BOOKMARKS_BY_VIDEO_ID': {
          const bookmarks = await getBookmarksByVideoId(db, message.videoId, {
            normalized: message.normalized,
            order: message.order, // time_asc | new
          });
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
          const { bookmark: updBookmark } = message;
          try {
            validateBookmark(updBookmark, {
              bookmarkTitle: { ...BOOKMARK_TITLE_CONSTRAINS, required: true },
              bookmarkNote: BOOKMARK_NOTE_CONSTRAINS,
              bookmarkColor: { required: true },
            });
            const { bookmark } = await updateBookmark(db, updBookmark);
            const tabs = await getCurrentVideoTabs(bookmark.videoId);

            if (tabs.length) {
              for (const tab of tabs) {
                chrome.tabs.sendMessage(tab.id, {
                  action: 'CONTENT/UPDATE_BOOKMARK',
                  bookmark: bookmark,
                });
              }
            }

            sendResponse({ success: true, bookmark: bookmark });
          } catch (err) {
            const errorMessage =
              err instanceof ValidationError
                ? err.message
                : 'Failed to update bookmark';
            sendResponse({ success: false, error: errorMessage });
          }
          break;
        }
        case 'SAVE_VIDEO_LOOP': {
          await saveVideoLoop(
            db,
            message.videoId,
            message.loopStartId,
            message.loopEndId,
          );
          const tabs = await getCurrentVideoTabs(message.videoId);

          for (const tab of tabs) {
            chrome.tabs.sendMessage(tab.id, {
              action: 'CONTENT/SET_VIDEO_LOOP',
              videoId: message.videoId,
              loopStartId: message.loopStartId,
              loopEndId: message.loopEndId,
            });
          }

          sendResponse({ success: true });
          break;
        }
        case 'DELETE_VIDEO_LOOP': {
          await deleteVideoLoop(db, message.videoId);
          const tabs = await getCurrentVideoTabs(message.videoId);

          for (const tab of tabs) {
            chrome.tabs.sendMessage(tab.id, {
              action: 'CONTENT/REMOVE_VIDEO_LOOP',
            });
          }

          sendResponse({ success: true });
          break;
        }
        case 'DELETE_BOOKMARK': {
          const { videoId } = await deleteBookmark(db, message.bookmarkId);
          const tabs = await getCurrentVideoTabs(videoId);

          if (tabs.length) {
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
        case 'RESET': {
          const videoIds = await resetData(db);
          const tabs = await getCurrentVideoTabs(...videoIds);

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
        case 'EXPORT_DATA': {
          const videosWithBookmarks = await getVideosWithBookmarks(db);
          const tags = await getTags(db);

          for (const video of videosWithBookmarks) {
            delete video.loopStartId;
            delete video.loopEndId;
          }

          sendResponse({
            success: true,
            data: {
              version: DATA_VERSION,
              exportedAt: new Date().toISOString(),
              videos: videosWithBookmarks,
              tags,
            },
          });
          break;
        }
        case 'IMPORT_DATA': {
          try {
            validateImportedData(message.data, DATA_VERSION, {
              videoTitle: VIDEO_TITLE_CONSTRAINS,
              bookmarkTitle: BOOKMARK_TITLE_CONSTRAINS,
              bookmarkNote: BOOKMARK_NOTE_CONSTRAINS,
              tagTitle: TAG_TITLE_CONSTRAINS,
            });
            await importData(db, message.data);
            const videoIds = message.data.videos.map((v) => v.videoId);
            const tabs = await getCurrentVideoTabs(...videoIds);

            if (tabs.length) {
              for (const tab of tabs) {
                chrome.tabs.sendMessage(tab.id, {
                  action: 'CONTENT/REFRESH_BOOKMARKS',
                });
              }
            }

            sendResponse({ success: true });
          } catch (error) {
            console.error(error);
            const errorMessage =
              error instanceof ValidationError
                ? error.message
                : 'Failed to import data';
            sendResponse({ success: false, error: errorMessage });
          }

          break;
        }
        default:
          console.warn('Unknown action:', message.action);
      }
    } catch (err) {
      console.error('Messages listener error:', err?.message);
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
        videoObjectStore.createIndex(VIDEOS_BY_TAG_IDX, 'tagId', {
          unique: false,
          multiEntry: true,
        });
      }

      if (!db.objectStoreNames.contains('bookmarks')) {
        const bmObjectStore = db.createObjectStore('bookmarks', {
          keyPath: 'id',
          autoIncrement: false,
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

      if (!db.objectStoreNames.contains('tags')) {
        db.createObjectStore('tags', { keyPath: 'id' });
      }
    };

    dbOpenRequest.onerror = () => {
      reject(dbOpenRequest.error);
    };

    dbOpenRequest.onsuccess = () => {
      const db = dbOpenRequest.result;

      db.onerror = (e) => {
        console.error('Database error: ', e.target.error?.message);
      };

      db.onversionchange = () => {
        db.close();
        console.warn('Database is outdated');
      };

      resolve(db);
    };
  });
}

function getTags(db, { normalized = false } = {}) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(['tags'], 'readonly');
    let result = normalized ? { byId: [], ids: [] } : [];

    t.oncomplete = () => {
      resolve(result);
    };
    t.onabort = () => {
      reject(t.error);
    };

    t.objectStore('tags').openCursor().onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) {
        if (normalized) {
          result.byId.push([cursor.key, cursor.value]);
          result.ids.push(cursor.key);
        } else {
          result.push(cursor.value);
        }
        cursor.continue();
      }
    };
  });
}

function createTag(db, payload) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(['tags'], 'readwrite');
    let tag;

    t.oncomplete = () => {
      resolve({ tag });
    };

    t.onabort = () => {
      reject(t.error);
    };

    t.objectStore('tags').add({
      id: crypto.randomUUID(),
      title: payload.title,
      color: payload.color || null,
    }).onsuccess = (e) => {
      t.objectStore('tags').get(e.target.result).onsuccess = (ev) => {
        tag = ev.target.result;
      };
    };
  });
}

function updateTag(db, tag) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(['tags'], 'readwrite');
    const tagStore = t.objectStore('tags');
    const req = tagStore.put(tag);

    req.onsuccess = () => {
      tagStore.get(req.result).onsuccess = (e) => {
        resolve({ tag: e.target.result });
      };
    };

    req.onerror = () => {
      reject(req.error);
    };
  });
}

function deleteTag(db, tagId) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(['tags', 'videos'], 'readwrite');
    const videoStore = t.objectStore('videos');
    const tagStore = t.objectStore('tags');

    t.oncomplete = () => {
      resolve();
    };

    t.onabort = () => {
      reject(t.error);
    };

    tagStore.delete(tagId).onsuccess = () => {
      videoStore
        .index(VIDEOS_BY_TAG_IDX)
        .openCursor(IDBKeyRange.only(tagId)).onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          cursor.update({ ...cursor.value, tagId: [] });
          cursor.continue();
        }
      };
    };
  });
}

function deleteTags(db) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(['tags', 'videos'], 'readwrite');
    const videoStore = t.objectStore('videos');
    const tagStore = t.objectStore('tags');

    t.oncomplete = () => {
      resolve();
    };

    t.onabort = () => {
      reject(t.error);
    };

    tagStore.openCursor().onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) {
        videoStore
          .index(VIDEOS_BY_TAG_IDX)
          .openCursor(IDBKeyRange.only(cursor.key)).onsuccess = (e) => {
          const vidCursor = e.target.result;
          if (vidCursor) {
            vidCursor.update({ ...vidCursor.value, tagId: [] });
            vidCursor.continue();
          }
        };

        cursor.delete();
        cursor.continue();
      }
    };
  });
}

function setVideoTag(db, videoId, tagId) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(['videos'], 'readwrite');
    const videoStore = t.objectStore('videos');

    t.oncomplete = () => {
      resolve();
    };

    t.onabort = () => {
      reject(t.error);
    };

    videoStore.get(videoId).onsuccess = (e) => {
      const video = e.target.result;
      if (video) {
        video.tagId = tagId ? [tagId] : [];
        videoStore.put(video);
      }
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

    t.objectStore('bookmarks').add({
      id: crypto.randomUUID(),
      videoId: payload.videoId,
      time: Math.floor(payload.time),
      title: payload.title ?? new Date().toLocaleString(),
      note: '',
      color: payload.color ?? DEFAULT_MARK_COLOR,
      createdAt: new Date().getTime(),
    }).onsuccess = (e) => {
      t.objectStore('bookmarks').get(e.target.result).onsuccess = (ev) => {
        bookmark = ev.target.result;
      };
    };

    videoStore.get(payload.videoId).onsuccess = (event) => {
      video = event.target.result;

      if (!video) {
        videoStore.add({
          videoId: payload.videoId,
          title: payload.videoTitle,
          tagId: [],
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
  });
}

function getVideosWithBookmarks(
  db,
  { topVideoId = null, normalized = false, includeBookmarks = true } = {},
) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(['videos', 'bookmarks'], 'readonly');
    const videoStore = t.objectStore('videos');
    const bmStore = t.objectStore('bookmarks');
    const videosCursor = videoStore
      .index(VIDEOS_BY_CREATED_AT_IDX)
      .openCursor(null, 'prev'); // newest videos first
    const videosWithBookmarks = new Map();

    t.oncomplete = () => {
      let result;

      if (normalized) {
        result = {
          byId: Array.from(videosWithBookmarks.entries()),
          ids: [],
        };
        if (topVideoId && videosWithBookmarks.has(topVideoId)) {
          result.ids.push(topVideoId);
          videosWithBookmarks.delete(topVideoId);
          result.ids.push(...videosWithBookmarks.keys());
        } else {
          result.ids = Array.from(videosWithBookmarks.keys());
        }
      } else {
        result = [];
        if (topVideoId && videosWithBookmarks.has(topVideoId)) {
          result.push(videosWithBookmarks.get(topVideoId));
          videosWithBookmarks.delete(topVideoId);
          result.push(...videosWithBookmarks.values());
        } else {
          result = Array.from(videosWithBookmarks.values());
        }
      }

      resolve(result);
    };

    t.onabort = () => {
      reject(t.error);
    };

    videosCursor.onsuccess = (e) => {
      const cursor = e.target.result;

      if (cursor) {
        const video = cursor.value;
        bmStore.index(BOOKMARKS_BY_VIDEO_ID_IDX).getAll({
          query: IDBKeyRange.only(video.videoId),
        }).onsuccess = (ev) => {
          if (includeBookmarks) {
            // sort bookmarks by createdAt desc
            const sortedBookmarks = ev.target.result.toSorted(
              (a, b) => b.createdAt - a.createdAt,
            );
            // keep only ids for normalized response
            video.bookmarks = normalized
              ? sortedBookmarks.map((bm) => bm.id)
              : sortedBookmarks;
          }
          videosWithBookmarks.set(video.videoId, video);
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

function getBookmarksByVideoId(
  db,
  videoId,
  { normalized = false, order = 'time_asc' } = {},
) {
  return new Promise((resolve) => {
    const t = db.transaction(['bookmarks'], 'readonly');
    const bmStore = t.objectStore('bookmarks');
    const req = bmStore
      .index(BOOKMARKS_BY_VIDEO_ID_IDX)
      .getAll(IDBKeyRange.only(videoId));

    req.onsuccess = (event) => {
      let sorted;
      if (!order || order === 'time_asc') {
        sorted = event.target.result.toSorted((a, b) => a.time - b.time);
      }
      if (order === 'new') {
        sorted = event.target.result.toSorted(
          (a, b) => b.createdAt - a.createdAt,
        );
      }
      if (normalized) {
        const result = {
          byId: [],
          ids: [],
        };
        sorted.forEach((bm) => {
          result.byId.push([bm.id, bm]);
          result.ids.push(bm.id);
        });
        resolve(result);
      } else {
        resolve(sorted);
      }
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

function resetData(db) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(['videos', 'bookmarks', 'tags'], 'readwrite');
    const videoIds = [];

    t.oncomplete = () => {
      resolve(videoIds);
    };

    t.onabort = () => {
      reject(t.error);
    };

    t.objectStore('videos').getAllKeys().onsuccess = (e) => {
      videoIds.push(...e.target.result);
      t.objectStore('videos').clear();
      t.objectStore('bookmarks').clear();
      t.objectStore('tags').clear();
    };
  });
}

function importData(db, data) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(['videos', 'bookmarks', 'tags'], 'readwrite');

    t.oncomplete = () => {
      resolve();
    };

    t.onabort = () => {
      reject(t.error);
    };

    const videoStore = t.objectStore('videos');
    const bmStore = t.objectStore('bookmarks');
    const tagStore = t.objectStore('tags');

    for (const video of data.videos) {
      videoStore.put({
        videoId: video.videoId,
        title: video.title,
        createdAt: video.createdAt,
        loopStartId: null,
        loopEndId: null,
        tagId: video.tagId ?? [],
      }).onsuccess = (e) => {
        const videoId = e.target.result;

        for (const bookmark of video.bookmarks) {
          bmStore.put({
            id: bookmark.id,
            videoId,
            time: bookmark.time,
            title: bookmark.title,
            note: bookmark.note,
            color: bookmark.color,
            createdAt: bookmark.createdAt,
          });
        }
      };
    }

    if (data.tags) {
      for (const tag of data.tags) {
        tagStore.put({
          id: tag.id,
          title: tag.title,
          color: tag.color,
        });
      }
    }
  });
}
