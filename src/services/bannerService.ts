import { BannersConfig, SingleBannerConfig } from '../types';
import { db } from '../firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

// Default high-resolution Left Banner graphic (SVG Data URL)
export const DEFAULT_LEFT_BANNER_IMAGE = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 500" width="240" height="500">
  <defs>
    <linearGradient id="bgGradLeft" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1e1022" />
      <stop offset="50%" stop-color="#2d122d" />
      <stop offset="100%" stop-color="#0e0714" />
    </linearGradient>
    <linearGradient id="goldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#fbbf24" />
      <stop offset="50%" stop-color="#f59e0b" />
      <stop offset="100%" stop-color="#d97706" />
    </linearGradient>
    <linearGradient id="roseGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#f43f5e" />
      <stop offset="100%" stop-color="#e11d48" />
    </linearGradient>
  </defs>

  <!-- Background -->
  <rect width="240" height="500" rx="20" fill="url(#bgGradLeft)" />
  <rect x="1.5" y="1.5" width="237" height="497" rx="18.5" fill="none" stroke="#f43f5e" stroke-width="1.5" stroke-opacity="0.3" />

  <!-- Ambient light circles -->
  <circle cx="200" cy="80" r="90" fill="#f43f5e" fill-opacity="0.12" />
  <circle cx="30" cy="420" r="100" fill="#f59e0b" fill-opacity="0.08" />

  <!-- Brand badge -->
  <rect x="20" y="24" width="130" height="22" rx="11" fill="#f43f5e" fill-opacity="0.2" stroke="#f43f5e" stroke-width="1" stroke-opacity="0.5" />
  <text x="85" y="39" fill="#fca5a5" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="9" font-weight="900" text-anchor="middle" letter-spacing="1">PHOTOBOOK VN</text>

  <!-- Discount tag -->
  <rect x="160" y="24" width="60" height="22" rx="11" fill="url(#goldGrad)" />
  <text x="190" y="39" fill="#000000" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="9" font-weight="900" text-anchor="middle">-20%</text>

  <!-- Title -->
  <text x="20" y="82" fill="#ffffff" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="20" font-weight="900">IN ALBUM CƯỚI</text>
  <text x="20" y="106" fill="url(#goldGrad)" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="16" font-weight="800">PHOTOBOOK CAO CẤP</text>

  <!-- Subtitle -->
  <text x="20" y="130" fill="#9ca3af" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="10.5" font-weight="500">Mở phẳng 180° • Chuẩn màu Lab</text>

  <!-- Illustration Card Frame -->
  <g transform="translate(20, 150)">
    <rect width="200" height="190" rx="16" fill="#180b20" stroke="#f43f5e" stroke-width="1" stroke-opacity="0.25" />
    
    <!-- Stylized Album Mockup -->
    <rect x="25" y="28" width="150" height="110" rx="8" fill="#3b1d3d" stroke="#f59e0b" stroke-width="1.2" stroke-opacity="0.4" />
    <path d="M 100 28 L 100 138" stroke="#f59e0b" stroke-width="1.5" stroke-opacity="0.6" stroke-dasharray="2 2" />
    
    <!-- Photo frames inside album -->
    <rect x="35" y="40" width="55" height="75" rx="4" fill="#652b66" />
    <circle cx="62" cy="65" r="14" fill="#fbbf24" fill-opacity="0.4" />
    <path d="M 40 105 Q 62 80 85 105 Z" fill="#f43f5e" fill-opacity="0.5" />
    
    <rect x="110" y="40" width="55" height="75" rx="4" fill="#652b66" />
    <circle cx="137" cy="65" r="14" fill="#f43f5e" fill-opacity="0.4" />
    <path d="M 115 105 Q 137 80 160 105 Z" fill="#fbbf24" fill-opacity="0.5" />

    <text x="100" y="165" fill="#e5e7eb" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="11" font-weight="700" text-anchor="middle">Bìa Da Khắc Tên & Canvas</text>
  </g>

  <!-- Checklist -->
  <g transform="translate(24, 360)">
    <circle cx="8" cy="8" r="6" fill="#10b981" fill-opacity="0.2" />
    <path d="M 5 8 L 7.5 10.5 L 11 6" fill="none" stroke="#10b981" stroke-width="1.5" stroke-linecap="round" />
    <text x="22" y="12" fill="#d1d5db" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="10.5" font-weight="600">Phủ UV chống ẩm mốc 100%</text>

    <circle cx="8" cy="28" r="6" fill="#10b981" fill-opacity="0.2" />
    <path d="M 5 28 L 7.5 30.5 L 11 26" fill="none" stroke="#10b981" stroke-width="1.5" stroke-linecap="round" />
    <text x="22" y="32" fill="#d1d5db" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="10.5" font-weight="600">Giao hỏa tốc toàn quốc</text>
  </g>

  <!-- CTA Button -->
  <g transform="translate(20, 428)">
    <rect width="200" height="44" rx="22" fill="url(#roseGrad)" />
    <text x="100" y="27" fill="#ffffff" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="12" font-weight="800" text-anchor="middle">XEM MẪU ALBUM ➜</text>
  </g>
