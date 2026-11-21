/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Download,
  Smartphone,
  Share,
  PlusSquare,
  MoreVertical,
  Monitor,
  X,
  CheckCircle2,
} from 'lucide-react';
import { usePWAInstall } from '../../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  variant?: 'header' | 'login';
}

type GuideTab = 'ios' | 'android' | 'desktop';

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ variant = 'header' }) => {
  const { isInstallable, isInstalled, isIOS, isAndroid, install } = usePWAInstall();
  const [showGuideModal, setShowGuideModal] = useState(false);
  const [guideTab, setGuideTab] = useState<GuideTab>('android');

  useEffect(() => {
    if (isIOS) setGuideTab('ios');
    else if (isAndroid) setGuideTab('android');
    else setGuideTab('desktop');
  }, [isIOS, isAndroid]);

  // Already running as an installed standalone app -> hide button
  if (isInstalled) {
    return null;
  }

  const handleTrigger = async () => {
    if (isInstallable) {
      const accepted = await install();
      if (accepted) return;
    }
    setShowGuideModal(true);
  };

  return (
    <>
      {variant === 'login' ? (
        <button
          type="button"
          onClick={handleTrigger}
          className="mt-4 w-full py-2.5 px-4 rounded-xl border border-emerald-200 bg-emerald-50/80 hover:bg-emerald-100/80 text-emerald-800 text-xs font-bold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
        >
          {isInstallable ? (
            <Download className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <Smartphone className="w-4 h-4 text-emerald-600 shrink-0" />
          )}
          <span>
            {isInstallable
              ? 'Cài Đặt Ứng Dụng FitTrack Pro'
              : 'Cài FitTrack Pro Thành App (iOS / Android / PC)'}
          </span>
        </button>
      ) : (
        <button
          type="button"
          onClick={handleTrigger}
          className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition-colors cursor-pointer whitespace-nowrap"
          title="Cài ứng dụng FitTrack Pro lên điện thoại hoặc máy tính"
        >
          {isInstallable ? (
            <Download className="w-3.5 h-3.5 shrink-0" />
          ) : (
            <Smartphone className="w-3.5 h-3.5 shrink-0" />
          )}
          <span>Cài App</span>
        </button>
      )}

      {showGuideModal &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto"
            onClick={() => setShowGuideModal(false)}
          >
            <div
              className="w-full max-w-md max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl bg-white p-5 sm:p-6 shadow-2xl border border-slate-200 space-y-4 text-left my-auto"
              onClick={(e) => e.stopPropagation()}
            >
            {/* Header with new app icon preview */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <img
                  src="./apple-touch-icon.png"
                  alt="FitTrack Pro"
                  className="w-13 h-13 rounded-2xl shadow-md border border-emerald-100 shrink-0 object-cover"
                />
                <div>
                  <h3 className="text-sm sm:text-base font-extrabold text-slate-900">
                    Cài FitTrack Pro Thành App
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Mở toàn màn hình như app thật · Dùng chung dữ liệu thời gian thực
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowGuideModal(false)}
                className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer"
                aria-label="Đóng"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Platform switcher tabs */}
            <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200/80 text-xs font-bold">
              <button
                type="button"
                onClick={() => setGuideTab('ios')}
                className={`py-1.5 px-2 rounded-lg transition-colors cursor-pointer ${
                  guideTab === 'ios'
                    ? 'bg-white text-emerald-700 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                iPhone / iPad
              </button>
              <button
                type="button"
                onClick={() => setGuideTab('android')}
                className={`py-1.5 px-2 rounded-lg transition-colors cursor-pointer ${
                  guideTab === 'android'
                    ? 'bg-white text-emerald-700 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Android
              </button>
              <button
                type="button"
                onClick={() => setGuideTab('desktop')}
                className={`py-1.5 px-2 rounded-lg transition-colors cursor-pointer ${
                  guideTab === 'desktop'
                    ? 'bg-white text-emerald-700 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Máy tính
              </button>
            </div>

            {/* Platform-specific instructions */}
            {guideTab === 'ios' && (
              <div className="space-y-2.5 text-xs text-slate-700">
                <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-slate-50 border border-slate-200/80">
                  <span className="w-5 h-5 rounded-full bg-emerald-600 text-white font-bold text-[11px] flex items-center justify-center shrink-0 mt-0.5">
                    1
                  </span>
                  <div className="leading-relaxed">
                    Mở link web bằng trình duyệt <strong>Safari</strong>, sau đó nhấn biểu tượng{' '}
                    <span className="inline-flex items-center gap-1 font-bold text-slate-900 px-1.5 py-0.5 rounded bg-white border border-slate-200">
                      <Share className="w-3 h-3 text-emerald-600" /> Chia sẻ
                    </span>{' '}
                    ở thanh dưới cùng.
                  </div>
                </div>

                <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-slate-50 border border-slate-200/80">
                  <span className="w-5 h-5 rounded-full bg-emerald-600 text-white font-bold text-[11px] flex items-center justify-center shrink-0 mt-0.5">
                    2
                  </span>
                  <div className="leading-relaxed">
                    Cuộn xuống chọn{' '}
                    <span className="inline-flex items-center gap-1 font-bold text-slate-900 px-1.5 py-0.5 rounded bg-white border border-slate-200">
                      <PlusSquare className="w-3 h-3 text-emerald-600" /> Thêm vào MH chính
                    </span>{' '}
                    → nhấn <strong>Thêm</strong> (nếu đã có bản cũ trên iPhone, hãy xóa bản cũ trước để nhận logo mới).
                  </div>
                </div>
              </div>
            )}

            {guideTab === 'android' && (
              <div className="space-y-2.5 text-xs text-slate-700">
                <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-slate-50 border border-slate-200/80">
                  <span className="w-5 h-5 rounded-full bg-emerald-600 text-white font-bold text-[11px] flex items-center justify-center shrink-0 mt-0.5">
                    1
                  </span>
                  <div className="leading-relaxed">
                    Mở link web trực tiếp bằng <strong>Google Chrome</strong> (tránh mở trong Zalo/Facebook).
                  </div>
                </div>

                <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-slate-50 border border-slate-200/80">
                  <span className="w-5 h-5 rounded-full bg-emerald-600 text-white font-bold text-[11px] flex items-center justify-center shrink-0 mt-0.5">
                    2
                  </span>
                  <div className="leading-relaxed">
                    Bấm nút <strong>Cài App</strong> trên thanh tiêu đề hoặc nhấn{' '}
                    <span className="inline-flex items-center gap-0.5 font-bold text-slate-900 px-1.5 py-0.5 rounded bg-white border border-slate-200">
                      <MoreVertical className="w-3 h-3 text-emerald-600" /> Menu
                    </span>{' '}
                    góc trên phải → chọn <strong>Cài đặt ứng dụng</strong>.
                  </div>
                </div>
              </div>
            )}

            {guideTab === 'desktop' && (
              <div className="space-y-2.5 text-xs text-slate-700">
                <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-slate-50 border border-slate-200/80">
                  <span className="w-5 h-5 rounded-full bg-emerald-600 text-white font-bold text-[11px] flex items-center justify-center shrink-0 mt-0.5">
                    1
                  </span>
                  <div className="leading-relaxed">
                    Mở trực tiếp địa chỉ web ứng dụng trên trình duyệt <strong>Chrome</strong> hoặc <strong>Edge</strong> (không mở qua khung nhúng).
                  </div>
                </div>

                <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-slate-50 border border-slate-200/80">
                  <span className="w-5 h-5 rounded-full bg-emerald-600 text-white font-bold text-[11px] flex items-center justify-center shrink-0 mt-0.5">
                    2
                  </span>
                  <div className="leading-relaxed">
                    Nhấn biểu tượng{' '}
                    <span className="inline-flex items-center gap-1 font-bold text-slate-900 px-1.5 py-0.5 rounded bg-white border border-slate-200">
                      <Monitor className="w-3 h-3 text-emerald-600" /> Cài đặt FitTrack Pro
                    </span>{' '}
                    ở góc phải thanh địa chỉ (hoặc bấm trực tiếp nút <strong>Cài App</strong> trên màn hình).
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-start gap-2 p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-[11px] text-emerald-900">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>
                App tự động đồng bộ Database và <strong>tự cập nhật phiên bản mới</strong> mỗi khi hệ thống update — không cần cài lại.
              </span>
            </div>

            <button
              type="button"
              onClick={() => setShowGuideModal(false)}
              className="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-colors cursor-pointer"
            >
              Đã hiểu
            </button>
          </div>
        </div>,
          document.body
        )}
    </>
  );
};
