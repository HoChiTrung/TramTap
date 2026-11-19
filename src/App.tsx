/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { HealthProvider, useHealth } from './context/HealthContext';
import { LoginPage } from './components/auth/LoginPage';
import { Header } from './components/Header';
import { StudentList } from './components/trainer/StudentList';
import { StudentDetailView } from './components/trainer/StudentDetailView';
import { StudentPortal } from './components/student/StudentPortal';
import { NutritionTicketManager } from './components/nutrition/NutritionTicketManager';
import { TrainerManagementView } from './components/admin/TrainerManagementView';
import { PrintableReportModal } from './components/reports/PrintableReportModal';
import { ReferenceStandardsModal } from './components/common/ReferenceStandardsModal';
import {
  Users,
  ShieldCheck,
  BookOpen,
  Utensils,
  AlertTriangle,
  RefreshCw,
  X,
} from 'lucide-react';

const MainApp: React.FC = () => {
  const {
    currentUser,
    role,
    isAdmin,
    selectedStudent,
    setSelectedStudent,
    setOpenStandardsModal,
    dbStatus,
    dbError,
    clearDbError,
    refreshDatabase,
  } = useHealth();

  const [trainerSubView, setTrainerSubView] = useState<
    'directory' | 'detail' | 'nutrition' | 'trainers'
  >('directory');
  const [isReconnecting, setIsReconnecting] = useState(false);

  const handleRetryDb = async () => {
    setIsReconnecting(true);
    await refreshDatabase();
    setIsReconnecting(false);
  };

  // If not authenticated, show the complete LoginPage
  if (!currentUser) {
    return <LoginPage />;
  }

  return (
    <div className="min-h-screen bg-slate-100/70 text-slate-900 pb-16 font-sans overflow-x-clip">
      <Header />

      <main className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 pt-4 sm:pt-6">
        {/* Strict Database Error Notification Banner */}
        {(dbError || !dbStatus.connected) && (
          <div className="mb-4 p-3.5 rounded-2xl bg-rose-50 border border-rose-300 text-rose-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs no-print">
            <div className="flex items-start space-x-2.5 text-xs">
              <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <div className="font-extrabold text-rose-950">
                  Cảnh báo Kết nối Cơ sở dữ liệu PostgreSQL (Aiven Cloud)
                </div>
                <p className="text-rose-800 mt-0.5">
                  {dbError ||
                    dbStatus.error ||
                    'Không thể kết nối đến Database. Hệ thống KHÔNG lưu tạm trên trình duyệt để tránh tạo hoặc cập nhật thông tin mà không được lưu thật.'}
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-2 shrink-0">
              <button
                type="button"
                onClick={handleRetryDb}
                disabled={isReconnecting}
                className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold inline-flex items-center space-x-1.5 transition-colors cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isReconnecting ? 'animate-spin' : ''}`} />
                <span>{isReconnecting ? 'Đang kết nối...' : 'Thử kết nối lại DB'}</span>
              </button>
              {dbError && (
                <button
                  type="button"
                  onClick={clearDbError}
                  className="p-1.5 text-rose-600 hover:bg-rose-100 rounded-lg cursor-pointer"
                  title="Đóng thông báo"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        )}
        {role === 'trainer' || role === 'admin' ? (
          <div>
            {/* Trainer / Admin Uniform Sub-Navigation Bar */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 mb-4 sm:mb-5 bg-white p-2.5 sm:p-3 rounded-2xl border border-slate-200/90 shadow-2xs no-print">
              <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 text-xs min-w-0">
                <button
                  onClick={() => setTrainerSubView('directory')}
                  className={`h-9 px-3.5 rounded-xl font-bold transition-all inline-flex items-center justify-center space-x-1.5 cursor-pointer border whitespace-nowrap ${
                    trainerSubView === 'directory' || trainerSubView === 'detail'
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                      : 'bg-slate-50 text-slate-700 border-slate-200/90 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <Users className="w-4 h-4 shrink-0" />
                  <span>Danh Sách Học Viên</span>
                </button>

                <button
                  onClick={() => setTrainerSubView('nutrition')}
                  className={`h-9 px-3.5 rounded-xl font-bold transition-all inline-flex items-center justify-center space-x-1.5 cursor-pointer border whitespace-nowrap ${
                    trainerSubView === 'nutrition'
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                      : 'bg-slate-50 text-slate-700 border-slate-200/90 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <Utensils className="w-4 h-4 shrink-0" />
                  <span>Đánh Phiếu Bữa Ăn</span>
                </button>

                {isAdmin && (
                  <button
                    onClick={() => setTrainerSubView('trainers')}
                    className={`h-9 px-3.5 rounded-xl font-bold transition-all inline-flex items-center justify-center space-x-1.5 cursor-pointer border whitespace-nowrap ${
                      trainerSubView === 'trainers'
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                        : 'bg-slate-50 text-slate-700 border-slate-200/90 hover:bg-slate-100 hover:text-slate-900'
                    }`}
                  >
                    <ShieldCheck className="w-4 h-4 shrink-0" />
                    <span>Quản Lý HLV &amp; Tài Khoản</span>
                  </button>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 lg:pt-0 border-t lg:border-t-0 border-slate-100 shrink-0">
                <button
                  onClick={() => setOpenStandardsModal(true)}
                  className="w-full sm:w-auto h-9 px-3.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold inline-flex items-center justify-center space-x-1.5 transition-colors cursor-pointer border border-slate-200 whitespace-nowrap"
                >
                  <BookOpen className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Bảng Chỉ Số Cơ Thể</span>
                </button>
              </div>
            </div>

            {/* View Render */}
            {trainerSubView === 'trainers' && isAdmin ? (
              <TrainerManagementView />
            ) : trainerSubView === 'nutrition' ? (
              <NutritionTicketManager
                mode="trainer"
                focusedStudent={selectedStudent}
                defaultView="batch"
              />
            ) : trainerSubView === 'directory' || !selectedStudent ? (
              <StudentList
                onSelectStudent={(student) => {
                  setSelectedStudent(student);
                  setTrainerSubView('detail');
                }}
              />
            ) : (
              <StudentDetailView student={selectedStudent} />
            )}
          </div>
        ) : (
          /* Student Portal View */
          <div>
            {selectedStudent ? (
              <StudentPortal student={selectedStudent} />
            ) : (
              <div className="py-20 text-center bg-white rounded-3xl border border-slate-200">
                <p className="text-sm font-semibold text-slate-600">
                  Đang đồng bộ hồ sơ học viên của bạn...
                </p>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Printable Report Modal */}
      <PrintableReportModal />

      {/* Reference Standards Modal (From Center Charts) */}
      <ReferenceStandardsModal />
    </div>
  );
};

export default function App() {
  return (
    <HealthProvider>
      <MainApp />
    </HealthProvider>
  );
}
