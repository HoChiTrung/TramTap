/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  StudentProfile,
  HealthMetricRecord,
  HealthScoreBreakdown,
  AnomalyAlert,
  AIAdviceRecord,
  WarningMetricItem,
  ActionRecommendationItem,
  AIHealthAnalysisContent,
  CalorieGoalBreakdown,
  DeepAssessmentCard,
} from '../types/health.js';
import {
  getIdealWeightRange,
  getVisceralFatEvaluation,
  getBoneMassEvaluation,
  BODY_TYPE_DEFINITIONS,
  WATER_STANDARDS,
} from '../data/medicalStandards.js';

/**
 * 1. Calculate Daily Recommended Water (Từ bảng tiêu chuẩn trong ảnh 59bf1002.jpg)
 */
export function calculateWaterTarget(weightKg: number, workoutDurationMins: number = 45): number {
  // Check exact lookup from table first
  const mapped = WATER_STANDARDS.weightToLitersMap.find((m) => Math.abs(m.weightKg - weightKg) <= 2.5);
  let baseLiters = mapped ? mapped.liters : weightKg * 0.033;
  const activityOffset = (workoutDurationMins / 45) * 0.5;
  return Number((baseLiters + activityOffset).toFixed(2));
}

/**
 * Helper: Parse desired timeframe in weeks from student's targetMetrics or healthGoal text
 */
export function resolveTargetDurationWeeks(profile?: StudentProfile, weightDiffKg: number = 3): number {
  if (profile?.targetMetrics?.targetDurationWeeks && profile.targetMetrics.targetDurationWeeks > 0) {
    return profile.targetMetrics.targetDurationWeeks;
  }
  const goalText = (profile?.healthGoal || '').toLowerCase();
  const weekMatch = goalText.match(/(\d+)\s*tuần/);
  if (weekMatch) return Math.max(1, parseInt(weekMatch[1], 10));
  const monthMatch = goalText.match(/(\d+)\s*tháng/);
  if (monthMatch) return Math.max(2, parseInt(monthMatch[1], 10) * 4);
  const dayMatch = goalText.match(/(\d+)\s*ngày/);
  if (dayMatch) return Math.max(1, Math.round(parseInt(dayMatch[1], 10) / 7));

  // Default realistic medical pace (~0.5kg - 0.6kg per week, minimum 4 weeks, default 8 weeks)
  if (weightDiffKg > 0) {
    return Math.max(4, Math.min(24, Math.round(weightDiffKg / 0.55)));
  }
  return 8;
}

/**
 * 2. Calculate Detailed Calorie Plan based on 4 factors:
 * - Current Weight (kg)
 * - Target Weight (kg) -> Weight to Lose or Gain (1kg ≈ 7,700 Kcal)
 * - Desired Timeframe (weeks / days)
 * - Visceral Fat Level (Mức mỡ nội tạng hiện tại & mục tiêu)
 * - BMR & TDEE
 */
