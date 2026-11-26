/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { StudentProfile, HealthMetricRecord, BodyTypeClassification } from '../../types/health';
import { useHealth } from '../../context/HealthContext';
import { calculateHealthScore } from '../../utils/healthCalculations';
import { X, AlertTriangle, Scale, Sparkles } from 'lucide-react';

interface AddMetricModalProps {
  student: StudentProfile;
  latestMetric?: HealthMetricRecord;
  onClose: () => void;
}

/**
 * Smart decimal input formatter:
 * - Converts ',' to '.' and strips invalid characters.
 * - Never interferes when the user is deleting (Backspace) or already typed '.'.
 * - Auto-inserts '.' after `intDigits` digits when typing continuously
 *   (e.g. '347' -> '34.7', '123' -> '12.3', '28' -> '2.8').
 */
function formatSmartDecimal(
  raw: string,
  prev: string,
  opts: { intDigits: number; maxDecimals?: number; minAutoSplit?: number; allowExactTen?: boolean }
): string {
  const { intDigits, maxDecimals = 1, minAutoSplit, allowExactTen = false } = opts;

  let cleaned = raw.replace(/,/g, '.').replace(/[^0-9.]/g, '');
  const firstDot = cleaned.indexOf('.');
  if (firstDot !== -1) {
    cleaned =
      cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, '');
  }

  // Do not auto-format when deleting characters
  if (cleaned.length < prev.length) {
    return cleaned;
  }

  // Respect explicit decimal point entered by user
  if (cleaned.includes('.')) {
    const [intPart, decPart = ''] = cleaned.split('.');
    return `${intPart}.${decPart.slice(0, maxDecimals)}`;
  }

  // Auto-insert decimal when exceeding integer digit count
  if (cleaned.length > intDigits) {
    if (allowExactTen && cleaned === '10') {
      return '10';
    }
    if (minAutoSplit !== undefined && cleaned.length === intDigits + 1) {
      const asNum = Number(cleaned);
      if (asNum < minAutoSplit) {
        return cleaned;
      }
    }
    const intPart = cleaned.slice(0, intDigits);
    const decPart = cleaned.slice(intDigits, intDigits + maxDecimals);
    return `${intPart}.${decPart}`;
  }

  return cleaned;
}

function formatIntegerOnly(raw: string, maxLen: number): string {
  return raw.replace(/\D/g, '').slice(0, maxLen);
}