</svg>
`)}`;

// Default high-resolution Right Banner graphic (SVG Data URL)
export const DEFAULT_RIGHT_BANNER_IMAGE = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 500" width="240" height="500">
  <defs>
    <linearGradient id="bgGradRight" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0a1026" />
      <stop offset="50%" stop-color="#151945" />
      <stop offset="100%" stop-color="#060917" />
    </linearGradient>
    <linearGradient id="purpleGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#6366f1" />
      <stop offset="100%" stop-color="#8b5cf6" />
    </linearGradient>
    <linearGradient id="cyanGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#38bdf8" />
      <stop offset="100%" stop-color="#06b6d4" />
    </linearGradient>
  </defs>

  <!-- Background -->
  <rect width="240" height="500" rx="20" fill="url(#bgGradRight)" />
  <rect x="1.5" y="1.5" width="237" height="497" rx="18.5" fill="none" stroke="#6366f1" stroke-width="1.5" stroke-opacity="0.3" />

  <!-- Ambient light circles -->
  <circle cx="40" cy="70" r="90" fill="#6366f1" fill-opacity="0.15" />
  <circle cx="200" cy="420" r="100" fill="#06b6d4" fill-opacity="0.08" />

  <!-- Brand badge -->
  <rect x="20" y="24" width="115" height="22" rx="11" fill="#6366f1" fill-opacity="0.2" stroke="#6366f1" stroke-width="1" stroke-opacity="0.5" />
  <text x="77" y="39" fill="#a5b4fc" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="9" font-weight="900" text-anchor="middle" letter-spacing="1">SMART PIX VIP</text>

  <!-- Tag -->
  <rect x="145" y="24" width="75" height="22" rx="11" fill="#38bdf8" />
  <text x="182" y="39" fill="#042f2e" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="9" font-weight="900" text-anchor="middle">+10 LƯỢT</text>

  <!-- Title -->
  <text x="20" y="82" fill="#ffffff" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="20" font-weight="900">AI RETOUCH ẢNH</text>
  <text x="20" y="106" fill="url(#cyanGrad)" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="16" font-weight="800">CƯỚI CHUYÊN NGHIỆP</text>

  <!-- Subtitle -->
  <text x="20" y="130" fill="#94a3b8" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="10.5" font-weight="500">Giữ nét thật • Xuất file nét 2K - 4K</text>

  <!-- Illustration Card Frame -->
  <g transform="translate(20, 150)">
    <rect width="200" height="190" rx="16" fill="#0d1433" stroke="#6366f1" stroke-width="1" stroke-opacity="0.25" />
    
    <!-- Retouch Visual: Before / After Split Portrait -->
    <rect x="25" y="24" width="150" height="115" rx="10" fill="#1e293b" />
    
    <!-- Left side: Before -->
    <path d="M 25 34 Q 60 55 100 50 L 100 139 L 25 139 Z" fill="#334155" />
    <circle cx="65" cy="70" r="22" fill="#64748b" />
    <text x="62" y="125" fill="#94a3b8" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="9" font-weight="800" text-anchor="middle">GỐC</text>

    <!-- Center Divider Line -->
    <line x1="100" y1="24" x2="100" y2="139" stroke="#38bdf8" stroke-width="2" />
    <circle cx="100" cy="81" r="9" fill="#38bdf8" />
    <path d="M 97 81 L 103 81 M 100 78 L 100 84" stroke="#000" stroke-width="1.5" />

    <!-- Right side: After AI Magic -->
    <path d="M 100 50 Q 140 55 175 34 L 175 139 L 100 139 Z" fill="#312e81" />
    <circle cx="135" cy="70" r="22" fill="#818cf8" />
    <text x="138" y="125" fill="#38bdf8" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="9" font-weight="800" text-anchor="middle">AI RETOUCH</text>

    <text x="100" y="165" fill="#e2e8f0" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="11" font-weight="700" text-anchor="middle">Chỉnh 1 click chỉ 10 giây</text>
  </g>

  <!-- Checklist -->
  <g transform="translate(24, 360)">
    <circle cx="8" cy="8" r="6" fill="#38bdf8" fill-opacity="0.2" />
    <path d="M 5 8 L 7.5 10.5 L 11 6" fill="none" stroke="#38bdf8" stroke-width="1.5" stroke-linecap="round" />
    <text x="22" y="12" fill="#d1d5db" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="10.5" font-weight="600">Da mịn tự nhiên, xóa chi tiết thừa</text>

    <circle cx="8" cy="28" r="6" fill="#38bdf8" fill-opacity="0.2" />
    <path d="M 5 28 L 7.5 30.5 L 11 26" fill="none" stroke="#38bdf8" stroke-width="1.5" stroke-linecap="round" />
    <text x="22" y="32" fill="#d1d5db" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="10.5" font-weight="600">Hỗ trợ ảnh RAW & JPEG</text>
  </g>

  <!-- CTA Button -->
  <g transform="translate(20, 428)">
    <rect width="200" height="44" rx="22" fill="url(#purpleGrad)" />
    <text x="100" y="27" fill="#ffffff" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="12" font-weight="800" text-anchor="middle">NÂNG CẤP VIP NGAY 👑</text>
  </g>
