/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  AllocationBasis,
  ContractAllocations,
  DISCOUNT_TIERS,
  DiscountTier,
  HerbalifeProduct,
  PackageBomItem,
  PackageSplitConfig,
  TuitionContract,
  TuitionPackage,
  TuitionStatus,
} from '../types/tuition';

export function formatVnd(amount: number): string {
  const rounded = Math.round(Number.isFinite(amount) ? amount : 0);
  const formatted = new Intl.NumberFormat('vi-VN').format(rounded);
  return `${formatted} ₫`;
}

export function formatPercent(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  return `${safe.toFixed(1).replace('.', ',')}%`;
}

export function normalizeDiscountTier(raw: unknown, fallback: DiscountTier = 50): DiscountTier {
  const n = Number(raw);
  if (n === 37) return 35; // Migrate legacy 37% input to official 35% tier
  if ((DISCOUNT_TIERS as readonly number[]).includes(n)) {
    return n as DiscountTier;
  }
  return fallback;
}

export function getContractTotal(unitPrice: number, durationMonths: number): number {
  const price = Math.max(0, Number(unitPrice) || 0);
  const duration = Math.max(0, Number(durationMonths) || 0);
  return Math.round(price * duration);
}

export function getContractDebt(totalAmount: number, paidAmount: number): number {
  return Math.max(0, Math.round((Number(totalAmount) || 0) - (Number(paidAmount) || 0)));
}

export function getContractStatus(totalAmount: number, paidAmount: number): TuitionStatus {
  const total = Math.max(0, Math.round(Number(totalAmount) || 0));
  const paid = Math.max(0, Math.round(Number(paidAmount) || 0));
  if (total > 0 && paid >= total) return 'completed';
  if (paid > 0 && paid < total) return 'partial';
  return 'unpaid';
}

export function getContractStatusLabel(status: TuitionStatus): string {
  switch (status) {
    case 'completed':
      return 'Đã hoàn thành';
    case 'partial':
      return 'Còn nợ';
    case 'unpaid':
      return 'Chưa thanh toán';
  }
}

export function hasDistinctReferrer(trainerName: string, referrerName: string): boolean {
  const ref = String(referrerName || '').trim();
  if (!ref) return false;
  const tr = String(trainerName || '').trim();
  if (tr && ref.toLowerCase() === tr.toLowerCase()) return false;
  return true;
}

export function getProductUnitPriceAtTier(product: HerbalifeProduct, tier: number): number {
  const norm = normalizeDiscountTier(tier, 50);
  const price = Number(product.prices?.[String(norm)]);
  if (Number.isFinite(price) && price >= 0) return Math.round(price);
  const fallback = Number(product.prices?.['0']);
  return Number.isFinite(fallback) ? Math.round(fallback) : 0;
}

export function computeProductItemCost(
  product: HerbalifeProduct,
  quantity: number,
  tier: number
): number {
  const unitPrice = getProductUnitPriceAtTier(product, tier);
  const portionsPerUnit = Math.max(0.01, Number(product.portionsPerUnit) || 1);
  const safeQty = Math.max(0, Number(quantity) || 0);
  return Math.round((safeQty / portionsPerUnit) * unitPrice);
}

export interface BomCostLineItem {
  productId: string;
  productName: string;
  quantity: number;
  portionUnitLabel: string;
  unitPrice: number;
  tier: DiscountTier;
  cost: number;
  buyerRole: 'trainer' | 'referrer';
}

export interface PackageBomCostResult {
  trainerProductCost: number;
  referrerProductCost: number;
  totalProductCost: number;
  trainerItems: BomCostLineItem[];
  referrerItems: BomCostLineItem[];
}

/**
 * Tính chính xác tiền mua sản phẩm Herbalife theo định mức gói (BOM) và mức chiết khấu của từng bên:
 * - Nếu có Người giới thiệu (khác HLV dạy): mỗi bên mua các sản phẩm gán buyerRole của mình theo mức CK riêng.
 * - Nếu KHÔNG có Người giới thiệu (hoặc tự giới thiệu): toàn bộ sản phẩm của gói do HLV dạy mua theo mức CK của HLV dạy.
 */
