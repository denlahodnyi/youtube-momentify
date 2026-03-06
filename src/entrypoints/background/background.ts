import {
  typedMessage,
  type BackgroundTypedMessage,
  type Backup,
  type Bookmark,
  type CreateBookmark,
  type CreateTag,
  type Tag,
  type Video,
} from '@/api/index.js';
import {
  DEFAULT_MARK_COLOR,
  VIDEO_TITLE_CONSTRAINS,
  BOOKMARK_TITLE_CONSTRAINS,
  BOOKMARK_NOTE_CONSTRAINS,
  TAG_TITLE_CONSTRAINS,
  getCurrentVideoTabs,
  getYoutubeVideoTabPattern,
} from '@/shared';
import {
  validateBookmark,
  validateImportedData,
  validateTag,
  ValidationError,
} from './backgroundUtils.js';

const chrome = browser;

const BOOKMARKS_BY_VIDEO_ID_IDX = 'bookmarks_idx/by_videoId';
const VIDEOS_BY_CREATED_AT_IDX = 'videos_idx/by_createdAt';
const VIDEOS_BY_TAG_IDX = 'videos_idx/by_tag';
const DATA_VERSION = 1;
const DB_VERSION = 1;

export type Commands =
  | 'quick-save'
  | 'edited-save'
  | 'next-bookmark'
  | 'previous-bookmark';