</svg>
`)}`;

// Default high-resolution VIP Modal Banner 1 graphic (SVG Data URL)
export const DEFAULT_VIP_BANNER_1_IMAGE = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 220" width="400" height="220">
  <defs>
    <linearGradient id="bgVip1" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#180b20" />
      <stop offset="60%" stop-color="#2d1338" />
      <stop offset="100%" stop-color="#120619" />
    </linearGradient>
    <linearGradient id="vipGold" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#fde047" />
      <stop offset="50%" stop-color="#eab308" />
      <stop offset="100%" stop-color="#ca8a04" />
    </linearGradient>
    <linearGradient id="vipRose" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#f43f5e" />
      <stop offset="100%" stop-color="#fb7185" />
    </linearGradient>
  </defs>

  <rect width="400" height="220" rx="18" fill="url(#bgVip1)" />
  <rect x="1.5" y="1.5" width="397" height="217" rx="16.5" fill="none" stroke="#f43f5e" stroke-width="1.5" stroke-opacity="0.35" />

  <!-- Ambient light -->
  <circle cx="360" cy="40" r="80" fill="#f43f5e" fill-opacity="0.15" />
  <circle cx="40" cy="180" r="70" fill="#eab308" fill-opacity="0.1" />

  <!-- Badge 1: Photobook VN -->
  <rect x="20" y="18" width="125" height="22" rx="11" fill="#f43f5e" fill-opacity="0.2" stroke="#f43f5e" stroke-width="1" stroke-opacity="0.5" />
  <text x="82" y="33" fill="#fca5a5" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="9" font-weight="900" text-anchor="middle" letter-spacing="0.8">PHOTOBOOK VIETNAM</text>

  <!-- Badge 2: Ưu đãi -->
  <rect x="155" y="18" width="105" height="22" rx="11" fill="url(#vipGold)" />
  <text x="207" y="33" fill="#000000" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="9.5" font-weight="900" text-anchor="middle">GIẢM 20% ĐƠN ĐẦU</text>

  <!-- Titles -->
  <text x="20" y="72" fill="#ffffff" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="20" font-weight="900">ĐẶT IN ALBUM CƯỚI</text>
  <text x="20" y="96" fill="url(#vipGold)" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="14.5" font-weight="800">TẶNG TÀI KHOẢN VIP TRỌN ĐỜI 👑</text>

  <!-- Subtitle -->
  <text x="20" y="122" fill="#d1d5db" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="11" font-weight="500">Chỉ từ 1 cuốn • Bìa da cao cấp • Mở phẳng 180°</text>

  <!-- Features tag list -->
  <g transform="translate(20, 140)">
    <rect width="360" height="26" rx="6" fill="#ffffff" fill-opacity="0.06" />
    <text x="12" y="17" fill="#fbbf24" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="10.5" font-weight="700">✓ Lọc ảnh máy tính siêu tốc</text>
    <text x="180" y="17" fill="#38bdf8" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="10.5" font-weight="700">✓ Xuất mã file in album 1 chạm</text>
  </g>

  <!-- CTA Button -->
  <g transform="translate(20, 174)">
    <rect width="180" height="32" rx="16" fill="url(#vipRose)" />
    <text x="90" y="20" fill="#ffffff" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="11" font-weight="800" text-anchor="middle">XEM MẪU &amp; BÁO GIÁ ➜</text>
  </g>
