export interface CompressionResult {
  dataUrl: string;
  sizeKb: number;
  width: number;
  height: number;
  originalSizeKb: number;
}

export async function compressBannerImage(
  file: File,
  maxWidth = 500,
  maxHeight = 1100,
  quality = 0.85
): Promise<CompressionResult> {
  const originalSizeKb = Math.round(file.size / 1024);

  return new Promise((resolve, reject) => {
    if (file.type === 'image/svg+xml') {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Không thể đọc file SVG'));
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        resolve({
          dataUrl,
          sizeKb: Math.round(dataUrl.length / 1024),
          width: maxWidth,
          height: maxHeight,
          originalSizeKb,
        });
      };
      reader.readAsDataURL(file);
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Không thể đọc file ảnh từ máy tính'));
    reader.onload = (event) => {
      const rawDataUrl = event.target?.result as string;
      if (!rawDataUrl) {
        reject(new Error('Dữ liệu ảnh rỗng'));
        return;
      }

      const img = new Image();
      img.onerror = () => reject(new Error('Định dạng ảnh không được trình duyệt hỗ trợ'));
      img.onload = () => {
        let width = img.naturalWidth || img.width;
        let height = img.naturalHeight || img.height;

        if (width === 0 || height === 0) {
          reject(new Error('Kích thước ảnh không hợp lệ'));
          return;
        }

        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.max(10, Math.round(width * ratio));
          height = Math.max(10, Math.round(height * ratio));
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d', { alpha: false });
        if (!ctx) {
          reject(new Error('Không thể khởi tạo bộ xử lý Canvas'));
          return;
        }

        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
        const approxSizeKb = Math.round((compressedDataUrl.length * 3) / 4 / 1024);

        resolve({
          dataUrl: compressedDataUrl,
          sizeKb: approxSizeKb,
          width,
          height,
          originalSizeKb,
        });
      };

      img.src = rawDataUrl;
    };

    reader.readAsDataURL(file);
  });
}
