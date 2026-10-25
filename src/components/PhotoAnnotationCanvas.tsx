import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  PenTool, 
  Trash2, 
  Check, 
  X, 
  Download, 
  FileText, 
  MessageSquare, 
  Sparkles,
  Edit2,
  Crown,
  ArrowLeftRight,
  Eye,
  RefreshCw,
  AlertCircle,
  SlidersHorizontal,
  Wand2,
  CheckCircle2,
  Loader2,
  ShieldCheck,
  ShieldAlert
} from 'lucide-react';
import type { DriveFile, StrokeAnnotation, Point } from '../types';
import { type UserProfile, updateFirestoreUser } from '../firebase';

interface PhotoAnnotationCanvasProps {
  file: DriveFile;
  imageUrl: string;
  retouchedImageUrl?: string;
  onSaveRetouchedImage?: (url: string) => void;
  annotations: StrokeAnnotation[];
  onSaveAnnotations: (newAnnotations: StrokeAnnotation[]) => void;
  isDrawingMode: boolean;
  setIsDrawingMode: (active: boolean) => void;
  userProfile?: UserProfile | null;
  onUpdateUserProfile?: (profile: UserProfile) => void;
  onOpenVIPModal?: () => void;
  onOpenTopupModal?: () => void;
  folderId?: string;
}

const PRESET_QUICK_NOTES = [
  'Chấm mụn & làm mịn da',
  'Bóp gọn eo / dáng',
  'Xóa người / vật thể thừa',
  'Chỉnh sáng vùng này',
  'Khử bóng nhờn / nếp nhăn',
  'Chỉnh màu váy / tóc',
  'Làm mờ phông nền'
];

