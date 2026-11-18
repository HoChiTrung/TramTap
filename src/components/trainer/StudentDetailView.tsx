/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { StudentProfile } from '../../types/health';
import { useHealth } from '../../context/HealthContext';
import {
  calculateHealthScore,
  detectAnomalies,
  calculateGapAnalysis,
  calculateCalorieGoalBreakdown,
} from '../../utils/healthCalculations';
import { MetricsCharts } from '../common/MetricsCharts';
import { AIAdviceQueue } from './AIAdviceQueue';
import { NutritionTicketManager } from '../nutrition/NutritionTicketManager';
import { AddMetricModal } from '../modals/AddMetricModal';
import { AddStudentModal } from '../modals/AddStudentModal';
import {
  Scale,
  Activity,
  AlertTriangle,
  Target,
  Sparkles,
  Calendar,
  Phone,
  Plus,
  Trash2,
  Edit2,
  Utensils,
  Printer,
  UserCheck,
} from 'lucide-react';

interface StudentDetailViewProps {
  student: StudentProfile;
}

export const StudentDetailView: React.FC<StudentDetailViewProps> = ({ student }) => {
  const {
    getStudentMetrics,
    getStudentAdvices,
    getStudentMeals,
    deleteMetricRecord,
    setOpenReportModal,
  } = useHealth();

  const [activeTab, setActiveTab] = useState<
    'metrics' | 'charts' | 'ai-advice' | 'nutrition'
  >('metrics');

  const [showAddMetricModal, setShowAddMetricModal] = useState(false);
  const [showEditStudentModal, setShowEditStudentModal] = useState(false);

  // Data for this student
  const studentMetrics = getStudentMetrics(student.id);
  const studentAdvices = getStudentAdvices(student.id);
  const studentMeals = getStudentMeals(student.id);

  // Count used meal ticket portions for badge display
  const totalPortions = student.targetMetrics?.totalMealPortions || 60;
  const usedPortionsCount = studentMeals.reduce((acc, m) => {
    let c = 0;
    if (m.macros?.morningStatus === 'used' || m.macros?.morningStatus === 'takeaway') c += 1;
    if (m.macros?.afternoonStatus === 'used' || m.macros?.afternoonStatus === 'takeaway') c += 1;
    return acc + c;
  }, 0);

  const latestMetric = studentMetrics[studentMetrics.length - 1];
  const firstMetric = studentMetrics[0];

  // Algorithmic Health Score & Anomaly Detection
  const healthScore = latestMetric ? calculateHealthScore(student, latestMetric) : null;
  const anomalies = latestMetric ? detectAnomalies(student, latestMetric, studentMetrics) : [];
  const gapAnalysis = calculateGapAnalysis(student, latestMetric, firstMetric);
  const caloriePlan = calculateCalorieGoalBreakdown(
    latestMetric?.bmr || 1550,
    latestMetric?.weight || 65,
    student,
    1.375,
    latestMetric?.visceralFat
  );

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Profile Header Banner */}
      <div className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-6 border border-slate-200/90 shadow-xs relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 sm:gap-6">
          {/* Core Bio */}
          <div className="flex items-start sm:items-center min-w-0">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight break-words">
                  {student.fullName}
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700">
                  {student.gender} • {student.age} tuổi
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                  {student.height} m
                </span>
                {student.trainerName && (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-50 text-indigo-800 border border-indigo-200 inline-flex items-center gap-1">
                    <UserCheck className="w-3 h-3" />
                    HLV: {student.trainerName}
                  </span>
                )}
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                <span className="flex items-center">
                  <Phone className="w-3.5 h-3.5 mr-1 text-slate-400 shrink-0" />
                  {student.phone}
                </span>
                <span className="flex items-center">
                  <Calendar className="w-3.5 h-3.5 mr-1 text-slate-400 shrink-0" />
                  Sinh ngày: {student.dateOfBirth}
                </span>
              </div>

              {/* Baseline Target Pill */}
              <div className="mt-2.5 p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-xs break-words">
                <span className="font-bold text-slate-700 mr-1.5 inline-flex items-center">
                  <Target className="w-3.5 h-3.5 mr-1 text-emerald-600 shrink-0" />
                  Mục tiêu sức khỏe:
                </span>
                <span className="text-slate-600 font-medium">{student.healthGoal}</span>
              </div>
            </div>
          </div>

          {/* Quick Buttons */}
          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            <button
              onClick={() => setShowEditStudentModal(true)}
              className="flex-1 sm:flex-initial justify-center px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors flex items-center space-x-1 whitespace-nowrap cursor-pointer"
            >
              <Edit2 className="w-3.5 h-3.5 shrink-0" />
              <span>Sửa Hồ Sơ</span>
            </button>

            <button
              onClick={() => setShowAddMetricModal(true)}
              className="flex-1 sm:flex-initial justify-center px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-emerald-600/20 flex items-center space-x-1.5 whitespace-nowrap cursor-pointer"
            >
              <Plus className="w-4 h-4 shrink-0" />
              <span>Nhập 10 Chỉ Số Mới</span>
            </button>

            <button
              onClick={() => setOpenReportModal(true)}
              className="flex-1 sm:flex-initial justify-center px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all flex items-center space-x-1 whitespace-nowrap cursor-pointer"
              title="Xuất Báo Cáo PDF Chuẩn SRS 3.5"
            >
              <Printer className="w-3.5 h-3.5 text-slate-300 shrink-0" />
              <span>Xuất PDF</span>
            </button>
          </div>
        </div>

        {/* Anomaly Alerts Notification Box (SRS 2.4.A) */}
        {anomalies.length > 0 && (
          <div className="mt-5 space-y-2">
            {anomalies.map((a, idx) => (
              <div
                key={idx}
                className={`p-3.5 rounded-2xl border text-xs flex items-start space-x-3 ${
                  a.severity === 'high'
                    ? 'bg-rose-50/90 border-rose-200 text-rose-900'
                    : 'bg-amber-50/90 border-amber-200 text-amber-900'
                }`}
              >
                <AlertTriangle
                  className={`w-5 h-5 shrink-0 mt-0.5 ${
                    a.severity === 'high' ? 'text-rose-600' : 'text-amber-600'
                  }`}
                />
                <div>
                  <div className="font-extrabold">{a.title}</div>
                  <p className="mt-0.5 leading-relaxed opacity-90">{a.message}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Health Score & Gap Analysis Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5">
        {/* Card 1: Algorithmic Health Score (Thang điểm 100 - SRS 3.3) */}
        <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-950 rounded-2xl sm:rounded-3xl p-4 sm:p-5 text-white shadow-md relative overflow-hidden">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-400">
              Health Score (SRS 3.3)
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              {healthScore ? healthScore.tier : 'Chưa có dữ liệu'}
            </span>
          </div>

          <div className="mt-3 flex items-baseline space-x-2">
            <span className="text-4xl font-extrabold tracking-tight text-white">
              {healthScore ? healthScore.totalScore : '--'}
            </span>
            <span className="text-xs text-slate-400 font-semibold">/ 100 điểm chuẩn hóa</span>
          </div>

          {/* Sub-scores Breakdown */}
          {healthScore && (
            <div className="mt-4 space-y-2 pt-3 border-t border-white/10 text-[11px]">
              <div className="flex justify-between text-slate-300">
                <span>W1 Mỡ nội tạng (25%):</span>
                <span className="font-bold text-white">{healthScore.scores.visceralFatScore}đ</span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>W2 Khối cơ bắp (25%):</span>
                <span className="font-bold text-white">{healthScore.scores.muscleMassScore}đ</span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>W3 Tuổi sinh học vs Thực (20%):</span>
                <span className="font-bold text-white">{healthScore.scores.biologicalAgeScore}đ</span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>W4 Mỡ dưới da (15%):</span>
                <span className="font-bold text-white">{healthScore.scores.subcutaneousFatScore}đ</span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>W5 Nước & Canxi xương (15%):</span>
                <span className="font-bold text-white">{healthScore.scores.waterAndBoneScore}đ</span>
              </div>
            </div>
          )}
        </div>

        {/* Card 2: Gap Analysis & Progress (SRS 2.3) */}
        <div className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-5 border border-slate-200/90 shadow-xs md:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
            <div className="flex items-center space-x-2">
              <Target className="w-4 h-4 text-emerald-600 shrink-0" />
              <h3 className="font-bold text-slate-900 text-sm">
                Đối Soát Mục Tiêu & Khoảng Bù Chênh Lệch (Gap Analysis)
              </h3>
            </div>
            <span className="text-[11px] text-slate-400 font-mono">Δ = Metric - Target</span>
          </div>

          {latestMetric ? (
            <div className="mt-3 space-y-3.5 text-xs">
              {/* Weight Gap with Progress Bar & AI Calorie Target Summary */}
              <div>
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 mb-1.5">
                  <span className="font-semibold text-slate-700">
                    Tiến trình Cân nặng ({caloriePlan.durationWeeks} tuần):
                  </span>
                  <span className="font-bold text-emerald-700">
                    Hiện tại: {latestMetric.weight}kg → Mục tiêu:{' '}
                    {student.targetMetrics.targetWeight || '--'}kg (
                    {gapAnalysis?.weightProgressPercent || 0}% hoàn thành)
                  </span>
                </div>
                <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                  <div
                    className="bg-emerald-600 h-full rounded-full transition-all duration-500"
                    style={{ width: `${gapAnalysis?.weightProgressPercent || 0}%` }}
                  ></div>
                </div>
                <div className="mt-2 p-2.5 rounded-xl bg-orange-50/70 border border-orange-200/80 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                  <span className="font-bold text-orange-950">
                    🔥 {caloriePlan.label}:{' '}
                    <span className="text-orange-700 font-black">
                      {caloriePlan.mode === 'weight_loss'
                        ? '≤ '
                        : caloriePlan.mode === 'weight_gain'
                        ? '≥ '
                        : ''}
                      {caloriePlan.targetDailyCalories} Kcal/ngày
                    </span>
                  </span>
                  <span className="text-slate-600">
                    Mỡ nội tạng: <strong>Cấp {latestMetric.visceralFat}</strong> • TDEE:{' '}
                    <strong>{caloriePlan.tdee} Kcal</strong> •{' '}
                    {caloriePlan.mode === 'weight_loss'
                      ? `Thâm hụt ${caloriePlan.dailyCalorieAdjustment} Kcal/ngày`
                      : caloriePlan.mode === 'weight_gain'
                      ? `Thặng dư +${caloriePlan.dailyCalorieAdjustment} Kcal/ngày`
                      : 'Duy trì cân nặng'}
                  </span>
                </div>
              </div>

              {/* 3 Indicators Gap Comparison Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3 pt-1">
                <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100">
                  <div className="text-[11px] text-slate-500">Mỡ nội tạng</div>
                  <div className="font-extrabold text-slate-900 mt-0.5">
                    Cấp {latestMetric.visceralFat}{' '}
                    <span className="text-[10px] text-slate-400 font-normal">
                      (Mục tiêu: {student.targetMetrics.targetVisceralFat || 5})
                    </span>
                  </div>
                  <div className="text-[10px] font-bold text-emerald-600 mt-0.5">
                    {gapAnalysis?.visceralDelta !== null
                      ? gapAnalysis?.visceralDelta! > 0
                        ? `Cần giảm thêm ${gapAnalysis?.visceralDelta} cấp`
                        : 'Đã đạt mục tiêu! 🎉'
                      : '--'}
                  </div>
                </div>

                <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100">
                  <div className="text-[11px] text-slate-500">Khối cơ bắp</div>
                  <div className="font-extrabold text-slate-900 mt-0.5">
                    {latestMetric.muscleMass} kg{' '}
                    <span className="text-[10px] text-slate-400 font-normal">
                      (Mục tiêu: {student.targetMetrics.targetMuscleMass || '--'}kg)
                    </span>
                  </div>
                  <div className="text-[10px] font-bold text-indigo-600 mt-0.5">
                    {student.targetMetrics.targetMuscleMass
                      ? `${(student.targetMetrics.targetMuscleMass - latestMetric.muscleMass).toFixed(1)}kg cần tăng`
                      : 'Đang theo dõi'}
                  </div>
                </div>

                <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-100">
                  <div className="text-[11px] text-slate-500">Vòng eo</div>
                  <div className="font-extrabold text-slate-900 mt-0.5">
                    {latestMetric.waist} cm{' '}
                    <span className="text-[10px] text-slate-400 font-normal">
                      (Mục tiêu: {student.targetMetrics.targetWaist || '--'}cm)
                    </span>
                  </div>
                  <div className="text-[10px] font-bold text-amber-600 mt-0.5">
                    {student.targetMetrics.targetWaist
                      ? `${(latestMetric.waist - student.targetMetrics.targetWaist).toFixed(1)}cm cần siết`
                      : 'Đang theo dõi'}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="py-6 text-center text-xs text-slate-400">
              Chưa có dữ liệu cân đo để tính toán khoảng bù
            </div>
          )}
        </div>
      </div>

      {/* Sub-tab Navigation */}
      <div className="flex border-b border-slate-200 overflow-x-auto space-x-1 text-xs font-semibold">
        {[
          { key: 'metrics', label: '10 Chỉ Số Sinh Học & Nhật Ký', icon: Scale, count: studentMetrics.length },
          { key: 'charts', label: 'Biểu Đồ Tiến Trình (Analytics)', icon: Activity },
          { key: 'ai-advice', label: 'Lời Khuyên AI (Tự Động Phân Tích)', icon: Sparkles, count: studentAdvices.length },
          { key: 'nutrition', label: 'Nhật Ký Dinh Dưỡng (Phiếu Ăn 30 Ngày)', icon: Utensils, count: usedPortionsCount },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as any)}
              className={`flex items-center space-x-2 py-3 px-4 border-b-2 transition-all whitespace-nowrap cursor-pointer ${
                isActive
                  ? 'border-emerald-600 text-emerald-800 font-bold bg-emerald-50/50 rounded-t-xl'
                  : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
              {tab.count !== undefined && tab.count > 0 && (
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                    isActive ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-700'
                  }`}
                >
                  {tab.key === 'nutrition' ? `${tab.count}/${totalPortions}` : tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab 1: 10 Health Metrics Table */}
      {activeTab === 'metrics' && (
        <div className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-5 border border-slate-200/90 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div>
              <h3 className="font-bold text-slate-900 text-base">
                Nhật Ký Đo Lường 10 Chỉ Số Sinh Học (Sổ KH)
              </h3>
              <p className="text-xs text-slate-500">
                Số hóa toàn diện dữ liệu cân đo định kỳ, phân loại thể hình và tuổi sinh học
              </p>
            </div>
            <button
              onClick={() => setShowAddMetricModal(true)}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center space-x-1.5 self-start sm:self-auto cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Thêm Nhật Ký Đo Mới</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-600 border-b border-slate-200">
                  <th className="py-2.5 px-3 font-bold">Ngày Đo</th>
                  <th className="py-2.5 px-3 font-bold">1. Cân Nặng</th>
                  <th className="py-2.5 px-3 font-bold">2. Mỡ Dưới Da</th>
                  <th className="py-2.5 px-3 font-bold">3. Canxi Xương</th>
                  <th className="py-2.5 px-3 font-bold">4. Lượng Nước</th>
                  <th className="py-2.5 px-3 font-bold">5. Cơ Bắp</th>
                  <th className="py-2.5 px-3 font-bold">6. Thể Hình</th>
                  <th className="py-2.5 px-3 font-bold">7. BMR</th>
                  <th className="py-2.5 px-3 font-bold">8. Tuổi Sinh Học</th>
                  <th className="py-2.5 px-3 font-bold">9. Mỡ Nội Tạng</th>
                  <th className="py-2.5 px-3 font-bold">10. Vòng Eo</th>
                  <th className="py-2.5 px-3 font-bold text-right">Thao Tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {studentMetrics.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-3 font-bold text-slate-900 whitespace-nowrap">
                      {m.date}
                    </td>
                    <td className="py-3 px-3 font-extrabold text-indigo-700">
                      {m.weight} <span className="text-[10px] text-slate-400 font-normal">kg</span>
                    </td>
                    <td className="py-3 px-3">{m.subcutaneousFat}%</td>
                    <td className="py-3 px-3">{m.boneCalcium}</td>
                    <td className="py-3 px-3 text-cyan-700 font-semibold">{m.bodyWater}%</td>
                    <td className="py-3 px-3 text-emerald-700 font-bold">{m.muscleMass} kg</td>
                    <td className="py-3 px-3">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-800">
                        {m.bodyType}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-mono">{m.bmr} Kcal</td>
                    <td className="py-3 px-3">
                      <span
                        className={`font-semibold ${
                          m.biologicalAge - student.age >= 3 ? 'text-amber-700 font-bold' : 'text-slate-700'
                        }`}
                      >
                        {m.biologicalAge} tuổi
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                          m.visceralFat >= 10
                            ? 'bg-rose-100 text-rose-800 border border-rose-300'
                            : 'bg-emerald-50 text-emerald-800'
                        }`}
                      >
                        Cấp {m.visceralFat}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-semibold text-amber-800">{m.waist} cm</td>
                    <td className="py-3 px-3 text-right">
                      <button
                        onClick={() => deleteMetricRecord(m.id)}
                        className="p-1 text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
                        title="Xóa lần đo này"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 2: Charts */}
      {activeTab === 'charts' && (
        <MetricsCharts metrics={studentMetrics} />
      )}

      {/* Tab 3: AI Advice Queue */}
      {activeTab === 'ai-advice' && (
        <AIAdviceQueue student={student} advices={studentAdvices} />
      )}

      {/* Tab 4: Nutrition Log (30-Day Meal Card & Same-Day Metric Weigh-In Quick Tick) */}
      {activeTab === 'nutrition' && (
        <NutritionTicketManager mode="trainer" focusedStudent={student} />
      )}

      {/* Modals */}
      {showAddMetricModal && (
        <AddMetricModal
          student={student}
          latestMetric={latestMetric}
          onClose={() => setShowAddMetricModal(false)}
        />
      )}

      {showEditStudentModal && (
        <AddStudentModal
          initialStudent={student}
          onClose={() => setShowEditStudentModal(false)}
        />
      )}
    </div>
  );
};
