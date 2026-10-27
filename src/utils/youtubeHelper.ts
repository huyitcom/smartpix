/**
 * Helper to extract YouTube video ID and build clean embed URL
 * Supports:
 * - https://www.youtube.com/watch?v=VIDEO_ID
 * - https://youtu.be/VIDEO_ID
 * - https://www.youtube.com/shorts/VIDEO_ID
 * - https://www.youtube.com/embed/VIDEO_ID
 */

export interface YouTubeEmbedInfo {
  embedUrl: string;
  videoId: string;
  isShorts: boolean;
}

export function getYouTubeEmbedInfo(url?: string): YouTubeEmbedInfo | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  let videoId = '';
  const isShorts = trimmed.includes('/shorts/');

  // 1. Shorts: youtube.com/shorts/ID
  const shortsMatch = trimmed.match(/\/shorts\/([a-zA-Z0-9_-]+)/);
  if (shortsMatch && shortsMatch[1]) {
    videoId = shortsMatch[1];
  }

  // 2. youtu.be/ID
  if (!videoId) {
    const youtuMatch = trimmed.match(/youtu\.be\/([a-zA-Z0-9_-]+)/);
    if (youtuMatch && youtuMatch[1]) {
      videoId = youtuMatch[1];
    }
  }

  // 3. youtube.com/watch?v=ID
  if (!videoId) {
    const watchMatch = trimmed.match(/[?&]v=([a-zA-Z0-9_-]+)/);
    if (watchMatch && watchMatch[1]) {
      videoId = watchMatch[1];
    }
  }

  // 4. youtube.com/embed/ID
  if (!videoId) {
    const embedMatch = trimmed.match(/\/embed\/([a-zA-Z0-9_-]+)/);
    if (embedMatch && embedMatch[1]) {
      videoId = embedMatch[1];
    }
  }

  // 5. Fallback: If 11-character video ID is pasted directly
  if (!videoId && /^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    videoId = trimmed;
  }

  if (!videoId) return null;

  return {
    videoId,
    isShorts,
    // Autoplay muted loop for seamless background or banner video display
    embedUrl: `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&mute=1&loop=1&playlist=${videoId}&controls=1&modestbranding=1&rel=0`,
  };
}