export function runBackground() {
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
        if (showQuickSave && tab.id) {
          chrome.tabs.sendMessage(tab.id, {
            action: 'CONTENT/TOGGLE_QUICK_SAVE',
            show: showQuickSave.newValue,
          });
        }
        if (showEditedSave && tab.id) {
          chrome.tabs.sendMessage(tab.id, {
            action: 'CONTENT/TOGGLE_EDITED_SAVE',
            show: showEditedSave.newValue,
          });
        }
        if (theme && tab.id) {
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

    if (activeVideoTab.id) {
      switch (command as Commands) {
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

  chrome.runtime.onMessage.addListener(
    (message: BackgroundTypedMessage, sender, sendResponse) => {
      console.log('sw message', message);

      (async () => {
        try {
          const db = await openDatabase();

          switch (message.action) {
            case 'CREATE_BOOKMARK': {
              try {
                const { action, ...payload } = message;
                validateBookmark(
                  { title: payload.title, color: payload.color },
                  {
                    bookmarkTitle: {
                      ...BOOKMARK_TITLE_CONSTRAINS,
                      required: !!message.title,
                    },
                    bookmarkNote: {
                      ...BOOKMARK_NOTE_CONSTRAINS,
                      required: false,
                    },
                    bookmarkColor: { required: !!message.color },
                  },
                );
                const { video, bookmark } = await createBookmark(db, message);
                const tabs = await getCurrentVideoTabs(video.videoId);
                if (tabs.length) {
                  for (const tab of tabs) {
                    if (tab.id) {
                      chrome.tabs.sendMessage(
                        tab.id,
                        typedMessage('CONTENT/CREATE_BOOKMARKS', 'in', {
                          bookmarks: [bookmark],
                        }),
                      );
                    }
                  }
                }

                sendResponse(
                  typedMessage(message.action, 'out', {
                    success: true,
                    video,
                    bookmark,
                  }),
                );
              } catch (err) {
                const errorMessage =
                  err instanceof ValidationError
                    ? err.message
                    : 'Failed to create new bookmark';
                console.error(errorMessage);
                sendResponse(
                  typedMessage(message.action, 'out', {
                    success: false,
                    error: errorMessage,
                  }),
                );
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
                  // tagColor: { required: !!message.tag.color },
                });
                const { tag } = await createTag(db, message.tag);
                sendResponse(
                  typedMessage(message.action, 'out', { success: true, tag }),
                );
              } catch (err) {
                const errorMessage =
                  err instanceof ValidationError
                    ? err.message
                    : 'Failed to create new tag';
                sendResponse(
                  typedMessage(message.action, 'out', {
                    success: false,
                    error: errorMessage,
                  }),
                );
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
                sendResponse(
                  typedMessage(message.action, 'out', { success: true, tag }),
                );
              } catch (err) {
                const errorMessage =
                  err instanceof ValidationError
                    ? err.message
                    : 'Failed to update tag';
                sendResponse(
                  typedMessage(message.action, 'out', {
                    success: false,
                    error: errorMessage,
                  }),
                );
              }
              break;
            }
            case 'GET_TAGS': {
              const result = await getTags(db, {
                normalized: message?.normalized,
              });
              sendResponse(
                typedMessage(message.action, 'out', {
                  success: true,
                  ...result,
                }),
              );
              break;
            }
            case 'DELETE_TAG': {
              await deleteTag(db, message.tagId);
              sendResponse(
                typedMessage(message.action, 'out', { success: true }),
              );
              break;
            }
            case 'DELETE_TAGS': {
              await deleteTags(db);
              sendResponse(
                typedMessage(message.action, 'out', { success: true }),
              );
              break;
            }
            case 'SET_VIDEO_TAG': {
              await setVideoTag(db, message.videoId, message.tagId || null);
              sendResponse(
                typedMessage(message.action, 'out', { success: true }),
              );
              break;
            }
            case 'GET_VIDEOS_WITH_BOOKMARKS': {
              const result = await getVideosWithBookmarks(db, {
                topVideoId: message?.topmostVideoId,
                includeBookmarks: message?.includeBookmarks,
                normalized: message?.normalized,
              });
              sendResponse(
                typedMessage(message.action, 'out', {
                  success: true,
                  ...result,
                }),
              );
              break;
            }
            case 'GET_BOOKMARKS_BY_VIDEO_ID': {
              const result = await getBookmarksByVideoId(db, message.videoId, {
                normalized: message.normalized,
                order: message.order, // time_asc | new
              });
              sendResponse(
                typedMessage(message.action, 'out', {
                  success: true,
                  ...result,
                }),
              );
              break;
            }
            case 'GET_BOOKMARK': {
              const bookmark = await getBookmark(db, message.bookmarkId);
              sendResponse(
                typedMessage(message.action, 'out', {
                  success: true,
                  bookmark,
                }),
              );
              break;
            }
            case 'GET_VIDEO': {
              const video = await getVideo(db, message.videoId);
              sendResponse(
                typedMessage(message.action, 'out', { success: true, video }),
              );
              break;
            }
            case 'GET_VIDEOS_TOTAL_COUNT': {
              const count = await getVideosTotalCount(db);
              sendResponse(
                typedMessage(message.action, 'out', { success: true, count }),
              );
              break;
            }
            case 'GET_BOOKMARKS_COUNT_BY_VIDEO_ID': {
              const count = await getBookmarksPerVideoTotalCount(
                db,
                message.videoId,
              );
              sendResponse(
                typedMessage(message.action, 'out', { success: true, count }),
              );
              break;
            }
            case 'UPDATE_BOOKMARK': {
              const { bookmark: updBookmark } = message;
              try {
                validateBookmark(updBookmark, {
                  bookmarkTitle: {
                    ...BOOKMARK_TITLE_CONSTRAINS,
                    required: true,
                  },
                  bookmarkNote: {
                    ...BOOKMARK_NOTE_CONSTRAINS,
                    required: false,
                  },
                  bookmarkColor: { required: true },
                });
                const { bookmark } = await updateBookmark(db, updBookmark);
                const tabs = await getCurrentVideoTabs(bookmark.videoId);

                if (tabs.length) {
                  for (const tab of tabs) {
                    if (tab.id) {
                      chrome.tabs.sendMessage(
                        tab.id,
                        typedMessage('CONTENT/UPDATE_BOOKMARK', 'in', {
                          bookmark: bookmark,
                        }),
                      );
                    }
                  }
                }

                sendResponse(
                  typedMessage(message.action, 'out', {
                    success: true,
                    bookmark: bookmark,
                  }),
                );
              } catch (err) {
                const errorMessage =
                  err instanceof ValidationError
                    ? err.message
                    : 'Failed to update bookmark';
                sendResponse(
                  typedMessage(message.action, 'out', {
                    success: false,
                    error: errorMessage,
                  }),
                );
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
                if (tab.id) {
                  chrome.tabs.sendMessage(
                    tab.id,
                    typedMessage('CONTENT/SET_VIDEO_LOOP', 'in', {
                      videoId: message.videoId,
                      loopStartId: message.loopStartId,
                      loopEndId: message.loopEndId,
                    }),
                  );
                }
              }

              sendResponse(
                typedMessage(message.action, 'out', { success: true }),
              );
              break;
            }
            case 'DELETE_VIDEO_LOOP': {
              await deleteVideoLoop(db, message.videoId);
              const tabs = await getCurrentVideoTabs(message.videoId);

              for (const tab of tabs) {
                if (tab.id) {
                  chrome.tabs.sendMessage(
                    tab.id,
                    typedMessage('CONTENT/REMOVE_VIDEO_LOOP', 'in', {}),
                  );
                }
              }

              sendResponse(
                typedMessage(message.action, 'out', { success: true }),
              );
              break;
            }
            case 'DELETE_BOOKMARK': {
              const { videoId } = await deleteBookmark(db, message.bookmarkId);
              const tabs = await getCurrentVideoTabs(videoId);

              if (tabs.length) {
                for (const tab of tabs) {
                  if (tab.id) {
                    chrome.tabs.sendMessage(
                      tab.id,
                      typedMessage('CONTENT/DELETE_BOOKMARK', 'in', {
                        bookmarkId: message.bookmarkId,
                      }),
                    );
                  }
                }
              }

              sendResponse(
                typedMessage(message.action, 'out', { success: true }),
              );
              break;
            }
            case 'DELETE_BOOKMARKS_BY_VIDEO_ID': {
              await deleteBookmarksByVideoId(db, message.videoId);
              const tabs = await getCurrentVideoTabs(message.videoId);

              if (tabs.length) {
                for (const tab of tabs) {
                  if (tab.id) {
                    chrome.tabs.sendMessage(
                      tab.id,
                      typedMessage('CONTENT/DELETE_ALL_BOOKMARKS', 'in', {}),
                    );
                  }
                }
              }

              sendResponse(
                typedMessage(message.action, 'out', { success: true }),
              );
              break;
            }
            case 'DELETE_VIDEO': {
              const { videoId } = message;
              await deleteVideo(db, videoId);
              const tabs = await getCurrentVideoTabs(videoId);

              if (tabs.length) {
                for (const tab of tabs) {
                  if (tab.id) {
                    chrome.tabs.sendMessage(
                      tab.id,
                      typedMessage('CONTENT/DELETE_ALL_BOOKMARKS', 'in', {}),
                    );
                  }
                }
              }

              sendResponse(
                typedMessage(message.action, 'out', { success: true }),
              );
              break;
            }
            case 'RESET': {
              const videoIds = await resetData(db);
              const tabs = await getCurrentVideoTabs(videoIds[0], ...videoIds);

              if (tabs.length) {
                for (const tab of tabs) {
                  if (tab.id) {
                    chrome.tabs.sendMessage(
                      tab.id,
                      typedMessage('CONTENT/DELETE_ALL_BOOKMARKS', 'in', {}),
                    );
                  }
                }
              }

              sendResponse(
                typedMessage(message.action, 'out', { success: true }),
              );
              break;
            }
            case 'EXPORT_DATA': {
              const videosWithBookmarks = await getVideosWithBookmarks(db);
              const tags = await getTags(db);

              for (const video of videosWithBookmarks.list) {
                delete (video as Partial<Video>).loopStartId;
                delete (video as Partial<Video>).loopEndId;
              }

              sendResponse(
                typedMessage(message.action, 'out', {
                  success: true,
                  data: {
                    version: DATA_VERSION,
                    exportedAt: new Date().toISOString(),
                    videos: videosWithBookmarks.list,
                    tags: tags.list,
                  },
                }),
              );
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
                const tabs = await getCurrentVideoTabs(
                  videoIds[0],
                  ...videoIds,
                );

                if (tabs.length) {
                  for (const tab of tabs) {
                    if (tab.id) {
                      chrome.tabs.sendMessage(
                        tab.id,
                        typedMessage('CONTENT/REFRESH_BOOKMARKS', 'in', {}),
                      );
                    }
                  }
                }

                sendResponse(
                  typedMessage(message.action, 'out', { success: true }),
                );
              } catch (error) {
                console.error(error);
                const errorMessage =
                  error instanceof ValidationError
                    ? error.message
                    : 'Failed to import data';
                sendResponse(
                  typedMessage(message.action, 'out', {
                    success: false,
                    error: errorMessage,
                  }),
                );
              }

              break;
            }
            default:
              console.warn('Unknown action:', message);
          }
        } catch (err) {
          console.error(
            'Messages listener error:',
            err instanceof Error ? err.message : '',
          );
        }
      })();

      return true;
    },
  );
}

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    if (!indexedDB) reject(new Error('IndexedDB is not supported'));
    const dbOpenRequest = indexedDB.open('momentify-db', DB_VERSION);

    dbOpenRequest.onblocked = () => {
      reject(new Error('DB is blocked'));
    };

    dbOpenRequest.onupgradeneeded = () => {
      const db = dbOpenRequest.result;

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
        console.error(
          'Database error: ',
          (e.target as IDBTransaction).error?.message,
        );
      };

      db.onversionchange = () => {
        db.close();
        console.warn('Database is outdated');
      };

      resolve(db);
    };
  });
}