export function computePackageProductCosts(params: {
  bomItems?: PackageBomItem[] | null;
  products: HerbalifeProduct[];
  trainerTier: number;
  referrerTier: number;
  hasReferrer: boolean;
  durationMonths: number;
}): PackageBomCostResult {
  const { bomItems, products, trainerTier, referrerTier, hasReferrer, durationMonths } = params;
  const safeDuration = Math.max(0.5, Number(durationMonths) || 1);
  const normTrainerTier = normalizeDiscountTier(trainerTier, 50);
  const normReferrerTier = normalizeDiscountTier(referrerTier, 50);

  const productMap = new Map<string, HerbalifeProduct>();
  for (const p of products) {
    productMap.set(p.id, p);
  }

  const trainerItems: BomCostLineItem[] = [];
  const referrerItems: BomCostLineItem[] = [];
  let trainerProductCost = 0;
  let referrerProductCost = 0;

  for (const item of bomItems || []) {
    const product = productMap.get(item.productId);
    if (!product) continue;

    const scaledQty = Math.round(Math.max(0, Number(item.quantity) || 0) * safeDuration * 100) / 100;
    if (scaledQty <= 0) continue;

    const effectiveBuyer: 'trainer' | 'referrer' =
      hasReferrer && item.buyerRole === 'referrer' ? 'referrer' : 'trainer';
    const effectiveTier = effectiveBuyer === 'referrer' ? normReferrerTier : normTrainerTier;
    const unitPrice = getProductUnitPriceAtTier(product, effectiveTier);
    const cost = computeProductItemCost(product, scaledQty, effectiveTier);

    const line: BomCostLineItem = {
      productId: product.id,
      productName: product.name,
      quantity: scaledQty,
      portionUnitLabel: product.portionUnitLabel || product.unitLabel || 'đơn vị',
      unitPrice,
      tier: effectiveTier,
      cost,
      buyerRole: effectiveBuyer,
    };

    if (effectiveBuyer === 'referrer') {
      referrerItems.push(line);
      referrerProductCost += cost;
    } else {
      trainerItems.push(line);
      trainerProductCost += cost;
    }
  }

  return {
    trainerProductCost: Math.round(trainerProductCost),
    referrerProductCost: Math.round(referrerProductCost),
    totalProductCost: Math.round(trainerProductCost + referrerProductCost),
    trainerItems,
    referrerItems,
  };
}

/**
 * Tự động xác định số khẩu phần phiếu bữa ăn dựa trên định mức sản phẩm (BOM) của gói luyện tập.
 * - Gói chỉ tập luyện (không BOM khẩu phần) -> 0 khẩu phần
 * - Gói 1tr5 / Gói 2tr5 (30 khẩu phần F1) -> 30 khẩu phần
 * - Gói 3tr7 / Gói 5tr5 (30 + 30 khẩu phần F1) -> 60 khẩu phần
 */
export function getPackageMealPortions(
  pkg: TuitionPackage | null | undefined,
  products: HerbalifeProduct[]
): number {
  if (!pkg) return 0;
  const productMap = new Map<string, HerbalifeProduct>();
  for (const p of products) {
    productMap.set(p.id, p);
  }

  let monthlyPortions = 0;
  for (const item of pkg.bomItems || []) {
    const qty = Number(item.quantity) || 0;
    if (qty <= 0) continue;
    const prod = productMap.get(item.productId);
    const portionLabel = (prod?.portionUnitLabel || '').toLowerCase();
    const prodName = (prod?.name || '').toLowerCase();
    const isMealPortionProduct =
      portionLabel.includes('khẩu phần') ||
      item.productId === 'prod-f1' ||
      prodName.includes('công thức 1') ||
      /\bf1\b/i.test(prodName) ||
      (prod ? prod.portionsPerUnit > 1 : false);

    if (isMealPortionProduct) {
      monthlyPortions += qty;
    }
  }

  const duration = Math.max(0.5, Number(pkg.defaultDurationMonths) || 1);
  return Math.min(360, Math.max(0, Math.round(monthlyPortions * duration)));
}

export function getContractProductCosts(contract: TuitionContract): {
  trainerProductCost: number;
  referrerProductCost: number;
  totalProductCost: number;
} {
  const tCost = Math.max(0, Math.round(Number(contract.trainerProductCost) || 0));
  const rCost = Math.max(0, Math.round(Number(contract.referrerProductCost) || 0));

  if (tCost > 0 || rCost > 0) {
    return {
      trainerProductCost: tCost,
      referrerProductCost: rCost,
      totalProductCost: tCost + rCost,
    };
  }

  // Graceful fallback for legacy contracts before dual-product-cost fields
  const legacyDiscPrice = Math.max(0, Math.round(Number(contract.discountedPrice) || 0));
  const total = Math.max(0, Math.round(Number(contract.totalAmount) || 0));
  if (legacyDiscPrice > 0 && legacyDiscPrice < total) {
    return {
      trainerProductCost: legacyDiscPrice,
      referrerProductCost: 0,
      totalProductCost: legacyDiscPrice,
    };
  }

  return {
    trainerProductCost: 0,
    referrerProductCost: 0,
    totalProductCost: 0,
  };
}

