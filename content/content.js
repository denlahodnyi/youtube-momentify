// TODO: fix context loose error (https://stackoverflow.com/questions/53939205/how-to-avoid-extension-context-invalidated-errors-when-messaging-after-an-exte)
console.log('SCRIPT RUNNING');
const BOOKMARK_BTN_ID = 'yt-momentify-bookmark-btn';
const TIMESTAMPS_OUTER_CONTAINER_ID = 'momentify-bar';
const TIMESTAMPS_INNER_CONTAINER_ID = 'momentify-bookmarks-container';
const MARK_DEFAULT_COLOR = '#FF7F50';
let lastUrl = location.href;
let videoId = getVideoIdFromUrl(lastUrl);

initUI();

const observer = new MutationObserver(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    videoId = getVideoIdFromUrl(lastUrl);
    console.log('Observer: urls dont match', lastUrl, location.href);
    initUI();
  }
});

observer.observe(document, { subtree: true, childList: true });

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('content message', message, sender);

  switch (message.action) {
    case 'CONTENT/PLAY_VIDEO_AT': {
      const video = document.body.querySelector('video');
      if (video) {
        video.currentTime = message.time;
        video.play();
      }
      break;
    }
    case 'CONTENT/UPDATE_BOOKMARK_COLOR': {
      const $mark = document.getElementById(
        `momentify-bookmark-${message.bookmarkId}`
      );

      if ($mark) {
        $mark.style.backgroundColor = message.color;
      }
      break;
    }
    case 'CONTENT/DELETE_BOOKMARK': {
      document
        .getElementById(`momentify-bookmark-${message.bookmarkId}`)
        ?.remove();
      break;
    }
    case 'CONTENT/DELETE_ALL_BOOKMARKS': {
      const container = document.getElementById(TIMESTAMPS_INNER_CONTAINER_ID);
      if (container) {
        container.innerHTML = '';
      }
      break;
    }
    default:
      console.warn('Unknown action:', message.action);
  }
});

function initUI() {
  addBookmarkButton();
  addTimestamps();
}

function getVideoIdFromUrl(url) {
  const result = checkVideoPageByUrl(url);
  return result?.videoId;
}

function addBookmarkButton() {
  console.log('ADD BUTTON');
  console.log(`🚀 -> videoId:`, videoId);

  if (videoId && !document.getElementById(BOOKMARK_BTN_ID)) {
    console.log('ADD NEW BUTTON');
    const controls = document.body.querySelector(
      '#movie_player .ytp-right-controls'
    );
    if (controls) {
      controls.insertAdjacentElement('afterbegin', createBookmarkButton());
    } else {
      console.error('No controls container found');
    }
  }
}

function createBookmarkButton() {
  console.log('CREATE BUTTON');
  const $button = document.createElement('button');
  // TODO: catch async errors
  // TODO: add accassibility attrs
  // TODO: add icon
  $button.id = BOOKMARK_BTN_ID;
  $button.className = 'ytp-button';
  // button.style.display = 'flex';
  // button.style.alignItems = 'center';
  // button.style.justifyContent = 'center';
  $button.style.cssText =
    'display: flex; align-items: center; justify-content: center;';
  $button.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-bookmark-icon lucide-bookmark"><path d="M17 3a2 2 0 0 1 2 2v15a1 1 0 0 1-1.496.868l-4.512-2.578a2 2 0 0 0-1.984 0l-4.512 2.578A1 1 0 0 1 5 20V5a2 2 0 0 1 2-2z"/></svg>`;
  $button.addEventListener('click', async () => {
    console.log('button clicked');
    const video = document.body.querySelector('video');
    const title = document.title.split(' - YouTube')[0];

    if (video) {
      const { currentTime, duration } = video;
      const result = await chrome.runtime.sendMessage({
        action: 'CREATE_BOOKMARK',
        time: currentTime,
        videoId,
        title,
      });

      if (result.success) {
        const { id, time, color } = result.item.bookmark;
        document
          .getElementById(TIMESTAMPS_INNER_CONTAINER_ID)
          ?.appendChild(createTimestampMark({ id, time, color }, duration));
      }
    } else {
      console.error('No video element found');
    }
  });
  return $button;
}