</svg>
`)}`;

// Default high-resolution VIP Modal Banner 2 graphic (SVG Data URL)
export const DEFAULT_VIP_BANNER_2_IMAGE = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 220" width="400" height="220">
  <defs>
    <linearGradient id="bgVip2" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0a162b" />
      <stop offset="60%" stop-color="#122547" />
      <stop offset="100%" stop-color="#071020" />
    </linearGradient>
    <linearGradient id="cyanSky" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#38bdf8" />
      <stop offset="50%" stop-color="#0ea5e9" />
      <stop offset="100%" stop-color="#0284c7" />
    </linearGradient>
    <linearGradient id="amberHotline" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#fbbf24" />
      <stop offset="100%" stop-color="#f59e0b" />
    </linearGradient>
  </defs>

  <rect width="400" height="220" rx="18" fill="url(#bgVip2)" />
  <rect x="1.5" y="1.5" width="397" height="217" rx="16.5" fill="none" stroke="#38bdf8" stroke-width="1.5" stroke-opacity="0.35" />

  <!-- Ambient light -->
  <circle cx="360" cy="180" r="90" fill="#0ea5e9" fill-opacity="0.12" />
  <circle cx="40" cy="30" r="80" fill="#6366f1" fill-opacity="0.1" />

  <!-- Badges -->
  <rect x="20" y="18" width="125" height="22" rx="11" fill="#0ea5e9" fill-opacity="0.2" stroke="#0ea5e9" stroke-width="1" stroke-opacity="0.5" />
  <text x="82" y="33" fill="#7dd3fc" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="9" font-weight="900" text-anchor="middle" letter-spacing="0.8">CHUẨN LAB ULTRA-HD</text>

  <rect x="155" y="18" width="135" height="22" rx="11" fill="url(#amberHotline)" />
  <text x="222" y="33" fill="#000000" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="9" font-weight="900" text-anchor="middle">HOTLINE: 0938.023.079</text>

  <!-- Titles -->
  <text x="20" y="72" fill="#ffffff" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="20" font-weight="900">ẢNH CỔNG &amp; KHUNG HÌNH</text>
  <text x="20" y="96" fill="url(#cyanSky)" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="14.5" font-weight="800">PHA LÊ • GỖ HD • CANVAS CAO CẤP</text>

  <!-- Subtitle -->
  <text x="20" y="122" fill="#d1d5db" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="11" font-weight="500">Màu sắc sắc nét chuẩn Studio • Phủ UV bảo vệ chống ẩm mốc</text>

  <!-- Features tag list -->
  <g transform="translate(20, 140)">
    <rect width="360" height="26" rx="6" fill="#ffffff" fill-opacity="0.06" />
    <text x="12" y="17" fill="#34d399" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="10.5" font-weight="700">✓ Duyệt mượt 2000+ file Drive</text>
    <text x="190" y="17" fill="#f472b6" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="10.5" font-weight="700">✓ Tích hợp AI Retouch da mịn</text>
  </g>

  <!-- CTA Button -->
  <g transform="translate(20, 174)">
    <rect width="180" height="32" rx="16" fill="url(#cyanSky)" />
    <text x="90" y="20" fill="#ffffff" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="11" font-weight="800" text-anchor="middle">LIÊN HỆ ĐẶT IN NGAY ➜</text>
  </g>