/**
 * Cơ sở tính lợi nhuận chia giữa HLV dạy và Người giới thiệu:
 * - 'margin' (Mặc định): Lợi nhuận sau khi trừ tiền mua sản phẩm = Tổng học phí - (Vốn SP HLV + Vốn SP NGT)
 * - 'total': Toàn bộ Tổng học phí
 * - 'paid': Số tiền Đã thanh toán
 */
export function getAllocationBasisAmount(
  totalAmount: number,
  paidAmount: number,
  totalProductCost: number,
  basis: AllocationBasis
): number {
  const total = Math.max(0, Math.round(Number(totalAmount) || 0));
  const paid = Math.max(0, Math.round(Number(paidAmount) || 0));
  const prodCost = Math.max(0, Math.round(Number(totalProductCost) || 0));

  if (basis === 'paid') return paid;
  if (basis === 'total') return total;
  return Math.max(0, total - prodCost);
}

export function getPackageSplitPercentages(splits?: Partial<PackageSplitConfig> | null): {
  trainer: number;
  referrer: number;
} {
  const trainer = Number(splits?.trainer);
  const referrer = Number(splits?.referrer);
  return {
    trainer: Number.isFinite(trainer) ? Math.max(0, trainer) : 50,
    referrer: Number.isFinite(referrer) ? Math.max(0, referrer) : 50,
  };
}

export function computeAutoAllocations(
  basisAmount: number,
  defaultSplits: Partial<PackageSplitConfig> | undefined | null,
  hasReferrer: boolean
): ContractAllocations {
  const safeBasis = Math.max(0, Math.round(Number(basisAmount) || 0));
  const { trainer: trainerPct, referrer: referrerPct } = getPackageSplitPercentages(defaultSplits);

  if (!hasReferrer || referrerPct <= 0) {
    const combinedPct = Math.min(100, trainerPct + (hasReferrer ? 0 : referrerPct));
    return {
      trainer: Math.round((safeBasis * combinedPct) / 100),
      referrer: 0,
    };
  }

  const trainerAmt = Math.round((safeBasis * trainerPct) / 100);
  const referrerAmt =
    Math.round(trainerPct + referrerPct) === 100
      ? Math.max(0, safeBasis - trainerAmt)
      : Math.round((safeBasis * referrerPct) / 100);

  return {
    trainer: trainerAmt,
    referrer: referrerAmt,
  };
}

export function getTrainerAllocation(allocations?: Partial<ContractAllocations> | null): number {
  const val = Number(allocations?.trainer);
  return Number.isFinite(val) ? Math.max(0, Math.round(val)) : 0;
}

export function getReferrerAllocation(allocations?: Partial<ContractAllocations> | null): number {
  const val = Number(allocations?.referrer);
  return Number.isFinite(val) ? Math.max(0, Math.round(val)) : 0;
}

export function generateNextStudentCode(contracts: TuitionContract[]): string {
  let maxNum = 0;
  for (const c of contracts) {
    const match = String(c.studentCode || '').match(/(\d+)$/);
    if (match) {
      const n = parseInt(match[1], 10);
      if (n > maxNum) maxNum = n;
    }
  }
  const next = maxNum + 1;
  return `HV-${String(next).padStart(3, '0')}`;
}

export interface PackageSummaryRow {
  packageId: string;
  packageName: string;
  studentCount: number;
  totalRevenue: number;
  totalProductCost: number;
  totalNetProfit: number;
  sharePercent: number;
}