export function calculateCalorieGoalBreakdown(
  bmr: number,
  currentWeightKg: number,
  profile?: StudentProfile,
  activityFactor: number = 1.375,
  currentVisceralFat?: number
): CalorieGoalBreakdown {
  const safeBmr = bmr || 1550;
  const tdee = Math.round(safeBmr * activityFactor);
  const lowerGoal = (profile?.healthGoal || '').toLowerCase();

  // Determine target weight: explicit targetWeight, or parsed from healthGoal ("giảm X kg" / "tăng X kg"), or ideal weight
  let targetWeightKg = profile?.targetMetrics?.targetWeight;
  if (!targetWeightKg || targetWeightKg <= 0) {
    const loseMatch = lowerGoal.match(/giảm\s*(\d+(?:[.,]\d+)?)\s*kg/);
    const gainMatch = lowerGoal.match(/tăng\s*(\d+(?:[.,]\d+)?)\s*kg/);
    if (loseMatch) {
      targetWeightKg = Number((currentWeightKg - parseFloat(loseMatch[1].replace(',', '.'))).toFixed(1));
    } else if (gainMatch) {
      targetWeightKg = Number((currentWeightKg + parseFloat(gainMatch[1].replace(',', '.'))).toFixed(1));
    } else if (profile) {
      const ideal = getIdealWeightRange(profile.height, profile.gender);
      if (lowerGoal.includes('giảm') || lowerGoal.includes('siết') || lowerGoal.includes('mỡ')) {
        targetWeightKg = Number(Math.min(currentWeightKg - 3, ideal.maxKg).toFixed(1));
      } else if (lowerGoal.includes('tăng')) {
        targetWeightKg = Number(Math.max(currentWeightKg + 3, ideal.minKg).toFixed(1));
      } else {
        targetWeightKg = currentWeightKg;
      }
    } else {
      targetWeightKg = currentWeightKg;
    }
  }

  const rawDiff = Number((targetWeightKg - currentWeightKg).toFixed(1));
  const weightDiffKg = Number(Math.abs(rawDiff).toFixed(1));
  const durationWeeks = resolveTargetDurationWeeks(profile, weightDiffKg);
  const durationDays = durationWeeks * 7;

  // Visceral Fat factor (Mức mỡ nội tạng hiện tại & mục tiêu)
  const visceralLevel = typeof currentVisceralFat === 'number' && currentVisceralFat > 0 ? currentVisceralFat : undefined;
  const targetVisceral = profile?.targetMetrics?.targetVisceralFat;
  let visceralDeficitBoost = 0;
  if (visceralLevel !== undefined) {
    if (visceralLevel >= 13) visceralDeficitBoost = 150;
    else if (visceralLevel >= 9) visceralDeficitBoost = 100;
    else if (visceralLevel >= 6) visceralDeficitBoost = 50;
  }

  const visceralText =
    visceralLevel !== undefined
      ? ` và mức mỡ nội tạng cấp ${visceralLevel}${targetVisceral ? ` (mục tiêu cấp ${targetVisceral})` : ''}`
      : targetVisceral
      ? ` và mục tiêu mỡ nội tạng cấp ${targetVisceral}`
      : '';

  let mode: CalorieGoalBreakdown['mode'] = 'maintenance';
  let label = 'Mức Calo Duy Trì Mỗi Ngày';
  let dailyCalorieAdjustment = 0;
  let targetDailyCalories = tdee;
  let visceralFatAdjustmentKcal = 0;
  let explanation = '';

  if (rawDiff < -0.2 || (rawDiff === 0 && (lowerGoal.includes('giảm') || lowerGoal.includes('siết') || lowerGoal.includes('mỡ')))) {
    mode = 'weight_loss';
    label = 'Mức Calo TỐI ĐA Nạp Mỗi Ngày (Giảm Cân)';
    const effectiveDiffKg = weightDiffKg > 0 ? weightDiffKg : 3.0;
    const effectiveTargetKg = weightDiffKg > 0 ? targetWeightKg : Number((currentWeightKg - 3.0).toFixed(1));
    const neededDailyDeficit = Math.round((effectiveDiffKg * 7700) / durationDays);
    visceralFatAdjustmentKcal = -visceralDeficitBoost;
    // Safe medical deficit: 300 to 1000 Kcal/day, never dropping below 1150 Kcal
    const safeDeficit = Math.min(1000, Math.max(300, neededDailyDeficit + visceralDeficitBoost));
    targetDailyCalories = Math.max(1150, tdee - safeDeficit);
    dailyCalorieAdjustment = targetDailyCalories - tdee; // negative value
    explanation = `Dựa trên cân nặng hiện tại ${currentWeightKg}kg, mục tiêu giảm ${effectiveDiffKg}kg về ${effectiveTargetKg}kg trong ${durationWeeks} tuần (${durationDays} ngày)${visceralText}: Tổng năng lượng cần thâm hụt là ${(effectiveDiffKg * 7700).toLocaleString('vi-VN')} Kcal${visceralDeficitBoost > 0 ? ` (cộng thêm -${visceralDeficitBoost} Kcal/ngày để ưu tiên đốt mỡ nội tạng)` : ''}. Với TDEE ${tdee} Kcal/ngày (BMR ${safeBmr} Kcal), cần thâm hụt ${Math.abs(dailyCalorieAdjustment)} Kcal/ngày → Mức Calo TỐI ĐA nạp vào mỗi ngày là ${targetDailyCalories} Kcal.`;
    targetWeightKg = effectiveTargetKg;
  } else if (rawDiff > 0.2 || (rawDiff === 0 && lowerGoal.includes('tăng'))) {
    mode = 'weight_gain';
    label = 'Mức Calo TỐI THIỂU Nạp Mỗi Ngày (Tăng Cân)';
    const effectiveDiffKg = weightDiffKg > 0 ? weightDiffKg : 3.0;
    const effectiveTargetKg = weightDiffKg > 0 ? targetWeightKg : Number((currentWeightKg + 3.0).toFixed(1));
    const neededDailySurplus = Math.round((effectiveDiffKg * 7700) / durationDays);
    // If visceral fat is elevated (>= 6), cap lean-gain surplus conservatively so visceral fat does not rise
    const maxSafeSurplus = visceralLevel !== undefined && visceralLevel >= 9 ? 350 : visceralLevel !== undefined && visceralLevel >= 6 ? 500 : 850;
    const safeSurplus = Math.min(maxSafeSurplus, Math.max(200, neededDailySurplus - Math.round(visceralDeficitBoost * 0.5)));
    visceralFatAdjustmentKcal = visceralDeficitBoost > 0 ? -Math.round(visceralDeficitBoost * 0.5) : 0;
    dailyCalorieAdjustment = safeSurplus; // positive value
    targetDailyCalories = tdee + safeSurplus;
    explanation = `Dựa trên cân nặng hiện tại ${currentWeightKg}kg, mục tiêu tăng +${effectiveDiffKg}kg lên ${effectiveTargetKg}kg trong ${durationWeeks} tuần (${durationDays} ngày)${visceralText}: Với mức tiêu hao TDEE ${tdee} Kcal/ngày (BMR ${safeBmr} Kcal), cần thặng dư sạch +${dailyCalorieAdjustment} Kcal/ngày${visceralLevel !== undefined && visceralLevel >= 6 ? ' (đã kiểm soát trần thặng dư để không tăng mỡ nội tạng)' : ''} → Mức Calo TỐI THIỂU cần nạp mỗi ngày là ${targetDailyCalories} Kcal.`;
    targetWeightKg = effectiveTargetKg;
  } else if (visceralLevel !== undefined && (visceralLevel >= 6 || (targetVisceral !== undefined && visceralLevel > targetVisceral))) {
    // Stable weight but elevated visceral fat -> mild body recomposition deficit
    mode = 'weight_loss';
    label = 'Mức Calo TỐI ĐA Nạp Mỗi Ngày (Giảm Mỡ Nội Tạng)';
    const gapLevels = targetVisceral !== undefined ? Math.max(1, visceralLevel - targetVisceral) : Math.max(1, visceralLevel - 4);
    const recompositionDeficit = Math.min(450, Math.max(200, visceralDeficitBoost + gapLevels * 35));
    visceralFatAdjustmentKcal = -recompositionDeficit;
    targetDailyCalories = Math.max(1200, tdee - recompositionDeficit);
    dailyCalorieAdjustment = targetDailyCalories - tdee;
    explanation = `Cân nặng hiện tại (${currentWeightKg}kg) sát mức mục tiêu (${targetWeightKg}kg), nhưng mức mỡ nội tạng đang ở cấp ${visceralLevel}${targetVisceral ? ` (mục tiêu cấp ${targetVisceral})` : ''}. Với TDEE ${tdee} Kcal/ngày trong lộ trình ${durationWeeks} tuần, cần thâm hụt nhẹ ${Math.abs(dailyCalorieAdjustment)} Kcal/ngày → Mức Calo TỐI ĐA nạp mỗi ngày là ${targetDailyCalories} Kcal để siết mỡ nội tạng mà vẫn giữ cơ.`;
  } else {
    mode = 'maintenance';
    label = 'Mức Calo Chuẩn Duy Trì Mỗi Ngày';
    dailyCalorieAdjustment = 0;
    targetDailyCalories = tdee;
    explanation = `Cân nặng hiện tại (${currentWeightKg}kg) đã đạt mốc mục tiêu (${targetWeightKg}kg)${visceralText}. Với BMR ${safeBmr} Kcal, mức tiêu hao TDEE là ${tdee} Kcal/ngày → Duy trì nạp ${targetDailyCalories} Kcal/ngày để giữ cân và ổn định chuyển hóa.`;
  }

  const proteinMultiplier = mode === 'weight_loss' ? (visceralLevel !== undefined && visceralLevel >= 6 ? 2.1 : 2.0) : 1.8;
  const proteinGrams = Math.round(currentWeightKg * proteinMultiplier);
  const fatGrams = Math.round((targetDailyCalories * 0.25) / 9);
  const carbsGrams = Math.max(50, Math.round((targetDailyCalories - proteinGrams * 4 - fatGrams * 9) / 4));

  return {
    mode,
    label,
    currentWeightKg,
    targetWeightKg,
    weightDiffKg: Number(Math.abs(targetWeightKg - currentWeightKg).toFixed(1)),
    currentVisceralFat: visceralLevel,
    targetVisceralFat: targetVisceral,
    visceralFatAdjustmentKcal,
    durationWeeks,
    durationDays,
    bmr: safeBmr,
    tdee,
    dailyCalorieAdjustment,
    targetDailyCalories,
    recommendedMacros: {
      proteinGrams,
      carbsGrams,
      fatGrams,
    },
    explanation,
  };
}

