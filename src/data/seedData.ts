/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  StudentProfile,
  HealthMetricRecord,
  AIAdviceRecord,
  MealLog,
  WorkoutLog,
  PhysiquePhoto,
  Badge,
  SmartNotification,
} from '../types/health.ts';

// Toàn bộ dữ liệu mẫu đã được xóa sạch — hệ thống chỉ lưu và đọc trực tiếp từ Database
export const SEED_STUDENTS: StudentProfile[] = [];
export const SEED_METRICS: HealthMetricRecord[] = [];
export const SEED_ADVICES: AIAdviceRecord[] = [];
export const SEED_MEALS: MealLog[] = [];
export const SEED_WORKOUTS: WorkoutLog[] = [];
export const SEED_PHOTOS: PhysiquePhoto[] = [];
export const SEED_BADGES: Badge[] = [];
export const SEED_NOTIFICATIONS: SmartNotification[] = [];