async function addTimestamps() {
  if (videoId) {
    const resp = await chrome.runtime.sendMessage({
      action: 'GET_BOOKMARKS_BY_VIDEO_ID',
      videoId,
    });
    console.log(`🚀 -> addTimestamps -> resp:`, resp);

    if (resp.list && resp.list.length > 0) {
      // TODO: sort by time?
      const $video = document.body.querySelector('video');
      console.log(`🚀 -> addTimestamps -> $video:`, $video, $video.duration);
      let duration = $video.duration;

      if ($video) {
        let $bookmarksInnerContainer = document.getElementById(
          TIMESTAMPS_INNER_CONTAINER_ID
        );

        console.log(
          `🚀 -> addTimestamps -> $bookmarksInnerContainer:`,
          $bookmarksInnerContainer
        );
        if ($bookmarksInnerContainer) {
          $bookmarksInnerContainer.innerHTML = '';
        }

        console.log(`🚀 -> addTimestamps -> duration:`, duration);
        if (Number.isNaN(duration)) {
          duration = await new Promise((resolve) => {
            $video.addEventListener('loadedmetadata', () => {
              console.log(
                `🚀 -> addTimestamps -> loadedmetadata -> $video.duration:`,
                $video.duration
              );
              resolve($video.duration);
            });
          });
          console.log(`🚀 -> addTimestamps -> duration:`, duration);
        }

        const $youTubeProgressBar =
          document.body.querySelector('.ytp-progress-bar');

        console.log(
          `🚀 -> addTimestamps -> $youTubeProgressBar:`,
          $youTubeProgressBar
        );
        if ($youTubeProgressBar) {
          // let $bookmarksInnerContainer = document.getElementById(
          //   TIMESTAMPS_INNER_CONTAINER_ID
          // );

          if (!$bookmarksInnerContainer) {
            // $bookmarksInnerContainer.innerHTML = '';
            const $bookmarksOuterContainer = document.createElement('div');
            $bookmarksOuterContainer.id = TIMESTAMPS_OUTER_CONTAINER_ID;
            $bookmarksOuterContainer.style.cssText = `
            position:absolute;
            top:0;
            left:0;
            width:100%;
            height:100%;
            `;
            $bookmarksInnerContainer = document.createElement('div');
            $bookmarksInnerContainer.id = TIMESTAMPS_INNER_CONTAINER_ID;
            $bookmarksInnerContainer.style.cssText = `
              position:relative;
              width:100%;
              height:100%;
            `;
            $bookmarksOuterContainer.appendChild($bookmarksInnerContainer);
            $youTubeProgressBar.appendChild($bookmarksOuterContainer);
          }

          resp.list.forEach((bm) => {
            $bookmarksInnerContainer.appendChild(
              createTimestampMark(bm, duration)
            );
          });
        } else {
          console.error('Cannot find progress bar element');
        }
      } else {
        console.error('Cannot find video element');
      }
    } else {
      const $bookmarksInnerContainer = document.getElementById(
        TIMESTAMPS_INNER_CONTAINER_ID
      );

      console.log(
        `🚀 -> addTimestamps -> $bookmarksInnerContainer:`,
        $bookmarksInnerContainer
      );
      if ($bookmarksInnerContainer) {
        $bookmarksInnerContainer.innerHTML = '';
      }
    }
  }
}

function createTimestampMark(
  { id, time, color = MARK_DEFAULT_COLOR },
  duration
) {
  const $mark = document.createElement('div');
  $mark.id = `momentify-bookmark-${id}`;
  $mark.dataset.time = time;
  $mark.style.cssText = `
            position: absolute;
            top: 50%;
            translate: 0 -50%;
            z-index: 1000;
            width: 4px;
            height: 8px;
            border-radius: 4px;
            background-color: ${color};
          `;
  const percent = Math.floor((time / duration) * 100);
  // const percent =
  //   (bm.time / $bookmarksInnerContainer.clientWidth) * 100;
  // const percent =
  //   ($bookmarksInnerContainer.clientWidth * 100) / bm.time;
  $mark.style.left = `${percent}%`;
  return $mark;
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