/**
 * 2b. Calculate Daily Calorie Target (compatible wrapper)
 */
export function calculateCalorieTarget(
  bmr: number,
  healthGoal: string,
  activityFactor: number = 1.375,
  currentWeightKg?: number,
  profile?: StudentProfile,
  currentVisceralFat?: number
): number {
  if (currentWeightKg && profile) {
    return calculateCalorieGoalBreakdown(bmr, currentWeightKg, profile, activityFactor, currentVisceralFat).targetDailyCalories;
  }
  let goalOffset = 0;
  const lowerGoal = healthGoal.toLowerCase();
  if (lowerGoal.includes('giảm') || lowerGoal.includes('mỡ') || lowerGoal.includes('siết') || lowerGoal.includes('weight loss')) {
    goalOffset = -400;
  } else if (lowerGoal.includes('tăng') || lowerGoal.includes('cơ') || lowerGoal.includes('bulk') || lowerGoal.includes('muscle')) {
    goalOffset = 400;
  }
  const target = Math.round(bmr * activityFactor + goalOffset);
  return Math.max(1200, target);
}

/**
 * 3. Algorithmic Health Score (Thang điểm 100)
 */
export function calculateHealthScore(
  profile: StudentProfile,
  latestMetric: HealthMetricRecord
): HealthScoreBreakdown {
  // S1: Visceral Fat Score (theo bảng chuẩn: 1-4: 100, 5: 85, 6-8: 70, 9-12: 45, >=13: 20)
  let sVisceral = 100;
  if (latestMetric.visceralFat <= 4) {
    sVisceral = 100;
  } else if (latestMetric.visceralFat === 5) {
    sVisceral = 85;
  } else if (latestMetric.visceralFat <= 8) {
    sVisceral = 70 - (latestMetric.visceralFat - 5) * 5;
  } else if (latestMetric.visceralFat <= 12) {
    sVisceral = 50 - (latestMetric.visceralFat - 8) * 6;
  } else {
    sVisceral = Math.max(10, 30 - (latestMetric.visceralFat - 12) * 2);
  }

  // S2: Muscle Mass Score relative to ideal range
  const idealWeight = getIdealWeightRange(profile.height, profile.gender);
  const midWeight = (idealWeight.minKg + idealWeight.maxKg) / 2;
  const idealMuscleRatio = profile.gender === 'Nữ' ? 0.35 : 0.44;
  const currentRatio = latestMetric.muscleMass / latestMetric.weight;
  const muscleRatioDiff = (currentRatio - idealMuscleRatio) / idealMuscleRatio;
  let sMuscle = 80;
  if (muscleRatioDiff >= 0) {
    sMuscle = Math.min(100, 85 + muscleRatioDiff * 50);
  } else {
    sMuscle = Math.max(30, 85 + muscleRatioDiff * 80);
  }

  // S3: Biological Age vs Real Age
  const ageDelta = latestMetric.biologicalAge - profile.age;
  let sAge = 85;
  if (ageDelta < -2) sAge = 100;
  else if (ageDelta <= 0) sAge = 90;
  else if (ageDelta <= 2) sAge = 70;
  else sAge = Math.max(20, 50 - (ageDelta - 2) * 8);

  // S4: Subcutaneous Fat Score
  let sSubcut = 80;
  const fat = latestMetric.subcutaneousFat;
  if (profile.gender === 'Nữ') {
    if (fat >= 18 && fat <= 24) sSubcut = 100;
    else if (fat < 18) sSubcut = Math.max(60, 100 - (18 - fat) * 4);
    else sSubcut = Math.max(25, 100 - (fat - 24) * 3.5);
  } else {
    if (fat >= 10 && fat <= 16) sSubcut = 100;
    else if (fat < 10) sSubcut = Math.max(60, 100 - (10 - fat) * 5);
    else sSubcut = Math.max(25, 100 - (fat - 16) * 3.8);
  }

  // S5: Water & Bone
  const boneStandard = getBoneMassEvaluation(latestMetric.weight, profile.gender);
  const boneDiff = Math.abs(latestMetric.boneCalcium - boneStandard.targetBoneKg);
  const sBone = Math.max(50, 100 - boneDiff * 25);

  let sWater = 80;
  const minWater = profile.gender === 'Nữ' ? WATER_STANDARDS.femaleOptimalMin : WATER_STANDARDS.maleOptimalMin;
  const maxWater = profile.gender === 'Nữ' ? WATER_STANDARDS.femaleOptimalMax : WATER_STANDARDS.maleOptimalMax;
  if (latestMetric.bodyWater >= minWater && latestMetric.bodyWater <= maxWater) {
    sWater = 100;
  } else if (latestMetric.bodyWater < minWater) {
    sWater = Math.max(30, 100 - (minWater - latestMetric.bodyWater) * 5);
  } else {
    sWater = 90;
  }
  const sWaterBone = sWater * 0.6 + sBone * 0.4;

  const totalScore = Math.round(
    0.25 * sVisceral +
    0.25 * sMuscle +
    0.20 * sAge +
    0.15 * sSubcut +
    0.15 * sWaterBone
  );

  let tier: HealthScoreBreakdown['tier'] = 'Trung bình';
  if (totalScore >= 85) tier = 'Xuất sắc';
  else if (totalScore >= 70) tier = 'Tốt';
  else if (totalScore >= 55) tier = 'Trung bình';
  else tier = 'Cần cải thiện';

  return {
    totalScore,
    tier,
    scores: {
      visceralFatScore: Math.round(sVisceral),
      muscleMassScore: Math.round(sMuscle),
      biologicalAgeScore: Math.round(sAge),
      subcutaneousFatScore: Math.round(sSubcut),
      waterAndBoneScore: Math.round(sWaterBone),
    },
  };
}

