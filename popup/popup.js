const MARK_DEFAULT_COLOR = '#FF7F50';

let currentVideoId;

(async () => {
  try {
    const [activeTab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    const checkResult = checkVideoPageByUrl(activeTab.url);
    currentVideoId = checkResult?.videoId;
    const resp = await chrome.runtime.sendMessage({
      action: 'GET_VIDEOS_WITH_BOOKMARKS',
      topmostVideoId: currentVideoId,
    });
    console.log('bookmarks resp', resp);
    const videosCount = await getVideosTotalCount();

    document.getElementById('videos-count').textContent = videosCount;

    const $videosContainer = document.getElementById('videos-list');

    if (!resp.list || resp.list.length === 0) {
      showEmptyVideosMessage();
    } else {
      const videoElements = await createVideoElements(resp.list);
      $videosContainer.append(...videoElements);
    }
  } catch (error) {
    console.error(error?.message);
  }
})();

const $colorPickerPopover = document.getElementById('bookmark-color-picker');
let currentBookmark;
let currentBookmarkId;
let currentBookmarkColor;
let $colorPopoverInvoker;

$colorPickerPopover.addEventListener('beforetoggle', (e) => {
  if (e.newState === 'open') {
    $colorPickerPopover.querySelectorAll('input').forEach(($input) => {
      $input.checked = false;

      if ($input.value === currentBookmark.color) {
        $input.checked = true;
      }
    });
  }
});

$colorPickerPopover.firstElementChild.addEventListener('change', async (e) => {
  $colorPopoverInvoker.style.backgroundColor = e.target.value;

  const getRes = await chrome.runtime.sendMessage({
    action: 'GET_BOOKMARK',
    bookmarkId: currentBookmark.id,
  });

  if (getRes.bookmark) {
    const result = await chrome.runtime.sendMessage({
      action: 'UPDATE_BOOKMARK',
      bookmark: { ...getRes.bookmark, color: e.target.value },
    });

    if (result.success) {
      currentBookmark.color = e.target.value;
    }
  }
});

const $searchForm = document.getElementById('search');
$searchForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const value = e.target.elements[0].value.trim().toLowerCase();
  const $videoItems = document.querySelectorAll(
    '[data-component="video-container"]',
  );

  $videoItems.forEach(($item) => {
    // TODO: show something if no results found?
    const title = $item
      .querySelector('[data-component="video-title"]')
      .textContent.toLowerCase();

    if (title.includes(value)) {
      $item.style.removeProperty('display');
    } else {
      $item.style.display = 'none';
    }
  });
});

