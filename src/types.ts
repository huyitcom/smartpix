export interface DriveFile {
  id: string;
  name: string;
  thumbnailLink?: string;
  webContentLink?: string;
  createdTime?: string;
}

export interface Point {
  x: number; // 0.0 to 1.0 (normalized)
  y: number; // 0.0 to 1.0 (normalized)
}

export interface StrokeAnnotation {
  id: string;
  points: Point[];
  color: string;
  lineWidth: number;
  note: string;
  createdAt: string;
}

export type AlbumAnnotations = Record<string, StrokeAnnotation[]>;
export type AlbumRetouchedImages = Record<string, string>;

export interface LinkCreationRecord {
  id: string;
  folderId: string;
  driveUrl: string;
  shareUrl?: string;
  creatorUid?: string;
  creatorEmail: string;
  creatorName: string;
  creatorPhotoURL?: string | null;
  creatorRole: 'admin' | 'vip' | 'user' | 'guest';
  photoCount?: number;
  createdAt: string;
  lastAccessedAt?: string;
}

export interface SingleBannerConfig {
  imageUrl: string;
  youtubeUrl?: string; // Link video YouTube (watch, shorts, embed, youtu.be)
  mediaType?: 'image' | 'youtube'; // Tùy chọn hiển thị: Ảnh hoặc Video YouTube
  linkUrl: string;
  enabled: boolean;
  altText?: string;
  width?: number; // Bề ngang (px), chiều cao tự động theo tỷ lệ
  updatedAt?: string;
}

export interface BannersConfig {
  leftBanner: SingleBannerConfig;
  rightBanner: SingleBannerConfig;
}

