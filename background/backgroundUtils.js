export function getYoutubeVideoTabPattern(videoId) {
  return `https://*.youtube.com/watch?v=${videoId}*`;
}

export async function getCurrentVideoTabs(videoId, ...ids) {
  const tabs = await chrome.tabs.query({
    url: [
      getYoutubeVideoTabPattern(videoId),
      ...(ids.length ? ids.map(getYoutubeVideoTabPattern) : []),
    ],
  });
  return tabs;
}

export function validateHex(color) {
  return /^#([a-f0-9]{6}|[a-f0-9]{3})$/i.test(color);
}

export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
  }
}

export function validateImportedData(data, latestVersion, constrains = {}) {
  if (!data || typeof data !== 'object') {
    throw new ValidationError('Invalid data format: expected an object');
  }

  if (!data.version || data.version > latestVersion) {
    throw new ValidationError('Unsupported data version');
  }

  if (!data.videos || !Array.isArray(data.videos)) {
    throw new ValidationError(
      'Invalid data format: "videos" field is required and should be an array',
    );
  }

  const bookmarks = [];

  for (const video of data.videos) {
    if (typeof video.videoId !== 'string') {
      throw new ValidationError(
        'Invalid video format: "id" should be a string',
      );
    }
    if (typeof video.title !== 'string') {
      throw new ValidationError(
        'Invalid video format: "title" should be a string',
      );
    }
    if (
      constrains.videoTitle &&
      (video.title.length < constrains.videoTitle.min ||
        video.title.length > constrains.videoTitle.max)
    ) {
      throw new ValidationError(
        `Video title length should be between ${constrains.videoTitle.min} and ${constrains.videoTitle.max} characters`,
      );
    }
    if (typeof video.createdAt !== 'number') {
      throw new ValidationError(
        'Invalid video format: "createdAt" should be a number',
      );
    }
    if (!Array.isArray(video.bookmarks)) {
      throw new ValidationError(
        'Invalid video format: "bookmarks" should be an array',
      );
    }
    bookmarks.push(...video.bookmarks);
  }

  for (const bookmark of bookmarks) {
    if (typeof bookmark.id !== 'string') {
      throw new ValidationError(
        'Invalid bookmark format: "id" should be a string',
      );
    }
    if (typeof bookmark.videoId !== 'string') {
      throw new ValidationError(
        'Invalid bookmark format: "videoId" should be a string',
      );
    }
    if (typeof bookmark.time !== 'number') {
      throw new ValidationError(
        'Invalid bookmark format: "time" should be a number',
      );
    }
    if (typeof bookmark.title !== 'string') {
      throw new ValidationError(
        'Invalid bookmark format: "title" should be a string',
      );
    }
    if (
      constrains.bookmarkTitle &&
      (bookmark.title.length < constrains.bookmarkTitle.min ||
        bookmark.title.length > constrains.bookmarkTitle.max)
    ) {
      throw new ValidationError(
        `Bookmark title length should be between ${constrains.bookmarkTitle.min} and ${constrains.bookmarkTitle.max} characters`,
      );
    }
    if (typeof bookmark.note !== 'string') {
      throw new ValidationError(
        'Invalid bookmark format: "note" should be a string',
      );
    }
    if (
      constrains.bookmarkNote &&
      (bookmark.note.length < constrains.bookmarkNote.min ||
        bookmark.note.length > constrains.bookmarkNote.max)
    ) {
      throw new ValidationError(
        `Bookmark note length should be between ${constrains.bookmarkNote.min} and ${constrains.bookmarkNote.max} characters`,
      );
    }
    if (typeof bookmark.color !== 'string') {
      throw new ValidationError(
        'Invalid bookmark format: "color" should be a string',
      );
    }
    if (!validateHex(bookmark.color)) {
      throw new ValidationError(
        'Invalid bookmark format: "color" should be a valid hex code',
      );
    }
    if (typeof bookmark.createdAt !== 'number') {
      throw new ValidationError(
        'Invalid bookmark format: "createdAt" should be a number',
      );
    }
  }
}
