/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type Gender = 'Nam' | 'Nữ' | 'Khác';

export type BodyTypeClassification =
  | 'Gầy'
  | 'Thiếu cân nhẹ'
  | 'Tiêu chuẩn'
  | 'Cơ bắp gọn'
  | 'Vận động viên'
  | 'Mỡ tiềm ẩn'
  | 'Thừa cân'
  | 'Béo phì';

export interface TargetMetrics {
  targetWeight?: number; // kg
  targetDurationWeeks?: number; // Số tuần mong muốn đạt mục tiêu cân nặng (mặc định 8 tuần)
  targetVisceralFat?: number; // Level 1-30
  targetMuscleMass?: number; // kg
  targetSubcutaneousFat?: number; // %
  targetWaist?: number; // cm
  totalMealPortions?: number; // Tổng số khẩu phần phiếu ăn (VD: 0, 30 hoặc 60 khẩu phần)
  trainingPackageId?: string; // ID gói luyện tập đang đăng ký (từ danh mục gói tập)
  trainingPackageName?: string; // Tên gói luyện tập đang đăng ký
}

export interface CalorieGoalBreakdown {
  mode: 'weight_loss' | 'weight_gain' | 'maintenance';
  label: string;
  currentWeightKg: number;
  targetWeightKg: number;
  weightDiffKg: number;
  currentVisceralFat?: number;
  targetVisceralFat?: number;
  visceralFatAdjustmentKcal?: number;
  durationWeeks: number;
  durationDays: number;
  bmr: number;
  tdee: number;
  dailyCalorieAdjustment: number;
  targetDailyCalories: number;
  recommendedMacros: {
    proteinGrams: number;
    carbsGrams: number;
    fatGrams: number;
  };
  explanation: string;
}

export interface StudentProfile {
  id: string;
  fullName: string; // Max 100 chars
  gender: Gender;
  age: number; // 1 - 120
  height: number; // Unit: mét, 0.50m - 2.50m
  phone: string; // Regex ^(03|5|7|8|9)+([0-9]{8})$
  address?: string; // Max 255 chars
  dateOfBirth: string; // YYYY-MM-DD
  healthGoal: string; // Max 500 chars (Baseline Target)
  targetMetrics: TargetMetrics;
  avatarUrl?: string;
  trainerId?: string; // ID của HLV phụ trách học viên này
  trainerName?: string; // Tên của HLV phụ trách
  createdAt: string;
}

export interface HealthMetricRecord {
  id: string;
  studentId: string;
  date: string; // YYYY-MM-DD
  timestamp: number;
  weight: number; // 1. Cân nặng (kg, 10.00 - 300.00)
  subcutaneousFat: number; // 2. Mỡ dưới da (%, 1.0 - 60.0)
  boneCalcium: number; // 3. Canxi xương (Chỉ số, 0.5 - 10.0)
  bodyWater: number; // 4. Lượng nước (%, 20.0 - 80.0)
  muscleMass: number; // 5. Trọng lượng cơ bắp (kg, 5.00 - 150.00)
  bodyType: BodyTypeClassification; // 6. Thể hình (Phân loại)
  bmr: number; // 7. Năng lượng khi nghỉ ngơi (Calories, 500 - 5000)
  biologicalAge: number; // 8. Tuổi sinh học (Tuổi, 1 - 120)
  visceralFat: number; // 9. Mỡ nội tạng (Chỉ số/Cấp, 1 - 30)
  waist: number; // 10. Vòng eo (cm, 30.0 - 200.0)
  notes?: string;
}

export interface AnomalyAlert {
  type: 'VISCERAL_FAT_HIGH' | 'EARLY_AGING' | 'PLATEAU' | 'RAPID_CHANGE';
  severity: 'high' | 'warning' | 'info';
  title: string;
  message: string;
  metricValue?: number;
  threshold?: number;
}

export type UserRole = 'admin' | 'trainer' | 'student';

export interface AuthUser {
  id: string;
  username: string;
  fullName: string;
  role: UserRole;
  phone?: string;
  studentId?: string;
  trainerId?: string;
  avatarUrl?: string;
  discountTier?: number;
}

export interface UserAccount {
  id: string;
  username: string;
  password?: string;
  fullName: string;
  role: UserRole;
  phone?: string;
  studentId?: string | null;
  trainerId?: string | null;
  trainerName?: string;
  discountTier?: number;
  createdAt?: string;
}