</svg>
`)}`;

export const DEFAULT_BANNERS_CONFIG: BannersConfig = {
  leftBanner: {
    imageUrl: DEFAULT_LEFT_BANNER_IMAGE,
    linkUrl: 'https://photobook.vn',
    enabled: true,
    width: 260,
    altText: 'Photobook Vietnam - In Album Cưới Cao Cấp',
  },
  rightBanner: {
    imageUrl: DEFAULT_RIGHT_BANNER_IMAGE,
    linkUrl: 'topup',
    enabled: true,
    width: 260,
    altText: 'Smart Pix VIP - AI Retouch Ảnh Cưới Studio',
  },
  vipBanner1: {
    imageUrl: DEFAULT_VIP_BANNER_1_IMAGE,
    linkUrl: 'https://photobook.vn',
    enabled: true,
    altText: 'Đặt in Album Cưới Photobook Vietnam - Giảm 20% đơn đầu tiên',
  },
  vipBanner2: {
    imageUrl: DEFAULT_VIP_BANNER_2_IMAGE,
    linkUrl: 'https://photobook.vn/bang-gia',
    enabled: true,
    altText: 'In Ảnh Cổng Pha Lê & Gỗ HD - Photobook Vietnam',
  },
};

const LOCAL_STORAGE_KEY = 'smartpix_ad_banners_config_v2';