type GetTagsResult<TNorm extends boolean> = TNorm extends true
  ? { normalized: true; list: { byId: [Tag['id'], Tag][]; ids: Tag['id'][] } }
  : { normalized: false; list: Tag[] };
function getTags<TNorm extends boolean = false>(
  db: IDBDatabase,
  { normalized }: { normalized?: TNorm } = {},
) {
  return new Promise<GetTagsResult<TNorm>>((resolve, reject) => {
    const t = db.transaction(['tags'], 'readonly');
    let result = normalized
      ? ({
          normalized: true,
          list: { byId: [], ids: [] },
        } as GetTagsResult<true>)
      : ({ normalized: false, list: [] } as GetTagsResult<false>);

    t.oncomplete = () => {
      resolve(result as GetTagsResult<TNorm>);
    };
    t.onabort = () => {
      reject(t.error);
    };

    const req = t.objectStore('tags').openCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor) {
        if (result.normalized) {
          result.list.byId.push([cursor.key as string, cursor.value]);
          result.list.ids.push(cursor.key as string);
        } else if (result.normalized === false) {
          result.list.push(cursor.value);
        }
        cursor.continue();
      }
    };
  });
}

function createTag(db: IDBDatabase, payload: CreateTag) {
  return new Promise<{ tag: Tag }>((resolve, reject) => {
    const t = db.transaction(['tags'], 'readwrite');
    let tag: Tag;

    t.oncomplete = () => {
      resolve({ tag });
    };

    t.onabort = () => {
      reject(t.error);
    };

    const addReq = t.objectStore('tags').add({
      id: crypto.randomUUID(),
      title: payload.title,
      color: null,
    } satisfies Tag);
    addReq.onsuccess = () => {
      const req = t.objectStore('tags').get(addReq.result);
      req.onsuccess = () => {
        tag = req.result;
      };
    };
  });
}