export interface WarningMetricItem {
  name: string;
  value: string;
  standard: string;
  level: 'danger' | 'warning' | 'safe';
  risk: string;
}

export interface ActionRecommendationItem {
  area: 'Dinh dưỡng' | 'Tập luyện' | 'Lối sống & Chuyển hóa';
  action: string;
  target: string;
  notes?: string;
}

export interface AIHealthAnalysisContent {
  // Phần 1: Chỉ số cảnh báo
  warningMetrics: WarningMetricItem[];
  // Phần 2: Đánh giá chuyên sâu
  deepAssessment: {
    overview: string;
    bodyCompositionAnalysis: string; // Cơ, mỡ, nước, xương
    visceralAndAgingRisk: string; // Mỡ nội tạng và tốc độ lão hóa sinh học
    progressComparison?: string; // So sánh tiến trình giữa các lần đo
  };
  // Phần 3: Khuyến nghị hành động cụ thể
  actionRecommendations: ActionRecommendationItem[];
  // Phân tích chi tiết Mức Calo tối đa / tối thiểu theo cân nặng hiện tại, cân nặng mục tiêu và thời gian
  calorieAnalysis?: CalorieGoalBreakdown;
  // Legacy / Quick Access fields for backward compatibility
  summary: string;
  nutritionAdvice: string;
  workoutAdvice: string;
  lifestyleTip: string;
  waterTargetLiters: number;
  calorieTargetKcal: number;
}

export interface AIAdviceRecord {
  id: string;
  studentId: string;
  metricRecordId: string;
  date: string;
  status: 'auto_generated' | 'draft_pending' | 'trainer_approved' | 'rejected';
  aiDraftContent: AIHealthAnalysisContent;
  trainerEditedContent?: string;
  trainerNote?: string;
  approvedAt?: string;
}

export interface HealthScoreBreakdown {
  totalScore: number; // 0 - 100
  tier: 'Xuất sắc' | 'Tốt' | 'Trung bình' | 'Cần cải thiện';
  scores: {
    visceralFatScore: number; // W1: 25%
    muscleMassScore: number; // W2: 25%
    biologicalAgeScore: number; // W3: 20%
    subcutaneousFatScore: number; // W4: 15%
    waterAndBoneScore: number; // W5: 15%
  };
}

export interface MealItem {
  name: string;
  portion: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export type PortionStatus = 'none' | 'used' | 'takeaway';

export interface MealLog {
  id: string;
  studentId: string;
  date: string;
  mealType: 'Bữa sáng' | 'Bữa trưa' | 'Bữa tối' | 'Bữa phụ' | 'Phiếu ăn 30 ngày';
  imageUrl: string;
  foodDescription: string;
  estimatedCalories: number;
  macros: {
    protein: number; // grams
    carbs: number; // grams
    fat: number; // grams
    dayNumber?: number; // 1..30
    morningStatus?: PortionStatus; // 'none' | 'used' | 'takeaway'
    afternoonStatus?: PortionStatus; // 'none' | 'used' | 'takeaway'
    attendanceStatus?: 'ate' | 'takeaway' | 'weighed_no_meal';
  };
  items?: MealItem[];
  trainerReaction?: '🔥' | '💪' | '👏' | '❤️';
  trainerComment?: string;
  loggedAt: string;
  nutritionAdvice?: string;
}

export interface WorkoutExercise {
  id: string;
  name: string;
  sets: string;
  reps: string;
  completed: boolean;
}

export interface WorkoutLog {
  id: string;
  studentId: string;
  date: string;
  planTitle: string;
  durationMinutes: number;
  exercises: WorkoutExercise[];
  trainerReaction?: '🔥' | '💪' | '👏' | '❤️';
  trainerComment?: string;
  loggedAt: string;
}

export interface PhysiquePhoto {
  id: string;
  studentId: string;
  date: string;
  imageUrl: string;
  photoType: 'before' | 'after' | 'progress';
  weight: number;
  notes?: string;
}

export interface Badge {
  id: string;
  title: string;
  description: string;
  icon: string;
  unlockedAt?: string;
  category: 'score' | 'visceral' | 'streak' | 'muscle' | 'water';
}

export interface SmartNotification {
  id: string;
  useCaseId: 'UC-NOTIF-01' | 'UC-NOTIF-02' | 'UC-NOTIF-03';
  studentId: string;
  title: string;
  message: string;
  priority: 'low' | 'medium' | 'high';
  createdAt: string;
  read: boolean;
}
