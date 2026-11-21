/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import {
  BomBuyerRole,
  DISCOUNT_TIERS,
  HerbalifeProduct,
  PackageBomItem,
  PackageSplitConfig,
  TuitionPackage,
} from '../../types/tuition';
import {
  computePackageProductCosts,
  formatVnd,
  getPackageSplitPercentages,
} from '../../utils/tuitionCalculations';
import { Plus, Edit2, Trash2, Check, X, AlertTriangle, Layers, Package } from 'lucide-react';

interface TuitionSettingsPanelProps {
  products: HerbalifeProduct[];
  packages: TuitionPackage[];
  onCreatePackage: (payload: {
    name: string;
    monthlyPrice: number;
    defaultDurationMonths: number;
    defaultSplits: PackageSplitConfig;
    bomItems: PackageBomItem[];
  }) => Promise<{ success: boolean; error?: string }>;
  onUpdatePackage: (
    id: string,
    payload: {
      name?: string;
      monthlyPrice?: number;
      defaultDurationMonths?: number;
      defaultSplits?: PackageSplitConfig;
      bomItems?: PackageBomItem[];
      isActive?: boolean;
    }
  ) => Promise<{ success: boolean; error?: string }>;
  onDeletePackage: (id: string) => Promise<{ success: boolean; error?: string }>;
  onCreateProduct: (payload: {
    name: string;
    unitLabel: string;
    portionUnitLabel: string;
    portionsPerUnit: number;
    prices: Record<string, number>;
  }) => Promise<{ success: boolean; error?: string }>;
  onUpdateProduct: (
    id: string,
    payload: {
      name?: string;
      unitLabel?: string;
      portionUnitLabel?: string;
      portionsPerUnit?: number;
      prices?: Record<string, number>;
      isActive?: boolean;
    }
  ) => Promise<{ success: boolean; error?: string }>;
  onDeleteProduct: (id: string) => Promise<{ success: boolean; error?: string }>;
}

const EMPTY_PRICES: Record<string, number> = {
  '0': 0,
  '25': 0,
  '35': 0,
  '42': 0,
  '50': 0,
};

