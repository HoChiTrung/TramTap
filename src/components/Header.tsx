/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { useHealth } from '../context/HealthContext';
import { APP_VERSION, APP_BUILD_TIME } from '../utils/appVersion';
import { PWAInstallButton } from './common/PWAInstallButton';
import {
  Bell,
  Printer,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  LogOut,
  BookOpen,
} from 'lucide-react';

export const Header: React.FC = () => {
  const {
    currentUser,
    isAdmin,
    logout,
    notifications,
    unreadNotificationCount,
    markNotificationRead,
    setOpenReportModal,
    setOpenStandardsModal,
  } = useHealth();

  const [showNotifications, setShowNotifications] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);

  const closeAllMenus = () => {
    setShowNotifications(false);
    setShowUserMenu(false);
  };

  const roleBadgeLabel =
    currentUser?.role === 'admin'
      ? 'Quản Trị Viên (Admin)'
      : currentUser?.role === 'trainer'
      ? 'Huấn Luyện Viên'
      : 'Tài khoản Học Viên';

  const roleShortCode =
    currentUser?.role === 'admin'
      ? 'ADM'
      : currentUser?.role === 'trainer'
      ? 'HLV'
      : 'HV';

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-xs no-print">
      {(showNotifications || showUserMenu) && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/15 sm:bg-transparent"
          onClick={closeAllMenus}
          aria-hidden="true"
        />
      )}
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 relative z-50">
        <div className="flex items-center justify-between h-16 gap-2">
          {/* Logo & Brand */}
          <div className="flex items-center space-x-2.5 sm:space-x-3 min-w-0">
            <img
              src="./pwa-192x192.png"
              alt="FitTrack Pro"
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl shadow-md shadow-emerald-500/20 shrink-0 object-cover"
            />
            <div className="min-w-0">
              <div className="flex items-center space-x-1.5 sm:space-x-2">
                <span className="font-extrabold text-base sm:text-lg tracking-tight bg-gradient-to-r from-slate-900 via-slate-800 to-emerald-700 bg-clip-text text-transparent truncate">
                  FitTrack Pro
                </span>
                <span
                  title={APP_BUILD_TIME ? `Phiên bản ${APP_VERSION} · Build ${APP_BUILD_TIME}` : `Phiên bản ${APP_VERSION}`}
                  className="px-1.5 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-700 font-mono tabular-nums text-[10px] sm:text-[11px] font-bold tracking-tight shrink-0 leading-none"
                >
                  {APP_VERSION}
                </span>
              </div>
              <p className="hidden sm:block text-xs text-slate-500 font-medium truncate">
                Quản lý & Theo dõi 10 Chỉ số Sức khỏe Học viên
              </p>
            </div>
          </div>

          {/* Reference Tables Action (hidden for Admin) */}
          {!isAdmin && (
            <div className="hidden lg:flex items-center space-x-3">
              <button
                onClick={() => setOpenStandardsModal(true)}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-bold text-slate-700 transition-colors border border-slate-200 cursor-pointer"
                title="Xem bảng mỡ nội tạng, chiều cao cân nặng lý tưởng, thể hình 1-9"
              >
                <BookOpen className="w-3.5 h-3.5 text-emerald-600" />
                <span>Bảng Chỉ Số Cơ Thể</span>
              </button>
            </div>
          )}

          {/* Right Controls: Actions, Notifications & User Account */}
          <div className="flex items-center space-x-1.5 sm:space-x-3 shrink-0">
            {/* In-App PWA Install Trigger (auto-hides when installed) */}
            <PWAInstallButton variant="header" />

            {/* Quick PDF Report Trigger (hidden for Admin) */}
            {!isAdmin && (
              <button
                onClick={() => setOpenReportModal(true)}
                className="hidden sm:inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors border border-slate-200 cursor-pointer"
                title="Xuất Báo Cáo In A4 Chuẩn SRS 3.5"
              >
                <Printer className="w-3.5 h-3.5 text-slate-600" />
                <span>Báo Cáo PDF</span>
              </button>
            )}

            {/* Smart Notifications Bell */}
            <div className="relative">
              <button
                onClick={() => {
                  const next = !showNotifications;
                  closeAllMenus();
                  setShowNotifications(next);
                }}
                className="relative p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                title="Thông báo tự động"
              >
                <Bell className="w-5 h-5" />
                {unreadNotificationCount > 0 && (
                  <span className="absolute top-1.5 right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white ring-2 ring-white">
                    {unreadNotificationCount}
                  </span>
                )}
              </button>

              {/* Notification Dropdown */}
              {showNotifications && (
                <div className="fixed inset-x-3 top-[68px] sm:inset-x-auto sm:absolute sm:right-0 sm:top-full sm:mt-2 w-auto sm:w-96 max-h-[calc(100vh-5.5rem)] flex flex-col bg-white rounded-2xl sm:rounded-xl shadow-2xl sm:shadow-xl border border-slate-200 py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                  <div className="px-4 py-2 border-b border-slate-100 flex items-center justify-between gap-2 shrink-0">
                    <div className="flex items-center space-x-2 min-w-0">
                      <span className="font-bold text-sm text-slate-900 truncate">Thông báo thông minh</span>
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800 shrink-0">
                        {unreadNotificationCount} mới
                      </span>
                    </div>
                    <button
                      onClick={() => setShowNotifications(false)}
                      className="sm:hidden text-xs font-semibold text-slate-500 hover:text-slate-800 px-2 py-1 rounded-lg bg-slate-100 shrink-0"
                    >
                      Đóng
                    </button>
                  </div>
                  <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                    {notifications.length === 0 ? (
                      <div className="p-4 text-center text-xs text-slate-500">
                        Không có thông báo mới
                      </div>
                    ) : (
                      notifications.map((n) => (
                        <div
                          key={n.id}
                          onClick={() => markNotificationRead(n.id)}
                          className={`p-3.5 sm:p-3 text-xs hover:bg-slate-50 transition-colors cursor-pointer ${
                            !n.read ? 'bg-amber-50/50' : ''
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-start space-x-1.5 min-w-0 flex-1">
                              {n.priority === 'high' ? (
                                <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                              ) : (
                                <CheckCircle2 className="w-4 h-4 text-teal-500 shrink-0 mt-0.5" />
                              )}
                              <span className="font-bold text-slate-800 break-words">{n.title}</span>
                            </div>
                            <span className="text-[10px] text-slate-400 shrink-0">{n.useCaseId}</span>
                          </div>
                          <p className="mt-1 text-slate-600 leading-relaxed pl-5.5 break-words">
                            {n.message}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* User Account & Logout Menu */}
            <div className="relative">
              <button
                onClick={() => {
                  const next = !showUserMenu;
                  closeAllMenus();
                  setShowUserMenu(next);
                }}
                className="flex items-center space-x-1 sm:space-x-2 p-1 sm:p-1.5 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-slate-800 to-slate-900 text-white flex items-center justify-center font-bold text-xs ring-2 ring-emerald-500/30 shrink-0">
                  {roleShortCode}
                </div>
                <div className="hidden md:block text-left">
                  <div className="text-xs font-extrabold text-slate-900 leading-tight">
                    {currentUser?.fullName || currentUser?.username}
                  </div>
                  <div className="text-[10px] text-emerald-700 font-bold">
                    {roleBadgeLabel}
                  </div>
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              </button>

              {showUserMenu && (
                <div className="fixed inset-x-3 top-[68px] sm:inset-x-auto sm:absolute sm:right-0 sm:top-full sm:mt-2 w-auto sm:w-56 bg-white rounded-2xl shadow-2xl sm:shadow-xl border border-slate-200 py-2 z-50 animate-in fade-in zoom-in-95 duration-100">
                  <div className="px-4 py-2 border-b border-slate-100">
                    <div className="text-xs font-bold text-slate-900">{currentUser?.fullName}</div>
                    <div className="text-[11px] text-slate-400 font-mono">@{currentUser?.username}</div>
                    <span className="mt-1 inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                      Role: {roleBadgeLabel}
                    </span>
                  </div>

                  {!isAdmin && (
                    <>
                      <button
                        onClick={() => {
                          setShowUserMenu(false);
                          setOpenReportModal(true);
                        }}
                        className="sm:hidden w-full flex items-center space-x-2 px-4 py-2 text-xs text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
                      >
                        <Printer className="w-4 h-4 text-slate-600" />
                        <span>Xuất Báo Cáo PDF</span>
                      </button>

                      <button
                        onClick={() => {
                          setShowUserMenu(false);
                          setOpenStandardsModal(true);
                        }}
                        className="w-full flex items-center space-x-2 px-4 py-2 text-xs text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
                      >
                        <BookOpen className="w-4 h-4 text-emerald-600" />
                        <span>Tra Cứu Bảng Chỉ Số Cơ Thể</span>
                      </button>
                    </>
                  )}

                  <button
                    onClick={() => {
                      setShowUserMenu(false);
                      logout();
                    }}
                    className="w-full flex items-center space-x-2 px-4 py-2 text-xs font-bold text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Đăng Xuất Khỏi Hệ Thống</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};
