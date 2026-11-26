/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { useHealth } from '../../context/HealthContext';
import { calculateHealthScore, getDeepAssessmentText } from '../../utils/healthCalculations';
import {
  X,
  Printer,
  Share2,
  Activity,
  ShieldCheck,
} from 'lucide-react';

export const PrintableReportModal: React.FC = () => {
  const {
    selectedStudent,
    getStudentMetrics,
    getStudentAdvices,
    openReportModal,
    setOpenReportModal,
  } = useHealth();

  const [shareSuccess, setShareSuccess] = useState(false);

  if (!openReportModal || !selectedStudent) return null;

  const metrics = getStudentMetrics(selectedStudent.id);
  const advices = getStudentAdvices(selectedStudent.id);

  const latestMetric = metrics[metrics.length - 1];
  const approvedAdvice = advices.find((a) => a.status === 'trainer_approved') || advices[0];
  const healthScore = latestMetric ? calculateHealthScore(selectedStudent, latestMetric) : null;

  const handlePrint = () => {
    window.print();
  };

  const handleShare = () => {
    navigator.clipboard?.writeText(window.location.href);
    setShareSuccess(true);
    setTimeout(() => setShareSuccess(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-xs p-2 sm:p-4 overflow-y-auto">
      {/* Container */}
      <div className="bg-white rounded-3xl shadow-2xl max-w-4xl w-full my-6 overflow-hidden flex flex-col max-h-[92vh] border border-slate-200">
        {/* Top Control Bar (Hidden when printed) */}
        <div className="px-6 py-3.5 bg-slate-900 text-white flex items-center justify-between no-print shrink-0">
          <div className="flex items-center space-x-2">
            <Printer className="w-5 h-5 text-emerald-400" />
            <span className="font-bold text-sm">
              Báo Cáo Sức Khỏe Định Kỳ Chuẩn In Ấn A4 (SRS 3.5)
            </span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handleShare}
              className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition-colors cursor-pointer"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>{shareSuccess ? 'Đã sao chép liên kết!' : 'Chia sẻ Zalo/Link'}</span>
            </button>

            <button
              onClick={handlePrint}
              className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center space-x-1.5 transition-all shadow-xs cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>In Ngay / Lưu PDF (A4)</span>
            </button>

            <button
              onClick={() => setOpenReportModal(false)}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/10 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Sheet Viewport */}
        <div className="flex-1 overflow-y-auto p-6 sm:p-10 bg-slate-100/60 print:bg-white print:p-0">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 p-8 max-w-[210mm] mx-auto print-container print:border-none print:shadow-none print:p-0">
            {/* 1. Header (Logo, Student Info, Health Goal) */}
            <div className="border-b-2 border-emerald-700 pb-5">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                {/* Logo & Brand */}
                <div className="flex items-center space-x-3">
                  <div className="w-12 h-12 rounded-xl bg-emerald-700 text-white flex items-center justify-center font-black shadow-xs">
                    <Activity className="w-7 h-7 stroke-[2.5]" />
                  </div>
                  <div>
                    <h1 className="text-xl font-black tracking-tight text-slate-900 uppercase">
                      TRUNG TÂM THỂ HÌNH & CHĂM SÓC SỨC KHỎE
                    </h1>
                    <div className="text-xs font-bold text-emerald-800 tracking-wider">
                      FITTRACK PRO • BÁO CÁO PHÂN TÍCH CHỈ SỐ SINH HỌC
                    </div>
                  </div>
                </div>

                <div className="text-center sm:text-right text-xs text-slate-500">
                  <div className="font-semibold text-slate-800">Mã Hồ Sơ: #{selectedStudent.id.toUpperCase()}</div>
                  <div>Ngày Xuất: {new Date().toLocaleDateString('vi-VN')}</div>
                </div>
              </div>

              {/* Student Metadata Card */}
              <div className="mt-4 p-4 rounded-xl bg-slate-50 border border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div>
                  <span className="text-slate-400 font-medium">Họ và tên:</span>
                  <div className="font-extrabold text-slate-900 text-sm">{selectedStudent.fullName}</div>
                </div>
                <div>
                  <span className="text-slate-400 font-medium">Giới tính & Tuổi:</span>
                  <div className="font-bold text-slate-900">{selectedStudent.gender} • {selectedStudent.age} tuổi</div>
                </div>
                <div>
                  <span className="text-slate-400 font-medium">Chiều cao:</span>
                  <div className="font-bold text-slate-900">{selectedStudent.height} mét</div>
                </div>
                <div>
                  <span className="text-slate-400 font-medium">Số điện thoại:</span>
                  <div className="font-bold text-slate-900 font-mono">{selectedStudent.phone}</div>
                </div>
                <div className="col-span-2 sm:col-span-4 pt-2 border-t border-slate-200/80 flex flex-wrap justify-between gap-2">
                  <div>
                    <span className="text-slate-500 font-semibold">Mục tiêu sức khỏe (Baseline Target):</span>{' '}
                    <span className="font-bold text-emerald-900">{selectedStudent.healthGoal}</span>
                  </div>
                  {selectedStudent.trainerName && (
                    <div>
                      <span className="text-slate-500 font-semibold">HLV phụ trách:</span>{' '}
                      <span className="font-bold text-indigo-900">{selectedStudent.trainerName}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* 2. Body Part 1: Bảng tổng hợp 10 chỉ số sinh học của lần đo mới nhất */}
            <div className="mt-6">
              <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-200">
                <h3 className="font-black text-slate-900 text-sm uppercase tracking-wide flex items-center">
                  <span className="w-2 h-2 rounded-full bg-emerald-600 mr-2"></span>
                  Phần 1: Bảng Tổng Hợp 10 Chỉ Số Sinh Học Lần Đo Mới Nhất ({latestMetric?.date || 'N/A'})
                </h3>
              </div>

              {latestMetric ? (
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 text-xs">
                  <div className="p-3 rounded-xl border border-slate-200 bg-slate-50/50">
                    <div className="text-[11px] text-slate-500 font-medium">1. Cân nặng</div>
                    <div className="text-base font-black text-indigo-700 mt-0.5">{latestMetric.weight} kg</div>
                  </div>

                  <div className="p-3 rounded-xl border border-slate-200 bg-slate-50/50">
                    <div className="text-[11px] text-slate-500 font-medium">2. Mỡ dưới da</div>
                    <div className="text-base font-black text-purple-700 mt-0.5">{latestMetric.subcutaneousFat}%</div>
                  </div>

                  <div className="p-3 rounded-xl border border-slate-200 bg-slate-50/50">
                    <div className="text-[11px] text-slate-500 font-medium">3. Canxi xương</div>
                    <div className="text-base font-black text-teal-700 mt-0.5">{latestMetric.boneCalcium}</div>
                  </div>

                  <div className="p-3 rounded-xl border border-slate-200 bg-slate-50/50">
                    <div className="text-[11px] text-slate-500 font-medium">4. Lượng nước</div>
                    <div className="text-base font-black text-cyan-700 mt-0.5">{latestMetric.bodyWater}%</div>
                  </div>

                  <div className="p-3 rounded-xl border border-slate-200 bg-slate-50/50">
                    <div className="text-[11px] text-slate-500 font-medium">5. Cơ bắp</div>
                    <div className="text-base font-black text-emerald-700 mt-0.5">{latestMetric.muscleMass} kg</div>
                  </div>

                  <div className="p-3 rounded-xl border border-slate-200 bg-slate-50/50">
                    <div className="text-[11px] text-slate-500 font-medium">6. Thể hình</div>
                    <div className="text-sm font-extrabold text-slate-800 mt-0.5">{latestMetric.bodyType}</div>
                  </div>

                  <div className="p-3 rounded-xl border border-slate-200 bg-slate-50/50">
                    <div className="text-[11px] text-slate-500 font-medium">7. BMR</div>
                    <div className="text-sm font-extrabold text-slate-800 mt-0.5">{latestMetric.bmr} Kcal</div>
                  </div>

                  <div className="p-3 rounded-xl border border-slate-200 bg-slate-50/50">
                    <div className="text-[11px] text-slate-500 font-medium">8. Tuổi sinh học</div>
                    <div className="text-sm font-extrabold text-slate-800 mt-0.5">{latestMetric.biologicalAge} tuổi</div>
                  </div>

                  <div className="p-3 rounded-xl border border-slate-200 bg-slate-50/50">
                    <div className="text-[11px] text-slate-500 font-medium">9. Mỡ nội tạng</div>
                    <div className={`text-base font-black mt-0.5 ${latestMetric.visceralFat >= 10 ? 'text-rose-700' : 'text-slate-800'}`}>
                      Cấp {latestMetric.visceralFat}
                    </div>
                  </div>

                  <div className="p-3 rounded-xl border border-slate-200 bg-slate-50/50">
                    <div className="text-[11px] text-slate-500 font-medium">10. Vòng eo</div>
                    <div className="text-base font-black text-amber-700 mt-0.5">{latestMetric.waist} cm</div>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-400 py-3">Chưa có dữ liệu đo lường</p>
              )}
            </div>

            {/* 3. Body Part 2: Bảng xu hướng biến động qua các kỳ */}
            <div className="mt-6">
              <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-200">
                <h3 className="font-black text-slate-900 text-sm uppercase tracking-wide flex items-center">
                  <span className="w-2 h-2 rounded-full bg-indigo-600 mr-2"></span>
                  Phần 2: Tiến Trình Biến Động Qua Các Kỳ Cân Đo
                </h3>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border border-slate-200 rounded-xl overflow-hidden">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700">
                      <th className="p-2.5 font-bold">Ngày Đo</th>
                      <th className="p-2.5 font-bold">Cân Nặng (kg)</th>
                      <th className="p-2.5 font-bold">Cơ Bắp (kg)</th>
                      <th className="p-2.5 font-bold">Mỡ Nội Tạng</th>
                      <th className="p-2.5 font-bold">Vòng Eo (cm)</th>
                      <th className="p-2.5 font-bold">Mỡ Dưới Da (%)</th>
                      <th className="p-2.5 font-bold">Tuổi Sinh Học</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {metrics.map((m) => (
                      <tr key={m.id}>
                        <td className="p-2.5 font-bold text-slate-900">{m.date}</td>
                        <td className="p-2.5 font-extrabold text-indigo-700">{m.weight}</td>
                        <td className="p-2.5 font-bold text-emerald-700">{m.muscleMass}</td>
                        <td className="p-2.5 font-bold">{m.visceralFat}</td>
                        <td className="p-2.5 font-bold text-amber-700">{m.waist}</td>
                        <td className="p-2.5">{m.subcutaneousFat}</td>
                        <td className="p-2.5">{m.biologicalAge}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 4. Footer: Health Score + Lời khuyên chính thức */}
            <div className="mt-6 pt-5 border-t-2 border-emerald-700">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-slate-200">
                <div className="flex items-center space-x-3">
                  <div className="p-2 rounded-xl bg-emerald-100 text-emerald-800 font-black text-2xl">
                    {healthScore ? healthScore.totalScore : '--'}
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-400 uppercase">
                      Điểm Sức Khỏe Tổng Thể (Health Score)
                    </div>
                    <div className="text-base font-extrabold text-slate-900">
                      Đạt hạng: {healthScore ? healthScore.tier : 'Chưa xếp hạng'}
                    </div>
                  </div>
                </div>

                <div className="text-xs text-slate-500 font-medium">
                  Cơ sở dữ liệu đám mây Aiven Cloud • Lưu vết y tế thể thao
                </div>
              </div>

              {/* Official 3-Part Clinical Advice */}
              <div className="mt-4 p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-3">
                <div className="font-extrabold text-slate-900 flex items-center justify-between border-b border-slate-200 pb-2">
                  <div className="flex items-center space-x-1.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-600" />
                    <span>PHÂN TÍCH SỨC KHỎE & PHÁC ĐỒ HÀNH ĐỘNG 3 PHẦN (HLV & AI ASSISTANT):</span>
                  </div>
                  {approvedAdvice && (
                    <span className="text-[11px] font-bold text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-full">
                      Kỳ đo: {approvedAdvice.date}
                    </span>
                  )}
                </div>

                {approvedAdvice?.aiDraftContent.warningMetrics && approvedAdvice.aiDraftContent.warningMetrics.length > 0 && (
                  <div>
                    <div className="font-bold text-red-900 text-[11px] mb-1 uppercase tracking-wide">
                      1. Chỉ số cảnh báo y tế:
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[10.5px]">
                      {approvedAdvice.aiDraftContent.warningMetrics.map((wm, wIdx) => (
                        <div key={wIdx} className="p-1.5 bg-white rounded-lg border border-slate-200">
                          <strong className="text-slate-900">{wm.name}</strong>: {wm.value} (Chuẩn: {wm.standard})
                          <div className="text-slate-600 italic">⚠️ {wm.risk}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {approvedAdvice?.aiDraftContent.deepAssessment && (
                  <div className="pt-2 border-t border-slate-200/80">
                    <div className="font-bold text-indigo-900 text-[11px] mb-1 uppercase tracking-wide">
                      2. Đánh giá chuyên sâu:
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[10.5px] text-slate-700">
                      <div className="p-2 bg-white rounded-lg border border-slate-200">
                        <strong>Thể trạng & Cơ mỡ:</strong>{' '}
                        {getDeepAssessmentText(
                          approvedAdvice.aiDraftContent.deepAssessment.body_matrix,
                          approvedAdvice.aiDraftContent.deepAssessment.bodyCompositionAnalysis
                        )}
                      </div>
                      <div className="p-2 bg-white rounded-lg border border-slate-200">
                        <strong>Mỡ nội tạng & Lão hóa:</strong>{' '}
                        {getDeepAssessmentText(
                          approvedAdvice.aiDraftContent.deepAssessment.visceral_and_aging,
                          approvedAdvice.aiDraftContent.deepAssessment.visceralAndAgingRisk
                        )}
                      </div>
                    </div>
                  </div>
                )}

                <div className="pt-2 border-t border-slate-200/80">
                  <div className="font-bold text-emerald-900 text-[11px] mb-1 uppercase tracking-wide">
                    3. Khuyến nghị hành động cụ thể:
                  </div>
                  {approvedAdvice?.aiDraftContent.actionRecommendations && approvedAdvice.aiDraftContent.actionRecommendations.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[10.5px]">
                      {approvedAdvice.aiDraftContent.actionRecommendations.map((act, aIdx) => (
                        <div key={aIdx} className="p-2 bg-white rounded-lg border border-emerald-200">
                          <div className="font-bold text-slate-900">{act.area}</div>
                          <div className="text-slate-700">{act.action}</div>
                          <div className="font-semibold text-emerald-800 mt-0.5">Mục tiêu: {act.target}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-slate-700 leading-relaxed font-medium">
                      {approvedAdvice?.trainerEditedContent || approvedAdvice?.aiDraftContent.summary || 'Học viên tiếp tục tuân thủ chế độ dinh dưỡng và giáo án tập luyện theo chỉ dẫn của Huấn luyện viên.'}
                    </p>
                  )}
                </div>
              </div>

              {/* Signatures */}
              <div className="mt-8 pt-4 flex justify-between items-center text-xs text-slate-600">
                <div className="text-center">
                  <div className="font-bold text-slate-900">HỌC VIÊN KÝ TÊN</div>
                  <div className="h-14"></div>
                  <div className="font-semibold">{selectedStudent.fullName}</div>
                </div>

                <div className="text-center">
                  <div className="font-bold text-slate-900">HUẤN LUYỆN VIÊN PHỤ TRÁCH</div>
                  <div className="h-14"></div>
                  <div className="font-semibold text-emerald-800">
                    {selectedStudent.trainerName || 'HLV Phụ Trách FitTrack Pro'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
