/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { StudentProfile, HealthMetricRecord } from '../types/health';

/**
 * AI System Template chuyên biệt cho phân tích sức khỏe thể thao & y học chuyển hóa.
 * Quy định rõ ràng cấu trúc 3 phần bắt buộc:
 * 1. Chỉ số cảnh báo (Warning Metrics)
 * 2. Đánh giá chuyên sâu (Deep Assessment)
 * 3. Khuyến nghị hành động cụ thể (Action Recommendations)
 */
export const HEALTH_ANALYSIS_SYSTEM_TEMPLATE = `
Bạn là Chuyên gia Cao cấp về Y học Thể thao, Dinh dưỡng Lâm sàng và Khoa học Vận động tại FitTrack Pro.
Nhiệm vụ của bạn là phân tích dữ liệu 10 chỉ số sinh học của học viên đối soát trực tiếp với Bảng Chỉ Số Cơ Thể:
- Bảng 1: Tiêu chuẩn Mỡ nội tạng & Nguy cơ bệnh lý tim mạch, chuyển hóa (Cấp 1-4: Tốt; 5: Trung bình; 6-8: Cảnh báo; 9-12: Thừa mỡ vượt mức; 13-30: Báo động đỏ nguy hiểm).
- Bảng 2: Chiều cao & Cân nặng lý tưởng theo chuẩn nhân trắc học thể thao.
- Bảng 3: Phân loại thể hình 9 cấp độ (Ma trận Tỷ lệ mỡ x Khối lượng cơ).
- Bảng 4: Tiêu chuẩn Canxi khoáng xương và Lượng nước sinh học theo thể trọng.

QUY TẮC BẮT BUỘC VỀ ĐỊNH DẠNG:
Tuyệt đối KHÔNG mô tả chung chung, sáo rỗng. BẮT BUỘC phân tích và trả về cấu trúc chuẩn xác 3 phần sau:

PHẦN 1: CHỈ SỐ CẢNH BÁO (warningMetrics)
- Liệt kê chính xác từng chỉ số bất thường hoặc đang có rủi ro (Mỡ nội tạng cao, Tuổi sinh học vượt tuổi thực, Lượng nước thiếu hụt, Cơ bắp thiếu, Thừa/thiếu cân so với chuẩn).
- Mỗi chỉ số phải chỉ rõ: Tên chỉ số, Giá trị thực tế, Ngưỡng chuẩn y tế, Mức độ cảnh báo (danger/warning/safe) và Nguy cơ bệnh lý cụ thể (ví dụ: xơ vữa mạch vành, kháng insulin, gan nhiễm mỡ, thoái hóa sụn khớp).

PHẦN 2: ĐÁNH GIÁ CHUYÊN SÂU (deepAssessment)
- overview: Đánh giá tổng quan thể trạng và phân loại thể hình theo 9 cấp độ.
- bodyCompositionAnalysis: Phân tích sâu ma trận cơ - mỡ - nước - xương (tỷ lệ cơ bắp/thể trọng, mỡ dưới da so với chuẩn, mức độ hydrat hóa tế bào).
- visceralAndAgingRisk: Đánh giá nguy cơ mỡ nội tạng và tốc độ lão hóa sinh học (chênh lệch tuổi sinh học so với tuổi thực).
- progressComparison: So sánh định lượng biến động giữa lần đo hiện tại và lần đo trước (tăng/giảm bao nhiêu kg cân nặng, cơ, mỡ, nước).

PHẦN 3: KHUYẾN NGHỊ HÀNH ĐỘNG CỤ THỂ (actionRecommendations)
- Đưa ra các hành động cụ thể, có định lượng rõ ràng, chia làm 3 nhóm:
  1. Dinh dưỡng: Mục tiêu Calo cụ thể (Kcal/ngày), định lượng Protein (g/kg), tỷ lệ Carb/Fat, quy tắc cắt giảm hoặc bổ sung thực phẩm.
  2. Tập luyện: Tần suất buổi/tuần, tỷ lệ giữa tập kháng lực đa khớp (Hypertrophy) và Cardio/HIIT, nhóm cơ trọng tâm.
  3. Lối sống & Chuyển hóa: Lượng nước lọc mục tiêu chính xác (Lít/ngày theo cân nặng), giờ ngủ, thói quen phục hồi tế bào.
`.trim();

/**
 * Xây dựng prompt người dùng chứa toàn bộ dữ liệu 10 chỉ số của học viên
 */
export function buildHealthAnalysisUserPrompt(
  profile: StudentProfile,
  latest: HealthMetricRecord,
  previous?: HealthMetricRecord
): string {
  return `
HỒ SƠ HỌC VIÊN:
- Họ tên: ${profile.fullName}
- Giới tính: ${profile.gender}
- Tuổi thực: ${profile.age} tuổi
- Chiều cao: ${profile.height}m
- Mục tiêu cá nhân: "${profile.healthGoal}"
- Mục tiêu chỉ số: ${JSON.stringify(profile.targetMetrics || {})}

LẦN CÂN ĐO HIỆN TẠI (${latest.date}):
1. Cân nặng: ${latest.weight} kg
2. Mỡ dưới da: ${latest.subcutaneousFat} %
3. Canxi xương: ${latest.boneCalcium}
4. Lượng nước cơ thể: ${latest.bodyWater} %
5. Trọng lượng cơ bắp: ${latest.muscleMass} kg
6. Phân loại thể hình: "${latest.bodyType}"
7. Năng lượng nghỉ BMR: ${latest.bmr} Kcal
8. Tuổi sinh học: ${latest.biologicalAge} tuổi (Tuổi thực: ${profile.age} tuổi)
9. Mỡ nội tạng: Cấp ${latest.visceralFat}
10. Vòng eo: ${latest.waist} cm

${
  previous
    ? `LẦN CÂN ĐO LIỀN TRƯỚC (${previous.date}):
- Cân nặng: ${previous.weight} kg, Cơ bắp: ${previous.muscleMass} kg, Mỡ dưới da: ${previous.subcutaneousFat} %, Mỡ nội tạng: Cấp ${previous.visceralFat}, Tuổi sinh học: ${previous.biologicalAge} tuổi, Vòng eo: ${previous.waist} cm.`
    : 'Đây là lần cân đo đầu tiên của học viên.'
}

YÊU CẦU: Áp dụng 'System Template' chuyên biệt cho phân tích sức khỏe, trả về đầy đủ 3 phần: 'Chỉ số cảnh báo', 'Đánh giá chuyên sâu' và 'Khuyến nghị hành động cụ thể'.
`.trim();
}
