const MARK_DEFAULT_COLOR = '#FF7F50';
const videoPagePattern = new URLPattern('https://*.youtube.com/watch?v=:id');

(async () => {
  try {
    const resp = await chrome.runtime.sendMessage({
      action: 'GET_VIDEOS_WITH_BOOKMARKS',
    });
    console.log('bookmarks resp', resp);

    const homeTab = document.getElementById('home');

    if (!resp.list || resp.list.length === 0) {
      showEmptyVideosMessage();
    } else {
      const videoElements = createVideoElements(resp.list);
      homeTab.append(...videoElements);
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
      const tabs = await tabsMatchesVideo(getRes.bookmark.videoId);

      if (tabs) {
        for (const tab of tabs) {
          chrome.tabs.sendMessage(tab.id, {
            action: 'CONTENT/UPDATE_BOOKMARK_COLOR',
            bookmarkId: getRes.bookmark.id,
            color: e.target.value,
          });
        }
      }
    }
  }
});

function createVideoElements(list) {
  const videoElements = new Set();
  const template = document.getElementById('video-template');

  for (const video of list) {
    const $clone = template.content.firstElementChild.cloneNode(true);
    $clone.querySelector('[data-component="video-title"]').textContent =
      video.title;

    if (video.bookmarks.length === 0) {
      $clone.querySelector('[data-component="empty-video-msg"]').style.display =
        'block';
    } else {
      const $bmList = $clone.querySelector('[data-component="bookmarks-list"]');
      $bmList.style.display = 'block';
      const bms = new Set();
      video.bookmarks.forEach((bm, i) => {
        const $bmElement = createBookmarkElement(bm, `#${i + 1}`);
        const $li = document.createElement('li');
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

          if ((await getVideosTotalCount()) === 0) {
            showEmptyVideosMessage();
          }

          const tabs = await tabsMatchesVideo(video.videoId);

          if (tabs) {
            for (const tab of tabs) {
              chrome.tabs.sendMessage(tab.id, {
                action: 'CONTENT/DELETE_ALL_BOOKMARKS',
              });
            }
          }
        }
      });
  }

  return videoElements;
}

function createBookmarkElement(bookmark, defaultTitle) {
  const template = document.getElementById('bookmark-template');
  const $clone = template.content.firstElementChild.cloneNode(true);
  const $colorButton = $clone.querySelector(
    '[data-component="bookmark-color"]'
  );
  $colorButton.style.backgroundColor = bookmark.color;
  $clone.querySelector('[data-component="bookmark-title"]').textContent =
    bookmark.title || defaultTitle;
  $clone.querySelector('[data-component="bookmark-timestamp"]').textContent =
    formatTime(bookmark.time);
  $clone
    .querySelector('[data-component="play-btn"]')
    .addEventListener('click', async () => {
      const activeTab = await activeTabMatchesVideo(bookmark.videoId);

      if (activeTab) {
        chrome.tabs.sendMessage(activeTab.id, {
          action: 'CONTENT/PLAY_VIDEO_AT',
          time: bookmark.time,
        });
        return;
      }

      const tabs = await tabsMatchesVideo(bookmark.videoId);

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
        url: `https://www.youtube.com/watch?v=${bookmark.videoId}&t=${bookmark.time}`,
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
        $clone.parentElement.remove();
        const tabs = await tabsMatchesVideo(bookmark.videoId);

        if (tabs) {
          for (const tab of tabs) {
            chrome.tabs.sendMessage(tab.id, {
              action: 'CONTENT/DELETE_BOOKMARK',
              bookmarkId: bookmark.id,
            });
          }
        }
      }
    });
  $colorButton.addEventListener('click', () => {
    const $colorPickerPopover = document.getElementById(
      'bookmark-color-picker'
    );
    $colorPopoverInvoker = $colorButton;
    currentBookmark = bookmark;
    $colorPickerPopover.togglePopover({ source: $colorButton });
  });

  return $clone;
}

async function getVideosTotalCount() {
  const resp = await chrome.runtime.sendMessage({
    action: 'GET_VIDEOS_TOTAL_COUNT',
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

async function activeTabMatchesVideo(videoId) {
  const [activeTab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });
  const result = videoPagePattern.exec(activeTab.url);

  if (result && result.search.groups.id === videoId) {
    return activeTab;
  }
}

async function tabsMatchesVideo(videoId) {
  const tabs = await chrome.tabs.query({
    url: `https://*.youtube.com/watch?v=${videoId}*`,
  });

  // TODO: always return array
  if (tabs && tabs.length > 0) {
    return tabs;
  }
}

function showEmptyVideosMessage() {
  const homeTab = document.getElementById('home');
  homeTab?.insertAdjacentHTML(
    'beforeend',
    '<p class="empty-bookmarks-msg">No bookmarks yet</p>'
  );
}