async function createVideoElements(list) {
  const videoElements = new Set();
  const template = document.getElementById('video-template');

  for (const video of list) {
    const $clone = template.content.firstElementChild.cloneNode(true);

    // TODO: think how to make this async
    const bookmarksCount = await getVideoBookmarksCount(video.videoId);
    $clone.querySelector('[data-component="bookmarks-count"]').textContent =
      bookmarksCount;

    if (currentVideoId && video.videoId === currentVideoId) {
      $clone.querySelector('[data-component="video"]').open = true;
    }

    $clone.querySelector('[data-component="thumbnail"]').src =
      getVideoThumbnailUrl(video.videoId);

    $clone.querySelector('[data-component="video-title"]').textContent =
      video.title;

    if (video.bookmarks.length === 0) {
      // TODO: manage empty message using CSS only?
      $clone.querySelector('[data-component="empty-video-msg"]').style.display =
        'block';
    } else {
      const $bmList = $clone.querySelector('[data-component="bookmarks-list"]');
      $bmList.style.display = 'block';
      const bms = new Set();
      video.bookmarks.forEach((bm, i) => {
        const $bmElement = createBookmarkElement(bm);
        const $li = document.createElement('li');
        $li.dataset.createdAt = bm.createdAt;
        $li.dataset.time = bm.time;
        $li.appendChild($bmElement);
        bms.add($li);
      });
      $bmList.append(...bms);
    }

    videoElements.add($clone);

    $clone
      .querySelector('[data-component="delete-video-btn"]')
      .addEventListener('click', async () => {
        const result = await chrome.runtime.sendMessage({
          action: 'DELETE_VIDEO',
          videoId: video.videoId,
        });

        if (result.success) {
          $clone.remove();

          const videosCount = await getVideosTotalCount();
          document.getElementById('videos-count').textContent = videosCount;

          if (videosCount === 0) {
            showEmptyVideosMessage();
          }
        }
      });

    // TODO: hide clear button if there are no bookmarks
    $clone
      .querySelector('[data-component="clear-bookmarks-btn"]')
      .addEventListener('click', async () => {
        const result = await chrome.runtime.sendMessage({
          action: 'DELETE_BOOKMARKS_BY_VIDEO_ID',
          videoId: video.videoId,
        });

        if (result.success) {
          $clone.querySelector('[data-component="bookmarks-list"]').innerHTML =
            '';
          $clone.querySelector(
            '[data-component="bookmarks-count"]',
          ).textContent = 0;
          $clone.querySelector(
            '[data-component="empty-video-msg"]',
          ).style.display = 'block';
        }
      });

    $clone
      .querySelector('[data-component="bookmarks-sorter"]')
      .addEventListener('change', (e) => {
        e.preventDefault();
        console.log('sort by', e.target.value);
        const $bmList = $clone.querySelector(
          '[data-component="bookmarks-list"]',
        );
        const sortedItems = Array.from($bmList.children).sort((a, b) => {
          switch (e.target.value) {
            case 'new': {
              return b.dataset.createdAt - a.dataset.createdAt;
            }
            case 'old': {
              return a.dataset.createdAt - b.dataset.createdAt;
            }
            case 'time_asc': {
              return a.dataset.time - b.dataset.time;
            }
            case 'time_desc': {
              return b.dataset.time - a.dataset.time;
            }
            default:
              return a.dataset.createdAt - b.dataset.createdAt;
          }
        });

        $bmList.innerHTML = '';
        $bmList.append(...sortedItems);
      });
  }

  return videoElements;
}

function createBookmarkElement(bookmark) {
  const template = document.getElementById('bookmark-template');
  const $clone = template.content.firstElementChild.cloneNode(true);

  // $clone.dataset.createdAt = bookmark.createdAt;
  // $clone.dataset.time = bookmark.time;

  $clone.querySelector('[data-component="bookmark-timestamp"]').textContent =
    formatTime(bookmark.time);

  // Buttons
  $clone
    .querySelector('[data-component="play-btn"]')
    .addEventListener('click', async () => {
      const activeTab = await getCurrentVideoActiveTab(bookmark.videoId);
      console.log(`🚀 -> createBookmarkElement -> activeTab:`, activeTab);

      if (activeTab) {
        chrome.tabs.sendMessage(activeTab.id, {
          action: 'CONTENT/PLAY_VIDEO_AT',
          time: bookmark.time,
        });
        return;
      }

      const tabs = await getCurrentVideoTabs(bookmark.videoId);
      console.log(`🚀 -> createBookmarkElement -> tabs:`, tabs);

      if (tabs) {
        const [tab] = tabs;
        chrome.tabs.sendMessage(tab.id, {
          action: 'PLAY_VIDEO_AT',
          time: bookmark.time,
        });
        await chrome.tabs.update(tab.id, { active: true });
        await chrome.windows.update(tab.windowId, { focused: true });

        return;
      }

      // TODO: check this later
      await chrome.tabs.create({
        url: getVideoUrlWithTime(bookmark.videoId, bookmark.time),
        active: true,
      });
    });
  $clone
    .querySelector('[data-component="delete-bm-btn"]')
    .addEventListener('click', async () => {
      // TODO: show some loader?
      const result = await chrome.runtime.sendMessage({
        action: 'DELETE_BOOKMARK',
        bookmarkId: bookmark.id,
      });
      if (result.success) {
        const $parentVideo = $clone.closest('[data-component="video"]');
        $clone.parentElement.remove();

        const bookmarksCount = await getVideoBookmarksCount(bookmark.videoId);
        $parentVideo.querySelector(
          '[data-component="bookmarks-count"]',
        ).textContent = bookmarksCount;
      }
    });
  $clone
    .querySelector('[data-component="copy-bm-btn"]')
    .addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(
          getVideoUrlWithTime(bookmark.videoId, bookmark.time),
        );
      } catch (error) {
        console.error(error);
      }
    });

  // Color picker
  const $colorButton = $clone.querySelector(
    '[data-component="bookmark-color"]',
  );
  $colorButton.style.backgroundColor = bookmark.color;
  $colorButton.addEventListener('click', () => {
    const $colorPickerPopover = document.getElementById(
      'bookmark-color-picker',
    );
    $colorPopoverInvoker = $colorButton;
    currentBookmark = bookmark;
    $colorPickerPopover.togglePopover({ source: $colorButton });
  });

  // Title
  const $title = $clone.querySelector('[data-component="bookmark-title"]');
  const $titleInput = $clone.querySelector(
    '[data-component="bookmark-title-input"]',
  );
  const $titleCharsCount = $title.querySelector(
    '[data-component="bookmark-title-chars-count"]',
  );
  $titleInput.value = bookmark.title;
  $titleCharsCount.textContent = $titleInput.value.length;
  $titleInput.addEventListener('input', (e) => {
    $titleCharsCount.textContent = e.target.value.length;
  });
  $titleInput.addEventListener('change', async (e) => {
    e.target.value = e.target.value.trim();
    const isValid = e.target.checkValidity();

    if (isValid) {
      const result = await chrome.runtime.sendMessage({
        action: 'UPDATE_BOOKMARK',
        bookmark: { ...bookmark, title: e.target.value },
      });

      if (result.success) bookmark.title = e.target.value;
    } else {
      const { valueMissing, tooShort } = e.target.validity;

      if (valueMissing || tooShort) $titleInput.value = bookmark.title;
    }

    $titleCharsCount.textContent = e.target.value.length;
  });

  // Note
  const $noteInput = $clone.querySelector(
    '[data-component="bookmark-note-input"]',
  );
  const $noteCharsCount = $clone.querySelector(
    '[data-component="bookmark-note-chars-count"]',
  );
  $noteInput.value = bookmark.note || '';
  $noteCharsCount.textContent = bookmark.note.length || 0;
  $noteInput.addEventListener('input', (e) => {
    $noteCharsCount.textContent = e.target.value.length;
  });
  $noteInput.addEventListener('change', async (e) => {
    const result = await chrome.runtime.sendMessage({
      action: 'UPDATE_BOOKMARK',
      bookmark: { ...bookmark, note: e.target.value },
    });

    if (result.success) bookmark.note = e.target.value;
  });

  return $clone;
}