function updateTag(db: IDBDatabase, tag: Tag) {
  return new Promise<{ tag: Tag }>((resolve, reject) => {
    const t = db.transaction(['tags'], 'readwrite');
    const tagStore = t.objectStore('tags');
    const req = tagStore.put(tag);

    req.onsuccess = () => {
      const getReq = tagStore.get(req.result);
      getReq.onsuccess = (e) => {
        resolve({ tag: getReq.result });
      };
    };

    req.onerror = () => {
      reject(req.error);
    };
  });
}

function deleteTag(db: IDBDatabase, tagId: Tag['id']) {
  return new Promise<void>((resolve, reject) => {
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
      const req = videoStore
        .index(VIDEOS_BY_TAG_IDX)
        .openCursor(IDBKeyRange.only(tagId));
      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor) {
          cursor.update({ ...cursor.value, tagId: [] });
          cursor.continue();
        }
      };
    };
  });
}

function deleteTags(db: IDBDatabase) {
  return new Promise<void>((resolve, reject) => {
    const t = db.transaction(['tags', 'videos'], 'readwrite');
    const videoStore = t.objectStore('videos');
    const tagStore = t.objectStore('tags');

    t.oncomplete = () => {
      resolve();
    };

    t.onabort = () => {
      reject(t.error);
    };

    const req = tagStore.openCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor) {
        const vidReq = videoStore
          .index(VIDEOS_BY_TAG_IDX)
          .openCursor(IDBKeyRange.only(cursor.key));
        vidReq.onsuccess = (e) => {
          const vidCursor = vidReq.result;
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

function setVideoTag(
  db: IDBDatabase,
  videoId: Video['videoId'],
  tagId: Tag['id'] | null,
) {
  return new Promise<void>((resolve, reject) => {
    const t = db.transaction(['videos'], 'readwrite');
    const videoStore = t.objectStore('videos');

    t.oncomplete = () => {
      resolve();
    };

    t.onabort = () => {
      reject(t.error);
    };

    const req = videoStore.get(videoId);
    req.onsuccess = () => {
      const video = req.result;
      if (video) {
        video.tagId = tagId ? [tagId] : [];
        videoStore.put(video);
      }
    };
  });
}

function createBookmark(db: IDBDatabase, payload: CreateBookmark) {
  return new Promise<{ video: Video; bookmark: Bookmark }>(
    (resolve, reject) => {
      const t = db.transaction(['videos', 'bookmarks'], 'readwrite');
      const videoStore = t.objectStore('videos');
      let video: Video;
      let bookmark: Bookmark;

      t.oncomplete = () => {
        resolve({ video, bookmark });
      };

      t.onabort = () => {
        reject(t.error);
      };

      const addReq = t.objectStore('bookmarks').add({
        id: crypto.randomUUID(),
        videoId: payload.videoId,
        time: Math.floor(payload.time),
        title: payload.title ?? new Date().toLocaleString(),
        note: '',
        color: payload.color ?? DEFAULT_MARK_COLOR,
        createdAt: new Date().getTime(),
      } satisfies Bookmark);
      addReq.onsuccess = (e) => {
        const req = t.objectStore('bookmarks').get(addReq.result);
        req.onsuccess = (ev) => {
          bookmark = req.result as Bookmark;
        };
      };

      const req = videoStore.get(payload.videoId);
      req.onsuccess = () => {
        video = req.result;
        if (!video) {
          const addReq = videoStore.add({
            videoId: payload.videoId,
            title: payload.videoTitle,
            tagId: [],
            loopStartId: null,
            loopEndId: null,
            createdAt: new Date().getTime(),
          } satisfies Video);
          addReq.onsuccess = () => {
            const req = videoStore.get(addReq.result);
            req.onsuccess = () => {
              video = req.result as Video;
            };
          };
        }
      };
    },
  );
}

type VideosAndBookmarks<TInclude extends boolean> = TInclude extends true
  ? Video & { bookmarks: Bookmark[] }
  : Video;
type GetVideosResult<
  TNorm extends boolean,
  TInclBM extends boolean,
> = TNorm extends true
  ? {
      normalized: true;
      list: {
        byId: [Video['videoId'], VideosAndBookmarks<TInclBM>][];
        ids: Video['videoId'][];
      };
    }
  : { normalized: false; list: VideosAndBookmarks<TInclBM>[] };

function getVideosWithBookmarks<
  TNorm extends boolean = false,
  TInclBM extends boolean = true,
>(
  db: IDBDatabase,
  options: {
    topVideoId?: Video['videoId'];
    includeBookmarks?: TInclBM;
    normalized?: TNorm;
  } = {},
) {
  const {
    topVideoId = null,
    normalized = false,
    includeBookmarks = true,
  } = options;

  return new Promise<GetVideosResult<TNorm, TInclBM>>((resolve, reject) => {
    const t = db.transaction(['videos', 'bookmarks'], 'readonly');
    const videoStore = t.objectStore('videos');
    const bmStore = t.objectStore('bookmarks');
    const videosCursor = videoStore
      .index(VIDEOS_BY_CREATED_AT_IDX)
      .openCursor(null, 'prev'); // newest videos first
    const videosWithBookmarks = new Map();

    t.oncomplete = () => {
      let result = normalized
        ? ({
            normalized: true,
            list: { byId: [], ids: [] },
          } as GetVideosResult<true, TInclBM>)
        : ({ normalized: false, list: [] } as GetVideosResult<false, TInclBM>);

      if (result.normalized) {
        result = {
          normalized: true,
          list: { byId: Array.from(videosWithBookmarks.entries()), ids: [] },
        };
        if (topVideoId && videosWithBookmarks.has(topVideoId)) {
          result.list.ids.push(topVideoId);
          videosWithBookmarks.delete(topVideoId);
          result.list.ids.push(...videosWithBookmarks.keys());
        } else {
          result.list.ids = Array.from(videosWithBookmarks.keys());
        }
      } else {
        result = { normalized: false, list: [] };
        if (topVideoId && videosWithBookmarks.has(topVideoId)) {
          result.list.push(videosWithBookmarks.get(topVideoId));
          videosWithBookmarks.delete(topVideoId);
          result.list.push(...videosWithBookmarks.values());
        } else {
          result.list = Array.from(videosWithBookmarks.values());
        }
      }

      resolve(result as GetVideosResult<TNorm, TInclBM>);
    };

    t.onabort = () => {
      reject(t.error);
    };

    videosCursor.onsuccess = (e) => {
      const cursor = videosCursor.result;

      if (cursor) {
        const video = cursor.value;
        const req = bmStore.index(BOOKMARKS_BY_VIDEO_ID_IDX).getAll({
          query: IDBKeyRange.only(video.videoId),
        } as unknown as IDBKeyRange);
        req.onsuccess = () => {
          if (includeBookmarks) {
            // sort bookmarks by createdAt desc
            const sortedBookmarks = req.result.toSorted(
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

function getBookmark(db: IDBDatabase, bookmarkId: Bookmark['id']) {
  return new Promise<Bookmark>((resolve, reject) => {
    const t = db.transaction('bookmarks', 'readonly');
    const bmStore = t.objectStore('bookmarks');
    const req = bmStore.get(bookmarkId);

    req.onsuccess = () => {
      resolve(req.result);
    };

    req.onerror = () => {
      reject(req.error);
    };
  });
}

type GetVideoBookmarksResult =
  | { normalized: false; list: Bookmark[] }
  | {
      normalized: true;
      list: {
        byId: [Bookmark['id'], Bookmark][];
        ids: Bookmark['id'][];
      };
    };
function getBookmarksByVideoId(
  db: IDBDatabase,
  videoId: Video['videoId'],
  { normalized = false, order = 'time_asc' } = {},
) {
  return new Promise<GetVideoBookmarksResult>((resolve, reject) => {
    const t = db.transaction(['bookmarks'], 'readonly');
    const bmStore = t.objectStore('bookmarks');
    const req = bmStore
      .index(BOOKMARKS_BY_VIDEO_ID_IDX)
      .getAll(IDBKeyRange.only(videoId));

    req.onsuccess = () => {
      let sorted: Bookmark[] = [];
      if (!order || order === 'time_asc') {
        sorted = req.result.toSorted((a, b) => a.time - b.time);
      }
      if (order === 'new') {
        sorted = req.result.toSorted((a, b) => b.createdAt - a.createdAt);
      }
      if (normalized) {
        const result: Extract<
          GetVideoBookmarksResult,
          { normalized: true }
        >['list'] = {
          byId: [],
          ids: [],
        };
        sorted.forEach((bm) => {
          result.byId.push([bm.id, bm]);
          result.ids.push(bm.id);
        });
        resolve({ normalized: true, list: result });
      } else {
        resolve({ normalized: false, list: sorted });
      }
    };

    req.onerror = () => {
      reject(req.error);
    };
  });
}

function getVideo(db: IDBDatabase, videoId: Video['videoId']) {
  return new Promise<Video>((resolve, reject) => {
    const t = db.transaction(['videos'], 'readonly');
    const req = t.objectStore('videos').get(videoId);

    req.onsuccess = () => {
      resolve(req.result);
    };

    req.onerror = () => {
      reject(req.error);
    };
  });
}

function getVideosTotalCount(db: IDBDatabase) {
  return new Promise<number>((resolve, reject) => {
    const t = db.transaction(['videos'], 'readonly');
    const videoStore = t.objectStore('videos');
    const req = videoStore.count();

    req.onsuccess = () => {
      resolve(req.result);
    };

    req.onerror = () => {
      reject(req.error);
    };
  });
}

function getBookmarksPerVideoTotalCount(
  db: IDBDatabase,
  videoId: Video['videoId'],
) {
  return new Promise<number>((resolve, reject) => {
    const t = db.transaction(['bookmarks'], 'readonly');
    const bmStore = t.objectStore('bookmarks');
    const req = bmStore
      .index(BOOKMARKS_BY_VIDEO_ID_IDX)
      .count(IDBKeyRange.only(videoId));

    req.onsuccess = () => {
      resolve(req.result);
    };

    req.onerror = () => {
      reject(req.error);
    };
  });
}

function updateBookmark(db: IDBDatabase, bookmark: Bookmark) {
  return new Promise<{ bookmark: Bookmark }>((resolve, reject) => {
    const t = db.transaction(['bookmarks'], 'readwrite');
    const bmStore = t.objectStore('bookmarks');
    const req = bmStore.put(bookmark);

    req.onsuccess = () => {
      const getReq = bmStore.get(req.result);
      getReq.onsuccess = () => {
        resolve({ bookmark: getReq.result });
      };
    };

    req.onerror = () => {
      reject(req.error);
    };
  });
}

function saveVideoLoop(
  db: IDBDatabase,
  videoId: Video['videoId'],
  loopStartId: Video['videoId'],
  loopEndId: Video['videoId'],
) {
  return new Promise<void>((resolve, reject) => {
    const t = db.transaction(['videos'], 'readwrite');
    const videosStore = t.objectStore('videos');

    t.oncomplete = () => {
      resolve();
    };

    t.onabort = () => {
      reject(t.error);
    };

    const req = videosStore.get(videoId);
    req.onsuccess = () => {
      const video = req.result;
      video.loopStartId = loopStartId;
      video.loopEndId = loopEndId;
      videosStore.put(video);
    };
  });
}

function deleteVideoLoop(db: IDBDatabase, videoId: Video['videoId']) {
  return new Promise<void>((resolve, reject) => {
    const t = db.transaction(['videos'], 'readwrite');
    const videosStore = t.objectStore('videos');

    t.oncomplete = () => {
      resolve();
    };

    t.onabort = () => {
      reject(t.error);
    };

    const req = videosStore.get(videoId);
    req.onsuccess = () => {
      const video = req.result;
      video.loopStartId = null;
      video.loopEndId = null;
      videosStore.put(video);
    };
  });
}

type DelBookmarkResult = {
  videoId: Video['videoId'];
  bookmarkId: Bookmark['id'];
};
function deleteBookmark(db: IDBDatabase, bookmarkId: Bookmark['id']) {
  return new Promise<DelBookmarkResult>((resolve, reject) => {
    const t = db.transaction(['bookmarks', 'videos'], 'readwrite');
    const bmStore = t.objectStore('bookmarks');
    const result: DelBookmarkResult = { bookmarkId: '', videoId: '' };

    t.oncomplete = () => {
      resolve(result);
    };

    t.onabort = () => {
      reject(t.error);
    };

    const req = bmStore.get(bookmarkId);
    req.onsuccess = () => {
      const bookmark = req.result;

      if (bookmark) {
        const videoGetReq = t.objectStore('videos').get(bookmark.videoId);

        videoGetReq.onsuccess = () => {
          const video = videoGetReq.result;
          result.bookmarkId = bookmarkId;
          result.videoId = bookmark.videoId;

          if (
            video.loopStartId === bookmarkId ||
            video.loopEndId === bookmarkId
          ) {
            t.objectStore('videos').put({
              ...video,
              loopStartId: null,
              loopEndId: null,
            }).onsuccess = () => {
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

function deleteBookmarksByVideoId(db: IDBDatabase, videoId: Video['videoId']) {
  return new Promise<void>((resolve, reject) => {
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

    cursorReq.onsuccess = () => {
      const cursor = cursorReq.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };

    const req = t.objectStore('videos').get(videoId);
    req.onsuccess = () => {
      const video = req.result;
      t.objectStore('videos').put({
        ...video,
        loopStartId: null,
        loopEndId: null,
      });
    };
  });
}

function deleteVideo(db: IDBDatabase, videoId: Video['videoId']) {
  return new Promise<void>((resolve, reject) => {
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
      const req = bmStore
        .index(BOOKMARKS_BY_VIDEO_ID_IDX)
        .openCursor(IDBKeyRange.only(videoId));
      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor) {
          bmStore.delete(cursor.primaryKey);
          cursor.continue();
        }
      };
    };
  });
}

function resetData(db: IDBDatabase) {
  return new Promise<Video['videoId'][]>((resolve, reject) => {
    const t = db.transaction(['videos', 'bookmarks', 'tags'], 'readwrite');
    const videoIds: Video['videoId'][] = [];

    t.oncomplete = () => {
      resolve(videoIds);
    };

    t.onabort = () => {
      reject(t.error);
    };

    const req = t.objectStore('videos').getAllKeys();
    req.onsuccess = () => {
      videoIds.push(...(req.result as Video['videoId'][]));
      t.objectStore('videos').clear();
      t.objectStore('bookmarks').clear();
      t.objectStore('tags').clear();
    };
  });
}

function importData(db: IDBDatabase, data: Backup) {
  return new Promise<void>((resolve, reject) => {
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
      const req = videoStore.put({
        videoId: video.videoId,
        title: video.title,
        createdAt: video.createdAt,
        loopStartId: null,
        loopEndId: null,
        tagId: video.tagId ?? [],
      } satisfies Video);
      req.onsuccess = () => {
        const videoId = req.result as Video['videoId'];

        for (const bookmark of video.bookmarks) {
          bmStore.put({
            id: bookmark.id,
            videoId,
            time: bookmark.time,
            title: bookmark.title,
            note: bookmark.note,
            color: bookmark.color,
            createdAt: bookmark.createdAt,
          } satisfies Bookmark);
        }
      };
    }

    if (data.tags) {
      for (const tag of data.tags) {
        tagStore.put({
          id: tag.id,
          title: tag.title,
          color: tag.color,
        } satisfies Tag);
      }
    }
  });
}
