import type { Backup, Video } from '@/api';

const chrome = browser;

export function getYoutubeVideoTabPattern(videoId: Video['videoId']) {
  return `https://*.youtube.com/watch?v=${videoId}*`;
}

export async function getCurrentVideoTabs(
  videoId: Video['videoId'],
  ...ids: Video['videoId'][]
) {
  const tabs = await chrome.tabs.query({
    url: [
      getYoutubeVideoTabPattern(videoId),
      ...(ids.length ? ids.map(getYoutubeVideoTabPattern) : []),
    ],
  });
  return tabs;
}

export function validateHex(color: string) {
  return /^#([a-f0-9]{6}|[a-f0-9]{3})$/i.test(color);
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export function validateTag(
  fields: { title: string; color?: string | null },
  constrains: {
    tagTitle?: { required: boolean; min: number; max: number };
    tagColor?: { required: boolean };
  } = {},
) {
  const { title, color } = fields;

  if (constrains.tagTitle?.required && !title) {
    throw new ValidationError('Tag title is required');
  }
  if (
    typeof title === 'string' &&
    constrains.tagTitle &&
    (title.length < constrains.tagTitle.min ||
      title.length > constrains.tagTitle.max)
  ) {
    throw new ValidationError(
      `Tag title must be between ${constrains.tagTitle.min} and ${constrains.tagTitle.max} characters`,
    );
  }

  if (constrains.tagColor?.required && !color) {
    throw new ValidationError('Tag color is required');
  }
  if (typeof color === 'string' && !validateHex(color)) {
    throw new ValidationError('Tag color must be a valid hex code');
  }
}

export function validateBookmark(
  fields: {
    title?: string | null;
    color?: string | null;
    note?: string | null;
  },
  constrains: {
    bookmarkTitle?: { required: boolean; min: number; max: number };
    bookmarkNote?: { required: boolean; min: number; max: number };
    bookmarkColor?: { required: boolean };
  } = {},
) {
  const { title, color, note = '' } = fields;

  if (constrains.bookmarkTitle?.required && !title) {
    throw new ValidationError('Bookmark title is required');
  }
  if (
    typeof title === 'string' &&
    constrains.bookmarkTitle &&
    (title.length < constrains.bookmarkTitle.min ||
      title.length > constrains.bookmarkTitle.max)
  ) {
    throw new ValidationError(
      `Bookmark title must be between ${constrains.bookmarkTitle.min} and ${constrains.bookmarkTitle.max} characters`,
    );
  }

  if (constrains.bookmarkNote?.required && !note) {
    throw new ValidationError('Bookmark title is required');
  }
  if (
    typeof note === 'string' &&
    constrains.bookmarkNote &&
    (note.length < constrains.bookmarkNote.min ||
      note.length > constrains.bookmarkNote.max)
  ) {
    throw new ValidationError(
      `Bookmark note must be between ${constrains.bookmarkNote.min} and ${constrains.bookmarkNote.max} characters`,
    );
  }

  if (constrains.bookmarkColor?.required && !color) {
    throw new ValidationError('Bookmark color is required');
  }
  if (typeof color === 'string' && !validateHex(color)) {
    throw new ValidationError('Bookmark color must be a valid hex code');
  }
}

export function validateImportedData(
  data: Backup,
  latestVersion: number,
  constrains: {
    videoTitle?: { min: number; max: number };
    bookmarkTitle?: { min: number; max: number };
    bookmarkNote?: { min: number; max: number };
    tagTitle?: { min: number; max: number };
  } = {},
) {
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
    if (video.tagId && !Array.isArray(video.tagId)) {
      throw new ValidationError(
        'Invalid video format: "tagId" should be an array',
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

  if (data.tags) {
    if (!Array.isArray(data.tags)) {
      throw new ValidationError(
        'Invalid data format: "tags field should be an array',
      );
    }
    for (const tag of data.tags) {
      if (typeof tag.id !== 'string') {
        throw new ValidationError(
          'Invalid tag format: "id" should be a string',
        );
      }
      if (
        constrains.tagTitle &&
        (tag.title.length < constrains.tagTitle.min ||
          tag.title.length > constrains.tagTitle.max)
      ) {
        throw new ValidationError(
          `Tag title length should be between ${constrains.tagTitle.min} and ${constrains.tagTitle.max} characters`,
        );
      }
      if (tag.color && typeof tag.color !== 'string') {
        throw new ValidationError(
          'Invalid tag format: "color" should be a string',
        );
      }
      if (tag.color && !validateHex(tag.color)) {
        throw new ValidationError(
          'Invalid tag format: "color" should be a valid hex code',
        );
      }
    }
  }
}
