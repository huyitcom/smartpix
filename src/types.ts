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

