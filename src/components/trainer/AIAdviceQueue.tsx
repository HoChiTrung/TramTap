/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { AIAdviceRecord, StudentProfile } from '../../types/health';
import { useHealth } from '../../context/HealthContext';
import { calculateCalorieGoalBreakdown } from '../../utils/healthCalculations';
import {
  Sparkles,
  Droplet,
  Flame,
  Dumbbell,
  Apple,
  BookOpen,
  Calendar,
  AlertTriangle,
  HeartPulse,
  Activity,
  CheckCircle2,
  TrendingUp,
  Scale,
  ShieldAlert,
} from 'lucide-react';

interface AIAdviceQueueProps {
  student: StudentProfile;
  advices: AIAdviceRecord[];
}

export const AIAdviceQueue: React.FC<AIAdviceQueueProps> = ({ student, advices }) => {
  const { setOpenStandardsModal, getStudentMetrics } = useHealth();
  const studentMetrics = getStudentMetrics(student.id);
  const latestMetric = studentMetrics[studentMetrics.length - 1];

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Banner */}
      <div className="bg-gradient-to-r from-emerald-950 via-teal-900 to-slate-900 rounded-2xl sm:rounded-3xl p-4 sm:p-6 text-white shadow-md">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2 text-emerald-300 text-xs font-bold uppercase tracking-wider">
              <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Hệ Thống Trợ Lý AI Chuyên Biệt (3-Part Clinical Template)</span>
            </div>
            <h3 className="text-base sm:text-lg font-black mt-1">
              Phân Tích Sức Khỏe & Khuyến Nghị 3 Phần Chuẩn Y Tế
            </h3>
            <p className="text-xs text-slate-300 mt-1 max-w-2xl leading-relaxed">
              AI áp dụng <strong>System Template chuyên biệt</strong>: Đối soát 10 chỉ số với <strong>Bảng Chỉ Số Cơ Thể</strong> để phân tích 3 phần rõ ràng: <strong>Chỉ số cảnh báo</strong>, <strong>Đánh giá chuyên sâu</strong> và <strong>Khuyến nghị hành động cụ thể</strong>.
            </p>
          </div>

          <button
            onClick={() => setOpenStandardsModal(true)}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center space-x-1.5 shrink-0 self-start sm:self-auto cursor-pointer"
          >
            <BookOpen className="w-4 h-4" />
            <span>Xem Bảng Chỉ Số Cơ Thể</span>
          </button>
        </div>
      </div>

      {/* List of Advices */}
      <div className="space-y-4 sm:space-y-6">
        {advices.length === 0 ? (
          <div className="p-8 sm:p-10 text-center bg-white rounded-2xl sm:rounded-3xl border border-slate-200 text-xs text-slate-500">
            Chưa có lần đo lường nào. Khi bạn nhập chỉ số mới, AI sẽ tự động phân tích và đưa ra lời khuyên 3 phần ngay tức thì!
          </div>
        ) : (
          advices.map((a, idx) => {
            const content = a.aiDraftContent;
            const matchedMetric =
              studentMetrics.find((m) => m.id === a.metricRecordId) || latestMetric;
            const caloriePlan =
              content.calorieAnalysis ||
              calculateCalorieGoalBreakdown(
                matchedMetric?.bmr || 1550,
                matchedMetric?.weight || 65,
                student,
                1.375,
                matchedMetric?.visceralFat
              );
            const hasStructuredWarnings =
              Array.isArray(content.warningMetrics) && content.warningMetrics.length > 0;
            const hasDeepAssessment = content.deepAssessment && typeof content.deepAssessment === 'object';
            const hasStructuredActions =
              Array.isArray(content.actionRecommendations) && content.actionRecommendations.length > 0;

            return (
              <div
                key={a.id}
                className={`bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-6 border shadow-xs text-xs space-y-4 sm:space-y-5 ${
                  idx === 0 ? 'border-emerald-300 ring-2 ring-emerald-500/10' : 'border-slate-200/90'
                }`}
              >
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
                  <div className="flex items-center space-x-2">
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center">
                      <Sparkles className="w-3 h-3 mr-1 text-emerald-600" />
                      AI PHÂN TÍCH 3 PHẦN CHUẨN Y KHOA
                    </span>
                    <span className="text-slate-600 font-semibold flex items-center">
                      <Calendar className="w-3.5 h-3.5 mr-1 text-slate-400" />
                      Kỳ đo: {a.date}
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-400 font-medium">
                    Học viên: <strong className="text-slate-700">{student.fullName}</strong> • Cập nhật: {a.approvedAt || a.date}
                  </span>
                </div>

                {/* Quick Target Counters */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="p-3.5 rounded-2xl bg-cyan-50/80 border border-cyan-200 flex items-center space-x-3">
                    <div className="p-2.5 rounded-xl bg-cyan-100 text-cyan-700 shrink-0">
                      <Droplet className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-[11px] text-cyan-800 font-semibold">Lượng Nước Khuyến Nghị (Water Target)</div>
                      <div className="text-base font-black text-cyan-950 mt-0.5">
                        {content.waterTargetLiters} Lít / ngày
                      </div>
                      <div className="text-[10px] text-cyan-600 mt-0.5">
                        Theo Bảng chuẩn thể trọng & chuyển hóa tế bào
                      </div>
                    </div>
                  </div>

                  <div className="p-3.5 rounded-2xl bg-orange-50/80 border border-orange-200 flex items-start space-x-3">
                    <div className="p-2.5 rounded-xl bg-orange-100 text-orange-700 shrink-0 mt-0.5">
                      <Flame className="w-5 h-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] text-orange-800 font-extrabold">
                        {caloriePlan.label}
                      </div>
                      <div className="text-base font-black text-orange-950 mt-0.5">
                        {caloriePlan.mode === 'weight_loss'
                          ? 'Tối đa ≤ '
                          : caloriePlan.mode === 'weight_gain'
                          ? 'Tối thiểu ≥ '
                          : ''}
                        {caloriePlan.targetDailyCalories} Kcal / ngày
                      </div>
                      <div className="text-[10.5px] text-orange-800 font-medium mt-0.5">
                        Hiện tại: <strong>{caloriePlan.currentWeightKg}kg</strong> → Mục tiêu:{' '}
                        <strong>{caloriePlan.targetWeightKg}kg</strong> trong{' '}
                        <strong>{caloriePlan.durationWeeks} tuần</strong>
                        {caloriePlan.currentVisceralFat !== undefined && (
                          <>
                            {' '}• Mỡ nội tạng: <strong>Cấp {caloriePlan.currentVisceralFat}</strong>
                          </>
                        )}{' '}
                        (TDEE: {caloriePlan.tdee} Kcal •{' '}
                        {caloriePlan.dailyCalorieAdjustment > 0
                          ? `+${caloriePlan.dailyCalorieAdjustment}`
                          : caloriePlan.dailyCalorieAdjustment}{' '}
                        Kcal/ngày)
                      </div>
                    </div>
                  </div>
                </div>

                {/* ======================================================== */}
                {/* PHẦN 1: CHỈ SỐ CẢNH BÁO */}
                {/* ======================================================== */}
                <div className="rounded-2xl border border-red-200/90 bg-red-50/30 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <div className="p-1.5 bg-red-100 rounded-lg text-red-700">
                        <ShieldAlert className="w-4 h-4" />
                      </div>
                      <h4 className="font-black text-red-950 text-sm uppercase tracking-wide">
                        Phần 1: Chỉ Số Cảnh Báo & Nguy Cơ Bệnh Lý
                      </h4>
                    </div>
                    <span className="text-[10px] font-bold text-red-700 bg-red-100/80 px-2 py-0.5 rounded-full">
                      Đối soát Bảng Chỉ Số Cơ Thể
                    </span>
                  </div>

                  {hasStructuredWarnings ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                      {content.warningMetrics.map((wm, wIdx) => {
                        const isDanger = wm.level === 'danger';
                        const isWarning = wm.level === 'warning';
                        return (
                          <div
                            key={wIdx}
                            className={`p-3 rounded-xl border bg-white space-y-1.5 ${
                              isDanger
                                ? 'border-red-300 shadow-2xs'
                                : isWarning
                                ? 'border-amber-300 shadow-2xs'
                                : 'border-emerald-200'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <span className="font-extrabold text-slate-900 text-xs">
                                {wm.name}
                              </span>
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider shrink-0 ${
                                  isDanger
                                    ? 'bg-red-100 text-red-800 border border-red-200'
                                    : isWarning
                                    ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                    : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                }`}
                              >
                                {isDanger ? 'Nguy hiểm' : isWarning ? 'Cảnh báo' : 'An toàn'}
                              </span>
                            </div>

                            <div className="flex items-center space-x-2 text-[11px]">
                              <span className="text-slate-500">Giá trị:</span>
                              <strong className="text-slate-900 font-bold">{wm.value}</strong>
                              <span className="text-slate-300">•</span>
                              <span className="text-slate-500">Chuẩn:</span>
                              <span className="text-slate-600 font-medium">{wm.standard}</span>
                            </div>

                            <p className="text-[11px] text-slate-700 font-medium leading-relaxed bg-slate-50 p-2 rounded-lg border border-slate-100">
                              ⚠️ <strong>Rủi ro:</strong> {wm.risk}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-700 leading-relaxed font-medium bg-white p-3 rounded-xl border border-red-200">
                      {content.summary}
                    </p>
                  )}
                </div>

                {/* ======================================================== */}
                {/* PHẦN 2: ĐÁNH GIÁ CHUYÊN SÂU */}
                {/* ======================================================== */}
                <div className="rounded-2xl border border-indigo-200/90 bg-indigo-50/30 p-4 space-y-3">
                  <div className="flex items-center space-x-2">
                    <div className="p-1.5 bg-indigo-100 rounded-lg text-indigo-700">
                      <HeartPulse className="w-4 h-4" />
                    </div>
                    <h4 className="font-black text-indigo-950 text-sm uppercase tracking-wide">
                      Phần 2: Đánh Giá Chuyên Sâu
                    </h4>
                  </div>

                  {hasDeepAssessment ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {/* Overview */}
                      <div className="p-3.5 bg-white rounded-xl border border-indigo-100 space-y-1">
                        <div className="font-extrabold text-indigo-950 flex items-center space-x-1.5 text-xs">
                          <Activity className="w-3.5 h-3.5 text-indigo-600" />
                          <span>Tổng Quan Thể Trạng (9 Cấp Độ Thể Hình):</span>
                        </div>
                        <p className="text-slate-700 leading-relaxed font-medium">
                          {content.deepAssessment.overview}
                        </p>
                      </div>

                      {/* Body Composition */}
                      <div className="p-3.5 bg-white rounded-xl border border-indigo-100 space-y-1">
                        <div className="font-extrabold text-indigo-950 flex items-center space-x-1.5 text-xs">
                          <Scale className="w-3.5 h-3.5 text-indigo-600" />
                          <span>Ma Trận Cơ - Mỡ - Nước - Xương:</span>
                        </div>
                        <p className="text-slate-700 leading-relaxed font-medium">
                          {content.deepAssessment.bodyCompositionAnalysis}
                        </p>
                      </div>

                      {/* Visceral & Aging Risk */}
                      <div className="p-3.5 bg-white rounded-xl border border-indigo-100 space-y-1">
                        <div className="font-extrabold text-indigo-950 flex items-center space-x-1.5 text-xs">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                          <span>Mỡ Nội Tạng & Lão Hóa Sinh Học:</span>
                        </div>
                        <p className="text-slate-700 leading-relaxed font-medium">
                          {content.deepAssessment.visceralAndAgingRisk}
                        </p>
                      </div>

                      {/* Progress Comparison */}
                      <div className="p-3.5 bg-white rounded-xl border border-indigo-100 space-y-1">
                        <div className="font-extrabold text-indigo-950 flex items-center space-x-1.5 text-xs">
                          <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
                          <span>So Sánh Biến Động Giữa Các Lần Đo:</span>
                        </div>
                        <p className="text-slate-700 leading-relaxed font-medium">
                          {content.deepAssessment.progressComparison || 'Lần đo đầu tiên - thiết lập mốc khởi điểm (baseline).'}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="p-3.5 bg-white rounded-xl border border-indigo-100">
                      <p className="text-slate-700 leading-relaxed font-medium">{content.summary}</p>
                    </div>
                  )}
                </div>

                {/* ======================================================== */}
                {/* PHẦN 3: KHUYẾN NGHỊ HÀNH ĐỘNG CỤ THỂ */}
                {/* ======================================================== */}
                <div className="rounded-2xl border border-emerald-200/90 bg-emerald-50/30 p-4 space-y-3">
                  <div className="flex items-center space-x-2">
                    <div className="p-1.5 bg-emerald-100 rounded-lg text-emerald-700">
                      <CheckCircle2 className="w-4 h-4" />
                    </div>
                    <h4 className="font-black text-emerald-950 text-sm uppercase tracking-wide">
                      Phần 3: Khuyến Nghị Hành Động Cụ Thể (Định Lượng Rõ Ràng)
                    </h4>
                  </div>

                  {hasStructuredActions ? (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {content.actionRecommendations.map((act, aIdx) => {
                        const isNutri = act.area === 'Dinh dưỡng';
                        const isWorkout = act.area === 'Tập luyện';
                        return (
                          <div
                            key={aIdx}
                            className={`p-3.5 rounded-xl border bg-white space-y-2 ${
                              isNutri
                                ? 'border-emerald-200'
                                : isWorkout
                                ? 'border-indigo-200'
                                : 'border-cyan-200'
                            }`}
                          >
                            <div className="flex items-center space-x-1.5">
                              {isNutri ? (
                                <Apple className="w-4 h-4 text-emerald-600" />
                              ) : isWorkout ? (
                                <Dumbbell className="w-4 h-4 text-indigo-600" />
                              ) : (
                                <Droplet className="w-4 h-4 text-cyan-600" />
                              )}
                              <span className="font-extrabold text-slate-900 text-xs">
                                {act.area}
                              </span>
                            </div>

                            <p className="text-[11px] text-slate-700 font-medium leading-relaxed">
                              {act.action}
                            </p>

                            <div className="p-2 rounded-lg bg-slate-50 border border-slate-100 text-[11px]">
                              <span className="text-slate-500 font-semibold block text-[10px] uppercase">
                                Chỉ tiêu định lượng:
                              </span>
                              <strong className="text-emerald-900 font-extrabold">{act.target}</strong>
                            </div>

                            {act.notes && (
                              <p className="text-[10px] text-slate-500 italic">
                                * {act.notes}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="p-3 bg-white rounded-xl border border-emerald-100">
                        <div className="font-bold text-emerald-950 mb-1 flex items-center space-x-1">
                          <Apple className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Dinh dưỡng:</span>
                        </div>
                        <p className="text-slate-700 font-medium">{content.nutritionAdvice}</p>
                      </div>
                      <div className="p-3 bg-white rounded-xl border border-indigo-100">
                        <div className="font-bold text-indigo-950 mb-1 flex items-center space-x-1">
                          <Dumbbell className="w-3.5 h-3.5 text-indigo-600" />
                          <span>Tập luyện:</span>
                        </div>
                        <p className="text-slate-700 font-medium">{content.workoutAdvice}</p>
                      </div>
                    </div>
                  )}

                  {/* Lifestyle and quick tip */}
                  <div className="p-2.5 bg-white/90 rounded-xl border border-emerald-200/80 text-[11px] text-emerald-950 font-medium flex items-center space-x-2">
                    <span className="text-base">💡</span>
                    <span>
                      <strong>Lối sống & Tối ưu chuyển hóa:</strong> {content.lifestyleTip}
                    </span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
