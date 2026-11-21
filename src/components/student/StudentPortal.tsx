/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import confetti from 'canvas-confetti';
import { StudentProfile } from '../../types/health';
import { useHealth } from '../../context/HealthContext';
import {
  calculateHealthScore,
  calculateWaterTarget,
  calculateCalorieGoalBreakdown,
} from '../../utils/healthCalculations';
import { MetricsCharts } from '../common/MetricsCharts';
import { NutritionTicketManager } from '../nutrition/NutritionTicketManager';
import {
  Droplet,
  Flame,
  Award,
  Sparkles,
  Utensils,
  Dumbbell,
  CheckCircle2,
  Calendar,
  Plus,
  Printer,
  Bell,
  ChevronRight,
  Apple,
  ShieldAlert,
  Activity,
  UserCheck,
} from 'lucide-react';

interface StudentPortalProps {
  student: StudentProfile;
}

export const StudentPortal: React.FC<StudentPortalProps> = ({ student }) => {
  const {
    getStudentMetrics,
    getStudentAdvices,
    getStudentMeals,
    badges,
    updateStudent,
    setOpenReportModal,
    setOpenStandardsModal,
  } = useHealth();

  const [activeTab, setActiveTab] = useState<'overview' | 'nutrition' | 'metrics'>('overview');

  const studentMetrics = getStudentMetrics(student.id);
  const studentAdvices = getStudentAdvices(student.id);
  const studentMeals = getStudentMeals(student.id);

  // Count used meal ticket portions
  const totalPortions = student.targetMetrics?.totalMealPortions ?? 60;
  const usedPortionsCount = studentMeals.reduce((acc, m) => {
    let c = 0;
    if (m.macros?.morningStatus === 'used' || m.macros?.morningStatus === 'takeaway') c += 1;
    if (m.macros?.afternoonStatus === 'used' || m.macros?.afternoonStatus === 'takeaway') c += 1;
    return acc + c;
  }, 0);

  const latestMetric = studentMetrics[studentMetrics.length - 1];
  const latestAdvice =
    studentAdvices[0] ||
    studentAdvices.find((a) => a.status === 'auto_generated') ||
    studentAdvices.find((a) => a.status === 'trainer_approved');

  // Calculations
  const healthScore = latestMetric ? calculateHealthScore(student, latestMetric) : null;
  const waterTarget = latestMetric ? calculateWaterTarget(latestMetric.weight, 45) : 2.5;
  const caloriePlan = calculateCalorieGoalBreakdown(
    latestMetric?.bmr || 1550,
    latestMetric?.weight || 65,
    student,
    1.375,
    latestMetric?.visceralFat
  );
  const calorieTarget = caloriePlan.targetDailyCalories;

  // Quick inline editor for target weight & desired duration
  const [isEditingCalorieGoal, setIsEditingCalorieGoal] = useState(false);
  const [goalTargetWeight, setGoalTargetWeight] = useState<string>(
    String(student.targetMetrics?.targetWeight ?? caloriePlan.targetWeightKg)
  );
  const [goalDurationWeeks, setGoalDurationWeeks] = useState<string>(
    String(student.targetMetrics?.targetDurationWeeks ?? caloriePlan.durationWeeks)
  );

  useEffect(() => {
    setGoalTargetWeight(String(student.targetMetrics?.targetWeight ?? caloriePlan.targetWeightKg));
    setGoalDurationWeeks(
      String(student.targetMetrics?.targetDurationWeeks ?? caloriePlan.durationWeeks)
    );
    setIsEditingCalorieGoal(false);
  }, [student.id, student.targetMetrics?.targetWeight, student.targetMetrics?.targetDurationWeeks]);

  const handleSaveCalorieGoal = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedWeight = parseFloat(goalTargetWeight);
    const parsedWeeks = parseInt(goalDurationWeeks, 10);
    if (!Number.isFinite(parsedWeight) || parsedWeight <= 25 || parsedWeight > 250) return;
    const validWeeks = Number.isFinite(parsedWeeks) && parsedWeeks >= 1 ? parsedWeeks : 8;
    const currentW = latestMetric?.weight || 65;
    const diff = Number(Math.abs(parsedWeight - currentW).toFixed(1));
    const updatedGoalText =
      parsedWeight < currentW - 0.2
        ? `Giảm ${diff}kg (từ ${currentW}kg xuống ${parsedWeight}kg) trong ${validWeeks} tuần`
        : parsedWeight > currentW + 0.2
        ? `Tăng ${diff}kg (từ ${currentW}kg lên ${parsedWeight}kg) trong ${validWeeks} tuần`
        : student.healthGoal;

    updateStudent({
      ...student,
      healthGoal: updatedGoalText,
      targetMetrics: {
        ...student.targetMetrics,
        targetWeight: parsedWeight,
        targetDurationWeeks: validWeeks,
      },
    });
    setIsEditingCalorieGoal(false);
  };

  // Local Water Tracker State (liters logged today)
  const [loggedWaterMl, setLoggedWaterMl] = useState<number>(1800);
  const targetWaterMl = Math.round(waterTarget * 1000);
  const waterPercent = Math.min(100, Math.round((loggedWaterMl / targetWaterMl) * 100));

  const addWater = (ml: number) => {
    const updated = loggedWaterMl + ml;
    setLoggedWaterMl(updated);
    if (updated >= targetWaterMl && loggedWaterMl < targetWaterMl) {
      confetti({
        particleCount: 80,
        spread: 60,
        origin: { y: 0.7 },
      });
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Student Welcome Header Banner */}
      <div className="bg-gradient-to-r from-emerald-900 via-teal-900 to-slate-900 rounded-2xl sm:rounded-3xl p-4 sm:p-6 text-white shadow-lg relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 sm:gap-6 relative z-10">
          <div className="flex items-start sm:items-center min-w-0">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-emerald-400">
                  Cổng Thông Tin Học Viên
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-white/10 text-white">
                  Read-Only Mode
                </span>
                {student.trainerName && (
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 inline-flex items-center gap-1">
                    <UserCheck className="w-3 h-3" />
                    HLV phụ trách: {student.trainerName}
                  </span>
                )}
              </div>
              <h1 className="text-xl sm:text-2xl font-black tracking-tight mt-0.5 break-words">
                Xin chào, {student.fullName}!
              </h1>
              <p className="text-xs text-slate-300 mt-1 break-words">
                Mục tiêu hiện tại: <span className="text-white font-semibold">{student.healthGoal}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center w-full md:w-auto">
            <button
              onClick={() => setOpenReportModal(true)}
              className="w-full md:w-auto justify-center px-4 py-2 bg-white/15 hover:bg-white/25 text-white rounded-xl text-xs font-bold transition-all backdrop-blur-xs flex items-center space-x-1.5 border border-white/20 cursor-pointer"
            >
              <Printer className="w-4 h-4 shrink-0" />
              <span>Xem Báo Cáo Sức Khỏe PDF</span>
            </button>
          </div>
        </div>

        {/* Gamification Badges Carousel */}
        <div className="mt-5 pt-4 border-t border-white/10 flex items-center space-x-3 overflow-x-auto text-xs">
          <span className="text-slate-400 font-semibold shrink-0 flex items-center text-[11px]">
            <Award className="w-4 h-4 mr-1 text-amber-400" />
            Huy hiệu đạt được:
          </span>
          {badges.map((b) => (
            <div
              key={b.id}
              className="px-3 py-1 bg-white/10 hover:bg-white/20 rounded-xl flex items-center space-x-1.5 shrink-0 border border-white/10 transition-colors cursor-default"
              title={b.description}
            >
              <span className="text-base">{b.icon}</span>
              <span className="font-bold text-white text-[11px]">{b.title}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Navigation Sub-tabs */}
      <div className="flex border-b border-slate-200 overflow-x-auto space-x-1 text-xs font-semibold">
        {[
          { key: 'overview', label: 'Tổng Quan & Mục Tiêu Hôm Nay', icon: Sparkles },
          { key: 'nutrition', label: 'Nhật Ký Dinh Dưỡng', icon: Utensils, count: usedPortionsCount },
          { key: 'metrics', label: '10 Chỉ Số & Biểu Đồ Cá Nhân', icon: Calendar, count: studentMetrics.length },
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
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-emerald-600 text-white">
                  {tab.key === 'nutrition' ? `${tab.count}/${totalPortions}` : tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab 1: Overview */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Quick Metrics Bar (Health Score, Water Tracker, Calorie Target) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5">
            {/* Health Score Gauge */}
            <div className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-5 border border-slate-200/90 shadow-xs flex flex-col justify-between">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-extrabold uppercase tracking-wider text-slate-400">
                  Điểm Sức Khỏe Tổng Thể
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 shrink-0">
                  {healthScore ? healthScore.tier : 'Chưa có dữ liệu'}
                </span>
              </div>

              <div className="my-4 text-center">
                <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-gradient-to-tr from-emerald-600 to-teal-500 text-white font-black text-3xl shadow-lg shadow-emerald-500/20">
                  {healthScore ? healthScore.totalScore : '--'}
                </div>
                <div className="text-xs text-slate-500 mt-2 font-medium">
                  Tính toán theo chuẩn trọng số 10 chỉ số sinh học
                </div>
              </div>

              <div className="text-[11px] text-slate-500 text-center border-t border-slate-100 pt-2">
                Hạng vóc dáng: <strong className="text-slate-800">{latestMetric?.bodyType || 'Đang cập nhật'}</strong>
              </div>
            </div>

            {/* Smart Water Tracker */}
            <div className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-5 border border-slate-200/90 shadow-xs flex flex-col justify-between">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-extrabold uppercase tracking-wider text-cyan-700 flex items-center">
                  <Droplet className="w-3.5 h-3.5 mr-1 text-cyan-500 shrink-0" />
                  Mục Tiêu Nước Trong Ngày
                </span>
                <span className="text-xs font-bold text-cyan-800 font-mono shrink-0">
                  {loggedWaterMl} / {targetWaterMl} ml
                </span>
              </div>

              <div className="my-3">
                <div className="flex justify-between items-baseline mb-1 text-xs">
                  <span className="font-bold text-slate-800 text-lg">{waterPercent}%</span>
                  <span className="text-slate-500 text-[11px]">
                    Còn thiếu {Math.max(0, targetWaterMl - loggedWaterMl)} ml
                  </span>
                </div>
                <div className="w-full bg-cyan-100 h-3 rounded-full overflow-hidden">
                  <div
                    className="bg-cyan-500 h-full rounded-full transition-all duration-300"
                    style={{ width: `${waterPercent}%` }}
                  ></div>
                </div>

                <div className="mt-2.5 p-2 rounded-xl bg-cyan-50 border border-cyan-200 text-[11px] text-cyan-900 flex items-center space-x-1.5">
                  <Bell className="w-3.5 h-3.5 text-cyan-600 shrink-0" />
                  <span>
                    Nhắc nhở: Uống đều đặn mỗi 2 tiếng để hỗ trợ đào thải mỡ và phục hồi cơ.
                  </span>
                </div>
              </div>

              {/* Quick Log Buttons */}
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100">
                <button
                  onClick={() => addWater(250)}
                  className="py-1.5 px-3 bg-cyan-50 hover:bg-cyan-100 text-cyan-800 rounded-xl text-xs font-bold transition-colors flex items-center justify-center space-x-1 border border-cyan-200 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5 shrink-0" />
                  <span>+250 ml (1 Cốc)</span>
                </button>
                <button
                  onClick={() => addWater(500)}
                  className="py-1.5 px-3 bg-cyan-600 hover:bg-cyan-700 text-white rounded-xl text-xs font-bold transition-colors flex items-center justify-center space-x-1 shadow-xs cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5 shrink-0" />
                  <span>+500 ml (1 Bình)</span>
                </button>
              </div>
            </div>

            {/* Calorie & Nutrition Baseline */}
            <div className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-5 border border-slate-200/90 shadow-xs flex flex-col justify-between">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-extrabold uppercase tracking-wider text-orange-700 flex items-center">
                  <Flame className="w-3.5 h-3.5 mr-1 text-orange-500 shrink-0" />
                  {caloriePlan.mode === 'weight_loss'
                    ? 'Calo Tối Đa / Ngày (Giảm Cân)'
                    : caloriePlan.mode === 'weight_gain'
                    ? 'Calo Tối Thiểu / Ngày (Tăng Cân)'
                    : 'Mức Calo Duy Trì Hàng Ngày'}
                </span>
                <button
                  type="button"
                  onClick={() => setIsEditingCalorieGoal((prev) => !prev)}
                  className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-100 hover:bg-orange-200 text-orange-800 shrink-0 transition-colors cursor-pointer"
                >
                  {isEditingCalorieGoal ? 'Đóng' : 'Đổi mục tiêu'}
                </button>
              </div>

              {isEditingCalorieGoal ? (
                <form
                  onSubmit={handleSaveCalorieGoal}
                  className="my-3 p-3 rounded-2xl bg-orange-50/70 border border-orange-200 space-y-2.5 text-xs"
                >
                  <div className="font-bold text-orange-950 text-[11px]">
                    Cài đặt Cân nặng mong muốn & Thời gian (AI tự tính Calo):
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">
                        Hiện tại: {caloriePlan.currentWeightKg}kg → Mong muốn (kg)
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        min="30"
                        max="200"
                        value={goalTargetWeight}
                        onChange={(e) => setGoalTargetWeight(e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-orange-300 bg-white font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">
                        Thời gian đạt mục tiêu (Tuần)
                      </label>
                      <input
                        type="number"
                        step="1"
                        min="1"
                        max="104"
                        value={goalDurationWeeks}
                        onChange={(e) => setGoalDurationWeeks(e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-orange-300 bg-white font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500"
                        required
                      />
                    </div>
                  </div>
                  <button
                    type="submit"
                    className="w-full py-1.5 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-xl text-xs transition-colors shadow-2xs cursor-pointer"
                  >
                    Cập Nhật & Phân Tích Lại Mức Calo
                  </button>
                </form>
              ) : (
                <div className="my-2.5 text-center">
                  <div className="text-3xl font-extrabold text-slate-900 tracking-tight">
                    {caloriePlan.mode === 'weight_loss'
                      ? '≤ '
                      : caloriePlan.mode === 'weight_gain'
                      ? '≥ '
                      : ''}
                    {calorieTarget}{' '}
                    <span className="text-sm font-semibold text-slate-500">Kcal/ngày</span>
                  </div>
                  <div className="text-[11px] font-bold text-orange-700 mt-0.5">
                    {caloriePlan.label}
                  </div>

                  {/* Detailed AI Weight & Duration Calculation Box */}
                  <div className="mt-2.5 p-2.5 rounded-xl bg-orange-50/70 border border-orange-200/80 text-left text-[11px] space-y-1">
                    <div className="flex items-center justify-between text-slate-700">
                      <span>Lộ trình cân nặng:</span>
                      <strong className="text-slate-900">
                        {caloriePlan.currentWeightKg}kg → {caloriePlan.targetWeightKg}kg (
                        {caloriePlan.mode === 'weight_loss'
                          ? `Giảm ${caloriePlan.weightDiffKg}kg`
                          : caloriePlan.mode === 'weight_gain'
                          ? `Tăng ${caloriePlan.weightDiffKg}kg`
                          : 'Duy trì'}
                        )
                      </strong>
                    </div>
                    <div className="flex items-center justify-between text-slate-700">
                      <span>Thời gian mong muốn:</span>
                      <strong className="text-orange-900">
                        {caloriePlan.durationWeeks} tuần ({caloriePlan.durationDays} ngày)
                      </strong>
                    </div>
                    {caloriePlan.currentVisceralFat !== undefined && (
                      <div className="flex items-center justify-between text-slate-700">
                        <span>Mức mỡ nội tạng:</span>
                        <strong className="text-slate-900">
                          Cấp {caloriePlan.currentVisceralFat}
                          {caloriePlan.targetVisceralFat ? ` → Mục tiêu cấp ${caloriePlan.targetVisceralFat}` : ''}
                        </strong>
                      </div>
                    )}
                    <div className="flex items-center justify-between text-slate-700">
                      <span>BMR / TDEE tiêu hao:</span>
                      <strong className="text-slate-900">
                        {caloriePlan.bmr} / {caloriePlan.tdee} Kcal
                      </strong>
                    </div>
                    <div className="flex items-center justify-between text-slate-700 pt-0.5 border-t border-orange-200/60">
                      <span>
                        {caloriePlan.mode === 'weight_loss'
                          ? 'Mức thâm hụt cần thiết:'
                          : caloriePlan.mode === 'weight_gain'
                          ? 'Mức thặng dư cần thiết:'
                          : 'Cân bằng năng lượng:'}
                      </span>
                      <strong
                        className={
                          caloriePlan.mode === 'weight_loss'
                            ? 'text-emerald-700'
                            : caloriePlan.mode === 'weight_gain'
                            ? 'text-indigo-700'
                            : 'text-slate-700'
                        }
                      >
                        {caloriePlan.dailyCalorieAdjustment > 0
                          ? `+${caloriePlan.dailyCalorieAdjustment}`
                          : caloriePlan.dailyCalorieAdjustment}{' '}
                        Kcal/ngày
                      </strong>
                    </div>
                  </div>

                  <div className="mt-2.5 grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="p-2 bg-slate-50 rounded-xl">
                      <div className="text-[10px] text-slate-400 font-medium">Protein</div>
                      <div className="font-bold text-slate-800 mt-0.5">
                        {caloriePlan.recommendedMacros.proteinGrams}g
                      </div>
                    </div>
                    <div className="p-2 bg-slate-50 rounded-xl">
                      <div className="text-[10px] text-slate-400 font-medium">Carb</div>
                      <div className="font-bold text-slate-800 mt-0.5">
                        {caloriePlan.recommendedMacros.carbsGrams}g
                      </div>
                    </div>
                    <div className="p-2 bg-slate-50 rounded-xl">
                      <div className="text-[10px] text-slate-400 font-medium">Fat</div>
                      <div className="font-bold text-slate-800 mt-0.5">
                        {caloriePlan.recommendedMacros.fatGrams}g
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="text-[10.5px] text-slate-500 text-center border-t border-slate-100 pt-2">
                Công thức: 1kg trọng lượng ≈ 7.700 Kcal • TDEE = BMR × 1.375
              </div>
            </div>
          </div>

          {/* Instant AI Advice & Medical Analysis (3-Part Structured Clinical Template) */}
          {latestAdvice ? (
            <div className="bg-gradient-to-r from-emerald-50 via-teal-50 to-white rounded-2xl sm:rounded-3xl p-4 sm:p-6 border-2 border-emerald-300 shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-emerald-200">
                <div className="flex items-center space-x-2">
                  <Sparkles className="w-5 h-5 text-emerald-600 shrink-0" />
                  <h3 className="font-extrabold text-slate-900 text-sm sm:text-base">
                    Lời Khuyên & Phân Tích Sức Khỏe AI Tự Động (3 Phần Chuẩn Y Tế)
                  </h3>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => setOpenStandardsModal(true)}
                    className="text-xs font-bold text-emerald-800 bg-white hover:bg-emerald-100/60 px-3 py-1 rounded-full border border-emerald-300 transition-colors cursor-pointer"
                  >
                    Xem Bảng Chỉ Số Cơ Thể
                  </button>
                  <span className="text-xs font-bold text-emerald-800 bg-emerald-100 px-3 py-1 rounded-full">
                    Kỳ đo: {latestAdvice.date}
                  </span>
                </div>
              </div>

              {/* PHẦN 1: CHỈ SỐ CẢNH BÁO */}
              <div className="p-4 rounded-2xl bg-white border border-red-200 shadow-2xs space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-1.5 font-black text-red-950 text-xs uppercase tracking-wide">
                    <ShieldAlert className="w-4 h-4 text-red-600" />
                    <span>Phần 1: Chỉ Số Cảnh Báo & Rủi Ro Bệnh Lý</span>
                  </div>
                  <span className="text-[10px] font-bold text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
                    Đối soát Bảng chỉ số cơ thể
                  </span>
                </div>

                {Array.isArray(latestAdvice.aiDraftContent.warningMetrics) &&
                latestAdvice.aiDraftContent.warningMetrics.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                    {latestAdvice.aiDraftContent.warningMetrics.map((wm, wIdx) => {
                      const isDanger = wm.level === 'danger';
                      const isWarning = wm.level === 'warning';
                      return (
                        <div
                          key={wIdx}
                          className={`p-2.5 rounded-xl border ${
                            isDanger
                              ? 'bg-red-50/50 border-red-200'
                              : isWarning
                              ? 'bg-amber-50/50 border-amber-200'
                              : 'bg-emerald-50/50 border-emerald-200'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1 mb-1">
                            <span className="font-extrabold text-slate-900 text-[11px]">{wm.name}</span>
                            <span
                              className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded-full ${
                                isDanger
                                  ? 'bg-red-100 text-red-800'
                                  : isWarning
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-emerald-100 text-emerald-800'
                              }`}
                            >
                              {isDanger ? 'Nguy hiểm' : isWarning ? 'Cảnh báo' : 'An toàn'}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-600 mb-1">
                            Giá trị: <strong className="text-slate-900">{wm.value}</strong> • Chuẩn: {wm.standard}
                          </div>
                          <div className="text-[10.5px] text-slate-700 leading-snug font-medium">
                            ⚠️ {wm.risk}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-slate-800 font-medium">
                    {latestAdvice.trainerEditedContent || latestAdvice.aiDraftContent.summary}
                  </p>
                )}
              </div>

              {/* PHẦN 2: ĐÁNH GIÁ CHUYÊN SÂU */}
              <div className="p-4 rounded-2xl bg-white border border-indigo-200 shadow-2xs space-y-2.5">
                <div className="flex items-center space-x-1.5 font-black text-indigo-950 text-xs uppercase tracking-wide">
                  <Activity className="w-4 h-4 text-indigo-600" />
                  <span>Phần 2: Đánh Giá Chuyên Sâu</span>
                </div>

                {latestAdvice.aiDraftContent.deepAssessment ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 text-xs">
                    <div className="p-3 bg-indigo-50/40 rounded-xl border border-indigo-100 space-y-1">
                      <div className="font-bold text-indigo-950 text-[11px]">Tổng quan thể trạng:</div>
                      <p className="text-slate-700 font-medium leading-relaxed">
                        {latestAdvice.aiDraftContent.deepAssessment.overview}
                      </p>
                    </div>

                    <div className="p-3 bg-indigo-50/40 rounded-xl border border-indigo-100 space-y-1">
                      <div className="font-bold text-indigo-950 text-[11px]">Ma trận Cơ - Mỡ - Nước - Xương:</div>
                      <p className="text-slate-700 font-medium leading-relaxed">
                        {latestAdvice.aiDraftContent.deepAssessment.bodyCompositionAnalysis}
                      </p>
                    </div>

                    <div className="p-3 bg-indigo-50/40 rounded-xl border border-indigo-100 space-y-1">
                      <div className="font-bold text-indigo-950 text-[11px]">Mỡ nội tạng & Lão hóa sinh học:</div>
                      <p className="text-slate-700 font-medium leading-relaxed">
                        {latestAdvice.aiDraftContent.deepAssessment.visceralAndAgingRisk}
                      </p>
                    </div>

                    <div className="p-3 bg-indigo-50/40 rounded-xl border border-indigo-100 space-y-1">
                      <div className="font-bold text-indigo-950 text-[11px]">So sánh tiến trình biến động:</div>
                      <p className="text-slate-700 font-medium leading-relaxed">
                        {latestAdvice.aiDraftContent.deepAssessment.progressComparison || 'Lần đo đầu tiên - mốc đối chiếu cơ sở.'}
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-800 font-medium">
                    {latestAdvice.aiDraftContent.summary}
                  </p>
                )}
              </div>

              {/* PHẦN 3: KHUYẾN NGHỊ HÀNH ĐỘNG CỤ THỂ */}
              <div className="p-4 rounded-2xl bg-white border border-emerald-200 shadow-2xs space-y-2.5">
                <div className="flex items-center space-x-1.5 font-black text-emerald-950 text-xs uppercase tracking-wide">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Phần 3: Khuyến Nghị Hành Động Cụ Thể</span>
                </div>

                {Array.isArray(latestAdvice.aiDraftContent.actionRecommendations) &&
                latestAdvice.aiDraftContent.actionRecommendations.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 text-xs">
                    {latestAdvice.aiDraftContent.actionRecommendations.map((act, actIdx) => (
                      <div key={actIdx} className="p-3 bg-emerald-50/40 rounded-xl border border-emerald-100 space-y-1.5">
                        <div className="font-extrabold text-slate-900 text-[11px] flex items-center space-x-1">
                          {act.area === 'Dinh dưỡng' ? (
                            <Apple className="w-3.5 h-3.5 text-emerald-600" />
                          ) : act.area === 'Tập luyện' ? (
                            <Dumbbell className="w-3.5 h-3.5 text-indigo-600" />
                          ) : (
                            <Droplet className="w-3.5 h-3.5 text-cyan-600" />
                          )}
                          <span>{act.area}</span>
                        </div>
                        <p className="text-slate-700 leading-snug font-medium text-[11px]">{act.action}</p>
                        <div className="p-1.5 bg-white rounded-lg border border-emerald-200/80 text-[10.5px]">
                          <strong className="text-emerald-900">{act.target}</strong>
                        </div>
                        {act.notes && (
                          <div className="text-[10px] text-slate-500 italic">* {act.notes}</div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    <div className="p-3 bg-emerald-50/40 rounded-xl border border-emerald-100">
                      <div className="font-bold text-slate-900 mb-1">Dinh dưỡng khuyến nghị:</div>
                      <p className="text-slate-600">{latestAdvice.aiDraftContent.nutritionAdvice}</p>
                    </div>
                    <div className="p-3 bg-emerald-50/40 rounded-xl border border-emerald-100">
                      <div className="font-bold text-slate-900 mb-1">Kế hoạch tập luyện:</div>
                      <p className="text-slate-600">{latestAdvice.aiDraftContent.workoutAdvice}</p>
                    </div>
                  </div>
                )}

                <div className="p-2.5 bg-emerald-100/60 rounded-xl text-[11px] text-emerald-950 font-medium">
                  💧 <strong>Lối sống & Uống nước:</strong> {latestAdvice.aiDraftContent.lifestyleTip}
                </div>
              </div>
            </div>
          ) : (
            <div className="p-6 bg-slate-50 rounded-3xl border border-slate-200 text-center text-xs text-slate-500">
              Chưa có dữ liệu lời khuyên. Khi HLV cập nhật lần cân đo mới, AI sẽ phân tích tức thì!
            </div>
          )}

          {/* Quick Metrics History Preview */}
          <div className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-5 border border-slate-200/90 shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100 mb-3">
              <h3 className="font-bold text-slate-900 text-sm">
                10 Chỉ Số Lần Cân Đo Gần Nhất ({latestMetric?.date || 'Chưa có'})
              </h3>
              <button
                onClick={() => setActiveTab('metrics')}
                className="text-xs font-bold text-emerald-700 hover:text-emerald-800 flex items-center shrink-0 cursor-pointer"
              >
                <span>Xem tất cả lịch sử</span>
                <ChevronRight className="w-3.5 h-3.5 ml-0.5" />
              </button>
            </div>

            {latestMetric ? (
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 sm:gap-3 text-xs text-center">
                <div className="p-2.5 bg-slate-50 rounded-xl">
                  <div className="text-[10px] text-slate-400">1. Cân nặng</div>
                  <div className="font-extrabold text-slate-900 mt-0.5">{latestMetric.weight} kg</div>
                </div>
                <div className="p-2.5 bg-slate-50 rounded-xl">
                  <div className="text-[10px] text-slate-400">2. Mỡ dưới da</div>
                  <div className="font-extrabold text-slate-900 mt-0.5">{latestMetric.subcutaneousFat} %</div>
                </div>
                <div className="p-2.5 bg-slate-50 rounded-xl">
                  <div className="text-[10px] text-slate-400">3. Canxi xương</div>
                  <div className="font-extrabold text-slate-900 mt-0.5">{latestMetric.boneCalcium}</div>
                </div>
                <div className="p-2.5 bg-slate-50 rounded-xl">
                  <div className="text-[10px] text-slate-400">4. Lượng nước</div>
                  <div className="font-extrabold text-cyan-700 mt-0.5">{latestMetric.bodyWater} %</div>
                </div>
                <div className="p-2.5 bg-slate-50 rounded-xl">
                  <div className="text-[10px] text-slate-400">5. Cơ bắp</div>
                  <div className="font-extrabold text-emerald-700 mt-0.5">{latestMetric.muscleMass} kg</div>
                </div>
                <div className="p-2.5 bg-slate-50 rounded-xl">
                  <div className="text-[10px] text-slate-400">6. Thể hình</div>
                  <div className="font-extrabold text-slate-900 mt-0.5">{latestMetric.bodyType}</div>
                </div>
                <div className="p-2.5 bg-slate-50 rounded-xl">
                  <div className="text-[10px] text-slate-400">7. BMR</div>
                  <div className="font-extrabold text-slate-900 mt-0.5">{latestMetric.bmr} Kcal</div>
                </div>
                <div className="p-2.5 bg-slate-50 rounded-xl">
                  <div className="text-[10px] text-slate-400">8. Tuổi sinh học</div>
                  <div className="font-extrabold text-slate-900 mt-0.5">{latestMetric.biologicalAge} tuổi</div>
                </div>
                <div className="p-2.5 bg-slate-50 rounded-xl">
                  <div className="text-[10px] text-slate-400">9. Mỡ nội tạng</div>
                  <div className="font-extrabold text-slate-900 mt-0.5">Cấp {latestMetric.visceralFat}</div>
                </div>
                <div className="p-2.5 bg-slate-50 rounded-xl">
                  <div className="text-[10px] text-slate-400">10. Vòng eo</div>
                  <div className="font-extrabold text-amber-700 mt-0.5">{latestMetric.waist} cm</div>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-400 text-center py-4">Chưa có dữ liệu cân đo</p>
            )}
          </div>
        </div>
      )}

      {/* Tab 2: Nutrition Log (30-Day Meal Card - Read-Only View for Student) */}
      {activeTab === 'nutrition' && (
        <NutritionTicketManager mode="student" focusedStudent={student} />
      )}

      {/* Tab 3: Metrics History & Chart */}
      {activeTab === 'metrics' && (
        <div className="space-y-6">
          <MetricsCharts metrics={studentMetrics} />

          <div className="bg-white rounded-3xl p-5 border border-slate-200/90 shadow-xs">
            <h3 className="font-bold text-slate-900 text-sm mb-3">
              Lịch Sử 10 Chỉ Số Cân Đo (Read-Only)
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-600 border-b border-slate-200">
                    <th className="py-2.5 px-3 font-bold">Ngày</th>
                    <th className="py-2.5 px-3 font-bold">Cân Nặng</th>
                    <th className="py-2.5 px-3 font-bold">Mỡ Dưới Da</th>
                    <th className="py-2.5 px-3 font-bold">Lượng Nước</th>
                    <th className="py-2.5 px-3 font-bold">Cơ Bắp</th>
                    <th className="py-2.5 px-3 font-bold">Thể Hình</th>
                    <th className="py-2.5 px-3 font-bold">BMR</th>
                    <th className="py-2.5 px-3 font-bold">Tuổi Sinh Học</th>
                    <th className="py-2.5 px-3 font-bold">Mỡ Nội Tạng</th>
                    <th className="py-2.5 px-3 font-bold">Vòng Eo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {studentMetrics.map((m) => (
                    <tr key={m.id} className="hover:bg-slate-50">
                      <td className="py-3 px-3 font-bold">{m.date}</td>
                      <td className="py-3 px-3 font-extrabold text-indigo-700">{m.weight} kg</td>
                      <td className="py-3 px-3">{m.subcutaneousFat}%</td>
                      <td className="py-3 px-3 text-cyan-700 font-semibold">{m.bodyWater}%</td>
                      <td className="py-3 px-3 text-emerald-700 font-bold">{m.muscleMass} kg</td>
                      <td className="py-3 px-3">{m.bodyType}</td>
                      <td className="py-3 px-3">{m.bmr}</td>
                      <td className="py-3 px-3">{m.biologicalAge}</td>
                      <td className="py-3 px-3 font-bold text-rose-700">Cấp {m.visceralFat}</td>
                      <td className="py-3 px-3 font-semibold text-amber-700">{m.waist} cm</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