/**
 * 4. Automated Anomaly Detection based on standard reference charts
 */
export function detectAnomalies(
  profile: StudentProfile,
  latestMetric: HealthMetricRecord,
  history: HealthMetricRecord[]
): AnomalyAlert[] {
  const alerts: AnomalyAlert[] = [];

  // 1. Visceral Fat Warning (06-08 Cảnh báo, 09-12 Thừa mỡ, 13-30 Báo động)
  if (latestMetric.visceralFat >= 13) {
    alerts.push({
      type: 'VISCERAL_FAT_HIGH',
      severity: 'high',
      title: 'MỨC BÁO ĐỘNG ĐỎ: Mỡ Nội Tạng Cực Kỳ Nguy Hiểm',
      message: `Chỉ số mỡ nội tạng đạt cấp ${latestMetric.visceralFat} (ngưỡng an toàn 1-4). Nguy cơ cao dẫn tới tai biến, đột quỵ, xơ vữa mạch vành và gan nhiễm mỡ nặng. Bắt buộc có can thiệp y tế & thể thao khẩn cấp!`,
      metricValue: latestMetric.visceralFat,
      threshold: 13,
    });
  } else if (latestMetric.visceralFat >= 9) {
    alerts.push({
      type: 'VISCERAL_FAT_HIGH',
      severity: 'high',
      title: 'CẢNH BÁO: Lượng Mỡ Nội Tạng Thừa Trên Mức Cho Phép',
      message: `Chỉ số mỡ nội tạng đạt cấp ${latestMetric.visceralFat} (ngưỡng cho phép 1-4, cảnh báo 6-8). Gia tăng nguy cơ tiểu đường type 2, mỡ máu cao và đau mòn sụn khớp. Cần ăn kiêng kỷ luật và tập cardio đốt mỡ.`,
      metricValue: latestMetric.visceralFat,
      threshold: 9,
    });
  } else if (latestMetric.visceralFat >= 6) {
    alerts.push({
      type: 'VISCERAL_FAT_HIGH',
      severity: 'warning',
      title: 'LƯU Ý: Mỡ Nội Tạng Đang Ở Mức Cảnh Báo',
      message: `Chỉ số mỡ nội tạng là cấp ${latestMetric.visceralFat}. Cần tập luyện để đưa về vùng an toàn (cấp 1 - 4).`,
      metricValue: latestMetric.visceralFat,
      threshold: 6,
    });
  }

  // 2. Early Biological Aging
  const ageDelta = latestMetric.biologicalAge - profile.age;
  if (ageDelta >= 3) {
    alerts.push({
      type: 'EARLY_AGING',
      severity: 'high',
      title: 'CẢNH BÁO LÃO HÓA SỚM: Trao Đổi Chất Chậm',
      message: `Tuổi sinh học (${latestMetric.biologicalAge} tuổi) cao hơn tuổi thực (${profile.age} tuổi) tới ${ageDelta} tuổi. Mức độ chuyển hóa nội sinh kém, tích tụ gốc tự do hoặc thiếu ngủ kéo dài.`,
      metricValue: latestMetric.biologicalAge,
      threshold: profile.age + 3,
    });
  }

  // 3. Plateau Detection (UC-NOTIF-03)
  if (history.length >= 3) {
    const sorted = [...history].sort((a, b) => b.timestamp - a.timestamp);
    const m1 = sorted[0];
    const m2 = sorted[1];
    const m3 = sorted[2];

    const fatChange1 = Math.abs(m1.subcutaneousFat - m2.subcutaneousFat) / (m2.subcutaneousFat || 1);
    const fatChange2 = Math.abs(m2.subcutaneousFat - m3.subcutaneousFat) / (m3.subcutaneousFat || 1);
    const muscleChange1 = Math.abs(m1.muscleMass - m2.muscleMass) / (m2.muscleMass || 1);
    const muscleChange2 = Math.abs(m2.muscleMass - m3.muscleMass) / (m3.muscleMass || 1);

    if (fatChange1 < 0.01 && fatChange2 < 0.01 && muscleChange1 < 0.01 && muscleChange2 < 0.01) {
      alerts.push({
        type: 'PLATEAU',
        severity: 'warning',
        title: 'CẢNH BÁO TIẾN TRÌNH BỊ CHỮNG (PLATEAU)',
        message: '3 lần đo liên tiếp các chỉ số mỡ và cơ biến động dưới 1%. Cơ thể đang trong trạng thái thích nghi ngưỡng. HLV cần đổi bài tập hoặc điều chỉnh chu kỳ nạp dinh dưỡng.',
      });
    }
  }

  return alerts;
}

/**
 * 5. Instant AI Advice Generator (KHÔNG CẦN DUYỆT - TỰ ĐỘNG PHÁT HÀNH THEO BIẾN ĐỘNG CHỈ SỐ)
 * Áp dụng 'System Template' chuyên biệt cho phân tích sức khỏe:
 * Phần 1: Chỉ số cảnh báo (Warning Metrics)
 * Phần 2: Đánh giá chuyên sâu (Deep Assessment)
 * Phần 3: Khuyến nghị hành động cụ thể (Action Recommendations)
 */