async function getVideosTotalCount() {
  const resp = await chrome.runtime.sendMessage({
    action: 'GET_VIDEOS_TOTAL_COUNT',
  });

  return resp.count;
}

async function getVideoBookmarksCount(videoId) {
  const resp = await chrome.runtime.sendMessage({
    action: 'GET_BOOKMARKS_COUNT_BY_VIDEO_ID',
    videoId,
  });

  return resp.count;
}

function formatTime(timeInSec) {
  const seconds = Math.max(0, Math.floor(timeInSec));

  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;

  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  return `${m}:${String(s).padStart(2, '0')}`;
}

function getVideoThumbnailUrl(videoId) {
  return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
}

function getVideoUrlWithTime(videoId, timeInSec) {
  return `https://www.youtube.com/watch?v=${videoId}&t=${timeInSec}s`;
}

function checkVideoPageByUrl(url) {
  const videoPagePattern = new URLPattern({
    baseUrl: 'https://www.youtube.com',
    pathname: '/watch',
  });

  if (videoPagePattern.test(url)) {
    const urlObj = new URL(url);
    const videoId = urlObj.searchParams.get('v');
    const time =
      urlObj.searchParams.get('t') ?? urlObj.searchParams.get('start');

    return { videoId, time };
  }
}

async function getCurrentVideoActiveTab(videoId) {
  const [activeTab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });
  const result = checkVideoPageByUrl(activeTab.url);

  if (result?.videoId === videoId) {
    return activeTab;
  }
}

async function getCurrentVideoTabs(videoId) {
  const tabs = await chrome.tabs.query({
    url: `https://*.youtube.com/watch?v=${videoId}*`,
  });

  // TODO: always return array
  if (tabs && tabs.length > 0) {
    return tabs;
  }
}

function showEmptyVideosMessage() {
  const $videosContainer = document.getElementById('videos-list');
  $videosContainer?.insertAdjacentHTML(
    'beforeend',
    '<p class="empty-bookmarks-msg">No bookmarks yet</p>',
  );
}
