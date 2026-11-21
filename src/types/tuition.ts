/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export const DISCOUNT_TIERS = [0, 25, 35, 42, 50] as const;
export type DiscountTier = (typeof DISCOUNT_TIERS)[number];

export interface RevenueEntity {
  id: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
  createdAt?: string;
}

export interface HerbalifeProduct {
  id: string;
  name: string;
  unitLabel: string; // VD: 'hộp', 'hũ', 'chai'
  portionUnitLabel: string; // VD: 'khẩu phần', 'hũ'
  portionsPerUnit: number; // VD: 22 khẩu phần / 1 hộp F1; 1 hũ / 1 hũ Trà
  prices: Record<string, number>; // Keys: '0', '25', '35', '42', '50' (VNĐ bao gồm VAT)
  isActive: boolean;
  sortOrder: number;
  createdAt?: string;
}

export type BomBuyerRole = 'trainer' | 'referrer';

export interface PackageBomItem {
  productId: string;
  quantity: number; // Số lượng theo portionUnitLabel (VD: 30 khẩu phần F1, 1 hũ Trà)
  buyerRole: BomBuyerRole;
}

export interface PackageSplitConfig {
  trainer: number; // % lợi nhuận cho HLV dạy
  referrer: number; // % lợi nhuận cho Người giới thiệu
  [key: string]: number;
}

export interface TuitionPackage {
  id: string;
  name: string;
  monthlyPrice: number;
  defaultDurationMonths: number;
  defaultSplits: PackageSplitConfig;
  bomItems: PackageBomItem[];
  isActive: boolean;
  sortOrder: number;
  createdAt?: string;
}

export type AllocationBasis = 'margin' | 'total' | 'paid';

export type TuitionStatus = 'completed' | 'partial' | 'unpaid';

export interface ContractAllocations {
  trainer: number; // Lợi nhuận (VNĐ) chia cho HLV dạy
  referrer: number; // Lợi nhuận (VNĐ) chia cho Người giới thiệu
  [key: string]: number;
}

export interface TuitionContract {
  id: string;
  studentCode: string;
  studentId?: string | null;
  studentName: string;
  phone: string;
  referrerName: string;
  trainerId?: string | null;
  trainerName: string;
  packageId?: string | null;
  packageName: string;
  startDate: string; // YYYY-MM-DD
  unitPrice: number;
  durationMonths: number;
  totalAmount: number;
  discountPercent: number; // Mức chiết khấu HLV dạy (0, 25, 35, 42, 50)
  discountedPrice: number; // Tổng vốn SP (= trainerProductCost + referrerProductCost)
  trainerDiscountTier: number; // Mức chiết khấu HLV dạy (0, 25, 35, 42, 50)
  referrerDiscountTier: number; // Mức chiết khấu Người giới thiệu (0, 25, 35, 42, 50)
  trainerProductCost: number; // Tiền mua sản phẩm HLV dạy bỏ ra (VNĐ)
  referrerProductCost: number; // Tiền mua sản phẩm Người giới thiệu bỏ ra (VNĐ)
  paidAmount: number;
  allocations: ContractAllocations;
  isManualAllocation: boolean;
  allocationBasis: AllocationBasis;
  notes: string;
  createdAt?: string;
  updatedAt?: string;
}

export type OperatingCostCategory =
  | 'Mặt bằng'
  | 'Điện nước'
  | 'Dinh dưỡng & Hàng hóa'
  | 'Thiết bị'
  | 'Marketing'
  | 'Hoa hồng & Lương'
  | 'Chi phí khác';

export const OPERATING_COST_CATEGORIES: OperatingCostCategory[] = [
  'Mặt bằng',
  'Điện nước',
  'Dinh dưỡng & Hàng hóa',
  'Thiết bị',
  'Marketing',
  'Hoa hồng & Lương',
  'Chi phí khác',
];

export interface OperatingCost {
  id: string;
  costDate: string; // YYYY-MM-DD
  category: string;
  title: string;
  amount: number;
  notes: string;
  createdBy?: string;
  createdAt?: string;
}

export interface TuitionBootstrapPayload {
  entities: RevenueEntity[];
  products: HerbalifeProduct[];
  packages: TuitionPackage[];
  contracts: TuitionContract[];
  operatingCosts: OperatingCost[];
}