export function generateInstantAIAdvice(
  profile: StudentProfile,
  latest: HealthMetricRecord,
  previous?: HealthMetricRecord
): AIHealthAnalysisContent {
  const waterTarget = calculateWaterTarget(latest.weight, 45);
  const calorieAnalysis = calculateCalorieGoalBreakdown(latest.bmr, latest.weight, profile, 1.375, latest.visceralFat);
  const calorieTarget = calorieAnalysis.targetDailyCalories;
  const idealWeight = getIdealWeightRange(profile.height, profile.gender);
  const visceralEval = getVisceralFatEvaluation(latest.visceralFat);
  const boneStandard = getBoneMassEvaluation(latest.weight, profile.gender);

  // ==========================================
  // PHẦN 1: CHỈ SỐ CẢNH BÁO (warningMetrics)
  // ==========================================
  const warningMetrics: WarningMetricItem[] = [];

  // 1. Cảnh báo Mỡ nội tạng
  if (latest.visceralFat >= 13) {
    warningMetrics.push({
      name: 'Mỡ nội tạng (BÁO ĐỘNG ĐỎ)',
      value: `Cấp ${latest.visceralFat}`,
      standard: 'Cấp 1 - 4 (Tối ưu)',
      level: 'danger',
      risk: 'Nguy cơ đột quỵ, nhồi máu cơ tim, xơ gan do gan nhiễm mỡ tiến triển và biến chứng tim mạch nặng.',
    });
  } else if (latest.visceralFat >= 9) {
    warningMetrics.push({
      name: 'Mỡ nội tạng (Vượt mức cho phép)',
      value: `Cấp ${latest.visceralFat}`,
      standard: 'Cấp 1 - 4 (Tối ưu), 5 (Trung bình)',
      level: 'danger',
      risk: 'Gây đề kháng insulin dẫn đến tiểu đường type 2, xơ vữa động mạch vành và áp lực thoái hóa khớp gối.',
    });
  } else if (latest.visceralFat >= 6) {
    warningMetrics.push({
      name: 'Mỡ nội tạng (Mức cảnh báo)',
      value: `Cấp ${latest.visceralFat}`,
      standard: 'Cấp 1 - 4 (Tối ưu)',
      level: 'warning',
      risk: 'Bắt đầu tích tụ mỡ quanh bao gan và tim, cản trở lưu thông mạch máu nếu không can thiệp sớm.',
    });
  } else {
    warningMetrics.push({
      name: 'Mỡ nội tạng (An toàn)',
      value: `Cấp ${latest.visceralFat}`,
      standard: 'Cấp 1 - 4',
      level: 'safe',
      risk: 'Chỉ số mỡ nội tạng ở ngưỡng an toàn, bảo vệ tốt các cơ quan nội tạng.',
    });
  }

  // 2. Cảnh báo Lão hóa sinh học (Tuổi sinh học vs Tuổi thực)
  const ageDelta = latest.biologicalAge - profile.age;
  if (ageDelta >= 5) {
    warningMetrics.push({
      name: 'Tuổi sinh học (Lão hóa sâu)',
      value: `${latest.biologicalAge} tuổi (Chênh +${ageDelta} tuổi)`,
      standard: `Bằng hoặc trẻ hơn tuổi thực (${profile.age} tuổi)`,
      level: 'danger',
      risk: 'Tốc độ trao đổi chất suy giảm nghiêm trọng, suy giảm hormone nội sinh và tích lũy gốc tự do.',
    });
  } else if (ageDelta >= 2) {
    warningMetrics.push({
      name: 'Tuổi sinh học (Lão hóa sớm)',
      value: `${latest.biologicalAge} tuổi (Chênh +${ageDelta} tuổi)`,
      standard: `≤ ${profile.age} tuổi`,
      level: 'warning',
      risk: 'Chuyển hóa nền chậm, biểu hiện cơ thể thiếu ngủ, stress hoặc tích mỡ thụ động.',
    });
  } else {
    warningMetrics.push({
      name: 'Tuổi sinh học',
      value: `${latest.biologicalAge} tuổi (${ageDelta < 0 ? `Trẻ hơn ${Math.abs(ageDelta)} tuổi` : 'Tương đương tuổi thực'})`,
      standard: `≤ ${profile.age} tuổi`,
      level: 'safe',
      risk: 'Tốc độ chuyển hóa tế bào đang ở trạng thái trẻ hóa tốt.',
    });
  }

  // 3. Cảnh báo Cân nặng vs Ngưỡng chuẩn chiều cao
  if (latest.weight > idealWeight.maxKg + 5) {
    const overKg = Number((latest.weight - idealWeight.maxKg).toFixed(1));
    warningMetrics.push({
      name: 'Trọng lượng cơ thể (Thừa cân)',
      value: `${latest.weight} kg`,
      standard: `${idealWeight.minKg} - ${idealWeight.maxKg} kg (Chiều cao ${profile.height}m)`,
      level: 'danger',
      risk: `Vượt ${overKg}kg so với trần chuẩn; gia tăng tải trọng lên đĩa đệm cột sống và sụn khớp gối.`,
    });
  } else if (latest.weight > idealWeight.maxKg) {
    const overKg = Number((latest.weight - idealWeight.maxKg).toFixed(1));
    warningMetrics.push({
      name: 'Trọng lượng cơ thể',
      value: `${latest.weight} kg`,
      standard: `${idealWeight.minKg} - ${idealWeight.maxKg} kg`,
      level: 'warning',
      risk: `Hơi vượt trần chuẩn ${overKg}kg, cần siết mỡ để đưa về khoảng tối ưu.`,
    });
  } else if (latest.weight < idealWeight.minKg) {
    const underKg = Number((idealWeight.minKg - latest.weight).toFixed(1));
    warningMetrics.push({
      name: 'Trọng lượng cơ thể (Thiếu cân)',
      value: `${latest.weight} kg`,
      standard: `${idealWeight.minKg} - ${idealWeight.maxKg} kg`,
      level: 'warning',
      risk: `Dưới chuẩn ${underKg}kg; cơ thể có dấu hiệu thiếu năng lượng dự trữ và hệ miễn dịch kém.`,
    });
  }

  // 4. Cảnh báo Lượng nước sinh học
  const minOptimalWater = profile.gender === 'Nữ' ? 50 : 55;
  if (latest.bodyWater < minOptimalWater - 3) {
    warningMetrics.push({
      name: 'Tỷ lệ nước cơ thể (Thiếu hụt)',
      value: `${latest.bodyWater} %`,
      standard: `${minOptimalWater} - ${profile.gender === 'Nữ' ? 55 : 65} %`,
      level: 'danger',
      risk: 'Máu cô đặc, giảm hiệu suất vận chuyển oxy đến sợi cơ, thận giảm tốc độ lọc độc tố.',
    });
  } else if (latest.bodyWater < minOptimalWater) {
    warningMetrics.push({
      name: 'Tỷ lệ nước cơ thể',
      value: `${latest.bodyWater} %`,
      standard: `${minOptimalWater} - ${profile.gender === 'Nữ' ? 55 : 65} %`,
      level: 'warning',
      risk: 'Chưa đạt mức tối ưu cho quá trình đốt mỡ và đồng hóa protein cơ bắp.',
    });
  }

  // ==========================================
  // PHẦN 2: ĐÁNH GIÁ CHUYÊN SÂU (deepAssessment)
  // ==========================================
  const bodyTypeDef = Object.values(BODY_TYPE_DEFINITIONS).find(
    (b) => b.code.toLowerCase() === latest.bodyType.toLowerCase() || b.name.includes(latest.bodyType)
  );

  const isLowWater = latest.bodyWater < (profile.gender === 'Nam' ? 55 : 50);
  const isHighSubFat = latest.subcutaneousFat > (profile.gender === 'Nam' ? 20 : 28);
  const isLowMuscle = latest.muscleMass < (profile.gender === 'Nam' ? 32 : 21);
  const muscleRatio = ((latest.muscleMass / latest.weight) * 100).toFixed(1);

  const overviewCard: DeepAssessmentCard = {
    badge_text: bodyTypeDef && bodyTypeDef.index >= 4 && bodyTypeDef.index <= 6 ? 'Cân đối' : 'Cần tối ưu',
    badge_tone: bodyTypeDef && bodyTypeDef.index >= 4 && bodyTypeDef.index <= 6 ? 'positive' : 'warning',
    analysis: `Học viên **${profile.fullName}** (${profile.gender}, ${profile.age} tuổi) đang ở nhóm thể hình **"${latest.bodyType}"** (Cấp **${bodyTypeDef?.index || 5}/9**). ${bodyTypeDef?.description || 'Các chỉ số nền tảng ở mức tương đối cân đối.'}`,
    action_tip: 'Duy trì nhịp đo định kỳ mỗi 7–14 ngày để theo dõi sự dịch chuyển cấp độ thể hình.',
  };

  const matrixIssues: string[] = [];
  if (isLowMuscle) matrixIssues.push('khối cơ còn thấp');
  if (isLowWater) matrixIssues.push('tỷ lệ nước đang thiếu nhẹ');
  if (isHighSubFat) matrixIssues.push('mỡ dưới da hơi cao');

  const bodyMatrixCard: DeepAssessmentCard = {
    badge_text: matrixIssues.length === 0 ? 'Đạt chuẩn' : isLowWater ? 'Thiếu nước nhẹ' : 'Cần cân bằng',
    badge_tone: matrixIssues.length === 0 ? 'positive' : 'warning',
    analysis: `Cơ bắp đạt **${latest.muscleMass}kg** (**${muscleRatio}%** thể trọng), mỡ dưới da **${latest.subcutaneousFat}%**, khối lượng xương **${latest.boneCalcium}kg** (chuẩn: **${boneStandard.targetBoneKg}kg**) và lượng nước **${latest.bodyWater}%**. ${
      matrixIssues.length > 0
        ? `Hiện ghi nhận **${matrixIssues.join(', ')}** so với ngưỡng tham chiếu theo giới tính ${profile.gender}, cần ưu tiên bù nước và giữ đạm đều đặn.`
        : 'Tỷ lệ cơ, nước và khối lượng xương đang phối hợp hài hòa theo ngưỡng tham chiếu.'
    }`,
    action_tip: isLowWater
      ? `Uống đủ **${waterTarget} Lít/ngày** chia đều theo giờ để tối ưu trao đổi chất.`
      : `Giữ mức đạm **${calorieAnalysis.recommendedMacros.proteinGrams}g/ngày** để nuôi dưỡng và bảo toàn khối cơ.`,
  };

  const agingCauseNote =
    ageDelta > 0
      ? `Dù ${isLowMuscle ? 'cơ bắp cần tăng thêm' : 'khối cơ đang khá tốt'}, tuổi sinh học (**${latest.biologicalAge} tuổi**) vẫn cao hơn tuổi thực (**${profile.age} tuổi**) khoảng **+${ageDelta} tuổi**, nhiều khả năng liên quan đến ${isLowWater ? 'tình trạng thiếu nước làm chậm trao đổi chất' : isHighSubFat ? 'tỷ lệ mỡ dưới da cao gây áp lực chuyển hóa' : 'tốc độ chuyển hóa nền chưa tối ưu'}.`
      : `Tuổi sinh học **${latest.biologicalAge} tuổi** đang trẻ hơn hoặc bằng tuổi thực (**${profile.age} tuổi**), cho thấy hiệu suất chuyển hóa nội sinh tích cực.`;

  const visceralAndAgingCard: DeepAssessmentCard = {
    badge_text:
      latest.visceralFat >= 10
        ? 'Cảnh báo cao'
        : ageDelta > 0 || latest.visceralFat >= 7
        ? 'Cần tối ưu chuyển hóa'
        : 'Nguy cơ thấp',
    badge_tone: latest.visceralFat >= 10 ? 'alert' : ageDelta > 0 || latest.visceralFat >= 7 ? 'warning' : 'positive',
    analysis: `Mỡ nội tạng ở **Cấp ${latest.visceralFat}** (${visceralEval.label}). ${agingCauseNote} ${
      visceralEval.associatedRisks.length > 0
        ? `Cần chủ động kiểm soát các yếu tố nguy cơ: ${visceralEval.associatedRisks.join('; ')}.`
        : 'Nguy cơ rối loạn chuyển hóa liên quan đến mỡ nội tạng hiện ở mức thấp.'
    }`,
    action_tip:
      latest.visceralFat >= 8
        ? 'Ưu tiên cắt đường tinh luyện và tăng vận động Cardio Zone 2 từ 25–30 phút/buổi.'
        : 'Duy trì giấc ngủ trước 23h00 và vận động đều để giữ tuổi sinh học ổn định.',
  };

  let progressComparisonCard: DeepAssessmentCard = {
    badge_text: 'Mốc chuẩn (Baseline)',
    badge_tone: 'neutral',
    analysis: 'Đây là **lần đo đầu tiên**, đóng vai trò mốc chuẩn (baseline) để đối chiếu tốc độ thay đổi cơ, mỡ và nước ở các kỳ kiểm tra tiếp theo.',
    action_tip: 'Giữ cùng khung giờ và trạng thái cơ thể khi cân đo ở lần tới để so sánh chính xác.',
  };

  if (previous) {
    const dWeight = Number((latest.weight - previous.weight).toFixed(1));
    const dMuscle = Number((latest.muscleMass - previous.muscleMass).toFixed(1));
    const dFat = Number((latest.subcutaneousFat - previous.subcutaneousFat).toFixed(1));
    const dVisceral = latest.visceralFat - previous.visceralFat;
    const parts: string[] = [];
    if (dWeight !== 0) parts.push(`cân nặng **${dWeight > 0 ? `+${dWeight}` : dWeight}kg**`);
    if (dMuscle !== 0) parts.push(`cơ bắp **${dMuscle > 0 ? `+${dMuscle}` : dMuscle}kg**`);
    if (dFat !== 0) parts.push(`mỡ dưới da **${dFat > 0 ? `+${dFat}` : dFat}%**`);
    if (dVisceral !== 0) parts.push(`mỡ nội tạng **${dVisceral > 0 ? `+${dVisceral}` : dVisceral} cấp**`);

    const isRecompGood = dMuscle >= 0 && dFat < 0;
    progressComparisonCard = {
      badge_text: isRecompGood ? 'Tăng cơ - Giảm mỡ' : dMuscle < 0 ? 'Cần giữ cơ' : 'Ổn định',
      badge_tone: isRecompGood ? 'positive' : dMuscle < 0 ? 'warning' : 'neutral',
      analysis:
        parts.length > 0
          ? `So với lần đo trước (${previous.date}): ${parts.join(', ')}. ${
              isRecompGood
                ? 'Xu hướng **tăng cơ - giảm mỡ** đang đi đúng hướng và rất tích cực.'
                : dMuscle < 0
                ? 'Khối cơ có dấu hiệu giảm nhẹ, cần rà soát lại lượng đạm và cường độ tập kháng lực.'
                : 'Các chỉ số đang dịch chuyển ổn định theo lộ trình.'
            }`
          : `Các chỉ số giữ mức ổn định so với lần đo liền kề (${previous.date}).`,
      action_tip: isRecompGood
        ? 'Tiếp tục bám sát mức Calo và lịch tập hiện tại để duy trì đà tiến bộ.'
        : 'Kiểm tra lại nhật ký bữa ăn để đảm bảo đủ đạm và nước mỗi ngày.',
    };
  }

  const keyActions = [
    bodyMatrixCard.action_tip,
    visceralAndAgingCard.action_tip,
    progressComparisonCard.action_tip,
  ].filter((t): t is string => Boolean(t));

  const overview = overviewCard.analysis;
  const visceralAndAgingRisk = visceralAndAgingCard.analysis;
  const progressComparison = progressComparisonCard.analysis;

  // ==========================================
  // PHẦN 3: KHUYẾN NGHỊ HÀNH ĐỘNG CỤ THỂ (actionRecommendations)
  // ==========================================
  const actionRecommendations: ActionRecommendationItem[] = [];

  // Dinh dưỡng (Dựa trên Cân nặng hiện tại, Cân nặng mục tiêu, Thời gian mong muốn & Mức mỡ nội tạng)
  const proteinTargetGrams = calorieAnalysis.recommendedMacros.proteinGrams;
  const visceralActionContext = `, kết hợp mức mỡ nội tạng cấp ${latest.visceralFat}${calorieAnalysis.targetVisceralFat ? ` (mục tiêu cấp ${calorieAnalysis.targetVisceralFat})` : ''}`;
  const calorieActionPrefix =
    calorieAnalysis.mode === 'weight_loss'
      ? `Mức Calo TỐI ĐA nạp mỗi ngày: ${calorieTarget} Kcal/ngày (để giảm ${calorieAnalysis.weightDiffKg}kg từ ${calorieAnalysis.currentWeightKg}kg xuống ${calorieAnalysis.targetWeightKg}kg trong ${calorieAnalysis.durationWeeks} tuần${visceralActionContext}, thâm hụt ${Math.abs(calorieAnalysis.dailyCalorieAdjustment)} Kcal/ngày so với TDEE ${calorieAnalysis.tdee} Kcal).`
      : calorieAnalysis.mode === 'weight_gain'
      ? `Mức Calo TỐI THIỂU nạp mỗi ngày: ${calorieTarget} Kcal/ngày (để tăng +${calorieAnalysis.weightDiffKg}kg từ ${calorieAnalysis.currentWeightKg}kg lên ${calorieAnalysis.targetWeightKg}kg trong ${calorieAnalysis.durationWeeks} tuần${visceralActionContext}, thặng dư +${calorieAnalysis.dailyCalorieAdjustment} Kcal/ngày so với TDEE ${calorieAnalysis.tdee} Kcal).`
      : `Mức Calo duy trì mỗi ngày: ${calorieTarget} Kcal/ngày (cân bằng TDEE ${calorieAnalysis.tdee} Kcal để giữ mốc ${calorieAnalysis.currentWeightKg}kg${visceralActionContext}).`;

  actionRecommendations.push({
    area: 'Dinh dưỡng',
    action: `${calorieActionPrefix} Bổ sung ${proteinTargetGrams}g Protein, ${calorieAnalysis.recommendedMacros.carbsGrams}g Tinh bột và ${calorieAnalysis.recommendedMacros.fatGrams}g Chất béo tốt mỗi ngày.`,
    target:
      calorieAnalysis.mode === 'weight_loss'
        ? `Tối đa ${calorieTarget} Kcal/ngày • ${proteinTargetGrams}g Protein`
        : calorieAnalysis.mode === 'weight_gain'
        ? `Tối thiểu ${calorieTarget} Kcal/ngày • ${proteinTargetGrams}g Protein`
        : `${calorieTarget} Kcal/ngày • ${proteinTargetGrams}g Protein`,
    notes: latest.visceralFat >= 8
      ? 'Cắt bỏ hoàn toàn đường tinh luyện, nước ngọt có ga, bánh kẹo và đồ chiên ngập dầu để đảo ngược mỡ nội tạng.'
      : 'Ưu tiên tinh bột chậm (gạo lứt, khoai lang, yến mạch) và bổ sung 300g rau xanh/ngày.',
  });

  // Tập luyện
  actionRecommendations.push({
    area: 'Tập luyện',
    action: latest.visceralFat >= 8
      ? 'Lịch tập 4-5 buổi/tuần: Kết hợp 3 buổi kháng lực đa khớp (Compound Lifting) và 2 buổi Cardio ngắt quãng cường độ cao (HIIT) 25 phút.'
      : 'Lịch tập 3-4 buổi/tuần: Tập trung phát triển khối cơ (Hypertrophy) với các bài Squat, Deadlift, Bench Press, Lats Pull-down.',
    target: '4 - 5 buổi/tuần • 45 - 60 phút/buổi',
    notes: 'Khởi động kỹ khớp gối và cột sống trước buổi tập; kéo giãn cơ sau tập 10 phút.',
  });

  // Lối sống & Chuyển hóa
  actionRecommendations.push({
    area: 'Lối sống & Chuyển hóa',
    action: `Duy trì lượng nước lọc tối thiểu ${waterTarget} Lít/ngày (uống đều 250ml mỗi 2 tiếng). Ngủ đủ 7-8 tiếng và bắt buộc lên giường trước 23h00.`,
    target: `${waterTarget} Lít nước/ngày • Ngủ trước 23h00`,
    notes: 'Giúp hạ cortisol (hormone gây tích mỡ bụng) và kích hoạt hormone tăng trưởng GH phục hồi cơ bắp.',
  });

  const summary = `${progressComparison} ${overview} ${visceralAndAgingRisk}`;
  const nutritionAdvice = actionRecommendations[0].action;
  const workoutAdvice = actionRecommendations[1].action;
  const lifestyleTip = actionRecommendations[2].action;

  return {
    warningMetrics,
    deepAssessment: {
      overview: overviewCard,
      body_matrix: bodyMatrixCard,
      visceral_and_aging: visceralAndAgingCard,
      progress_comparison: progressComparisonCard,
      key_actions: keyActions,
    },
    actionRecommendations,
    calorieAnalysis,
    summary,
    nutritionAdvice,
    workoutAdvice,
    lifestyleTip,
    waterTargetLiters: waterTarget,
    calorieTargetKcal: calorieTarget,
  };
}