export function computePackageSummary(
  contracts: TuitionContract[],
  packages: TuitionPackage[]
): PackageSummaryRow[] {
  const activePackages = [...packages]
    .filter((p) => p.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const map = new Map<
    string,
    {
      packageId: string;
      packageName: string;
      count: number;
      revenue: number;
      productCost: number;
    }
  >();

  for (const pkg of activePackages) {
    map.set(pkg.id, {
      packageId: pkg.id,
      packageName: pkg.name,
      count: 0,
      revenue: 0,
      productCost: 0,
    });
  }

  for (const c of contracts) {
    const key = c.packageId && map.has(c.packageId) ? c.packageId : `name:${c.packageName || 'Khác'}`;
    const rev = Math.round(c.totalAmount || 0);
    const { totalProductCost } = getContractProductCosts(c);
    const existing = map.get(key);
    if (existing) {
      existing.count += 1;
      existing.revenue += rev;
      existing.productCost += totalProductCost;
    } else {
      map.set(key, {
        packageId: key,
        packageName: c.packageName || 'Gói khác',
        count: 1,
        revenue: rev,
        productCost: totalProductCost,
      });
    }
  }

  const grandTotal = contracts.reduce((s, c) => s + Math.round(c.totalAmount || 0), 0);

  return Array.from(map.values()).map((row) => ({
    packageId: row.packageId,
    packageName: row.packageName,
    studentCount: row.count,
    totalRevenue: row.revenue,
    totalProductCost: row.productCost,
    totalNetProfit: Math.max(0, row.revenue - row.productCost),
    sharePercent: grandTotal > 0 ? (row.revenue / grandTotal) * 100 : 0,
  }));
}

export interface PersonSettlementSummaryRow {
  personName: string;
  productCostReimbursement: number; // Hoàn vốn sản phẩm đã ứng mua (HLV dạy + Người GT)
  profitFromTeaching: number; // Lãi chia từ vai trò HLV dạy
  profitFromReferral: number; // Lãi chia từ vai trò Người giới thiệu
  totalProfit: number; // Tổng lợi nhuận = Lãi từ dạy + Lãi từ GT
  totalSettlement: number; // Tổng quyết toán = Hoàn vốn SP + Tổng lợi nhuận
  sharePercent: number;
}

export function computePersonAllocationSummary(contracts: TuitionContract[]): {
  rows: PersonSettlementSummaryRow[];
  totalProductCost: number;
  totalTeachingProfit: number;
  totalReferralProfit: number;
  totalProfit: number;
  grandTotalSettlement: number;
} {
  const map = new Map<
    string,
    {
      personName: string;
      productCostReimbursement: number;
      profitFromTeaching: number;
      profitFromReferral: number;
    }
  >();

  const ensureEntry = (rawName: string, fallback: string) => {
    const displayName = rawName.trim() || fallback;
    const key = displayName.toLowerCase();
    let entry = map.get(key);
    if (!entry) {
      entry = {
        personName: displayName,
        productCostReimbursement: 0,
        profitFromTeaching: 0,
        profitFromReferral: 0,
      };
      map.set(key, entry);
    }
    return entry;
  };

  let totalProductCost = 0;
  let totalTeachingProfit = 0;
  let totalReferralProfit = 0;

  for (const c of contracts) {
    const trainerProfit = getTrainerAllocation(c.allocations);
    const referrerProfit = getReferrerAllocation(c.allocations);
    const { trainerProductCost, referrerProductCost } = getContractProductCosts(c);

    if (trainerProfit > 0 || trainerProductCost > 0 || c.trainerName?.trim()) {
      const entry = ensureEntry(c.trainerName || '', 'Chưa gắn HLV');
      entry.productCostReimbursement += trainerProductCost;
      entry.profitFromTeaching += trainerProfit;
      totalProductCost += trainerProductCost;
      totalTeachingProfit += trainerProfit;
    }

    if (referrerProfit > 0 || referrerProductCost > 0 || c.referrerName?.trim()) {
      const entry = ensureEntry(c.referrerName || '', 'Chưa gắn NGT');
      entry.productCostReimbursement += referrerProductCost;
      entry.profitFromReferral += referrerProfit;
      totalProductCost += referrerProductCost;
      totalReferralProfit += referrerProfit;
    }
  }

  const totalProfit = totalTeachingProfit + totalReferralProfit;
  const grandTotalSettlement = totalProductCost + totalProfit;

  const rows: PersonSettlementSummaryRow[] = Array.from(map.values())
    .map((e) => {
      const rowProfit = e.profitFromTeaching + e.profitFromReferral;
      const totalSettlement = e.productCostReimbursement + rowProfit;
      return {
        personName: e.personName,
        productCostReimbursement: e.productCostReimbursement,
        profitFromTeaching: e.profitFromTeaching,
        profitFromReferral: e.profitFromReferral,
        totalProfit: rowProfit,
        totalSettlement,
        sharePercent: grandTotalSettlement > 0 ? (totalSettlement / grandTotalSettlement) * 100 : 0,
      };
    })
    .sort((a, b) => b.totalSettlement - a.totalSettlement);

  return {
    rows,
    totalProductCost,
    totalTeachingProfit,
    totalReferralProfit,
    totalProfit,
    grandTotalSettlement,
  };
}

function escapeCsvCell(value: string | number): string {
  const str = String(value ?? '');
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function exportTuitionCsv(params: {
  contracts: TuitionContract[];
  packages: TuitionPackage[];
  isAdmin: boolean;
  totalOperatingCosts: number;
  periodLabel: string;
}): void {
  const { contracts, packages, isAdmin, totalOperatingCosts, periodLabel } = params;

  const totalRevenue = contracts.reduce((s, c) => s + Math.round(c.totalAmount || 0), 0);
  const totalPaid = contracts.reduce((s, c) => s + Math.round(c.paidAmount || 0), 0);
  const totalDebt = contracts.reduce((s, c) => s + getContractDebt(c.totalAmount, c.paidAmount), 0);
  const totalProductCost = contracts.reduce(
    (s, c) => s + getContractProductCosts(c).totalProductCost,
    0
  );
  const grossProfitAfterProducts = totalRevenue - totalProductCost;
  const collectionRate = totalRevenue > 0 ? (totalPaid / totalRevenue) * 100 : 0;
  const netProfit = totalPaid - totalOperatingCosts;

  const pkgRows = computePackageSummary(contracts, packages);
  const personSummary = computePersonAllocationSummary(contracts);

  const lines: string[][] = [];
  lines.push(['BẢNG THEO DÕI HỌC PHÍ, CHIẾT KHẤU HERBALIFE & QUYẾT TOÁN HLV']);
  lines.push([`Kỳ báo cáo: ${periodLabel}`]);
  lines.push([]);

  if (isAdmin) {
    lines.push([
      'TỔNG DOANH THU',
      'ĐÃ THU HỌC PHÍ',
      'CÒN NỢ',
      'TỔNG VỐN SẢN PHẨM',
      'LỢI NHUẬN SAU SP',
      'TỶ LỆ THU',
      'CHI PHÍ VẬN HÀNH',
      'LỢI NHUẬN THUẦN (ĐÃ THU - CP VH)',
    ]);
    lines.push([
      formatVnd(totalRevenue),
      formatVnd(totalPaid),
      formatVnd(totalDebt),
      formatVnd(totalProductCost),
      formatVnd(grossProfitAfterProducts),
      formatPercent(collectionRate),
      formatVnd(totalOperatingCosts),
      formatVnd(netProfit),
    ]);
  } else {
    lines.push([
      'TỔNG DOANH THU',
      'ĐÃ THU HỌC PHÍ',
      'CÒN NỢ',
      'TỔNG VỐN SẢN PHẨM',
      'LỢI NHUẬN SAU SP',
      'TỶ LỆ THU',
    ]);
    lines.push([
      formatVnd(totalRevenue),
      formatVnd(totalPaid),
      formatVnd(totalDebt),
      formatVnd(totalProductCost),
      formatVnd(grossProfitAfterProducts),
      formatPercent(collectionRate),
    ]);
  }

  lines.push([]);
  lines.push(['THỐNG KÊ DOANH THU THEO GÓI TẬP']);
  lines.push([
    'STT',
    'Gói tập',
    'Số lượng HV',
    'Tổng doanh thu (VNĐ)',
    'Vốn sản phẩm (VNĐ)',
    'Lợi nhuận sau SP (VNĐ)',
    'Tỷ trọng doanh thu',
  ]);
  pkgRows.forEach((row, idx) => {
    lines.push([
      String(idx + 1),
      row.packageName,
      String(row.studentCount),
      formatVnd(row.totalRevenue),
      formatVnd(row.totalProductCost),
      formatVnd(row.totalNetProfit),
      formatPercent(row.sharePercent),
    ]);
  });
  lines.push([
    'Tổng cộng',
    '',
    String(contracts.length),
    formatVnd(totalRevenue),
    formatVnd(totalProductCost),
    formatVnd(grossProfitAfterProducts),
    totalRevenue > 0 ? '100,0%' : '0,0%',
  ]);

  lines.push([]);
  lines.push(['TỔNG HỢP QUYẾT TOÁN (HOÀN VỐN SẢN PHẨM + LỢI NHUẬN ĐƯỢC CHIA)']);
  lines.push([
    'HLV / Cá nhân',
    'Hoàn vốn SP (VNĐ)',
    'Lãi từ Dạy (VNĐ)',
    'Lãi từ Giới thiệu (VNĐ)',
    'Tổng Lợi Nhuận (VNĐ)',
    'Tổng Quyết Toán (VNĐ)',
    'Tỷ trọng',
  ]);
  personSummary.rows.forEach((row) => {
    lines.push([
      row.personName,
      formatVnd(row.productCostReimbursement),
      formatVnd(row.profitFromTeaching),
      formatVnd(row.profitFromReferral),
      formatVnd(row.totalProfit),
      formatVnd(row.totalSettlement),
      formatPercent(row.sharePercent),
    ]);
  });
  lines.push([
    'Tổng cộng',
    formatVnd(personSummary.totalProductCost),
    formatVnd(personSummary.totalTeachingProfit),
    formatVnd(personSummary.totalReferralProfit),
    formatVnd(personSummary.totalProfit),
    formatVnd(personSummary.grandTotalSettlement),
    personSummary.grandTotalSettlement > 0 ? '100,0%' : '0,0%',
  ]);

  lines.push([]);
  lines.push(['DANH SÁCH CHI TIẾT HỌC VIÊN & CÔNG NỢ']);
  lines.push([
    'Mã học viên',
    'Họ và tên',
    'HLV dạy',
    'CK HLV dạy (%)',
    'Người giới thiệu',
    'CK Người GT (%)',
    'Số điện thoại',
    'Gói tập',
    'Ngày bắt đầu',
    'Đơn giá / Tháng (VNĐ)',
    'Thời hạn (Tháng)',
    'Tổng học phí (VNĐ)',
    'Vốn SP HLV dạy (VNĐ)',
    'Vốn SP Người GT (VNĐ)',
    'Tổng vốn SP (VNĐ)',
    'Lợi nhuận sau SP (VNĐ)',
    'Đã thanh toán (VNĐ)',
    'Còn nợ (VNĐ)',
    'Trạng thái',
    'Lãi HLV dạy (VNĐ)',
    'Lãi Người GT (VNĐ)',
    'Tổng QT HLV dạy (VNĐ)',
    'Tổng QT Người GT (VNĐ)',
    'Ghi chú',
  ]);

  for (const c of contracts) {
    const debt = getContractDebt(c.totalAmount, c.paidAmount);
    const statusLabel = getContractStatusLabel(getContractStatus(c.totalAmount, c.paidAmount));
    const { trainerProductCost, referrerProductCost, totalProductCost: rowProdCost } =
      getContractProductCosts(c);
    const trainerProfit = getTrainerAllocation(c.allocations);
    const referrerProfit = getReferrerAllocation(c.allocations);
    const rowProfit = Math.round(c.totalAmount || 0) - rowProdCost;

    lines.push([
      c.studentCode,
      c.studentName,
      c.trainerName,
      `${normalizeDiscountTier(c.trainerDiscountTier ?? c.discountPercent, 50)}%`,
      c.referrerName,
      c.referrerName ? `${normalizeDiscountTier(c.referrerDiscountTier, 50)}%` : '',
      c.phone,
      c.packageName,
      c.startDate,
      formatVnd(c.unitPrice),
      String(c.durationMonths),
      formatVnd(c.totalAmount),
      formatVnd(trainerProductCost),
      formatVnd(referrerProductCost),
      formatVnd(rowProdCost),
      formatVnd(rowProfit),
      formatVnd(c.paidAmount),
      formatVnd(debt),
      statusLabel,
      formatVnd(trainerProfit),
      formatVnd(referrerProfit),
      formatVnd(trainerProductCost + trainerProfit),
      formatVnd(referrerProductCost + referrerProfit),
      c.notes || '',
    ]);
  }

  const csvContent =
    '\uFEFF' + lines.map((row) => row.map((cell) => escapeCsvCell(cell)).join(',')).join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const safePeriod = periodLabel.replace(/[^a-zA-Z0-9-_]+/g, '_');
  link.href = url;
  link.download = `Bang_Theo_Doi_Hoc_Phi_${safePeriod}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