export const TuitionSettingsPanel: React.FC<TuitionSettingsPanelProps> = ({
  products,
  packages,
  onCreatePackage,
  onUpdatePackage,
  onDeletePackage,
  onCreateProduct,
  onUpdateProduct,
  onDeleteProduct,
}) => {
  const orderedPackages = useMemo(
    () => [...packages].sort((a, b) => a.sortOrder - b.sortOrder),
    [packages]
  );
  const orderedProducts = useMemo(
    () => [...products].sort((a, b) => a.sortOrder - b.sortOrder),
    [products]
  );
  const productMap = useMemo(() => {
    const m = new Map<string, HerbalifeProduct>();
    for (const p of products) m.set(p.id, p);
    return m;
  }, [products]);

  // Package form state
  const [editingPkgId, setEditingPkgId] = useState<string | null>(null);
  const [pkgName, setPkgName] = useState('');
  const [pkgPrice, setPkgPrice] = useState<number>(1500000);
  const [pkgDuration, setPkgDuration] = useState<number>(1);
  const [trainerPct, setTrainerPct] = useState<number>(50);
  const [referrerPct, setReferrerPct] = useState<number>(50);
  const [bomItems, setBomItems] = useState<PackageBomItem[]>([]);
  const [confirmDeletePkgId, setConfirmDeletePkgId] = useState<string | null>(null);

  // Product form state
  const [showProductForm, setShowProductForm] = useState(false);
  const [editingProdId, setEditingProdId] = useState<string | null>(null);
  const [prodName, setProdName] = useState('');
  const [unitLabel, setUnitLabel] = useState('hộp');
  const [portionUnitLabel, setPortionUnitLabel] = useState('hộp');
  const [portionsPerUnit, setPortionsPerUnit] = useState<number>(1);
  const [prodPrices, setProdPrices] = useState<Record<string, number>>({ ...EMPTY_PRICES });
  const [confirmDeleteProdId, setConfirmDeleteProdId] = useState<string | null>(null);

  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );
  const [isBusy, setIsBusy] = useState(false);

  const totalPct = Math.round((trainerPct + referrerPct) * 10) / 10;

  // Package handlers
  const resetPackageForm = () => {
    setEditingPkgId(null);
    setPkgName('');
    setPkgPrice(1500000);
    setPkgDuration(1);
    setTrainerPct(50);
    setReferrerPct(50);
    setBomItems([]);
  };

  const startEditPackage = (pkg: TuitionPackage) => {
    setStatusMsg(null);
    const splits = getPackageSplitPercentages(pkg.defaultSplits);
    setEditingPkgId(pkg.id);
    setPkgName(pkg.name);
    setPkgPrice(pkg.monthlyPrice);
    setPkgDuration(pkg.defaultDurationMonths || 1);
    setTrainerPct(splits.trainer);
    setReferrerPct(splits.referrer);
    setBomItems((pkg.bomItems || []).map((b) => ({ ...b })));
  };

  const handleAddBomRow = () => {
    const firstProd = orderedProducts[0];
    if (!firstProd) return;
    setBomItems((prev) => [
      ...prev,
      {
        productId: firstProd.id,
        quantity: firstProd.portionsPerUnit > 1 ? 30 : 1,
        buyerRole: 'trainer',
      },
    ]);
  };

  const handleUpdateBomRow = (
    idx: number,
    patch: Partial<{ productId: string; quantity: number; buyerRole: BomBuyerRole }>
  ) => {
    setBomItems((prev) => prev.map((row, i) => (i === idx ? { ...row, ...patch } : row)));
  };

  const handleRemoveBomRow = (idx: number) => {
    setBomItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSavePackage = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMsg(null);
    if (!pkgName.trim()) {
      setStatusMsg({ type: 'error', text: 'Vui lòng nhập tên gói tập.' });
      return;
    }

    setIsBusy(true);
    const payload = {
      name: pkgName.trim(),
      monthlyPrice: Math.max(0, Math.round(pkgPrice)),
      defaultDurationMonths: Math.max(0.5, Number(pkgDuration) || 1),
      defaultSplits: {
        trainer: Math.max(0, Number(trainerPct) || 0),
        referrer: Math.max(0, Number(referrerPct) || 0),
      },
      bomItems: bomItems.filter((b) => b.productId && b.quantity > 0),
    };

    const res = editingPkgId
      ? await onUpdatePackage(editingPkgId, payload)
      : await onCreatePackage(payload);
    setIsBusy(false);

    if (res.success) {
      setStatusMsg({
        type: 'success',
        text: editingPkgId
          ? 'Đã cập nhật cấu hình gói tập và định mức sản phẩm.'
          : 'Đã thêm gói tập mới thành công.',
      });
      resetPackageForm();
    } else {
      setStatusMsg({ type: 'error', text: res.error || 'Không thể lưu gói tập.' });
    }
  };

  // Product handlers
  const resetProductForm = () => {
    setShowProductForm(false);
    setEditingProdId(null);
    setProdName('');
    setUnitLabel('hộp');
    setPortionUnitLabel('hộp');
    setPortionsPerUnit(1);
    setProdPrices({ ...EMPTY_PRICES });
  };

  const startEditProduct = (prod: HerbalifeProduct) => {
    setStatusMsg(null);
    setShowProductForm(true);
    setEditingProdId(prod.id);
    setProdName(prod.name);
    setUnitLabel(prod.unitLabel || 'hộp');
    setPortionUnitLabel(prod.portionUnitLabel || prod.unitLabel || 'hộp');
    setPortionsPerUnit(prod.portionsPerUnit || 1);
    setProdPrices({
      '0': Number(prod.prices?.['0']) || 0,
      '25': Number(prod.prices?.['25']) || 0,
      '35': Number(prod.prices?.['35']) || 0,
      '42': Number(prod.prices?.['42']) || 0,
      '50': Number(prod.prices?.['50']) || 0,
    });
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMsg(null);
    if (!prodName.trim()) {
      setStatusMsg({ type: 'error', text: 'Vui lòng nhập tên sản phẩm Herbalife.' });
      return;
    }

    setIsBusy(true);
    const payload = {
      name: prodName.trim(),
      unitLabel: unitLabel.trim() || 'hộp',
      portionUnitLabel: portionUnitLabel.trim() || unitLabel.trim() || 'hộp',
      portionsPerUnit: Math.max(0.1, Number(portionsPerUnit) || 1),
      prices: {
        '0': Math.max(0, Math.round(Number(prodPrices['0']) || 0)),
        '25': Math.max(0, Math.round(Number(prodPrices['25']) || 0)),
        '35': Math.max(0, Math.round(Number(prodPrices['35']) || 0)),
        '42': Math.max(0, Math.round(Number(prodPrices['42']) || 0)),
        '50': Math.max(0, Math.round(Number(prodPrices['50']) || 0)),
      },
    };

    const res = editingProdId
      ? await onUpdateProduct(editingProdId, payload)
      : await onCreateProduct(payload);
    setIsBusy(false);

    if (res.success) {
      setStatusMsg({
        type: 'success',
        text: editingProdId
          ? `Đã cập nhật bảng giá sản phẩm "${payload.name}".`
          : `Đã thêm sản phẩm "${payload.name}" vào bảng giá.`,
      });
      resetProductForm();
    } else {
      setStatusMsg({ type: 'error', text: res.error || 'Không thể lưu sản phẩm.' });
    }
  };

  const formatBomSummary = (items: PackageBomItem[], role: BomBuyerRole): string => {
    const filtered = (items || []).filter((i) => i.buyerRole === role);
    if (filtered.length === 0) return '—';
    return filtered
      .map((i) => {
        const p = productMap.get(i.productId);
        if (!p) return `${i.quantity} SP`;
        const shortName = p.name.includes('Công Thức 1')
          ? 'F1'
          : p.name.includes('Trà Thảo Mộc')
          ? 'Trà'
          : p.name.includes('Rebuild Strength')
          ? 'Rebuild'
          : p.name;
        return `${i.quantity} ${p.portionUnitLabel} ${shortName}`;
      })
      .join(' + ');
  };

  return (
    <div className="space-y-5">
      {statusMsg && (
        <div
          className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
            statusMsg.type === 'error'
              ? 'bg-rose-50 border-rose-200 text-rose-800'
              : 'bg-emerald-50 border-emerald-200 text-emerald-800'
          }`}
        >
          {statusMsg.type === 'error' ? (
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
          ) : (
            <Check className="w-4 h-4 text-emerald-600 shrink-0" />
          )}
          <span>{statusMsg.text}</span>
        </div>
      )}

      {/* Section 1: Tuition Packages + BOM + Profit Splits */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Layers className="w-4 h-4 text-emerald-600" />
              <span>Danh Mục Gói Tập, Định Mức Sản Phẩm &amp; Tỷ Lệ Chia Lợi Nhuận</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Cấu hình đơn giá gói, sản phẩm đi kèm theo từng bên mua (HLV dạy / Người giới thiệu) và tỷ lệ chia lợi nhuận dư sau khi trừ tiền mua sản phẩm.
            </p>
          </div>
          {editingPkgId && (
            <button
              type="button"
              onClick={resetPackageForm}
              className="text-xs font-semibold text-slate-600 hover:text-slate-900 inline-flex items-center gap-1 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              <span>Hủy sửa gói</span>
            </button>
          )}
        </div>

        <form
          onSubmit={handleSavePackage}
          className="space-y-4 p-4 rounded-xl bg-slate-50 border border-slate-200"
        >
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
            <div className="sm:col-span-5">
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Tên gói tập <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={pkgName}
                onChange={(e) => setPkgName(e.target.value)}
                placeholder="VD: Gói 2tr5 (Cơ bản), Gói 3tr7..."
                required
                className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 focus:outline-none focus:border-emerald-600"
              />
            </div>

            <div className="sm:col-span-4">
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Đơn giá / Tháng (VNĐ)
              </label>
              <input
                type="number"
                min={0}
                step={50000}
                value={pkgPrice}
                onChange={(e) => setPkgPrice(Math.max(0, Number(e.target.value) || 0))}
                className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm font-mono tabular-nums text-right text-slate-900 focus:outline-none focus:border-emerald-600"
              />
            </div>

            <div className="sm:col-span-3">
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Thời hạn mặc định (Tháng)
              </label>
              <input
                type="number"
                min={0.5}
                step={0.5}
                value={pkgDuration}
                onChange={(e) => setPkgDuration(Math.max(0.5, Number(e.target.value) || 1))}
                className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm font-mono tabular-nums text-right text-slate-900 focus:outline-none focus:border-emerald-600"
              />
            </div>
          </div>

          {/* Profit Split Percentages */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
            <div className="bg-white border border-slate-200 rounded-lg p-3">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Lãi HLV dạy (%)
              </label>
              <input
                type="number"
                min={0}
                max={100}
                step={1}
                value={trainerPct}
                onChange={(e) => setTrainerPct(Math.max(0, Number(e.target.value) || 0))}
                className="w-full h-9 px-2.5 rounded border border-slate-300 text-sm font-mono tabular-nums text-right text-slate-900 focus:outline-none focus:border-emerald-600"
              />
            </div>

            <div className="bg-white border border-slate-200 rounded-lg p-3">
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Lãi Người giới thiệu (%)
              </label>
              <input
                type="number"
                min={0}
                max={100}
                step={1}
                value={referrerPct}
                onChange={(e) => setReferrerPct(Math.max(0, Number(e.target.value) || 0))}
                className="w-full h-9 px-2.5 rounded border border-slate-300 text-sm font-mono tabular-nums text-right text-slate-900 focus:outline-none focus:border-emerald-600"
              />
            </div>

            <div className="bg-white border border-slate-200 rounded-lg p-3">
              <div className="text-[11px] text-slate-500">Tổng tỷ lệ chia lợi nhuận</div>
              <div
                className={`text-base font-bold font-mono tabular-nums mt-1 ${
                  totalPct > 100 ? 'text-rose-700' : 'text-emerald-700'
                }`}
              >
                {totalPct}%
              </div>
            </div>
          </div>

          {/* Package BOM Editor */}
          <div className="space-y-2 pt-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-700">
                Định mức sản phẩm Herbalife trong gói (tính cho 1 tháng)
              </span>
              <button
                type="button"
                onClick={handleAddBomRow}
                disabled={orderedProducts.length === 0}
                className="h-8 px-2.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-700 inline-flex items-center gap-1 cursor-pointer disabled:opacity-40"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Thêm sản phẩm vào gói</span>
              </button>
            </div>

            {bomItems.length === 0 ? (
              <div className="p-3 rounded-lg border border-dashed border-slate-300 bg-white text-xs text-slate-500">
                Gói này không kèm sản phẩm (VD: Gói tập luyện 300.000 ₫). Bấm &quot;Thêm sản phẩm vào gói&quot; nếu có sản phẩm đi kèm.
              </div>
            ) : (
              <div className="space-y-2">
                {bomItems.map((row, idx) => {
                  const p = productMap.get(row.productId);
                  return (
                    <div
                      key={`${row.productId}-${idx}`}
                      className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center bg-white border border-slate-200 rounded-lg p-2.5"
                    >
                      <div className="sm:col-span-5">
                        <select
                          value={row.productId}
                          onChange={(e) => handleUpdateBomRow(idx, { productId: e.target.value })}
                          className="w-full h-9 px-2.5 rounded border border-slate-300 bg-white text-xs text-slate-900 focus:outline-none focus:border-emerald-600"
                        >
                          {orderedProducts.map((prod) => (
                            <option key={prod.id} value={prod.id}>
                              {prod.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="sm:col-span-3 flex items-center gap-1.5">
                        <input
                          type="number"
                          min={0.5}
                          step={0.5}
                          value={row.quantity}
                          onChange={(e) =>
                            handleUpdateBomRow(idx, {
                              quantity: Math.max(0.5, Number(e.target.value) || 0),
                            })
                          }
                          className="w-20 h-9 px-2 rounded border border-slate-300 text-xs font-mono tabular-nums text-right text-slate-900 focus:outline-none focus:border-emerald-600"
                        />
                        <span className="text-xs text-slate-500 truncate">
                          {p?.portionUnitLabel || 'đơn vị'}
                        </span>
                      </div>

                      <div className="sm:col-span-3">
                        <select
                          value={row.buyerRole}
                          onChange={(e) =>
                            handleUpdateBomRow(idx, {
                              buyerRole: e.target.value === 'referrer' ? 'referrer' : 'trainer',
                            })
                          }
                          className="w-full h-9 px-2.5 rounded border border-slate-300 bg-white text-xs font-semibold text-slate-800 focus:outline-none focus:border-emerald-600"
                        >
                          <option value="trainer">HLV dạy mua</option>
                          <option value="referrer">Người giới thiệu mua</option>
                        </select>
                      </div>

                      <div className="sm:col-span-1 text-right">
                        <button
                          type="button"
                          onClick={() => handleRemoveBomRow(idx)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded cursor-pointer"
                          title="Xóa dòng sản phẩm"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-2">
            {editingPkgId && (
              <button
                type="button"
                onClick={resetPackageForm}
                className="h-9 px-4 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer"
              >
                Hủy
              </button>
            )}
            <button
              type="submit"
              disabled={isBusy}
              className="h-9 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {editingPkgId ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
              <span>{editingPkgId ? 'Lưu Thay Đổi Gói Tập' : 'Thêm Gói Tập Mới'}</span>
            </button>
          </div>
        </form>

        {/* Package List Table */}
        <div className="overflow-x-auto border border-slate-200 rounded-lg">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-500">
                <th className="py-2.5 px-4 whitespace-nowrap">Tên gói tập</th>
                <th className="py-2.5 px-3 text-right whitespace-nowrap">Đơn giá / Tháng</th>
                <th className="py-2.5 px-3 whitespace-nowrap">SP HLV dạy mua</th>
                <th className="py-2.5 px-3 whitespace-nowrap">SP Người GT mua</th>
                <th className="py-2.5 px-3 text-right whitespace-nowrap">Vốn SP (mẫu CK 50%)</th>
                <th className="py-2.5 px-3 text-right whitespace-nowrap">Chia lãi (HLV / NGT)</th>
                <th className="py-2.5 px-3 whitespace-nowrap">Trạng thái</th>
                <th className="py-2.5 px-4 text-right whitespace-nowrap">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {orderedPackages.map((pkg) => {
                const splits = getPackageSplitPercentages(pkg.defaultSplits);
                const sampleCost = computePackageProductCosts({
                  bomItems: pkg.bomItems,
                  products,
                  trainerTier: 50,
                  referrerTier: 50,
                  hasReferrer: true,
                  durationMonths: 1,
                });
                return (
                  <tr key={pkg.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4 font-semibold text-slate-900 whitespace-nowrap">
                      {pkg.name}
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums font-semibold text-slate-800 whitespace-nowrap">
                      {formatVnd(pkg.monthlyPrice)}
                    </td>
                    <td className="py-3 px-3 text-slate-700 whitespace-nowrap">
                      {formatBomSummary(pkg.bomItems, 'trainer')}
                    </td>
                    <td className="py-3 px-3 text-slate-700 whitespace-nowrap">
                      {formatBomSummary(pkg.bomItems, 'referrer')}
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-700 whitespace-nowrap">
                      {sampleCost.totalProductCost > 0
                        ? formatVnd(sampleCost.totalProductCost)
                        : '0 ₫'}
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums font-semibold text-emerald-700 whitespace-nowrap">
                      {splits.trainer}% / {splits.referrer}%
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => onUpdatePackage(pkg.id, { isActive: !pkg.isActive })}
                        className={`text-xs font-semibold cursor-pointer ${
                          pkg.isActive ? 'text-emerald-700' : 'text-slate-400'
                        }`}
                      >
                        {pkg.isActive ? 'Đang mở' : 'Tạm ẩn'}
                      </button>
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => startEditPackage(pkg)}
                          className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded cursor-pointer"
                          title="Sửa gói tập"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        {confirmDeletePkgId === pkg.id ? (
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={async () => {
                                await onDeletePackage(pkg.id);
                                setConfirmDeletePkgId(null);
                              }}
                              className="px-2 py-1 bg-rose-600 text-white text-[11px] font-semibold rounded cursor-pointer"
                            >
                              Xóa
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeletePkgId(null)}
                              className="px-2 py-1 bg-slate-100 text-slate-600 text-[11px] rounded cursor-pointer"
                            >
                              Hủy
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeletePkgId(pkg.id)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded cursor-pointer"
                            title="Xóa gói tập"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Section 2: Official Herbalife Product Price List */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Package className="w-4 h-4 text-emerald-600" />
              <span>Bảng Giá Sản Phẩm Herbalife (Áp dụng 08/08/2026 — Đã gồm VAT)</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Hệ thống tự tra giá theo mức chiết khấu 0% / 25% / 35% / 42% / 50% của HLV dạy và Người giới thiệu. Với F1 (22 khẩu phần/hộp), 30 khẩu phần tự tính theo tỷ lệ 30/22 hộp.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              if (showProductForm) {
                resetProductForm();
              } else {
                setEditingProdId(null);
                setProdName('');
                setUnitLabel('hộp');
                setPortionUnitLabel('hộp');
                setPortionsPerUnit(1);
                setProdPrices({ ...EMPTY_PRICES });
                setShowProductForm(true);
              }
            }}
            className="h-9 px-3 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-800 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            {showProductForm ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
            <span>{showProductForm ? 'Đóng biểu mẫu' : 'Thêm Sản Phẩm'}</span>
          </button>
        </div>

        {showProductForm && (
          <form
            onSubmit={handleSaveProduct}
            className="space-y-3 p-4 rounded-xl bg-slate-50 border border-slate-200"
          >
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
              <div className="sm:col-span-5">
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Tên sản phẩm <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={prodName}
                  onChange={(e) => setProdName(e.target.value)}
                  placeholder="VD: Hỗn Hợp Dinh Dưỡng F1 (550g)"
                  required
                  className="w-full h-9 px-3 rounded-lg border border-slate-300 bg-white text-xs text-slate-900 focus:outline-none focus:border-emerald-600"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-600 mb-1">Đơn vị gốc</label>
                <input
                  type="text"
                  value={unitLabel}
                  onChange={(e) => setUnitLabel(e.target.value)}
                  placeholder="hộp / hũ"
                  className="w-full h-9 px-2.5 rounded-lg border border-slate-300 bg-white text-xs text-slate-900 focus:outline-none focus:border-emerald-600"
                />
              </div>

              <div className="sm:col-span-3">
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Đơn vị tính trong gói
                </label>
                <input
                  type="text"
                  value={portionUnitLabel}
                  onChange={(e) => setPortionUnitLabel(e.target.value)}
                  placeholder="khẩu phần / hũ"
                  className="w-full h-9 px-2.5 rounded-lg border border-slate-300 bg-white text-xs text-slate-900 focus:outline-none focus:border-emerald-600"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Quy đổi / 1 {unitLabel}
                </label>
                <input
                  type="number"
                  min={0.1}
                  step={0.5}
                  value={portionsPerUnit}
                  onChange={(e) => setPortionsPerUnit(Math.max(0.1, Number(e.target.value) || 1))}
                  className="w-full h-9 px-2.5 rounded-lg border border-slate-300 bg-white text-xs font-mono tabular-nums text-right text-slate-900 focus:outline-none focus:border-emerald-600"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
              {DISCOUNT_TIERS.map((tier) => (
                <div key={tier} className="bg-white border border-slate-200 rounded-lg p-2.5">
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1 font-mono">
                    {tier === 0 ? 'Giá lẻ (0%)' : `Chiết khấu ${tier}%`}
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={1000}
                    value={prodPrices[String(tier)] ?? 0}
                    onChange={(e) =>
                      setProdPrices((prev) => ({
                        ...prev,
                        [String(tier)]: Math.max(0, Math.round(Number(e.target.value) || 0)),
                      }))
                    }
                    className="w-full h-8 px-2 rounded border border-slate-300 text-xs font-mono tabular-nums text-right text-slate-900 focus:outline-none focus:border-emerald-600"
                  />
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={resetProductForm}
                className="h-9 px-4 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={isBusy}
                className="h-9 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Check className="w-4 h-4" />
                <span>{editingProdId ? 'Lưu Giá Sản Phẩm' : 'Thêm Vào Bảng Giá'}</span>
              </button>
            </div>
          </form>
        )}

        <div className="overflow-x-auto border border-slate-200 rounded-lg">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-500">
                <th className="py-2.5 px-4 whitespace-nowrap">Sản phẩm</th>
                <th className="py-2.5 px-3 whitespace-nowrap">Quy cách</th>
                {DISCOUNT_TIERS.map((tier) => (
                  <th key={tier} className="py-2.5 px-3 text-right whitespace-nowrap font-mono">
                    {tier === 0 ? 'Lẻ (0%)' : `${tier}%`}
                  </th>
                ))}
                <th className="py-2.5 px-4 text-right whitespace-nowrap">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {orderedProducts.map((prod) => (
                <tr key={prod.id} className="hover:bg-slate-50/70">
                  <td className="py-2.5 px-4 font-semibold text-slate-900 whitespace-nowrap">
                    {prod.name}
                  </td>
                  <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap font-mono tabular-nums">
                    {prod.portionsPerUnit > 1
                      ? `1 ${prod.unitLabel} = ${prod.portionsPerUnit} ${prod.portionUnitLabel}`
                      : `1 ${prod.unitLabel}`}
                  </td>
                  {DISCOUNT_TIERS.map((tier) => (
                    <td
                      key={tier}
                      className={`py-2.5 px-3 text-right font-mono tabular-nums whitespace-nowrap ${
                        tier === 50 ? 'font-semibold text-emerald-700' : 'text-slate-700'
                      }`}
                    >
                      {formatVnd(Number(prod.prices?.[String(tier)]) || 0)}
                    </td>
                  ))}
                  <td className="py-2.5 px-4 text-right whitespace-nowrap">
                    <div className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => startEditProduct(prod)}
                        className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded cursor-pointer"
                        title="Sửa giá sản phẩm"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      {confirmDeleteProdId === prod.id ? (
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={async () => {
                              await onDeleteProduct(prod.id);
                              setConfirmDeleteProdId(null);
                            }}
                            className="px-2 py-1 bg-rose-600 text-white text-[11px] font-semibold rounded cursor-pointer"
                          >
                            Xóa
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteProdId(null)}
                            className="px-2 py-1 bg-slate-100 text-slate-600 text-[11px] rounded cursor-pointer"
                          >
                            Hủy
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteProdId(prod.id)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded cursor-pointer"
                          title="Xóa sản phẩm"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
