/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { StudentProfile } from '../../types/health';
import { useHealth } from '../../context/HealthContext';
import { calculateHealthScore, detectAnomalies } from '../../utils/healthCalculations';
import { AddStudentModal } from '../modals/AddStudentModal';
import {
  Search,
  UserPlus,
  Users,
  Sparkles,
  AlertTriangle,
  ChevronRight,
  Phone,
  Trash2,
  UserCheck,
} from 'lucide-react';

interface StudentListProps {
  onSelectStudent: (student: StudentProfile) => void;
}

export const StudentList: React.FC<StudentListProps> = ({ onSelectStudent }) => {
  const {
    students,
    selectedStudent,
    getStudentMetrics,
    deleteStudent,
    canCreateStudent,
    currentUser,
    isAdmin,
  } = useHealth();
  const [searchTerm, setSearchTerm] = useState('');
  const [genderFilter, setGenderFilter] = useState<string>('ALL');
  const [alertFilter, setAlertFilter] = useState<'ALL' | 'HAS_ALERT' | 'HIGH_SCORE'>('ALL');
  const [showAddModal, setShowAddModal] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Compute student stats with score & anomalies
  const studentsWithStats = useMemo(() => {
    return students.map((s) => {
      const metrics = getStudentMetrics(s.id);
      const latest = metrics[metrics.length - 1];
      const healthScore = latest ? calculateHealthScore(s, latest) : null;
      const anomalies = latest ? detectAnomalies(s, latest, metrics) : [];
      return {
        student: s,
        metrics,
        latest,
        healthScore,
        anomalies,
      };
    });
  }, [students, getStudentMetrics]);

  // Filtered List
  const filtered = useMemo(() => {
    return studentsWithStats.filter(({ student: s, healthScore, anomalies }) => {
      const matchSearch =
        s.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.phone.includes(searchTerm) ||
        s.healthGoal.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (s.trainerName || '').toLowerCase().includes(searchTerm.toLowerCase());

      const matchGender = genderFilter === 'ALL' || s.gender === genderFilter;

      let matchAlert = true;
      if (alertFilter === 'HAS_ALERT') {
        matchAlert = anomalies.length > 0;
      } else if (alertFilter === 'HIGH_SCORE') {
        matchAlert = (healthScore?.totalScore || 0) >= 80;
      }

      return matchSearch && matchGender && matchAlert;
    });
  }, [studentsWithStats, searchTerm, genderFilter, alertFilter]);

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Top Banner / Stat Overview */}
      <div className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-6 border border-slate-200/90 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight">
              Danh Sách Học Viên Đang Quản Lý
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 shrink-0">
              {students.length} hồ sơ
            </span>
            {!isAdmin && currentUser && (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-50 text-indigo-800 border border-indigo-200">
                HLV phụ trách: {currentUser.fullName}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Theo dõi hành trình thể trạng, kiểm soát rủi ro chuyển hóa và chuẩn hóa vận hành dịch vụ HLV
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          {canCreateStudent && (
            <button
              onClick={() => setShowAddModal(true)}
              className="w-full sm:w-auto justify-center px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-emerald-600/20 flex items-center space-x-2 cursor-pointer"
            >
              <UserPlus className="w-4 h-4 shrink-0" />
              <span>Thêm Học Viên Mới</span>
            </button>
          )}
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="bg-white rounded-2xl p-3.5 sm:p-4 border border-slate-200/90 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
        {/* Search Input */}
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Tìm theo tên, SĐT, mục tiêu, HLV..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-hidden font-medium"
          />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          {/* Gender */}
          <select
            value={genderFilter}
            onChange={(e) => setGenderFilter(e.target.value)}
            className="flex-1 sm:flex-initial min-w-0 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-700 outline-hidden"
          >
            <option value="ALL">Tất cả giới tính</option>
            <option value="Nam">Nam</option>
            <option value="Nữ">Nữ</option>
          </select>

          {/* Alert Filter */}
          <select
            value={alertFilter}
            onChange={(e: any) => setAlertFilter(e.target.value)}
            className="flex-1 sm:flex-initial min-w-0 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-700 outline-hidden"
          >
            <option value="ALL">Tất cả trạng thái</option>
            <option value="HAS_ALERT">Có cảnh báo sức khỏe ⚠️</option>
            <option value="HIGH_SCORE">Health Score cao (≥ 80) ⭐</option>
          </select>
        </div>
      </div>

      {/* Students Grid */}
      {filtered.length === 0 ? (
        <div className="py-20 text-center bg-white rounded-2xl sm:rounded-3xl border border-slate-200">
          <Users className="w-12 h-12 text-slate-300 mx-auto mb-2" />
          <h4 className="font-bold text-slate-700 text-sm">Không tìm thấy học viên phù hợp</h4>
          <p className="text-xs text-slate-400 mt-1">
            Bấm &ldquo;Thêm Học Viên Mới&rdquo; để khởi tạo hồ sơ học viên đầu tiên vào Database
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map(({ student: s, metrics, latest, healthScore, anomalies }) => {
            const isSelected = selectedStudent?.id === s.id;
            return (
              <div
                key={s.id}
                onClick={() => onSelectStudent(s)}
                className={`bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-5 border transition-all cursor-pointer hover:shadow-md relative group ${
                  isSelected
                    ? 'border-emerald-600 ring-2 ring-emerald-500/20 shadow-sm'
                    : 'border-slate-200/90 hover:border-slate-300'
                }`}
              >
                {/* Top Row: Name, Score Badge */}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-extrabold text-slate-900 text-sm group-hover:text-emerald-700 transition-colors">
                          {s.fullName}
                        </h3>
                        <span className="text-[11px] font-semibold text-slate-500">
                          {s.gender} • {s.age}t
                        </span>
                        {s.trainerName && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-800 border border-indigo-200 inline-flex items-center gap-1">
                            <UserCheck className="w-3 h-3" />
                            HLV: {s.trainerName}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-400 flex items-center space-x-2 mt-0.5">
                        <span className="flex items-center">
                          <Phone className="w-3 h-3 mr-1 text-slate-400" />
                          {s.phone}
                        </span>
                        <span>•</span>
                        <span>{s.height}m</span>
                      </div>
                    </div>
                  </div>

                  {/* Health Score Pill */}
                  {healthScore ? (
                    <div className="text-right">
                      <div className="inline-flex items-center px-2.5 py-1 rounded-xl text-xs font-extrabold bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-xs">
                        <Sparkles className="w-3 h-3 mr-1" />
                        {healthScore.totalScore}đ
                      </div>
                      <div className="text-[10px] text-slate-400 font-medium mt-0.5">
                        {healthScore.tier}
                      </div>
                    </div>
                  ) : (
                    <span className="text-[11px] text-slate-400 italic">Chưa đo</span>
                  )}
                </div>

                {/* Health Goal */}
                <div className="mt-3 p-2 bg-slate-50 rounded-xl text-xs text-slate-600 line-clamp-1">
                  <span className="font-bold text-slate-700">Mục tiêu:</span> {s.healthGoal}
                </div>

                {/* Latest Key Metrics Preview */}
                {latest ? (
                  <div className="mt-3 grid grid-cols-4 gap-2 pt-2 border-t border-slate-100 text-center text-xs">
                    <div className="p-1.5 bg-slate-50/80 rounded-lg">
                      <div className="text-[10px] text-slate-400">Cân nặng</div>
                      <div className="font-extrabold text-slate-800">{latest.weight}kg</div>
                    </div>
                    <div className="p-1.5 bg-slate-50/80 rounded-lg">
                      <div className="text-[10px] text-slate-400">Mỡ nội tạng</div>
                      <div
                        className={`font-extrabold ${
                          latest.visceralFat >= 10 ? 'text-rose-600' : 'text-slate-800'
                        }`}
                      >
                        Cấp {latest.visceralFat}
                      </div>
                    </div>
                    <div className="p-1.5 bg-slate-50/80 rounded-lg">
                      <div className="text-[10px] text-slate-400">Cơ bắp</div>
                      <div className="font-extrabold text-emerald-700">{latest.muscleMass}kg</div>
                    </div>
                    <div className="p-1.5 bg-slate-50/80 rounded-lg">
                      <div className="text-[10px] text-slate-400">Vòng eo</div>
                      <div className="font-extrabold text-slate-800">{latest.waist}cm</div>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 py-2 text-center text-xs text-slate-400 border-t border-slate-100">
                    Chưa có nhật ký cân đo
                  </div>
                )}

                {/* Anomaly Badges */}
                {anomalies.length > 0 && (
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {anomalies.map((a, i) => (
                      <span
                        key={i}
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          a.severity === 'high'
                            ? 'bg-rose-100 text-rose-800 border border-rose-200'
                            : 'bg-amber-100 text-amber-800 border border-amber-200'
                        }`}
                      >
                        <AlertTriangle className="w-3 h-3 mr-1" />
                        {a.type === 'VISCERAL_FAT_HIGH'
                          ? 'Mỡ nội tạng ≥ 10'
                          : a.type === 'EARLY_AGING'
                          ? 'Lão hóa sớm'
                          : 'Chững tiến trình'}
                      </span>
                    ))}
                  </div>
                )}

                {/* Bottom Actions */}
                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                  <span className="text-[11px] text-slate-400">
                    {metrics.length} lần cân đo • Lần cuối: {latest ? latest.date : 'Chưa có'}
                  </span>

                  <div className="flex items-center space-x-1" onClick={(e) => e.stopPropagation()}>
                    {confirmDeleteId === s.id ? (
                      <div className="flex items-center space-x-1">
                        <button
                          type="button"
                          onClick={() => {
                            deleteStudent(s.id);
                            setConfirmDeleteId(null);
                          }}
                          className="px-2 py-1 bg-rose-600 text-white rounded-lg text-[10px] font-bold cursor-pointer"
                        >
                          Xác nhận xóa
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="px-2 py-1 bg-slate-200 text-slate-700 rounded-lg text-[10px] font-bold cursor-pointer"
                        >
                          Hủy
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(s.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer"
                        title="Xóa hồ sơ"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onSelectStudent(s)}
                      className="font-bold text-emerald-700 flex items-center group-hover:translate-x-0.5 transition-transform cursor-pointer"
                    >
                      <span>Chi tiết</span>
                      <ChevronRight className="w-4 h-4 ml-0.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Student Modal */}
      {showAddModal && <AddStudentModal onClose={() => setShowAddModal(false)} />}
    </div>
  );
};