export default function PhotoAnnotationCanvas({
  file,
  imageUrl,
  retouchedImageUrl,
  onSaveRetouchedImage,
  annotations,
  onSaveAnnotations,
  isDrawingMode,
  setIsDrawingMode,
  userProfile,
  onUpdateUserProfile,
  onOpenVIPModal,
  onOpenTopupModal,
  folderId,
}: PhotoAnnotationCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // VIP & Credit State: New users get 3 free credits; any user with credits > 0 or VIP/Admin can run AI Retouch
  const [demoVipActive, setDemoVipActive] = useState<boolean>(() => {
    return localStorage.getItem('photobook_demo_vip_pass') === 'true';
  });
  const currentCredits = typeof userProfile?.credits === 'number' ? userProfile.credits : 3;
  const isVipUser =
    userProfile?.role === 'vip' ||
    userProfile?.role === 'admin' ||
    currentCredits > 0 ||
    demoVipActive;

  // Display Mode: Toggle between base photo and AI-retouched photo directly on canvas
  const [displayMode, setDisplayMode] = useState<'original' | 'retouched'>(() => {
    return retouchedImageUrl ? 'retouched' : 'original';
  });

  // Keep displayMode updated if retouchedImageUrl changes externally
  useEffect(() => {
    if (retouchedImageUrl) {
      setDisplayMode('retouched');
    }
  }, [retouchedImageUrl]);

  // AI Retouching states
  const [isRetouching, setIsRetouching] = useState(false);
  const [retouchStep, setRetouchStep] = useState<number>(0);
  const [retouchError, setRetouchError] = useState<string | null>(null);

  // Comparison & VIP Dialogs
  const [showCompareModal, setShowCompareModal] = useState(false);
  const [compareSlider, setCompareSlider] = useState<number>(50);
  const [compareViewType, setCompareViewType] = useState<'split' | 'side-by-side'>('split');
  const [showVipPromptModal, setShowVipPromptModal] = useState(false);
  const [showResolutionModal, setShowResolutionModal] = useState(false);
  const [selectedResolution, setSelectedResolution] = useState<'1K' | '2K' | '4K'>('2K');
  const [faceLockEnabled, setFaceLockEnabled] = useState<boolean>(true);
  const [rawAIRetouchedUrl, setRawAIRetouchedUrl] = useState<string | null>(null);
  const [faceProtectedUrl, setFaceProtectedUrl] = useState<string | null>(null);
  const [customAIRetouchPrompt, setCustomAIRetouchPrompt] = useState('');
  const retouchAbortRef = useRef<AbortController | null>(null);

  // Drawing state
  const isDrawingRef = useRef(false);
  const currentStrokeRef = useRef<Point[]>([]);
  const [strokeWidth, setStrokeWidth] = useState<number>(5);
  const [hoveredAnnotationId, setHoveredAnnotationId] = useState<string | null>(null);

  // Pending stroke awaiting note input
  const [pendingStroke, setPendingStroke] = useState<Point[] | null>(null);
  const [noteText, setNoteText] = useState('');
  const [editingAnnotationId, setEditingAnnotationId] = useState<string | null>(null);
  const [editingNoteText, setEditingNoteText] = useState('');

  // Image load state
  const [imageLoaded, setImageLoaded] = useState(false);

  // Export state
  const [isExporting, setIsExporting] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 2800);
  };

  // Helper to convert photo URL into high quality base64 data for AI input
  const getCleanBase64 = async (srcUrl: string, maxDim = 2048): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const offCanvas = document.createElement('canvas');
          let w = img.naturalWidth || 1600;
          let h = img.naturalHeight || 1200;
          if (w > maxDim || h > maxDim) {
            if (w > h) {
              h = Math.round((h * maxDim) / w);
              w = maxDim;
            } else {
              w = Math.round((w * maxDim) / h);
              h = maxDim;
            }
          }
          offCanvas.width = w;
          offCanvas.height = h;
          const ctx = offCanvas.getContext('2d');
          if (!ctx) return reject(new Error('Canvas context failure'));
          ctx.drawImage(img, 0, 0, w, h);
          let quality = maxDim >= 4096 ? 0.92 : 0.90;
          let dataUrl = offCanvas.toDataURL('image/jpeg', quality);
          // Keep payload safely under Vercel Serverless Function's 4.5MB body limit (~3.5MB base64 max)
          while (dataUrl.length > 3500000 && quality > 0.65) {
            quality -= 0.08;
            dataUrl = offCanvas.toDataURL('image/jpeg', quality);
          }
          resolve(dataUrl);
        } catch (e) {
          reject(e);
        }
      };
      img.onerror = () => reject(new Error('Lỗi nạp ảnh để xử lý AI'));
      img.src = srcUrl;
    });
  };

  // Helper to blend AI-retouched image seamlessly into the original photo,
  // strictly preserving 100% of unselected areas (especially human faces, smiles, eyes)
  const blendSmartFaceProtection = async (
    origUrl: string,
    aiUrl: string,
    annos: StrokeAnnotation[]
  ): Promise<string> => {
    return new Promise((resolve) => {
      let isSettled = false;
      const safeResolve = (result: string) => {
        if (!isSettled) {
          isSettled = true;
          clearTimeout(timeoutTimer);
          resolve(result);
        }
      };

      // 6-second safety fallback: NEVER let the UI hang or spin indefinitely
      const timeoutTimer = setTimeout(() => {
        console.warn('blendSmartFaceProtection timed out (6s), falling back to raw AI output');
        safeResolve(aiUrl);
      }, 6000);

      const origImg = new Image();
      const aiImg = new Image();
      origImg.crossOrigin = 'anonymous';
      aiImg.crossOrigin = 'anonymous';

      let loadedCount = 0;
      const onLoad = () => {
        loadedCount++;
        if (loadedCount < 2) return;

        try {
          const w = origImg.naturalWidth || origImg.width;
          const h = origImg.naturalHeight || origImg.height;
          if (!w || !h) {
            safeResolve(aiUrl);
            return;
          }

          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            safeResolve(aiUrl);
            return;
          }

          // 1. Draw base original photo: every single unselected pixel is 100% genuine camera quality
          ctx.drawImage(origImg, 0, 0, w, h);

          // 2. Create offscreen soft feathered mask for the edited/circled regions
          const maskCanvas = document.createElement('canvas');
          maskCanvas.width = w;
          maskCanvas.height = h;
          const maskCtx = maskCanvas.getContext('2d');
          if (!maskCtx) {
            safeResolve(aiUrl);
            return;
          }

          maskCtx.fillStyle = '#FFFFFF';
          maskCtx.strokeStyle = '#FFFFFF';
          maskCtx.lineCap = 'round';
          maskCtx.lineJoin = 'round';

          annos.forEach((anno) => {
            if (!anno.points || anno.points.length === 0) return;
            const xs = anno.points.map((p) => p.x * w);
            const ys = anno.points.map((p) => p.y * h);
            const minX = Math.min(...xs);
            const maxX = Math.max(...xs);
            const minY = Math.min(...ys);
            const maxY = Math.max(...ys);
            const boxW = Math.max(maxX - minX, 40);
            const boxH = Math.max(maxY - minY, 40);

            // Dynamic padding based on size of annotated region
            const padX = Math.min(Math.max(boxW * 0.15, 25), 90);
            const padY = Math.min(Math.max(boxH * 0.15, 25), 90);

            const rx = Math.max(0, minX - padX);
            const ry = Math.max(0, minY - padY);
            const rw = Math.min(w - rx, boxW + padX * 2);
            const rh = Math.min(h - ry, boxH + padY * 2);

            // Draw soft rounded rectangle covering the target edited area
            maskCtx.beginPath();
            if (typeof maskCtx.roundRect === 'function') {
              maskCtx.roundRect(rx, ry, rw, rh, Math.min(padX, 35));
            } else {
              maskCtx.rect(rx, ry, rw, rh);
            }
            maskCtx.fill();

            // Also draw thick stroke along the user's path to guarantee continuous coverage
            if (anno.points.length > 1) {
              maskCtx.lineWidth = Math.max((anno.lineWidth || 5) * (w / 1000) * 3, 50);
              maskCtx.beginPath();
              anno.points.forEach((pt, i) => {
                const px = pt.x * w;
                const py = pt.y * h;
                if (i === 0) maskCtx.moveTo(px, py);
                else maskCtx.lineTo(px, py);
              });
              maskCtx.stroke();
            }
          });

          // 3. Create offscreen canvas for the AI edited content masked with feathered mask
          const aiMaskedCanvas = document.createElement('canvas');
          aiMaskedCanvas.width = w;
          aiMaskedCanvas.height = h;
          const aiMaskedCtx = aiMaskedCanvas.getContext('2d');
          if (!aiMaskedCtx) {
            safeResolve(aiUrl);
            return;
          }

          // Draw AI image scaled to full canvas size
          aiMaskedCtx.drawImage(aiImg, 0, 0, w, h);

          // Apply soft blur to mask for invisible seamless gradient blending
          const blurCanvas = document.createElement('canvas');
          blurCanvas.width = w;
          blurCanvas.height = h;
          const blurCtx = blurCanvas.getContext('2d');
          if (blurCtx) {
            blurCtx.filter = 'blur(16px)';
            blurCtx.drawImage(maskCanvas, 0, 0);
            aiMaskedCtx.globalCompositeOperation = 'destination-in';
            aiMaskedCtx.drawImage(blurCanvas, 0, 0);
          } else {
            aiMaskedCtx.globalCompositeOperation = 'destination-in';
            aiMaskedCtx.drawImage(maskCanvas, 0, 0);
          }

          // 4. Composite feathered AI edit on top of original camera photo
          ctx.drawImage(aiMaskedCanvas, 0, 0);

          try {
            canvas.toBlob(
              (b) => {
                if (b && b.size > 20000) {
                  const reader = new FileReader();
                  reader.onloadend = () => {
                    safeResolve((reader.result as string) || aiUrl);
                  };
                  reader.onerror = () => safeResolve(aiUrl);
                  reader.readAsDataURL(b);
                } else {
                  safeResolve(aiUrl);
                }
              },
              'image/jpeg',
              0.98
            );
          } catch (blobErr) {
            console.warn('canvas.toBlob failed, using aiUrl:', blobErr);
            safeResolve(aiUrl);
          }
        } catch (err) {
          console.warn('blendSmartFaceProtection error:', err);
          safeResolve(aiUrl);
        }
      };

      origImg.onload = onLoad;
      aiImg.onload = onLoad;
      origImg.onerror = () => {
        console.warn('origImg failed to load in blendSmartFaceProtection');
        safeResolve(aiUrl);
      };
      aiImg.onerror = () => {
        console.warn('aiImg failed to load in blendSmartFaceProtection');
        safeResolve(aiUrl);
      };

      // Ensure origUrl doesn't fail canvas CORS by proxying remote http(s) URLs
      if (origUrl.startsWith('http://') || origUrl.startsWith('https://')) {
        origImg.src = `/api/proxy-image?url=${encodeURIComponent(origUrl)}`;
      } else {
        origImg.src = origUrl;
      }
      aiImg.src = aiUrl;
    });
  };

  // Open Resolution Picker Dialog before running AI Retouch
  const handleOpenAIRetouchFlow = () => {
    if (annotations.length === 0) {
      showToast("Vui lòng khoanh vùng và thêm ít nhất 1 ghi chú trước khi sửa ảnh!");
      return;
    }

    if (!isVipUser) {
      setShowVipPromptModal(true);
      return;
    }

    setShowResolutionModal(true);
  };

  // Cancel currently running AI retouch process
  const handleCancelAIRetouch = () => {
    if (retouchAbortRef.current) {
      try {
        retouchAbortRef.current.abort();
      } catch {
        // ignore
      }
      retouchAbortRef.current = null;
    }
    setIsRetouching(false);
    showToast('Đã dừng tiến trình xử lý AI.');
  };

  // Run AI Retouch process with chosen resolution (1K, 2K, or 4K)
  const handleRunAIRetouch = async (
    customInstruction?: string,
    resolutionOverride?: '1K' | '2K' | '4K'
  ) => {
    if (annotations.length === 0) {
      showToast("Vui lòng khoanh vùng và thêm ít nhất 1 ghi chú trước khi sửa ảnh!");
      return;
    }

    if (!isVipUser) {
      setShowVipPromptModal(true);
      return;
    }

    const activeResolution = resolutionOverride || selectedResolution;
    const requiredCredits = activeResolution === '4K' ? 3 : activeResolution === '2K' ? 2 : 1;

    if (currentCredits < requiredCredits) {
      setShowResolutionModal(false);
      showToast(
        `⚠️ Số dư không đủ (${currentCredits} lượt, độ phân giải ${activeResolution} cần ${requiredCredits} lượt). Vui lòng nạp thêm lượt!`
      );
      if (onOpenTopupModal) {
        onOpenTopupModal();
      }
      return;
    }

    const targetMaxDim = activeResolution === '4K' ? 4096 : activeResolution === '2K' ? 2048 : 1280;
    const sourceUrlForRes =
      activeResolution === '4K' && imageUrl.includes('=s2048')
        ? imageUrl.replace('=s2048', '=s4096')
        : imageUrl;

    setShowResolutionModal(false);
    setIsRetouching(true);
    setRetouchStep(1);
    setRetouchError(null);

    const abortController = new AbortController();
    retouchAbortRef.current = abortController;

    // 75-second network timeout safeguard
    const timeoutId = setTimeout(() => {
      if (retouchAbortRef.current === abortController) {
        abortController.abort();
      }
    }, 75000);

    try {
      // Step 1: Analyze notes
      await new Promise(r => setTimeout(r, 600));
      setRetouchStep(2);

      // Step 2: Prepare image base64 at appropriate resolution
      let base64Image = '';
      try {
        base64Image = await getCleanBase64(sourceUrlForRes, targetMaxDim);
      } catch {
        try {
          base64Image = await getCleanBase64(imageUrl, targetMaxDim);
        } catch {
          // Fallback via server image proxy to guarantee no CORS issues
          const proxyUrl = `/api/proxy-image?url=${encodeURIComponent(sourceUrlForRes)}`;
          base64Image = await getCleanBase64(proxyUrl, targetMaxDim);
        }
      }

      setRetouchStep(3);

      // Step 3: Call server AI retouch endpoint with AbortSignal
      const response = await fetch('/api/ai/retouch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: abortController.signal,
        body: JSON.stringify({
          folderId: folderId || '',
          fileId: file.id,
          imageBase64: base64Image,
          annotations: annotations,
          customPrompt: customInstruction || customAIRetouchPrompt,
          resolution: activeResolution,
        }),
      });

      const rawText = await response.text();
      let data: any = null;
      try {
        data = JSON.parse(rawText);
      } catch {
        if (response.status === 404 || rawText.includes('Cannot POST /api/ai/retouch')) {
          throw new Error(
            'Endpoint /api/ai/retouch chưa có trên bản build Vercel hiện tại. Vui lòng đồng bộ/push code mới nhất (bao gồm file api/index.ts và vercel.json) lên GitHub/Vercel và bấm Redeploy.'
          );
        }
        if (response.status === 413 || rawText.includes('Request Entity Too Large') || rawText.includes('FUNCTION_PAYLOAD_TOO_LARGE')) {
          throw new Error(
            'Dung lượng ảnh gửi lên vượt giới hạn 4.5MB của Vercel Serverless. Hãy chọn độ phân giải 1K hoặc 2K và thử lại.'
          );
        }
        if (response.status === 504 || rawText.includes('GATEWAY_TIMEOUT') || rawText.includes('FUNCTION_INVOCATION_TIMEOUT')) {
          throw new Error(
            'Thời gian xử lý AI vượt quá giới hạn phản hồi của Vercel. Hãy thử chọn độ phân giải 1K/2K hoặc cập nhật vercel.json (maxDuration: 60).'
          );
        }
        throw new Error(
          `Máy chủ trả về phản hồi không đúng định dạng JSON (HTTP ${response.status}). Vui lòng đẩy code mới nhất lên Vercel và Redeploy.`
        );
      }

      if (!response.ok || !data?.success) {
        throw new Error(data?.error || 'Lỗi khi gọi AI xử lý ảnh.');
      }

      setRetouchStep(4);
      await new Promise(r => setTimeout(r, 400));

      if (data.retouchedImageUrl) {
        setRawAIRetouchedUrl(data.retouchedImageUrl);
        let finalOutputUrl = data.retouchedImageUrl;

        if (faceLockEnabled && annotations.length > 0) {
          try {
            showToast('Đang hoàn thiện và đồng bộ khuôn mặt gốc...');
            finalOutputUrl = await blendSmartFaceProtection(imageUrl, data.retouchedImageUrl, annotations);
            setFaceProtectedUrl(finalOutputUrl);
          } catch (blendErr) {
            console.warn('Face protection blend error, using raw AI image:', blendErr);
          }
        }

        onSaveRetouchedImage?.(finalOutputUrl);
        setDisplayMode('retouched');
        setShowCompareModal(true);

        // Deduct credits after successful AI render (1K = 1, 2K = 2, 4K = 3)
        if (userProfile?.uid) {
          try {
            const consumeRes = await fetch('/api/credits/consume', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                uid: userProfile.uid,
                email: userProfile.email,
                displayName: userProfile.displayName,
                resolution: activeResolution,
                fileId: file.id,
                fileName: file.name,
                folderId: folderId || '',
                notesCount: annotations.length,
              }),
            });
            const consumeData = await consumeRes.json();
            if (consumeRes.ok && consumeData?.user) {
              await updateFirestoreUser(userProfile.uid, {
                credits: consumeData.credits,
                renderCount: consumeData.renderCount,
              });
              if (onUpdateUserProfile) {
                onUpdateUserProfile({
                  ...userProfile,
                  ...consumeData.user,
                  credits: consumeData.credits,
                  renderCount: consumeData.renderCount,
                });
              }
            }
          } catch (consumeErr) {
            console.warn('Credit consume sync warning:', consumeErr);
          }
        }

        showToast(faceLockEnabled
          ? `✨ AI đã xóa/sửa hoàn tất (-${requiredCredits} lượt) và bảo toàn 100% khuôn mặt gốc (${activeResolution})!`
          : `✨ AI đã chỉnh sửa hoàn tất ở độ phân giải ${activeResolution} (-${requiredCredits} lượt)!`);
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.log('AI retouch cancelled by user or timeout');
        showToast('Tiến trình xử lý AI đã dừng.');
        return;
      }
      console.error("AI Retouch error:", err);
      setRetouchError(err.message || 'Đã xảy ra sự cố khi gọi AI xử lý ảnh.');
    } finally {
      clearTimeout(timeoutId);
      retouchAbortRef.current = null;
      setIsRetouching(false);
    }
  };

  // Helper to draw a single stroke onto canvas context
  const drawStrokePath = (
    ctx: CanvasRenderingContext2D,
    points: Point[],
    canvasW: number,
    canvasH: number,
    color: string,
    width: number,
    isPending = false
  ) => {
    if (!points || points.length === 0) return;

    const dpr = window.devicePixelRatio || 1;
    const baseWidth = Math.max(2, width * dpr);

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // 1. Outer dark halo for high contrast on light or textured backgrounds
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.75)';
    ctx.lineWidth = baseWidth + 3.5 * dpr;
    if (isPending) {
      ctx.setLineDash([8 * dpr, 6 * dpr]);
    } else {
      ctx.setLineDash([]);
    }

    if (points.length === 1) {
      const px = points[0].x * canvasW;
      const py = points[0].y * canvasH;
      ctx.beginPath();
      ctx.arc(px, py, (baseWidth + 3.5 * dpr) / 2, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
      ctx.fill();
    } else {
      ctx.beginPath();
      points.forEach((pt, idx) => {
        const px = pt.x * canvasW;
        const py = pt.y * canvasH;
        if (idx === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.stroke();
    }

    // 2. Primary vivid foreground stroke
    ctx.strokeStyle = color;
    ctx.lineWidth = baseWidth;

    if (points.length === 1) {
      const px = points[0].x * canvasW;
      const py = points[0].y * canvasH;
      ctx.beginPath();
      ctx.arc(px, py, baseWidth / 2, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    } else {
      ctx.beginPath();
      points.forEach((pt, idx) => {
        const px = pt.x * canvasW;
        const py = pt.y * canvasH;
        if (idx === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.stroke();
    }

    ctx.restore();
  };

  // Redraw all annotations and current/pending strokes on the canvas
  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear entire canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 1. Draw saved annotations
    annotations.forEach((anno) => {
      const isHovered = hoveredAnnotationId === anno.id;
      const strokeColor = isHovered ? '#fbbf24' : (anno.color || '#ef4444');
      const strokeW = (anno.lineWidth || 5) * (isHovered ? 1.3 : 1);
      drawStrokePath(ctx, anno.points, canvas.width, canvas.height, strokeColor, strokeW, false);
    });

    // 2. Draw pending stroke awaiting note input
    if (pendingStroke && pendingStroke.length > 0) {
      drawStrokePath(ctx, pendingStroke, canvas.width, canvas.height, '#ef4444', strokeWidth, true);
    }

    // 3. Draw live active stroke currently being drawn by user
    if (currentStrokeRef.current && currentStrokeRef.current.length > 0) {
      drawStrokePath(ctx, currentStrokeRef.current, canvas.width, canvas.height, '#ef4444', strokeWidth, false);
    }
  }, [annotations, hoveredAnnotationId, pendingStroke, strokeWidth]);

  // Synchronize canvas dimensions to match the rendered image exactly
  const syncCanvasSize = useCallback(() => {
    const img = imageRef.current;
    const canvas = canvasRef.current;
    if (!img || !canvas) return;

    const rect = img.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const dpr = window.devicePixelRatio || 1;
    const targetW = Math.round(rect.width * dpr);
    const targetH = Math.round(rect.height * dpr);

    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }

    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;

    redrawCanvas();
  }, [redrawCanvas]);

  // Sync canvas size on mount, resize, image load, and redraw whenever dependencies change
  useEffect(() => {
    syncCanvasSize();
    const handleResize = () => syncCanvasSize();
    window.addEventListener('resize', handleResize);

    let ro: ResizeObserver | null = null;
    if (imageRef.current && typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => syncCanvasSize());
      ro.observe(imageRef.current);
    }

    return () => {
      window.removeEventListener('resize', handleResize);
      if (ro) ro.disconnect();
    };
  }, [syncCanvasSize, imageLoaded]);

  // Redraw whenever annotations, hovered state, or pending stroke changes
  useEffect(() => {
    redrawCanvas();
  }, [redrawCanvas]);

  // Helper to extract normalized point [0, 1] relative to the canvas
  const getNormalizedPoint = (e: React.PointerEvent<HTMLCanvasElement>): Point | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;

    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;

    return {
      x: Math.max(0, Math.min(1, x)),
      y: Math.max(0, Math.min(1, y)),
    };
  };

  // Pointer down: initiate stroke
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingMode || pendingStroke) return;
    e.preventDefault();

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }

    const point = getNormalizedPoint(e);
    if (!point) return;

    isDrawingRef.current = true;
    currentStrokeRef.current = [point];
    redrawCanvas();
  };

  // Pointer move: record coordinates and render in real time
  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current || !isDrawingMode) return;
    e.preventDefault();

    const point = getNormalizedPoint(e);
    if (!point) return;

    const stroke = currentStrokeRef.current;
    const last = stroke[stroke.length - 1];
    if (last) {
      const dx = point.x - last.x;
      const dy = point.y - last.y;
      // Filter points that are too close to reduce noise
      if (Math.hypot(dx, dy) < 0.002) return;
    }

    stroke.push(point);
    redrawCanvas();
  };

  // Pointer up: finalize stroke and prompt for note
  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    e.preventDefault();

    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // ignore
    }

    isDrawingRef.current = false;
    const stroke = [...currentStrokeRef.current];
    currentStrokeRef.current = [];

    if (stroke.length >= 2) {
      setPendingStroke(stroke);
      setNoteText('');
    } else if (stroke.length === 1) {
      // Single tap creates a clean circular callout loop
      const center = stroke[0];
      const r = 0.035;
      const circlePoints: Point[] = [];
      for (let i = 0; i <= 20; i++) {
        const angle = (i / 20) * Math.PI * 2;
        circlePoints.push({
          x: Math.max(0, Math.min(1, center.x + Math.cos(angle) * r)),
          y: Math.max(0, Math.min(1, center.y + Math.sin(angle) * r)),
        });
      }
      setPendingStroke(circlePoints);
      setNoteText('');
    } else {
      redrawCanvas();
    }
  };

  // Save new annotation
  const handleConfirmNewAnnotation = (textToSave?: string) => {
    const finalNote = (textToSave ?? noteText).trim() || 'Chỉnh sửa vùng khoanh đỏ này';
    if (!pendingStroke || pendingStroke.length === 0) return;

    const newAnnotation: StrokeAnnotation = {
      id: 'anno_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      points: pendingStroke,
      color: '#ef4444',
      lineWidth: strokeWidth,
      note: finalNote,
      createdAt: new Date().toISOString(),
    };

    const updated = [...annotations, newAnnotation];
    onSaveAnnotations(updated);
    setPendingStroke(null);
    setNoteText('');
    showToast('✓ Đã lưu ghi chú cho vùng khoanh đỏ');
  };

  const handleCancelNewAnnotation = () => {
    setPendingStroke(null);
    setNoteText('');
    redrawCanvas();
  };

  // Delete annotation
  const handleDeleteAnnotation = (id: string) => {
    const updated = annotations.filter(a => a.id !== id);
    onSaveAnnotations(updated);
    if (hoveredAnnotationId === id) setHoveredAnnotationId(null);
    if (editingAnnotationId === id) setEditingAnnotationId(null);
    showToast('Đã xóa ghi chú');
  };

  // Update annotation text
  const handleSaveEditAnnotation = (id: string) => {
    if (!editingNoteText.trim()) return;
    const updated = annotations.map(a => a.id === id ? { ...a, note: editingNoteText.trim() } : a);
    onSaveAnnotations(updated);
    setEditingAnnotationId(null);
    setEditingNoteText('');
    showToast('✓ Đã cập nhật ghi chú');
  };

  // Export current annotated image with rendered red strokes and numbered callout pin list
  const handleExportAnnotatedImage = async () => {
    if (!imageRef.current) return;
    setIsExporting(true);

    try {
      const img = imageRef.current;
      const naturalWidth = img.naturalWidth || 1920;
      const naturalHeight = img.naturalHeight || 1080;

      const exportCanvas = document.createElement('canvas');
      exportCanvas.width = naturalWidth;
      exportCanvas.height = naturalHeight;
      const ctx = exportCanvas.getContext('2d');

      if (!ctx) throw new Error('Không thể khởi tạo Canvas');

      // Load image with anonymous cross-origin for canvas export
      const tempImg = new Image();
      tempImg.crossOrigin = 'anonymous';
      tempImg.src = imageUrl;

      await new Promise<void>((resolve, reject) => {
        tempImg.onload = () => resolve();
        tempImg.onerror = () => {
          try {
            ctx.drawImage(img, 0, 0, naturalWidth, naturalHeight);
            resolve();
          } catch {
            reject(new Error('Lỗi tải ảnh để xuất'));
          }
        };
      });

      if (!tempImg.complete) {
        ctx.drawImage(img, 0, 0, naturalWidth, naturalHeight);
      } else {
        ctx.drawImage(tempImg, 0, 0, naturalWidth, naturalHeight);
      }

      // Draw all annotations with high resolution
      annotations.forEach((anno, index) => {
        if (!anno.points || anno.points.length === 0) return;

        const scale = Math.max(naturalWidth, naturalHeight) / 1000;
        const lineW = Math.max(3, anno.lineWidth * scale);

        // 1. Draw outer dark shadow for contrast
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.75)';
        ctx.lineWidth = lineW + 3 * scale;
        ctx.beginPath();
        anno.points.forEach((pt, pIdx) => {
          const px = pt.x * naturalWidth;
          const py = pt.y * naturalHeight;
          if (pIdx === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.stroke();

        // 2. Draw vivid red highlight line
        ctx.strokeStyle = anno.color || '#ef4444';
        ctx.lineWidth = lineW;
        ctx.beginPath();
        anno.points.forEach((pt, pIdx) => {
          const px = pt.x * naturalWidth;
          const py = pt.y * naturalHeight;
          if (pIdx === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.stroke();

        // 3. Draw numbered badge circle
        const firstPt = anno.points[0];
        const badgeX = firstPt.x * naturalWidth;
        const badgeY = firstPt.y * naturalHeight;
        const badgeRadius = 15 * scale;

        // Shadow
        ctx.beginPath();
        ctx.arc(badgeX, badgeY, badgeRadius + 2 * scale, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fill();

        // Badge red fill
        ctx.beginPath();
        ctx.arc(badgeX, badgeY, badgeRadius, 0, Math.PI * 2);
        ctx.fillStyle = '#dc2626';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2.5 * scale;
        ctx.stroke();

        // Badge number text
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${Math.round(14 * scale)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(index + 1), badgeX, badgeY);
      });

      // Bottom banner summarizing note instructions
      if (annotations.length > 0) {
        const bannerPadding = 20 * (naturalWidth / 1920);
        const lineHeight = 30 * (naturalWidth / 1920);
        const bannerHeight = (annotations.length * lineHeight) + bannerPadding * 2 + 25;

        ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
        ctx.fillRect(0, naturalHeight - bannerHeight, naturalWidth, bannerHeight);

        ctx.fillStyle = '#38bdf8';
        ctx.font = `bold ${Math.round(16 * (naturalWidth / 1920))}px sans-serif`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(`YÊU CẦU CHỈNH SỬA (${annotations.length} mục) - PHOTOBOOK VIETNAM`, bannerPadding, naturalHeight - bannerHeight + 14);

        annotations.forEach((anno, i) => {
          ctx.fillStyle = '#ffffff';
          ctx.font = `${Math.round(14 * (naturalWidth / 1920))}px sans-serif`;
          const y = naturalHeight - bannerHeight + bannerPadding + 32 + (i * lineHeight);
          ctx.fillText(`[${i + 1}] ${anno.note}`, bannerPadding, y);
        });
      }

      exportCanvas.toBlob((blob) => {
        if (!blob) throw new Error('Không thể xuất ảnh');
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        const cleanName = file.name.replace(/\.[^/.]+$/, '');
        link.download = `${cleanName}_khoanh_do_chinhsua.jpg`;
        link.href = url;
        link.click();
        URL.revokeObjectURL(url);
        showToast('✓ Đã tải ảnh có khoanh đỏ chỉnh sửa về máy!');
      }, 'image/jpeg', 0.95);

    } catch (err: any) {
      console.error('Export error:', err);
      alert('Không thể xuất ảnh trực tiếp do chính sách bảo mật trình duyệt. Quý khách có thể xuất danh sách ghi chú dạng file text.');
    } finally {
      setIsExporting(false);
    }
  };

  // Export text file of notes for this photo
  const handleExportTextNotes = () => {
    if (annotations.length === 0) return;
    const cleanName = file.name.replace(/\.[^/.]+$/, '');
    let content = `DANH SÁCH YÊU CẦU CHỈNH SỬA - PHOTOBOOK VIETNAM\n`;
    content += `File: ${file.name}\n`;
    content += `Thời gian: ${new Date().toLocaleString('vi-VN')}\n`;
    content += `Tổng số ghi chú: ${annotations.length}\n`;
    content += `-----------------------------------------\n\n`;

    annotations.forEach((a, idx) => {
      content += `${idx + 1}. [Ghi chú #${idx + 1}]: ${a.note}\n`;
    });

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ghi-chu-${cleanName}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('✓ Đã tải file ghi chú text');
  };

  const handleDownloadRetouchedImage = async () => {
    if (!retouchedImageUrl) return;
    const cleanName = file.name.replace(/\.[^/.]+$/, '');
    const fileName = `${cleanName}_ai_retouched.jpg`;

    try {
      showToast('Đang chuẩn bị ảnh AI (HD) chất lượng cao...');

      // Render through an offscreen canvas at full natural resolution to guarantee a valid, non-corrupted JPEG binary
      const blob = await new Promise<Blob>((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          try {
            const w = img.naturalWidth || img.width;
            const h = img.naturalHeight || img.height;
            if (!w || !h) {
              reject(new Error('Ảnh chưa tải xong kích thước gốc'));
              return;
            }
            const offCanvas = document.createElement('canvas');
            offCanvas.width = w;
            offCanvas.height = h;
            const ctx = offCanvas.getContext('2d');
            if (!ctx) {
              reject(new Error('Không thể khởi tạo bộ đệm ảnh HD'));
              return;
            }
            // Fill white background before drawing in case of any transparent pixels
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, w, h);
            ctx.drawImage(img, 0, 0, w, h);
            offCanvas.toBlob(
              (b) => {
                if (b && b.size > 15000) {
                  resolve(b);
                } else {
                  reject(new Error('Dữ liệu xuất ảnh không hợp lệ'));
                }
              },
              'image/jpeg',
              0.98
            );
          } catch (err) {
            reject(err);
          }
        };
        img.onerror = () => reject(new Error('Không thể nạp ảnh AI để tải về'));
        img.src = retouchedImageUrl;
      });

      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
      showToast(`✓ Đã tải ảnh AI (HD) hoàn thiện (${Math.round(blob.size / 1024)} KB)!`);
    } catch (canvasErr) {
      console.warn('Canvas export fallback:', canvasErr);
      try {
        const response = await fetch(retouchedImageUrl);
        const contentType = response.headers.get('content-type') || '';
        if (!response.ok || (!contentType.startsWith('image/') && !retouchedImageUrl.startsWith('data:image/'))) {
          throw new Error('Ảnh AI tạm thời hết hạn trên phiên làm việc. Vui lòng bấm "Chỉnh sửa lại" để tạo bản HD mới.');
        }
        const rawBlob = await response.blob();
        if (rawBlob.size < 15000) {
          throw new Error('File ảnh AI trên bộ nhớ đệm không còn đầy đủ. Vui lòng bấm "Chỉnh sửa lại" để xuất lại ảnh HD.');
        }
        const blobUrl = URL.createObjectURL(rawBlob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
        showToast(`✓ Đã tải ảnh AI (HD) hoàn thiện (${Math.round(rawBlob.size / 1024)} KB)!`);
      } catch (err: any) {
        showToast(`⚠️ ${err?.message || 'Không thể tải ảnh AI. Vui lòng bấm Chỉnh sửa lại.'}`);
      }
    }
  };

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center gap-2.5 select-none overflow-hidden">
      
      {/* Toast Alert */}
      {toastMessage && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-slate-900/90 text-white px-5 py-2.5 rounded-full shadow-2xl backdrop-blur-md text-xs sm:text-sm font-semibold flex items-center gap-2 border border-slate-700 animate-in fade-in slide-in-from-top-2">
          <Sparkles className="w-4 h-4 text-amber-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Main Photo Viewport (never overlapped by bottom toolbar) */}
      <div className="flex-1 min-h-0 w-full flex items-center justify-center overflow-hidden">
        {/* Image & Canvas Wrapper: tight inline-block containing the exact photo */}
        <div 
          ref={containerRef}
          className="relative inline-block max-w-full max-h-[calc(100vh-220px)] select-none"
        >
          {/* Floating Switcher for Original vs AI Retouched */}
          {retouchedImageUrl && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 flex items-center bg-slate-950/90 p-1 rounded-full shadow-2xl border border-slate-700/80 backdrop-blur-md animate-in fade-in slide-in-from-top-2 whitespace-nowrap">
              <button
                type="button"
                onClick={() => setDisplayMode('original')}
                className={`px-3.5 py-1 rounded-full text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                  displayMode === 'original' 
                    ? 'bg-slate-700 text-white shadow-sm' 
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Eye className="w-3.5 h-3.5 shrink-0" />
                <span>Trước</span>
              </button>
              <button
                type="button"
                onClick={() => setDisplayMode('retouched')}
                className={`px-3.5 py-1 rounded-full text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                  displayMode === 'retouched' 
                    ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md' 
                    : 'text-purple-300 hover:text-white'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-300 animate-pulse shrink-0" />
                <span>Sau</span>
              </button>
              <button
                type="button"
                onClick={() => setShowCompareModal(true)}
                className="px-2.5 py-1 text-xs text-amber-400 hover:text-amber-300 font-bold border-l border-slate-700 ml-1 flex items-center gap-1 cursor-pointer whitespace-nowrap"
                title="Mở thanh trượt so sánh Trước / Sau"
              >
                <ArrowLeftRight className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden sm:inline">So sánh</span>
              </button>
            </div>
          )}

          {/* The Base Photo (switches between original and AI retouched) */}
          <img
            ref={imageRef}
            src={displayMode === 'retouched' && retouchedImageUrl ? retouchedImageUrl : imageUrl}
            alt={file.name}
            className="max-w-full max-h-[calc(100vh-220px)] w-auto h-auto object-contain pointer-events-none rounded shadow-2xl block"
            draggable={false}
            onLoad={() => {
              setImageLoaded(true);
              syncCanvasSize();
            }}
          />

          {/* Real-time HTML5 Drawing Canvas Overlay */}
          <canvas
            ref={canvasRef}
            className={`absolute inset-0 z-10 ${
              isDrawingMode 
                ? 'cursor-crosshair touch-none pointer-events-auto' 
                : 'pointer-events-none'
            }`}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          />

          {/* Numbered Interactive Callout Pins (rendered on top of canvas) */}
          <div className="absolute inset-0 pointer-events-none z-20 overflow-hidden">
            {annotations.map((anno, index) => {
              if (!anno.points || anno.points.length === 0) return null;
              const firstPt = anno.points[0];
              const isHovered = hoveredAnnotationId === anno.id;

              return (
                <div
                  key={anno.id}
                  style={{
                    left: `${firstPt.x * 100}%`,
                    top: `${firstPt.y * 100}%`,
                  }}
                  className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-auto cursor-pointer group"
                  onClick={(e) => {
                    e.stopPropagation();
                    setHoveredAnnotationId(anno.id);
                    setEditingAnnotationId(anno.id);
                    setEditingNoteText(anno.note);
                  }}
                  onMouseEnter={() => setHoveredAnnotationId(anno.id)}
                  onMouseLeave={() => setHoveredAnnotationId(null)}
                  title={`#${index + 1}: ${anno.note}`}
                >
                  <div 
                    className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center font-black text-xs sm:text-sm text-white shadow-xl transition-all duration-200 border-2 ${
                      isHovered 
                        ? 'bg-amber-500 border-white scale-125 ring-4 ring-amber-400/50' 
                        : 'bg-red-600 hover:bg-red-500 border-white hover:scale-110 ring-2 ring-black/40'
                    }`}
                  >
                    {index + 1}
                  </div>

                  {/* Hover Tooltip */}
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:flex flex-col items-center pointer-events-none z-30 min-w-[140px] max-w-xs">
                    <div className="bg-slate-950/95 text-white text-[11px] font-medium px-2.5 py-1.5 rounded-lg shadow-2xl border border-slate-700/80 whitespace-normal text-center leading-snug">
                      <span className="text-amber-400 font-bold block mb-0.5">Yêu cầu #{index + 1}</span>
                      {anno.note}
                    </div>
                    <div className="w-2 h-2 bg-slate-950/95 rotate-45 -mt-1 border-r border-b border-slate-700/80"></div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Modal / Dialog when finishing drawing a stroke */}
          {pendingStroke && (
            <div className="absolute inset-0 z-40 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
              <div className="bg-slate-900 border-2 border-red-500 rounded-2xl shadow-2xl p-5 max-w-md w-full text-white animate-in zoom-in-95 duration-150">
                <div className="flex items-center justify-between mb-3 border-b border-slate-800 pb-2.5">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-red-600 flex items-center justify-center font-bold text-xs text-white">
                      {annotations.length + 1}
                    </div>
                    <h3 className="font-bold text-base text-slate-100">Ghi chú cho vùng vừa khoanh đỏ</h3>
                  </div>
                  <button
                    onClick={handleCancelNewAnnotation}
                    className="p-1 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <p className="text-xs text-slate-300 mb-3">
                  Bạn muốn thợ chỉnh sửa/retoucher làm gì ở vùng khoanh đỏ này?
                </p>

                <textarea
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  placeholder="Ví dụ: Xóa nốt mụn, bóp nhẹ eo, chỉnh sáng da mặt, xóa người phía sau..."
                  rows={3}
                  autoFocus
                  className="w-full bg-slate-800/90 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent resize-none mb-3"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleConfirmNewAnnotation();
                    }
                  }}
                />

                {/* Quick suggestion chips */}
                <div className="mb-4">
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1.5">
                    Gợi ý nhanh:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {PRESET_QUICK_NOTES.map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => {
                          setNoteText(preset);
                          handleConfirmNewAnnotation(preset);
                        }}
                        className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded-lg transition-colors border border-slate-700 hover:border-slate-500 cursor-pointer"
                      >
                        + {preset}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={handleCancelNewAnnotation}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
                  >
                    Hủy nét vẽ
                  </button>
                  <button
                    type="button"
                    onClick={() => handleConfirmNewAnnotation()}
                    className="px-5 py-2 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded-xl shadow-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <Check className="w-4 h-4" />
                    Lưu ghi chú
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Drawing Control Bar (Docked cleanly below the image so it never covers the photo) */}
      <div className="shrink-0 z-30 flex items-center gap-2 bg-slate-900/95 text-white px-3 sm:px-4 py-2 rounded-2xl shadow-2xl backdrop-blur-md border border-slate-700/80 max-w-[95vw] overflow-x-auto">
        
        {/* Toggle Mode / Close Drawing Mode */}
        {isDrawingMode ? (
          <button
            onClick={() => setIsDrawingMode(false)}
            className="p-1.5 rounded-xl bg-red-600 hover:bg-red-500 text-white ring-2 ring-red-400 transition-all shadow-sm cursor-pointer flex items-center justify-center"
            title="Đóng chế độ vẽ"
            aria-label="Đóng chế độ vẽ"
          >
            <X className="w-4 h-4 stroke-[2.5]" />
          </button>
        ) : (
          <button
            onClick={() => setIsDrawingMode(true)}
            className="px-3 py-1.5 rounded-xl font-bold text-xs sm:text-sm flex items-center gap-1.5 transition-all shadow-sm cursor-pointer bg-slate-800 hover:bg-slate-700 text-slate-200"
            title="Bật chế độ khoanh vùng đỏ"
          >
            <PenTool className="w-4 h-4" />
            <span>Khoanh vùng sửa</span>
          </button>
        )}

        <div className="w-px h-5 bg-slate-700 mx-1"></div>

        {/* Note Counter */}
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-xl bg-slate-800/60 text-xs shrink-0">
          <MessageSquare className="w-3.5 h-3.5 text-red-400" />
          <span className="font-semibold text-slate-200">
            {annotations.length} <span className="hidden sm:inline">ghi chú</span>
          </span>
        </div>

        {/* VIP AI Retouch Button */}
        {annotations.length > 0 && (
          <button
            type="button"
            onClick={handleOpenAIRetouchFlow}
            disabled={isRetouching}
            className={`px-3 sm:px-3.5 py-1.5 rounded-xl font-bold text-xs sm:text-sm flex items-center gap-1.5 transition-all shadow-lg cursor-pointer transform hover:scale-105 active:scale-95 shrink-0 ${
              retouchedImageUrl
                ? 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white ring-2 ring-purple-400/50'
                : 'bg-gradient-to-r from-amber-500 via-rose-500 to-purple-600 hover:from-amber-600 hover:to-purple-700 text-white ring-2 ring-amber-300/60'
            }`}
            title="Dùng AI cùng API key để xử lý chỉnh sửa trực tiếp trên ảnh theo các vị trí khoanh đỏ"
          >
            <Sparkles className="w-4 h-4 text-amber-200 animate-pulse" />
            <span>{retouchedImageUrl ? 'Chỉnh sửa lại' : 'Chỉnh sửa ngay'}</span>
            <Crown className="w-3.5 h-3.5 text-amber-300" />
          </button>
        )}

        {/* Before / After Comparison & Direct HD Download Buttons */}
        {retouchedImageUrl && (
          <>
            <button
              type="button"
              onClick={() => setShowCompareModal(true)}
              className="px-3 py-1.5 rounded-xl font-semibold text-xs bg-slate-800 hover:bg-slate-700 text-purple-300 hover:text-white transition-colors flex items-center gap-1.5 border border-purple-500/40 cursor-pointer shrink-0"
              title="Xem so sánh ảnh gốc và ảnh AI đã sửa"
            >
              <ArrowLeftRight className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline">So sánh Trước/Sau</span>
            </button>
            <button
              type="button"
              onClick={handleDownloadRetouchedImage}
              className="px-3 py-1.5 rounded-xl font-bold text-xs bg-slate-800 hover:bg-slate-700 text-sky-400 hover:text-sky-300 transition-colors flex items-center gap-1.5 border border-sky-500/40 cursor-pointer shrink-0"
              title="Tải ảnh AI (HD) về máy"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Tải ảnh AI (HD)</span>
            </button>
          </>
        )}

        {/* Export text list */}
        {annotations.length > 0 && (
          <button
            onClick={handleExportTextNotes}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            title="Tải danh sách ghi chú dạng file text (.txt)"
          >
            <FileText className="w-4 h-4" />
          </button>
        )}

        {/* Clear all annotations for this photo */}
        {annotations.length > 0 && (
          <button
            onClick={() => {
              onSaveAnnotations([]);
              showToast('Đã xóa tất cả ghi chú của ảnh');
            }}
            className="p-1.5 rounded-xl text-slate-400 hover:text-red-400 hover:bg-slate-800 transition-colors cursor-pointer"
            title="Xóa tất cả ghi chú của ảnh này"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}

        {/* Credit Balance & Top-up Shortcut in Bottom Bar */}
        {onOpenTopupModal && (
          <button
            type="button"
            onClick={onOpenTopupModal}
            className="px-2.5 py-1.5 rounded-xl bg-indigo-950/90 hover:bg-indigo-900 border border-indigo-500/40 text-xs font-bold text-indigo-200 flex items-center gap-1.5 cursor-pointer transition shrink-0"
            title="Nạp thêm lượt Render AI (PayOS VietQR)"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>{currentCredits} lượt</span>
            <span className="text-amber-400 font-black">+Nạp</span>
          </button>
        )}
      </div>

      {/* Side Note Drawer (Right panel showing the notes list) */}
      {annotations.length > 0 && (
        <div className="hidden lg:flex flex-col absolute right-4 top-20 bottom-24 w-80 bg-slate-900/90 text-white rounded-2xl shadow-2xl backdrop-blur-md border border-slate-700/80 p-4 overflow-hidden z-20">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse"></span>
              <h4 className="font-bold text-sm text-slate-200">
                Ghi chú cần sửa ({annotations.length})
              </h4>
            </div>
            <span className="text-[11px] text-slate-400">Photobook VN</span>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
            {annotations.map((anno, idx) => {
              const isHovered = hoveredAnnotationId === anno.id;
              const isEditing = editingAnnotationId === anno.id;

              return (
                <div
                  key={anno.id}
                  onMouseEnter={() => setHoveredAnnotationId(anno.id)}
                  onMouseLeave={() => setHoveredAnnotationId(null)}
                  className={`p-3 rounded-xl border transition-all text-xs ${
                    isHovered 
                      ? 'bg-slate-800 border-amber-400 shadow-md' 
                      : 'bg-slate-800/60 border-slate-700/70'
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <span className="w-6 h-6 rounded-full bg-red-600 shrink-0 flex items-center justify-center font-bold text-white text-xs">
                      {idx + 1}
                    </span>

                    <div className="flex-1 min-w-0">
                      {isEditing ? (
                        <div className="space-y-2">
                          <textarea
                            value={editingNoteText}
                            onChange={(e) => setEditingNoteText(e.target.value)}
                            rows={2}
                            className="w-full bg-slate-900 border border-slate-600 rounded-lg p-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-red-500 resize-none"
                          />
                          <div className="flex items-center gap-1.5 justify-end">
                            <button
                              onClick={() => setEditingAnnotationId(null)}
                              className="px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded text-[11px] text-slate-300 cursor-pointer"
                            >
                              Hủy
                            </button>
                            <button
                              onClick={() => handleSaveEditAnnotation(anno.id)}
                              className="px-2.5 py-1 bg-red-600 hover:bg-red-500 rounded text-[11px] font-bold text-white cursor-pointer"
                            >
                              Lưu
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <p className="text-slate-200 font-medium leading-relaxed break-words">
                            {anno.note}
                          </p>
                          <div className="flex items-center justify-between mt-2 pt-1 border-t border-slate-700/50 text-[10px] text-slate-400">
                            <span>Vị trí #{idx + 1}</span>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => {
                                  setEditingAnnotationId(anno.id);
                                  setEditingNoteText(anno.note);
                                }}
                                className="hover:text-amber-400 transition-colors cursor-pointer flex items-center gap-0.5"
                              >
                                <Edit2 className="w-3 h-3" />
                                Sửa
                              </button>
                              <button
                                onClick={() => handleDeleteAnnotation(anno.id)}
                                className="hover:text-red-400 transition-colors cursor-pointer flex items-center gap-0.5"
                              >
                                <Trash2 className="w-3 h-3" />
                                Xóa
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-3 pt-3 border-t border-slate-800 flex flex-col gap-2">
            {/* VIP AI Retouch action button in drawer */}
            <button
              type="button"
              onClick={handleOpenAIRetouchFlow}
              disabled={isRetouching}
              className="w-full py-2.5 bg-gradient-to-r from-amber-500 via-rose-500 to-purple-600 hover:from-amber-600 hover:to-purple-700 text-white rounded-xl font-bold text-xs shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-98"
              title="Áp dụng AI chỉnh sửa trực tiếp theo các yêu cầu ghi chú"
            >
              <Sparkles className="w-4 h-4 text-amber-200 animate-pulse" />
              <span>{retouchedImageUrl ? 'Chỉnh sửa lại' : 'Chỉnh sửa ngay'}</span>
              <Crown className="w-3.5 h-3.5 text-amber-300" />
            </button>

            {retouchedImageUrl && (
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setShowCompareModal(true)}
                  className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-purple-300 hover:text-white rounded-xl font-semibold text-xs border border-purple-500/30 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <ArrowLeftRight className="w-3.5 h-3.5 text-amber-400" />
                  So sánh AI
                </button>
                <button
                  type="button"
                  onClick={handleDownloadRetouchedImage}
                  className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-sky-400 hover:text-sky-300 rounded-xl font-bold text-xs border border-sky-500/30 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  Tải ảnh AI (HD)
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 1. AI PROCESSING PROGRESS MODAL */}
      {isRetouching && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-purple-500/50 rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl text-center flex flex-col items-center relative overflow-hidden animate-in fade-in zoom-in-95">
            {/* Ambient Background Glow */}
            <div className="absolute -top-24 -left-24 w-48 h-48 bg-purple-500/20 rounded-full blur-3xl pointer-events-none"></div>
            <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-amber-500/20 rounded-full blur-3xl pointer-events-none"></div>

            {/* Glowing Icon */}
            <div className="relative mb-5">
              <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-amber-500 via-rose-500 to-purple-600 flex items-center justify-center shadow-lg shadow-purple-500/30 animate-pulse">
                <Wand2 className="w-10 h-10 text-white" />
              </div>
              <div className="absolute inset-0 rounded-full border-2 border-white/40 border-t-transparent animate-spin"></div>
            </div>

            <h3 className="text-xl sm:text-2xl font-black text-white mb-2 tracking-tight">
              AI Đang Chỉnh Sửa ({selectedResolution})
            </h3>
            <p className="text-xs sm:text-sm text-purple-200/80 mb-6">
              Photobook Vietnam AI Engine đang xử lý {annotations.length} vị trí khoanh đỏ ở độ phân giải {selectedResolution}
            </p>

            {/* Progress Step Milestones */}
            <div className="w-full space-y-3 text-left mb-6 bg-slate-950/60 p-4 rounded-2xl border border-slate-800">
              {[
                { step: 1, title: 'Phân tích các vùng khoanh đỏ & ghi chú' },
                { step: 2, title: 'Kết nối Studio Retouch AI Model' },
                { step: 3, title: 'Làm mịn da, bóp dáng & xử lý vật thể' },
                { step: 4, title: 'Hoàn tất bức ảnh nghệ thuật studio' },
              ].map((item) => {
                const isDone = retouchStep > item.step;
                const isCurrent = retouchStep === item.step;

                return (
                  <div key={item.step} className="flex items-center gap-3">
                    <div className="shrink-0">
                      {isDone ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                      ) : isCurrent ? (
                        <div className="w-5 h-5 rounded-full border-2 border-amber-400 border-t-transparent animate-spin" />
                      ) : (
                        <div className="w-5 h-5 rounded-full border border-slate-700 bg-slate-800 text-[10px] text-slate-500 flex items-center justify-center font-bold">
                          {item.step}
                        </div>
                      )}
                    </div>
                    <span className={`text-xs font-semibold ${
                      isDone 
                        ? 'text-emerald-300' 
                        : isCurrent 
                          ? 'text-amber-300 font-bold' 
                          : 'text-slate-500'
                    }`}>
                      {item.title}
                    </span>
                  </div>
                );
              })}
            </div>

            <p className="text-[11px] text-slate-400 italic mb-4">
              Quá trình xử lý thường mất từ 5 - 15 giây.
            </p>

            <button
              type="button"
              onClick={handleCancelAIRetouch}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold transition border border-slate-700 cursor-pointer flex items-center gap-1.5"
            >
              <X className="w-3.5 h-3.5" />
              <span>Hủy tiến trình</span>
            </button>
          </div>
        </div>
      )}

      {/* Retouch Error Modal */}
      {retouchError && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-red-500/50 rounded-2xl p-6 max-w-md w-full text-center text-white">
            <div className="w-14 h-14 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-8 h-8" />
            </div>
            <h4 className="text-lg font-bold mb-2">Chưa thể hoàn tất chỉnh sửa AI</h4>
            <p className="text-xs text-slate-300 mb-4 leading-relaxed">
              {retouchError}
            </p>

            {(retouchError.includes("prepayment credits") || retouchError.includes("tín dụng trả trước") || retouchError.includes("depleted") || retouchError.includes("402")) && (
              <div className="mb-4 p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-left text-xs text-rose-200 space-y-2">
                <p className="font-bold text-rose-300 flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>Tín dụng trả trước Google AI Studio đã hết (Code 402):</span>
                </p>
                <p className="leading-relaxed text-slate-300">
                  Dự án AI Studio của bạn đang sử dụng cơ chế nạp tiền trước (Prepay Billing) và số dư hiện tại đã về 0$.
                </p>
                <div className="pt-1 flex flex-col gap-2">
                  <a
                    href="https://ai.studio/projects"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full py-2 px-3 bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 transition shadow"
                  >
                    <span>Nạp tiền / Quản lý Dự án tại ai.studio/projects ↗</span>
                  </a>
                  <a
                    href="https://ai.google.dev/gemini-api/docs/billing#prepay"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] text-slate-400 hover:text-slate-200 underline text-center block"
                  >
                    Tìm hiểu thêm về chính sách nạp tiền Prepay của Gemini API ↗
                  </a>
                </div>
              </div>
            )}

            {(retouchError.includes("spending cap") || retouchError.includes("Spend Cap") || retouchError.includes("ai.studio/spend")) && (
              <div className="mb-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-left text-xs text-amber-200 space-y-1.5">
                <p className="font-semibold text-amber-300">💡 Hướng dẫn xử lý Spend Cap:</p>
                <p>1. Truy cập trang quản lý hạn mức Google AI Studio.</p>
                <p>2. Kiểm tra mục <strong>Monthly Spend Cap</strong> của Project đang dùng.</p>
                <p>3. Nâng hạn mức (hoặc chọn Project/API Key khác có số dư khả dụng).</p>
                <a
                  href="https://ai.studio/spend"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-amber-300 hover:text-amber-100 underline decoration-amber-400"
                >
                  <span>Mở Google AI Studio Spend Cap ↗</span>
                </a>
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => setRetouchError(null)}
                className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition cursor-pointer"
              >
                Đóng
              </button>
              <button
                onClick={() => {
                  setRetouchError(null);
                  handleRunAIRetouch();
                }}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Thử lại
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. VIP PROMO / UNLOCK MODAL (when non-VIP clicks VIP AI button) */}
      {showVipPromptModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-amber-500/40 rounded-3xl p-6 sm:p-8 max-w-md w-full text-white text-center relative shadow-2xl">
            <button
              onClick={() => setShowVipPromptModal(false)}
              className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white rounded-full hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-amber-400 to-amber-600 flex items-center justify-center text-slate-950 mx-auto mb-4 shadow-lg shadow-amber-500/30">
              <Crown className="w-8 h-8" />
            </div>

            <h3 className="text-xl sm:text-2xl font-black mb-2 text-white">
              Đặc Quyền Thành Viên VIP
            </h3>
            
            <p className="text-xs sm:text-sm text-slate-300 mb-5 leading-relaxed">
              Chức năng áp dụng AI cùng API Key để chỉnh sửa trực tiếp trên ảnh (làm mịn da, thon dáng, xóa vật thể) theo các vị trí khoanh đỏ dành riêng cho khách hàng VIP của Photobook Vietnam.
            </p>

            <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4 text-left space-y-2 mb-6 text-xs">
              <div className="flex items-center gap-2 text-amber-300 font-semibold">
                <Sparkles className="w-4 h-4 shrink-0 text-amber-400" />
                <span>Chỉnh sửa ảnh tự động bằng Gemini AI cao cấp</span>
              </div>
              <div className="flex items-center gap-2 text-slate-300">
                <Check className="w-4 h-4 shrink-0 text-emerald-400" />
                <span>Giữ nguyên nhận diện khuôn mặt & độ nét Studio</span>
              </div>
              <div className="flex items-center gap-2 text-slate-300">
                <Check className="w-4 h-4 shrink-0 text-emerald-400" />
                <span>So sánh thanh trượt Trước / Sau trực tiếp trên ảnh</span>
              </div>
              <div className="flex items-center gap-2 text-slate-300">
                <Check className="w-4 h-4 shrink-0 text-emerald-400" />
                <span>Tải ảnh đã sửa AI chuẩn HD về máy tính / điện thoại</span>
              </div>
            </div>

            <div className="flex flex-col gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setDemoVipActive(true);
                  localStorage.setItem('photobook_demo_vip_pass', 'true');
                  setShowVipPromptModal(false);
                  showToast('🌟 Đã kích hoạt quyền VIP trải nghiệm!');
                  setShowResolutionModal(true);
                }}
                className="w-full py-3.5 px-4 bg-gradient-to-r from-amber-500 via-rose-500 to-purple-600 hover:from-amber-600 hover:to-purple-700 text-white font-bold rounded-2xl shadow-xl flex items-center justify-center gap-2 text-sm cursor-pointer transition active:scale-98"
              >
                <Sparkles className="w-4 h-4 text-amber-200" />
                <span>Kích hoạt trải nghiệm VIP ngay (Miễn phí)</span>
              </button>

              {onOpenVIPModal && (
                <button
                  type="button"
                  onClick={() => {
                    setShowVipPromptModal(false);
                    onOpenVIPModal();
                  }}
                  className="w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold rounded-xl text-xs transition cursor-pointer"
                >
                  Đăng nhập tài khoản / Liên hệ Photobook VN
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 2B. RESOLUTION PICKER MODAL (1K / 2K / 4K) */}
      {showResolutionModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-purple-500/40 rounded-3xl p-6 sm:p-7 max-w-md w-full text-white relative shadow-2xl">
            <button
              type="button"
              onClick={() => setShowResolutionModal(false)}
              className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white rounded-full hover:bg-slate-800 transition cursor-pointer"
              title="Đóng"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-amber-500 via-rose-500 to-purple-600 flex items-center justify-center shadow-lg shadow-purple-500/20 shrink-0">
                <Sparkles className="w-6 h-6 text-white" />
              </div>
              <div className="text-left">
                <h3 className="text-lg sm:text-xl font-black text-white leading-tight">
                  Chọn Độ Phân Giải AI
                </h3>
                <p className="text-xs text-slate-400">
                  Áp dụng cho {annotations.length} vị trí đã khoanh đỏ trên ảnh
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between bg-indigo-950/50 border border-indigo-500/30 rounded-2xl px-3.5 py-2.5 mb-4 text-xs">
              <div className="flex items-center gap-1.5 text-indigo-200 font-semibold">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <span>Số dư khả dụng:</span>
                <span className="text-amber-400 font-black text-sm">{currentCredits} lượt</span>
              </div>
              {onOpenTopupModal && (
                <button
                  type="button"
                  onClick={() => {
                    setShowResolutionModal(false);
                    onOpenTopupModal();
                  }}
                  className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[11px] cursor-pointer transition"
                >
                  + Nạp thêm lượt
                </button>
              )}
            </div>

            <div className="space-y-2.5 mb-6">
              {([
                {
                  res: '1K' as const,
                  cost: 1,
                  title: '1K • Tiêu Chuẩn (~1024px)',
                  badge: '1 lượt • Nhanh',
                  badgeColor: 'bg-slate-800 text-slate-300 border-slate-700',
                  desc: 'Tốc độ xử lý nhanh (~5-8 giây), phù hợp xem thử bố cục nhanh.',
                },
                {
                  res: '2K' as const,
                  cost: 2,
                  title: '2K • Sắc Nét Studio (~2048px)',
                  badge: '2 lượt • Khuyên dùng',
                  badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-400/40',
                  desc: 'Cân bằng tối ưu giữa độ chi tiết da, trang phục và tốc độ xử lý.',
                },
                {
                  res: '4K' as const,
                  cost: 3,
                  title: '4K • Siêu Nét In Ấn (~4096px)',
                  badge: '3 lượt • Ultra HD',
                  badgeColor: 'bg-purple-500/20 text-purple-300 border-purple-400/40',
                  desc: 'Độ phân giải cực đại giữ trọn vẹn chi tiết để in Photobook khổ lớn.',
                },
              ]).map((option) => {
                const isSelected = selectedResolution === option.res;
                return (
                  <button
                    key={option.res}
                    type="button"
                    onClick={() => setSelectedResolution(option.res)}
                    className={`w-full p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex items-start gap-3 ${
                      isSelected
                        ? 'bg-purple-950/60 border-purple-400 ring-2 ring-purple-500/40 shadow-lg'
                        : 'bg-slate-950/60 border-slate-800 hover:border-slate-700 hover:bg-slate-800/50'
                    }`}
                  >
                    <div
                      className={`w-5 h-5 rounded-full mt-0.5 flex items-center justify-center border shrink-0 ${
                        isSelected
                          ? 'border-amber-400 bg-amber-400 text-slate-950'
                          : 'border-slate-600 bg-slate-900'
                      }`}
                    >
                      {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="font-bold text-sm text-white">{option.title}</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${option.badgeColor}`}>
                          {option.badge}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 leading-relaxed">{option.desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Face Lock Feature Toggle */}
            <div 
              onClick={() => setFaceLockEnabled(!faceLockEnabled)}
              className={`p-3.5 rounded-2xl border mb-5 cursor-pointer transition-all flex items-start gap-3 ${
                faceLockEnabled
                  ? 'bg-emerald-950/40 border-emerald-500/60 ring-1 ring-emerald-500/30'
                  : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
              }`}
            >
              <div className={`w-5 h-5 rounded-md mt-0.5 flex items-center justify-center border shrink-0 transition ${
                faceLockEnabled ? 'bg-emerald-500 border-emerald-400 text-white' : 'border-slate-600 bg-slate-900'
              }`}>
                {faceLockEnabled && <Check className="w-3.5 h-3.5 stroke-[3]" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span className="font-bold text-xs sm:text-sm text-emerald-200">
                    Bảo toàn 100% khuôn mặt gốc (Face Lock)
                  </span>
                  <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full font-bold">
                    Khuyên dùng
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Chỉ áp dụng AI cho đúng vùng khoanh đỏ (xóa người, xóa vật thể,...), giữ nguyên từng pixel khuôn mặt, ánh mắt, hàm răng và nụ cười thật của người trong ảnh gốc.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => setShowResolutionModal(false)}
                className="px-4 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={() => handleRunAIRetouch(undefined, selectedResolution)}
                className="flex-1 py-3 px-4 bg-gradient-to-r from-amber-500 via-rose-500 to-purple-600 hover:from-amber-600 hover:to-purple-700 text-white font-bold rounded-xl shadow-xl flex items-center justify-center gap-2 text-xs sm:text-sm cursor-pointer transition active:scale-98"
              >
                <Sparkles className="w-4 h-4 text-amber-200 animate-pulse" />
                <span>Bắt đầu chỉnh sửa AI ({selectedResolution})</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. INTERACTIVE BEFORE / AFTER COMPARISON MODAL */}
      {showCompareModal && retouchedImageUrl && (
        <div className="fixed inset-0 z-50 bg-black/95 backdrop-blur-md flex flex-col items-center justify-between p-3 sm:p-6">
          
          {/* Header */}
          <div className="w-full max-w-6xl flex items-center justify-between pb-3 border-b border-slate-800 text-white shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center shadow-md">
                <Sparkles className="w-5 h-5 text-amber-300" />
              </div>
              <div>
                <h3 className="font-black text-sm sm:text-base text-white flex items-center gap-2">
                  So Sánh Kết Quả Chỉnh Sửa AI
                  <span className="bg-amber-500/20 text-amber-300 border border-amber-400/40 text-[10px] px-2 py-0.5 rounded-full font-bold">
                    VIP Mode
                  </span>
                </h3>
                <p className="text-[11px] text-slate-400">
                  File: {file.name} • {annotations.length} yêu cầu chỉnh sửa đã áp dụng
                </p>
              </div>
            </div>

            {/* View Mode Toggle, Face-Lock Toggle & Close */}
            <div className="flex items-center gap-2 flex-wrap justify-end">
              {rawAIRetouchedUrl && faceProtectedUrl && (
                <button
                  type="button"
                  onClick={() => {
                    const isCurrentlyProtected = retouchedImageUrl === faceProtectedUrl;
                    const nextUrl = isCurrentlyProtected ? rawAIRetouchedUrl : faceProtectedUrl;
                    onSaveRetouchedImage?.(nextUrl);
                    showToast(isCurrentlyProtected 
                      ? 'Đang xem bản AI gốc (Chưa khóa mặt)' 
                      : '✓ Đang xem bản Bảo toàn khuôn mặt gốc 100%');
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer border ${
                    retouchedImageUrl === faceProtectedUrl
                      ? 'bg-emerald-950/70 text-emerald-300 border-emerald-500/50 hover:bg-emerald-900/80'
                      : 'bg-slate-800 text-amber-300 border-amber-500/50 hover:bg-slate-700'
                  }`}
                  title="Bấm để bật/tắt chế độ bảo toàn khuôn mặt gốc"
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{retouchedImageUrl === faceProtectedUrl ? 'Mặt gốc: ĐANG BẬT' : 'Mặt gốc: ĐANG TẮT'}</span>
                </button>
              )}

              <div className="bg-slate-800/90 p-1 rounded-xl flex items-center text-xs">
                <button
                  type="button"
                  onClick={() => setCompareViewType('split')}
                  className={`px-3 py-1 rounded-lg font-bold transition flex items-center gap-1.5 cursor-pointer ${
                    compareViewType === 'split' ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Thanh trượt</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCompareViewType('side-by-side')}
                  className={`px-3 py-1 rounded-lg font-bold transition flex items-center gap-1.5 cursor-pointer ${
                    compareViewType === 'side-by-side' ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <ArrowLeftRight className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Song song</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => setShowCompareModal(false)}
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition cursor-pointer"
                title="Đóng (ESC)"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Main Visual Comparison Viewer */}
          <div className="flex-1 w-full max-w-6xl my-3 relative flex items-center justify-center overflow-hidden min-h-0 select-none">
            {compareViewType === 'split' ? (
              // Split interactive slider view
              <div className="relative max-w-full max-h-full inline-block rounded-2xl overflow-hidden shadow-2xl border border-slate-700 bg-slate-950">
                {/* 1. Underlying: AI Retouched Image (Full) */}
                <img
                  src={retouchedImageUrl}
                  alt="Ảnh đã chỉnh sửa bởi AI"
                  className="max-w-full max-h-[calc(100vh-210px)] w-auto h-auto object-contain block pointer-events-none"
                  draggable={false}
                />
                
                {/* Label on Right (AI Retouched) */}
                <div className="absolute top-4 right-4 bg-purple-950/80 backdrop-blur-md text-purple-200 border border-purple-500/50 px-3 py-1 rounded-full text-xs font-bold pointer-events-none flex items-center gap-1.5 shadow-lg">
                  <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                  <span>Sau khi sửa AI ✨</span>
                </div>

                {/* 2. Overlying: Original Image with clip-path matching slider */}
                <div 
                  className="absolute inset-0 overflow-hidden pointer-events-none border-r-2 border-white shadow-2xl"
                  style={{ width: `${compareSlider}%` }}
                >
                  <img
                    src={imageUrl}
                    alt="Ảnh gốc trước khi sửa"
                    className="max-w-none h-full object-contain pointer-events-none block"
                    style={{
                      // Match the exact dimensions of parent
                      width: 'auto',
                      minWidth: '100%',
                    }}
                    draggable={false}
                  />
                  {/* Label on Left (Original) */}
                  <div className="absolute top-4 left-4 bg-slate-900/80 backdrop-blur-md text-white border border-slate-600 px-3 py-1 rounded-full text-xs font-bold pointer-events-none flex items-center gap-1.5 shadow-lg whitespace-nowrap">
                    <PenTool className="w-3.5 h-3.5 text-red-400" />
                    <span>Trước ({annotations.length} ghi chú)</span>
                  </div>
                </div>

                {/* Draggable Divider Handle */}
                <div 
                  className="absolute top-0 bottom-0 z-30 cursor-ew-resize flex items-center justify-center"
                  style={{ left: `calc(${compareSlider}% - 18px)`, width: '36px' }}
                  onPointerDown={(e) => {
                    const parent = e.currentTarget.parentElement;
                    if (!parent) return;
                    const handleMove = (moveEv: PointerEvent) => {
                      const rect = parent.getBoundingClientRect();
                      const x = moveEv.clientX - rect.left;
                      const percent = Math.max(0, Math.min(100, (x / rect.width) * 100));
                      setCompareSlider(Math.round(percent));
                    };
                    const handleUp = () => {
                      window.removeEventListener('pointermove', handleMove);
                      window.removeEventListener('pointerup', handleUp);
                    };
                    window.addEventListener('pointermove', handleMove);
                    window.addEventListener('pointerup', handleUp);
                  }}
                >
                  <div className="w-8 h-8 rounded-full bg-white text-slate-900 shadow-2xl flex items-center justify-center border-2 border-purple-500 ring-4 ring-black/40">
                    <ArrowLeftRight className="w-4 h-4 text-slate-800" />
                  </div>
                </div>
              </div>
            ) : (
              // Side-by-side mode
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full h-full max-h-[calc(100vh-210px)] items-center">
                {/* Left: Original with circled markup */}
                <div className="relative h-full flex flex-col items-center justify-center bg-slate-900/60 rounded-2xl p-2 border border-slate-800 overflow-hidden">
                  <div className="absolute top-3 left-3 z-10 bg-slate-950/80 backdrop-blur-md text-slate-200 border border-slate-700 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5">
                    <PenTool className="w-3.5 h-3.5 text-red-400" />
                    <span>Ảnh gốc & Ghi chú ({annotations.length})</span>
                  </div>
                  <img
                    src={imageUrl}
                    alt="Ảnh gốc"
                    className="max-w-full max-h-full object-contain rounded-xl"
                  />
                </div>

                {/* Right: AI Retouched */}
                <div className="relative h-full flex flex-col items-center justify-center bg-slate-900/60 rounded-2xl p-2 border border-purple-500/40 overflow-hidden">
                  <div className="absolute top-3 left-3 z-10 bg-purple-950/90 backdrop-blur-md text-purple-200 border border-purple-500/50 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 shadow-lg">
                    <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                    <span>Ảnh đã xử lý bởi AI (VIP) ✨</span>
                  </div>
                  <img
                    src={retouchedImageUrl}
                    alt="Ảnh đã chỉnh sửa bởi AI"
                    className="max-w-full max-h-full object-contain rounded-xl"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Footer Controls */}
          <div className="w-full max-w-6xl pt-3 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
            <div className="text-xs text-slate-400 flex items-center gap-2">
              <span className="hidden sm:inline">Kéo nút tròn ở giữa để xem trực tiếp sự khác biệt trước và sau khi AI xử lý.</span>
            </div>

            <div className="flex items-center gap-2.5 ml-auto">
              {/* Button: Download Retouched Image */}
              <button
                type="button"
                onClick={handleDownloadRetouchedImage}
                className="px-4 py-2.5 rounded-xl font-bold text-xs bg-slate-800 hover:bg-slate-700 text-sky-400 hover:text-sky-300 border border-sky-500/30 flex items-center gap-1.5 cursor-pointer transition"
              >
                <Download className="w-4 h-4" />
                <span>Tải ảnh AI (HD)</span>
              </button>

              {/* Button: Apply as main displayed image */}
              <button
                type="button"
                onClick={() => {
                  setDisplayMode('retouched');
                  setShowCompareModal(false);
                  showToast('✓ Đã áp dụng ảnh AI làm ảnh hiển thị chính!');
                }}
                className="px-5 py-2.5 rounded-xl font-bold text-xs bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white shadow-lg flex items-center gap-1.5 cursor-pointer transition active:scale-98"
              >
                <Check className="w-4 h-4 stroke-[2.5]" />
                <span>Áp dụng ảnh này</span>
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