/**
 * Resolve deep assessment card safely for both new structured format and legacy string format
 */
export function resolveDeepAssessmentCard(
  primary: string | DeepAssessmentCard | undefined,
  legacyText: string | undefined,
  defaultBadge: string
): DeepAssessmentCard {
  if (primary && typeof primary === 'object' && typeof primary.analysis === 'string') {
    return {
      badge_text: primary.badge_text || defaultBadge,
      badge_tone: primary.badge_tone || 'neutral',
      analysis: primary.analysis,
      action_tip: primary.action_tip,
    };
  }
  const text =
    typeof primary === 'string' && primary.trim()
      ? primary
      : typeof legacyText === 'string'
      ? legacyText
      : '';
  return {
    badge_text: defaultBadge,
    badge_tone: 'neutral',
    analysis: text,
  };
}

export function getDeepAssessmentText(
  primary: string | DeepAssessmentCard | undefined,
  legacyText?: string
): string {
  if (primary && typeof primary === 'object' && typeof primary.analysis === 'string') {
    return primary.analysis.replace(/\*\*/g, '');
  }
  if (typeof primary === 'string' && primary.trim()) {
    return primary.replace(/\*\*/g, '');
  }
  return (legacyText || '').replace(/\*\*/g, '');
}

/**
 * 6. Gap Analysis
 */
export function calculateGapAnalysis(
  profile: StudentProfile,
  latestMetric?: HealthMetricRecord,
  firstMetric?: HealthMetricRecord
) {
  if (!latestMetric) return null;

  const targets = profile.targetMetrics;
  const targetWeight = targets.targetWeight;
  const targetVisceral = targets.targetVisceralFat;
  const targetMuscle = targets.targetMuscleMass;

  let weightProgressPercent = 0;
  if (targetWeight && firstMetric) {
    const totalGoalDelta = Math.abs(firstMetric.weight - targetWeight);
    const achievedDelta = Math.abs(firstMetric.weight - latestMetric.weight);
    weightProgressPercent = totalGoalDelta > 0 ? Math.min(100, Math.round((achievedDelta / totalGoalDelta) * 100)) : 100;
  }

  return {
    weightDelta: targetWeight ? Number((latestMetric.weight - targetWeight).toFixed(1)) : null,
    visceralDelta: targetVisceral !== undefined ? latestMetric.visceralFat - targetVisceral : null,
    muscleDelta: targetMuscle ? Number((latestMetric.muscleMass - targetMuscle).toFixed(1)) : null,
    weightProgressPercent,
  };
}