export const AddMetricModal: React.FC<AddMetricModalProps> = ({
  student,
  latestMetric,
  onClose,
}) => {
  const { addMetricRecord } = useHealth();

  // Start empty so trainer can type immediately without deleting prefilled values
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [weight, setWeight] = useState('');
  const [subcutaneousFat, setSubcutaneousFat] = useState('');
  const [boneCalcium, setBoneCalcium] = useState('');
  const [bodyWater, setBodyWater] = useState('');
  const [muscleMass, setMuscleMass] = useState('');
  const [bodyType] = useState<BodyTypeClassification>(
    latestMetric ? latestMetric.bodyType : 'Tiêu chuẩn'
  );
  const [bmr, setBmr] = useState('');
  const [biologicalAge, setBiologicalAge] = useState('');
  const [visceralFat, setVisceralFat] = useState('');
  const [waist] = useState(latestMetric ? String(latestMetric.waist) : '80.0');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const hasPreviewData = Boolean(weight && subcutaneousFat && muscleMass);

  // Real-time Preview Calculation (only shown when user starts entering values)
  const tempMetric: HealthMetricRecord = {
    id: 'temp',
    studentId: student.id,
    date,
    timestamp: Date.now(),
    weight: parseFloat(weight) || latestMetric?.weight || 65,
    subcutaneousFat: parseFloat(subcutaneousFat) || latestMetric?.subcutaneousFat || 20,
    boneCalcium: parseFloat(boneCalcium) || latestMetric?.boneCalcium || 3,
    bodyWater: parseFloat(bodyWater) || latestMetric?.bodyWater || 55,
    muscleMass: parseFloat(muscleMass) || latestMetric?.muscleMass || 32,
    bodyType,
    bmr: parseInt(bmr, 10) || latestMetric?.bmr || 1500,
    biologicalAge: parseInt(biologicalAge, 10) || latestMetric?.biologicalAge || student.age,
    visceralFat: parseInt(visceralFat, 10) || latestMetric?.visceralFat || 5,
    waist: parseFloat(waist) || 80,
  };

  const scorePreview = hasPreviewData ? calculateHealthScore(student, tempMetric) : null;

  const clearFieldError = (field: string) => {
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: Record<string, string> = {};

    const w = parseFloat(weight);
    if (isNaN(w) || w < 10 || w > 300) newErrors.weight = 'Từ 10 - 300 kg';

    const fat = parseFloat(subcutaneousFat);
    if (isNaN(fat) || fat < 1 || fat > 60) newErrors.subcutaneousFat = 'Từ 1.0 - 60.0%';

    const bone = parseFloat(boneCalcium);
    if (isNaN(bone) || bone < 0.5 || bone > 10) newErrors.boneCalcium = 'Từ 0.5 - 10.0';

    const water = parseFloat(bodyWater);
    if (isNaN(water) || water < 20 || water > 80) newErrors.bodyWater = 'Từ 20.0 - 80.0%';

    const muscle = parseFloat(muscleMass);
    if (isNaN(muscle) || muscle < 5 || muscle > 150) newErrors.muscleMass = 'Từ 5 - 150 kg';

    const b = parseInt(bmr, 10);
    if (isNaN(b) || b < 500 || b > 5000) newErrors.bmr = 'Từ 500 - 5000';

    const bioAge = parseInt(biologicalAge, 10);
    if (isNaN(bioAge) || bioAge < 1 || bioAge > 120) newErrors.biologicalAge = 'Từ 1 - 120';

    const visc = parseInt(visceralFat, 10);
    if (isNaN(visc) || visc < 1 || visc > 30) newErrors.visceralFat = 'Từ 1 - 30';

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    const wst = parseFloat(waist) || (latestMetric ? latestMetric.waist : 80.0);

    try {
      setIsSubmitting(true);
      await addMetricRecord({
        studentId: student.id,
        date,
        weight: parseFloat(w.toFixed(2)),
        subcutaneousFat: parseFloat(fat.toFixed(1)),
        boneCalcium: parseFloat(bone.toFixed(1)),
        bodyWater: parseFloat(water.toFixed(1)),
        muscleMass: parseFloat(muscle.toFixed(2)),
        bodyType,
        bmr: b,
        biologicalAge: bioAge,
        visceralFat: visc,
        waist: parseFloat(wst.toFixed(1)),
        notes: notes.trim(),
      });

      onClose();
    } catch (err: any) {
      setErrors({
        submit:
          err?.message ||
          'Không thể kết nối Cơ sở dữ liệu để lưu chỉ số cân đo. Vui lòng thử lại!',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputBase =
    'w-full px-2.5 py-2 border rounded-xl focus:ring-2 focus:ring-emerald-500 outline-hidden font-bold text-slate-900 placeholder:font-normal placeholder:text-slate-400 text-sm sm:text-xs tabular-nums';

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-slate-900/60 backdrop-blur-xs p-2.5 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full min-w-0 p-3.5 sm:p-5 my-2 sm:my-6 max-h-[calc(100dvh-1rem)] overflow-y-auto overflow-x-hidden animate-in fade-in zoom-in-95 duration-150 border border-slate-100">
        {/* Compact Header */}
        <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-slate-100">
          <div className="flex items-center space-x-2 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
              <Scale className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="font-extrabold text-slate-900 text-sm truncate">
                Nhập Chỉ Số · {student.fullName}
              </h3>
              <p className="text-[11px] text-slate-500 truncate">
                Nhập liền tự tách thập phân (vd: <span className="font-mono font-semibold text-slate-700">347→34.7</span>,{' '}
                <span className="font-mono font-semibold text-slate-700">28→2.8</span>)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 shrink-0 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="mt-3 space-y-3 text-xs">
          {/* Date + Live Score Pill in 1 slim row */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <label className="font-bold text-slate-600 whitespace-nowrap">Ngày đo</label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="flex-1 min-w-0 px-2.5 py-1.5 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-hidden font-bold text-slate-800 text-xs"
              />
            </div>

            {scorePreview && (
              <div className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 font-extrabold text-[11px] shrink-0">
                <Sparkles className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>{scorePreview.totalScore}/100</span>
              </div>
            )}
          </div>

          {/* Inline Warning Chips (only when triggered) */}
          {((visceralFat && tempMetric.visceralFat >= 10) ||
            (biologicalAge && tempMetric.biologicalAge - student.age >= 3)) && (
            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
              {visceralFat && tempMetric.visceralFat >= 10 && (
                <span className="inline-flex items-center text-rose-700 font-bold bg-rose-50 px-2 py-0.5 rounded-lg border border-rose-200">
                  <AlertTriangle className="w-3 h-3 mr-1 shrink-0" />
                  Mỡ nội tạng ≥ 10
                </span>
              )}
              {biologicalAge && tempMetric.biologicalAge - student.age >= 3 && (
                <span className="inline-flex items-center text-amber-800 font-bold bg-amber-50 px-2 py-0.5 rounded-lg border border-amber-200">
                  <AlertTriangle className="w-3 h-3 mr-1 shrink-0" />
                  Lão hóa +{tempMetric.biologicalAge - student.age} tuổi
                </span>
              )}
            </div>
          )}

          {/* Compact 2-column Grid (works cleanly on mobile & desktop) */}
          <div className="grid grid-cols-2 gap-2.5">
            {/* Cân nặng */}
            <div>
              <label className="block font-bold text-slate-700 mb-1 text-[11px]">
                Cân nặng (kg)
              </label>
              <input
                type="text"
                inputMode="decimal"
                autoFocus
                required
                placeholder={latestMetric ? `Trước: ${latestMetric.weight}` : 'vd: 62.5'}
                value={weight}
                onChange={(e) => {
                  clearFieldError('weight');
                  setWeight(
                    formatSmartDecimal(e.target.value, weight, {
                      intDigits: 2,
                      maxDecimals: 2,
                      minAutoSplit: 200,
                    })
                  );
                }}
                className={`${inputBase} ${
                  errors.weight ? 'border-rose-400 bg-rose-50' : 'border-slate-200'
                }`}
              />
              {errors.weight && <p className="text-rose-500 text-[10px] mt-0.5">{errors.weight}</p>}
            </div>

            {/* Mỡ dưới da */}
            <div>
              <label className="block font-bold text-slate-700 mb-1 text-[11px]">
                Mỡ dưới da (%)
              </label>
              <input
                type="text"
                inputMode="decimal"
                required
                placeholder={latestMetric ? `Trước: ${latestMetric.subcutaneousFat}` : 'vd: 24.5'}
                value={subcutaneousFat}
                onChange={(e) => {
                  clearFieldError('subcutaneousFat');
                  setSubcutaneousFat(
                    formatSmartDecimal(e.target.value, subcutaneousFat, {
                      intDigits: 2,
                      maxDecimals: 1,
                    })
                  );
                }}
                className={`${inputBase} ${
                  errors.subcutaneousFat ? 'border-rose-400 bg-rose-50' : 'border-slate-200'
                }`}
              />
              {errors.subcutaneousFat && (
                <p className="text-rose-500 text-[10px] mt-0.5">{errors.subcutaneousFat}</p>
              )}
            </div>

            {/* Canxi xương */}
            <div>
              <label className="block font-bold text-slate-700 mb-1 text-[11px]">
                Canxi xương
              </label>
              <input
                type="text"
                inputMode="decimal"
                required
                placeholder={latestMetric ? `Trước: ${latestMetric.boneCalcium}` : 'vd: 2.8'}
                value={boneCalcium}
                onChange={(e) => {
                  clearFieldError('boneCalcium');
                  setBoneCalcium(
                    formatSmartDecimal(e.target.value, boneCalcium, {
                      intDigits: 1,
                      maxDecimals: 1,
                      allowExactTen: true,
                    })
                  );
                }}
                className={`${inputBase} ${
                  errors.boneCalcium ? 'border-rose-400 bg-rose-50' : 'border-slate-200'
                }`}
              />
              {errors.boneCalcium && (
                <p className="text-rose-500 text-[10px] mt-0.5">{errors.boneCalcium}</p>
              )}
            </div>

            {/* Lượng nước */}
            <div>
              <label className="block font-bold text-slate-700 mb-1 text-[11px]">
                Lượng nước (%)
              </label>
              <input
                type="text"
                inputMode="decimal"
                required
                placeholder={latestMetric ? `Trước: ${latestMetric.bodyWater}` : 'vd: 55.2'}
                value={bodyWater}
                onChange={(e) => {
                  clearFieldError('bodyWater');
                  setBodyWater(
                    formatSmartDecimal(e.target.value, bodyWater, {
                      intDigits: 2,
                      maxDecimals: 1,
                    })
                  );
                }}
                className={`${inputBase} ${
                  errors.bodyWater ? 'border-rose-400 bg-rose-50' : 'border-slate-200'
                }`}
              />
              {errors.bodyWater && (
                <p className="text-rose-500 text-[10px] mt-0.5">{errors.bodyWater}</p>
              )}
            </div>

            {/* Trọng lượng cơ bắp */}
            <div>
              <label className="block font-bold text-slate-700 mb-1 text-[11px]">
                Cơ bắp (kg)
              </label>
              <input
                type="text"
                inputMode="decimal"
                required
                placeholder={latestMetric ? `Trước: ${latestMetric.muscleMass}` : 'vd: 32.5'}
                value={muscleMass}
                onChange={(e) => {
                  clearFieldError('muscleMass');
                  setMuscleMass(
                    formatSmartDecimal(e.target.value, muscleMass, {
                      intDigits: 2,
                      maxDecimals: 2,
                    })
                  );
                }}
                className={`${inputBase} ${
                  errors.muscleMass ? 'border-rose-400 bg-rose-50' : 'border-slate-200'
                }`}
              />
              {errors.muscleMass && (
                <p className="text-rose-500 text-[10px] mt-0.5">{errors.muscleMass}</p>
              )}
            </div>

            {/* BMR */}
            <div>
              <label className="block font-bold text-slate-700 mb-1 text-[11px]">
                BMR (Kcal)
              </label>
              <input
                type="text"
                inputMode="numeric"
                required
                placeholder={latestMetric ? `Trước: ${latestMetric.bmr}` : 'vd: 1450'}
                value={bmr}
                onChange={(e) => {
                  clearFieldError('bmr');
                  setBmr(formatIntegerOnly(e.target.value, 4));
                }}
                className={`${inputBase} ${
                  errors.bmr ? 'border-rose-400 bg-rose-50' : 'border-slate-200'
                }`}
              />
              {errors.bmr && <p className="text-rose-500 text-[10px] mt-0.5">{errors.bmr}</p>}
            </div>

            {/* Tuổi sinh học */}
            <div>
              <label className="block font-bold text-slate-700 mb-1 text-[11px]">
                Tuổi sinh học
              </label>
              <input
                type="text"
                inputMode="numeric"
                required
                placeholder={
                  latestMetric ? `Trước: ${latestMetric.biologicalAge}` : `Tuổi thật: ${student.age}`
                }
                value={biologicalAge}
                onChange={(e) => {
                  clearFieldError('biologicalAge');
                  setBiologicalAge(formatIntegerOnly(e.target.value, 3));
                }}
                className={`${inputBase} ${
                  errors.biologicalAge ? 'border-rose-400 bg-rose-50' : 'border-slate-200'
                }`}
              />
              {errors.biologicalAge && (
                <p className="text-rose-500 text-[10px] mt-0.5">{errors.biologicalAge}</p>
              )}
            </div>

            {/* Mỡ nội tạng */}
            <div>
              <label className="block font-bold text-slate-700 mb-1 text-[11px]">
                Mỡ nội tạng (Cấp)
              </label>
              <input
                type="text"
                inputMode="numeric"
                required
                placeholder={latestMetric ? `Trước: ${latestMetric.visceralFat}` : 'vd: 6'}
                value={visceralFat}
                onChange={(e) => {
                  clearFieldError('visceralFat');
                  setVisceralFat(formatIntegerOnly(e.target.value, 2));
                }}
                className={`${inputBase} ${
                  errors.visceralFat ? 'border-rose-400 bg-rose-50' : 'border-slate-200'
                }`}
              />
              {errors.visceralFat && (
                <p className="text-rose-500 text-[10px] mt-0.5">{errors.visceralFat}</p>
              )}
            </div>
          </div>

          {/* Compact 1-line Notes */}
          <input
            type="text"
            placeholder="Ghi chú nhanh (không bắt buộc)..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-hidden text-xs"
          />

          {errors.submit && (
            <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
              {errors.submit}
            </div>
          )}

          {/* Compact Actions */}
          <div className="pt-2 border-t border-slate-100 flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 border border-slate-200 rounded-xl font-bold text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-[2] py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold transition-colors shadow-xs cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? 'Đang lưu...' : 'Lưu Chỉ Số'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