export const fetchBannersConfig = async (): Promise<BannersConfig> => {
  let result: BannersConfig = { ...DEFAULT_BANNERS_CONFIG };

  const mergeConfig = (parsed: any): BannersConfig => {
    return {
      leftBanner: {
        ...DEFAULT_BANNERS_CONFIG.leftBanner,
        ...(parsed?.leftBanner || {}),
        mediaType: parsed?.leftBanner?.mediaType || 'image',
        youtubeUrl: parsed?.leftBanner?.youtubeUrl || '',
        width: typeof parsed?.leftBanner?.width === 'number' ? parsed.leftBanner.width : 260,
        imageUrl: parsed?.leftBanner?.imageUrl || DEFAULT_LEFT_BANNER_IMAGE,
      },
      rightBanner: {
        ...DEFAULT_BANNERS_CONFIG.rightBanner,
        ...(parsed?.rightBanner || {}),
        mediaType: parsed?.rightBanner?.mediaType || 'image',
        youtubeUrl: parsed?.rightBanner?.youtubeUrl || '',
        width: typeof parsed?.rightBanner?.width === 'number' ? parsed.rightBanner.width : 260,
        imageUrl: parsed?.rightBanner?.imageUrl || DEFAULT_RIGHT_BANNER_IMAGE,
      },
      vipBanner1: {
        ...DEFAULT_BANNERS_CONFIG.vipBanner1!,
        ...(parsed?.vipBanner1 || {}),
        mediaType: parsed?.vipBanner1?.mediaType || 'image',
        youtubeUrl: parsed?.vipBanner1?.youtubeUrl || '',
        imageUrl: typeof parsed?.vipBanner1?.imageUrl === 'string' ? parsed.vipBanner1.imageUrl : DEFAULT_VIP_BANNER_1_IMAGE,
        enabled: parsed?.vipBanner1?.enabled !== undefined ? parsed.vipBanner1.enabled : true,
        linkUrl: typeof parsed?.vipBanner1?.linkUrl === 'string' ? parsed.vipBanner1.linkUrl : 'https://photobook.vn',
      },
      vipBanner2: {
        ...DEFAULT_BANNERS_CONFIG.vipBanner2!,
        ...(parsed?.vipBanner2 || {}),
        mediaType: parsed?.vipBanner2?.mediaType || 'image',
        youtubeUrl: parsed?.vipBanner2?.youtubeUrl || '',
        imageUrl: typeof parsed?.vipBanner2?.imageUrl === 'string' ? parsed.vipBanner2.imageUrl : DEFAULT_VIP_BANNER_2_IMAGE,
        enabled: parsed?.vipBanner2?.enabled !== undefined ? parsed.vipBanner2.enabled : true,
        linkUrl: typeof parsed?.vipBanner2?.linkUrl === 'string' ? parsed.vipBanner2.linkUrl : 'https://photobook.vn/bang-gia',
      },
    };
  };

  // 1. Instant local storage read
  try {
    const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed?.leftBanner && parsed?.rightBanner) {
        result = mergeConfig(parsed);
      }
    }
  } catch {}

  // 2. Fetch from Firestore if available
  if (db) {
    try {
      const bannerDoc = await getDoc(doc(db, 'settings', 'ad_banners'));
      if (bannerDoc.exists()) {
        const d = bannerDoc.data();
        if (d?.leftBanner && d?.rightBanner) {
          result = mergeConfig(d);
          localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(result));
          return result;
        }
      }
    } catch (err) {
      console.warn('Could not fetch banners from Firestore:', err);
    }
  }

  // 3. Fallback to server API
  try {
    const res = await fetch('/api/banners');
    if (res.ok) {
      const data = await res.json();
      if (data?.banners?.leftBanner && data?.banners?.rightBanner) {
        result = mergeConfig(data.banners);
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(result));
      }
    }
  } catch {}

  return result;
};

export const saveBannersConfig = async (config: BannersConfig): Promise<boolean> => {
  try {
    const payload = {
      ...config,
      updatedAt: new Date().toISOString(),
    };

    // 1. Save to localStorage safely (catch QuotaExceededError without crashing)
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(payload));
    } catch (storageErr) {
      console.warn('LocalStorage quota exceeded or unavailable:', storageErr);
    }

    // 2. Save to Firestore 'settings/ad_banners'
    let firestoreSaved = false;
    if (db) {
      try {
        await setDoc(doc(db, 'settings', 'ad_banners'), payload, { merge: true });
        firestoreSaved = true;
      } catch (err) {
        console.warn('Could not save banners to Firestore:', err);
      }
    }

    // 3. Save to server backend
    let serverSaved = false;
    try {
      const res = await fetch('/api/admin/banners', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        serverSaved = true;
      }
    } catch (err) {
      console.warn('Could not save banners to server API:', err);
    }

    // Dispatch event to sync banner across components in same window
    try {
      window.dispatchEvent(new CustomEvent('smartpix_banners_updated', { detail: payload }));
    } catch {}

    return firestoreSaved || serverSaved || true;
  } catch (e) {
    console.error('Error saving banners config:', e);
    return false;
  }
};

