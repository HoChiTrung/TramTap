/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useHealth } from '../../context/HealthContext';
import { apiUrl } from '../../utils/api';
import {
  HerbalifeProduct,
  OperatingCost,
  PackageBomItem,
  PackageSplitConfig,
  TuitionBootstrapPayload,
  TuitionContract,
  TuitionPackage,
  TuitionStatus,
} from '../../types/tuition';
import {
  computePackageSummary,
  computePersonAllocationSummary,
  exportTuitionCsv,
  formatPercent,
  formatVnd,
  generateNextStudentCode,
  getContractDebt,
  getContractProductCosts,
  getContractStatus,
  getContractStatusLabel,
  getReferrerAllocation,
  getTrainerAllocation,
  normalizeDiscountTier,
} from '../../utils/tuitionCalculations';
import { ContractFormModal } from './ContractFormModal';
import { QuickPaymentModal } from './QuickPaymentModal';
import { OperatingCostsPanel } from './OperatingCostsPanel';
import { TuitionSettingsPanel } from './TuitionSettingsPanel';
import {
  Plus,
  Download,
  Search,
  RefreshCw,
  Edit2,
  Trash2,
  Wallet,
  AlertTriangle,
  Receipt,
  Settings,
  LayoutGrid,
  CheckCircle2,
  Clock,
  AlertCircle,
  Calendar,
} from 'lucide-react';

type AdminSubTab = 'overview' | 'costs' | 'settings';

export const TuitionDashboardView: React.FC = () => {
  const { currentUser, isAdmin, students, allStudents, trainers } = useHealth();

  const [products, setProducts] = useState<HerbalifeProduct[]>([]);
  const [packages, setPackages] = useState<TuitionPackage[]>([]);
  const [contracts, setContracts] = useState<TuitionContract[]>([]);
  const [operatingCosts, setOperatingCosts] = useState<OperatingCost[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const [adminTab, setAdminTab] = useState<AdminSubTab>('overview');

  // Filters
  const [selectedMonth, setSelectedMonth] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | TuitionStatus>('ALL');
  const [packageFilter, setPackageFilter] = useState<string>('ALL');
  const [trainerFilter, setTrainerFilter] = useState<string>('ALL');

  // Modals & inline confirm
  const [contractModalOpen, setContractModalOpen] = useState(false);
  const [editingContract, setEditingContract] = useState<TuitionContract | null>(null);
  const [paymentContract, setPaymentContract] = useState<TuitionContract | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const authHeaders = useCallback((): Record<string, string> => {
    return {
      'Content-Type': 'application/json',
      'x-auth-username': currentUser?.username || '',
    };
  }, [currentUser?.username]);

  const fetchBootstrap = useCallback(async () => {
    if (!currentUser?.username) return;
    setIsLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(apiUrl('/api/tuition/bootstrap'), {
        headers: { 'x-auth-username': currentUser.username },
      });
      const data = await res.json();
      if (!res.ok) {
        setLoadError(data.error || 'Không thể tải dữ liệu học phí từ PostgreSQL.');
        setIsLoading(false);
        return;
      }
      const payload = data as TuitionBootstrapPayload;
      setProducts(payload.products || []);
      setPackages(payload.packages || []);
      setContracts(payload.contracts || []);
      setOperatingCosts(payload.operatingCosts || []);
    } catch (err) {
      setLoadError(
        err instanceof Error
          ? `Lỗi kết nối máy chủ: ${err.message}`
          : 'Không thể kết nối máy chủ dữ liệu học phí.'
      );
    } finally {
      setIsLoading(false);
    }
  }, [currentUser?.username]);

  useEffect(() => {
    fetchBootstrap();
  }, [fetchBootstrap]);

  useEffect(() => {
    if (!actionFeedback) return;
    const t = setTimeout(() => setActionFeedback(null), 4000);
    return () => clearTimeout(t);
  }, [actionFeedback]);

  // Available months derived from contracts & costs
  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    for (const c of contracts) {
      if (c.startDate && c.startDate.length >= 7) set.add(c.startDate.slice(0, 7));
    }
    if (isAdmin) {
      for (const cost of operatingCosts) {
        if (cost.costDate && cost.costDate.length >= 7) set.add(cost.costDate.slice(0, 7));
      }
    }
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [contracts, operatingCosts, isAdmin]);

  // Filtered contracts
  const filteredContracts = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return contracts.filter((c) => {
      if (selectedMonth !== 'ALL' && !String(c.startDate || '').startsWith(selectedMonth)) {
        return false;
      }
      if (statusFilter !== 'ALL') {
        const st = getContractStatus(c.totalAmount, c.paidAmount);
        if (st !== statusFilter) return false;
      }
      if (packageFilter !== 'ALL') {
        const matchesPkg =
          c.packageId === packageFilter ||
          String(c.packageName || '').toLowerCase() === packageFilter.toLowerCase();
        if (!matchesPkg) return false;
      }
      if (isAdmin && trainerFilter !== 'ALL') {
        if (trainerFilter === 'UNASSIGNED') {
          if (c.trainerId || c.trainerName) return false;
        } else if (c.trainerId !== trainerFilter) {
          return false;
        }
      }
      if (q) {
        const haystack = [
          c.studentCode,
          c.studentName,
          c.phone,
          c.referrerName,
          c.trainerName,
          c.packageName,
          c.notes,
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [contracts, selectedMonth, statusFilter, packageFilter, trainerFilter, isAdmin, searchTerm]);

  // Filtered operating costs (Admin only)
  const totalOperatingCosts = useMemo(() => {
    if (!isAdmin) return 0;
    return operatingCosts
      .filter((c) => selectedMonth === 'ALL' || String(c.costDate || '').startsWith(selectedMonth))
      .reduce((sum, c) => sum + Math.round(c.amount || 0), 0);
  }, [operatingCosts, selectedMonth, isAdmin]);

  // Core KPIs
  const kpis = useMemo(() => {
    const totalRevenue = filteredContracts.reduce(
      (sum, c) => sum + Math.round(c.totalAmount || 0),
      0
    );
    const totalPaid = filteredContracts.reduce((sum, c) => sum + Math.round(c.paidAmount || 0), 0);
    const totalDebt = filteredContracts.reduce(
      (sum, c) => sum + getContractDebt(c.totalAmount, c.paidAmount),
      0
    );
    const totalProductCost = filteredContracts.reduce(
      (sum, c) => sum + getContractProductCosts(c).totalProductCost,
      0
    );
    const grossProfitAfterProducts = totalRevenue - totalProductCost;
    const collectionRate = totalRevenue > 0 ? (totalPaid / totalRevenue) * 100 : 0;
    const netProfit = totalPaid - totalOperatingCosts;
    return {
      totalRevenue,
      totalPaid,
      totalDebt,
      totalProductCost,
      grossProfitAfterProducts,
      collectionRate,
      totalOperatingCosts,
      netProfit,
    };
  }, [filteredContracts, totalOperatingCosts]);

  const packageSummary = useMemo(
    () => computePackageSummary(filteredContracts, packages),
    [filteredContracts, packages]
  );

  const personAllocationSummary = useMemo(
    () => computePersonAllocationSummary(filteredContracts),
    [filteredContracts]
  );

  const suggestedCode = useMemo(() => generateNextStudentCode(contracts), [contracts]);

  // CRUD Handlers: Contracts
  const handleSaveContract = async (
    payload: Omit<TuitionContract, 'id' | 'createdAt' | 'updatedAt'>,
    editingId?: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const url = editingId
        ? apiUrl(`/api/tuition/contracts/${editingId}`)
        : apiUrl('/api/tuition/contracts');
      const res = await fetch(url, {
        method: editingId ? 'PUT' : 'POST',
        headers: authHeaders(),
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error || 'Lưu hợp đồng thất bại.' };

      const saved = data as TuitionContract;
      setContracts((prev) =>
        editingId ? prev.map((c) => (c.id === editingId ? saved : c)) : [saved, ...prev]
      );
      setActionFeedback({
        type: 'success',
        text: editingId
          ? `Đã cập nhật hợp đồng ${saved.studentCode} (${saved.studentName}).`
          : `Đã tạo hợp đồng mới ${saved.studentCode} (${saved.studentName}).`,
      });
      return { success: true };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Lỗi kết nối khi lưu hợp đồng.',
      };
    }
  };

  const handleRecordPayment = async (
    contractId: string,
    amount: number,
    note: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await fetch(apiUrl(`/api/tuition/contracts/${contractId}/payment`), {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ amount, note }),
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error || 'Không thể ghi nhận thu tiền.' };

      const updated = data as TuitionContract;
      setContracts((prev) => prev.map((c) => (c.id === contractId ? updated : c)));
      setActionFeedback({
        type: 'success',
        text: `Đã ghi nhận thu ${formatVnd(amount)} cho ${updated.studentName}.`,
      });
      return { success: true };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Lỗi kết nối khi thu tiền.',
      };
    }
  };

  const handleDeleteContract = async (id: string) => {
    try {
      const res = await fetch(apiUrl(`/api/tuition/contracts/${id}`), {
        method: 'DELETE',
        headers: authHeaders(),
      });
      const data = await res.json();
      if (!res.ok) {
        setActionFeedback({ type: 'error', text: data.error || 'Không thể xóa hợp đồng.' });
        return;
      }
      setContracts((prev) => prev.filter((c) => c.id !== id));
      setConfirmDeleteId(null);
      setActionFeedback({ type: 'success', text: 'Đã xóa hợp đồng học phí khỏi cơ sở dữ liệu.' });
    } catch (err) {
      setActionFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Lỗi kết nối khi xóa hợp đồng.',
      });
    }
  };

  // Admin: Operating Costs CRUD
  const handleCreateCost = async (payload: {
    costDate: string;
    category: string;
    title: string;
    amount: number;
    notes: string;
  }) => {
    try {
      const res = await fetch(apiUrl('/api/tuition/costs'), {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error };
      setOperatingCosts((prev) => [data as OperatingCost, ...prev]);
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Lỗi kết nối.' };
    }
  };

  const handleUpdateCost = async (
    id: string,
    payload: { costDate: string; category: string; title: string; amount: number; notes: string }
  ) => {
    try {
      const res = await fetch(apiUrl(`/api/tuition/costs/${id}`), {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error };
      setOperatingCosts((prev) => prev.map((c) => (c.id === id ? (data as OperatingCost) : c)));
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Lỗi kết nối.' };
    }
  };

  const handleDeleteCost = async (id: string) => {
    try {
      const res = await fetch(apiUrl(`/api/tuition/costs/${id}`), {
        method: 'DELETE',
        headers: authHeaders(),
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error };
      setOperatingCosts((prev) => prev.filter((c) => c.id !== id));
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Lỗi kết nối.' };
    }
  };

  // Admin: Packages CRUD
  const handleCreatePackage = async (payload: {
    name: string;
    monthlyPrice: number;
    defaultDurationMonths: number;
    defaultSplits: PackageSplitConfig;
    bomItems: PackageBomItem[];
  }) => {
    try {
      const res = await fetch(apiUrl('/api/tuition/packages'), {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error };
      setPackages((prev) => [...prev, data as TuitionPackage]);
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Lỗi kết nối.' };
    }
  };

  const handleUpdatePackage = async (
    id: string,
    payload: {
      name?: string;
      monthlyPrice?: number;
      defaultDurationMonths?: number;
      defaultSplits?: PackageSplitConfig;
      bomItems?: PackageBomItem[];
      isActive?: boolean;
    }
  ) => {
    try {
      const res = await fetch(apiUrl(`/api/tuition/packages/${id}`), {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error };
      setPackages((prev) => prev.map((p) => (p.id === id ? (data as TuitionPackage) : p)));
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Lỗi kết nối.' };
    }
  };

  const handleDeletePackage = async (id: string) => {
    try {
      const res = await fetch(apiUrl(`/api/tuition/packages/${id}`), {
        method: 'DELETE',
        headers: authHeaders(),
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error };
      setPackages((prev) => prev.filter((p) => p.id !== id));
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Lỗi kết nối.' };
    }
  };

  // Admin: Herbalife Products CRUD
  const handleCreateProduct = async (payload: {
    name: string;
    unitLabel: string;
    portionUnitLabel: string;
    portionsPerUnit: number;
    prices: Record<string, number>;
  }) => {
    try {
      const res = await fetch(apiUrl('/api/tuition/products'), {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error };
      setProducts((prev) => [...prev, data as HerbalifeProduct]);
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Lỗi kết nối.' };
    }
  };

  const handleUpdateProduct = async (
    id: string,
    payload: {
      name?: string;
      unitLabel?: string;
      portionUnitLabel?: string;
      portionsPerUnit?: number;
      prices?: Record<string, number>;
      isActive?: boolean;
    }
  ) => {
    try {
      const res = await fetch(apiUrl(`/api/tuition/products/${id}`), {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error };
      setProducts((prev) => prev.map((p) => (p.id === id ? (data as HerbalifeProduct) : p)));
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Lỗi kết nối.' };
    }
  };

  const handleDeleteProduct = async (id: string) => {
    try {
      const res = await fetch(apiUrl(`/api/tuition/products/${id}`), {
        method: 'DELETE',
        headers: authHeaders(),
      });
      const data = await res.json();
      if (!res.ok) return { success: false, error: data.error };
      setProducts((prev) => prev.filter((p) => p.id !== id));
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Lỗi kết nối.' };
    }
  };

  const handleExportCsv = () => {
    exportTuitionCsv({
      contracts: filteredContracts,
      packages,
      isAdmin,
      totalOperatingCosts,
      periodLabel: selectedMonth === 'ALL' ? 'Tat_Ca' : selectedMonth,
    });
  };

  if (!currentUser) return null;

  return (
    <div className="space-y-5">
      {/* Top Workspace Header & Controls */}
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
              Bảng Theo Dõi Chi Phí Học Viên Tập Luyện
            </h1>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mt-1">
              <span>Quản trị học phí, công nợ, vốn sản phẩm Herbalife &amp; quyết toán HLV</span>
              <span aria-hidden="true">·</span>
              <span>
                {isAdmin
                  ? 'Phạm vi: Toàn hệ thống (Admin)'
                  : `Phạm vi: Học viên của ${currentUser.fullName}`}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <div className="inline-flex items-center gap-1.5 h-9 px-2.5 rounded-lg border border-slate-200 bg-slate-50">
              <Calendar className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="bg-transparent text-xs font-semibold text-slate-800 focus:outline-none cursor-pointer"
                aria-label="Lọc theo kỳ tháng"
              >
                <option value="ALL">Tất cả thời gian</option>
                {availableMonths.map((m) => (
                  <option key={m} value={m}>
                    Tháng {m.split('-')[1]}/{m.split('-')[0]}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={fetchBootstrap}
              className="h-9 px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              title="Đồng bộ lại dữ liệu"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Làm mới</span>
            </button>

            <button
              type="button"
              onClick={handleExportCsv}
              disabled={filteredContracts.length === 0}
              className="h-9 px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-40 whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Xuất CSV</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setEditingContract(null);
                setContractModalOpen(true);
              }}
              className="h-9 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              <span>Thêm Hợp Đồng</span>
            </button>
          </div>
        </div>

        {/* Admin Internal Segmented Tabs */}
        {isAdmin && (
          <div className="mt-4 pt-4 border-t border-slate-100 flex flex-wrap items-center gap-1.5">
            <div className="inline-flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg">
              <button
                type="button"
                onClick={() => setAdminTab('overview')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                  adminTab === 'overview'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span>Tổng Quan &amp; Công Nợ</span>
              </button>
              <button
                type="button"
                onClick={() => setAdminTab('costs')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                  adminTab === 'costs'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Receipt className="w-3.5 h-3.5" />
                <span>Sổ Chi Phí Vận Hành ({operatingCosts.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setAdminTab('settings')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                  adminTab === 'settings'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Settings className="w-3.5 h-3.5" />
                <span>Cấu Hình Gói &amp; Bảng Giá SP</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Error & Feedback Banners */}
      {loadError && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <span>{loadError}</span>
          </div>
          <button
            type="button"
            onClick={fetchBootstrap}
            className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-semibold cursor-pointer"
          >
            Thử tải lại
          </button>
        </div>
      )}

      {actionFeedback && (
        <div
          className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
            actionFeedback.type === 'error'
              ? 'bg-rose-50 border-rose-200 text-rose-800'
              : 'bg-emerald-50 border-emerald-200 text-emerald-800'
          }`}
        >
          {actionFeedback.type === 'error' ? (
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          )}
          <span>{actionFeedback.text}</span>
        </div>
      )}

      {/* KPI Strip: 6 Metrics for Admin, 4 Metrics for Trainer */}
      <div
        className={`grid grid-cols-2 ${
          isAdmin ? 'md:grid-cols-3 xl:grid-cols-6' : 'md:grid-cols-4'
        } gap-3`}
      >
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs font-medium text-slate-500">Tổng doanh thu</div>
          <div className="text-lg font-bold font-mono tabular-nums text-slate-900 mt-1.5">
            {formatVnd(kpis.totalRevenue)}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            {filteredContracts.length} hợp đồng · Vốn SP {formatVnd(kpis.totalProductCost)}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs font-medium text-slate-500">Đã thu học phí</div>
          <div className="text-lg font-bold font-mono tabular-nums text-emerald-700 mt-1.5">
            {formatVnd(kpis.totalPaid)}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">Thực thu ghi nhận</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs font-medium text-slate-500">Còn nợ</div>
          <div
            className={`text-lg font-bold font-mono tabular-nums mt-1.5 ${
              kpis.totalDebt > 0 ? 'text-amber-700' : 'text-slate-900'
            }`}
          >
            {formatVnd(kpis.totalDebt)}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">Công nợ chưa thu</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="text-xs font-medium text-slate-500">Tỷ lệ thu</div>
          <div className="text-lg font-bold font-mono tabular-nums text-slate-900 mt-1.5">
            {formatPercent(kpis.collectionRate)}
          </div>
          <div className="w-full h-1.5 bg-slate-100 rounded-full mt-2 overflow-hidden">
            <div
              className="h-full bg-emerald-600 rounded-full transition-all"
              style={{ width: `${Math.min(100, Math.max(0, kpis.collectionRate))}%` }}
            />
          </div>
        </div>

        {isAdmin && (
          <>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-xs font-medium text-slate-500">Chi phí vận hành</div>
              <div className="text-lg font-bold font-mono tabular-nums text-rose-700 mt-1.5">
                {formatVnd(kpis.totalOperatingCosts)}
              </div>
              <div className="text-[11px] text-slate-400 mt-1">Từ sổ chi phí vận hành</div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-xs font-medium text-slate-500">Lợi nhuận thuần</div>
              <div
                className={`text-lg font-bold font-mono tabular-nums mt-1.5 ${
                  kpis.netProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'
                }`}
              >
                {formatVnd(kpis.netProfit)}
              </div>
              <div className="text-[11px] text-slate-400 mt-1">Đã thu − Chi phí vận hành</div>
            </div>
          </>
        )}
      </div>

      {/* Admin Sub-tab Views */}
      {isAdmin && adminTab === 'costs' ? (
        <OperatingCostsPanel
          costs={operatingCosts}
          selectedMonth={selectedMonth}
          onCreateCost={handleCreateCost}
          onUpdateCost={handleUpdateCost}
          onDeleteCost={handleDeleteCost}
        />
      ) : isAdmin && adminTab === 'settings' ? (
        <TuitionSettingsPanel
          products={products}
          packages={packages}
          onCreatePackage={handleCreatePackage}
          onUpdatePackage={handleUpdatePackage}
          onDeletePackage={handleDeletePackage}
          onCreateProduct={handleCreateProduct}
          onUpdateProduct={handleUpdateProduct}
          onDeleteProduct={handleDeleteProduct}
        />
      ) : (
        /* Overview & Debt Ledger View */
        <div className="space-y-5">
          {/* Summary Tables Grid: 5 cols Package Stats + 7 cols 3-Layer Settlement Table */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-stretch">
            {/* Table 1: Revenue & Product Cost by Package */}
            <div className="xl:col-span-5 bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col">
              <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
                <h2 className="text-sm font-bold text-slate-900">
                  Thống Kê Doanh Thu Theo Gói Tập
                </h2>
                <span className="text-xs text-slate-500 font-mono tabular-nums">
                  {packageSummary.length} gói
                </span>
              </div>
              <div className="overflow-x-auto flex-1">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-500">
                      <th className="py-2.5 px-3">Gói tập</th>
                      <th className="py-2.5 px-2.5 text-right whitespace-nowrap">SL</th>
                      <th className="py-2.5 px-3 text-right whitespace-nowrap">Doanh thu</th>
                      <th className="py-2.5 px-3 text-right whitespace-nowrap">Vốn SP</th>
                      <th className="py-2.5 px-3 text-right whitespace-nowrap">Tỷ trọng</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {packageSummary.map((row) => (
                      <tr key={row.packageId} className="hover:bg-slate-50/70">
                        <td className="py-2.5 px-3 font-semibold text-slate-900 whitespace-nowrap">
                          {row.packageName}
                        </td>
                        <td className="py-2.5 px-2.5 text-right font-mono tabular-nums text-slate-700">
                          {row.studentCount}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-slate-900 whitespace-nowrap">
                          {formatVnd(row.totalRevenue)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-600 whitespace-nowrap">
                          {formatVnd(row.totalProductCost)}
                        </td>
                        <td className="py-2.5 px-3 text-right whitespace-nowrap">
                          <div className="font-mono tabular-nums text-slate-700">
                            {formatPercent(row.sharePercent)}
                          </div>
                          <div className="w-14 ml-auto h-1 bg-slate-100 rounded-full mt-1 overflow-hidden">
                            <div
                              className="h-full bg-emerald-600 rounded-full"
                              style={{ width: `${Math.min(100, Math.max(0, row.sharePercent))}%` }}
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-slate-200 bg-slate-50 text-xs font-bold text-slate-900">
                      <td className="py-2.5 px-3">Tổng cộng</td>
                      <td className="py-2.5 px-2.5 text-right font-mono tabular-nums">
                        {filteredContracts.length}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                        {formatVnd(kpis.totalRevenue)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                        {formatVnd(kpis.totalProductCost)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                        {kpis.totalRevenue > 0 ? '100,0%' : '0,0%'}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Table 2: Full Settlement Summary (Hoàn vốn SP + Lãi từ Dạy + Lãi từ GT + Tổng Lợi Nhuận + Tổng Quyết Toán) */}
            <div className="xl:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col">
              <div className="px-5 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-bold text-slate-900">
                    Tổng Hợp Quyết Toán (Hoàn Vốn SP + Lợi Nhuận Được Chia)
                  </h2>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Tổng quyết toán = Hoàn vốn mua sản phẩm + Tổng lợi nhuận (Dạy &amp; Giới thiệu)
                  </p>
                </div>
                <span className="text-xs text-slate-500 font-mono tabular-nums">
                  {personAllocationSummary.rows.length} HLV
                </span>
              </div>
              <div className="overflow-x-auto flex-1">
                {personAllocationSummary.rows.length === 0 ? (
                  <div className="py-10 px-4 text-center text-xs text-slate-500">
                    Chưa có dữ liệu quyết toán HLV dạy và Người giới thiệu trong kỳ lọc này.
                  </div>
                ) : (
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-500">
                        <th className="py-2.5 px-3 whitespace-nowrap">HLV / Cá nhân</th>
                        <th className="py-2.5 px-2.5 text-right whitespace-nowrap">Hoàn vốn SP</th>
                        <th className="py-2.5 px-2.5 text-right whitespace-nowrap">Lãi từ Dạy</th>
                        <th className="py-2.5 px-2.5 text-right whitespace-nowrap">Lãi từ GT</th>
                        <th className="py-2.5 px-2.5 text-right whitespace-nowrap">
                          Tổng Lợi Nhuận
                        </th>
                        <th className="py-2.5 px-3 text-right whitespace-nowrap">
                          Tổng Quyết Toán
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs">
                      {personAllocationSummary.rows.map((row) => (
                        <tr key={row.personName} className="hover:bg-slate-50/70">
                          <td className="py-2.5 px-3 font-semibold text-slate-900 whitespace-nowrap">
                            {row.personName}
                          </td>
                          <td className="py-2.5 px-2.5 text-right font-mono tabular-nums text-slate-700 whitespace-nowrap">
                            {formatVnd(row.productCostReimbursement)}
                          </td>
                          <td className="py-2.5 px-2.5 text-right font-mono tabular-nums text-slate-700 whitespace-nowrap">
                            {formatVnd(row.profitFromTeaching)}
                          </td>
                          <td className="py-2.5 px-2.5 text-right font-mono tabular-nums text-slate-700 whitespace-nowrap">
                            {formatVnd(row.profitFromReferral)}
                          </td>
                          <td className="py-2.5 px-2.5 text-right font-mono tabular-nums font-semibold text-emerald-700 whitespace-nowrap">
                            {formatVnd(row.totalProfit)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums font-bold text-slate-900 whitespace-nowrap">
                            {formatVnd(row.totalSettlement)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-slate-200 bg-slate-50 text-xs font-bold text-slate-900">
                        <td className="py-2.5 px-3 whitespace-nowrap">Tổng cộng</td>
                        <td className="py-2.5 px-2.5 text-right font-mono tabular-nums whitespace-nowrap">
                          {formatVnd(personAllocationSummary.totalProductCost)}
                        </td>
                        <td className="py-2.5 px-2.5 text-right font-mono tabular-nums whitespace-nowrap">
                          {formatVnd(personAllocationSummary.totalTeachingProfit)}
                        </td>
                        <td className="py-2.5 px-2.5 text-right font-mono tabular-nums whitespace-nowrap">
                          {formatVnd(personAllocationSummary.totalReferralProfit)}
                        </td>
                        <td className="py-2.5 px-2.5 text-right font-mono tabular-nums text-emerald-700 whitespace-nowrap">
                          {formatVnd(personAllocationSummary.totalProfit)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                          {formatVnd(personAllocationSummary.grandTotalSettlement)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                )}
              </div>
            </div>
          </div>

          {/* Detailed Student Tuition & Debt Table */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            {/* Table Toolbar */}
            <div className="px-5 py-4 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  Danh Sách Chi Tiết Học Viên &amp; Công Nợ
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Hiển thị {filteredContracts.length} / {contracts.length} hợp đồng học phí
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-[200px] flex-1 sm:flex-initial">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Tìm mã HV, tên, SĐT, NGT..."
                    className="w-full h-9 pl-8 pr-3 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white text-xs text-slate-900 focus:outline-none focus:border-emerald-600"
                  />
                </div>

                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as 'ALL' | TuitionStatus)}
                  className="h-9 px-2.5 rounded-lg border border-slate-200 bg-slate-50 text-xs font-medium text-slate-700 focus:outline-none focus:border-emerald-600"
                >
                  <option value="ALL">Tất cả trạng thái</option>
                  <option value="completed">Đã hoàn thành</option>
                  <option value="partial">Còn nợ</option>
                  <option value="unpaid">Chưa thanh toán</option>
                </select>

                <select
                  value={packageFilter}
                  onChange={(e) => setPackageFilter(e.target.value)}
                  className="h-9 px-2.5 rounded-lg border border-slate-200 bg-slate-50 text-xs font-medium text-slate-700 focus:outline-none focus:border-emerald-600"
                >
                  <option value="ALL">Tất cả gói tập</option>
                  {packages.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>

                {isAdmin && (
                  <select
                    value={trainerFilter}
                    onChange={(e) => setTrainerFilter(e.target.value)}
                    className="h-9 px-2.5 rounded-lg border border-slate-200 bg-slate-50 text-xs font-medium text-slate-700 focus:outline-none focus:border-emerald-600"
                  >
                    <option value="ALL">Tất cả HLV</option>
                    {trainers.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.fullName}
                      </option>
                    ))}
                    <option value="UNASSIGNED">Chưa gắn HLV</option>
                  </select>
                )}
              </div>
            </div>

            {/* Loading / Empty / Data Table */}
            {isLoading ? (
              <div className="p-5 space-y-2.5">
                {[1, 2, 3, 4].map((row) => (
                  <div
                    key={row}
                    className="h-10 rounded-lg bg-slate-100 animate-pulse"
                    aria-hidden="true"
                  />
                ))}
              </div>
            ) : filteredContracts.length === 0 ? (
              <div className="py-14 px-4 text-center">
                <Wallet className="w-9 h-9 text-slate-300 mx-auto mb-2.5" />
                <p className="text-sm font-semibold text-slate-800">
                  {contracts.length === 0
                    ? 'Chưa có hợp đồng học phí nào được ghi nhận'
                    : 'Không tìm thấy hợp đồng khớp với bộ lọc hiện tại'}
                </p>
                <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                  {contracts.length === 0
                    ? 'Bắt đầu tạo hợp đồng học phí đầu tiên để tự động tính vốn sản phẩm Herbalife theo chiết khấu từng HLV và quyết toán lợi nhuận.'
                    : 'Hãy xóa bớt điều kiện lọc hoặc chọn lại kỳ tháng để xem toàn bộ danh sách.'}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    if (contracts.length === 0) {
                      setEditingContract(null);
                      setContractModalOpen(true);
                    } else {
                      setSelectedMonth('ALL');
                      setSearchTerm('');
                      setStatusFilter('ALL');
                      setPackageFilter('ALL');
                      setTrainerFilter('ALL');
                    }
                  }}
                  className="mt-4 h-9 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  {contracts.length === 0 ? (
                    <>
                      <Plus className="w-4 h-4" />
                      <span>Tạo Hợp Đồng Đầu Tiên</span>
                    </>
                  ) : (
                    <span>Đặt Lại Bộ Lọc</span>
                  )}
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-500">
                      <th className="py-2.5 px-4 sticky left-0 bg-slate-50 z-10 border-r border-slate-200/70 whitespace-nowrap">
                        Học viên
                      </th>
                      <th className="py-2.5 px-3 whitespace-nowrap">HLV dạy</th>
                      <th className="py-2.5 px-3 whitespace-nowrap">Người giới thiệu</th>
                      <th className="py-2.5 px-3 whitespace-nowrap">Gói tập</th>
                      <th className="py-2.5 px-3 text-right whitespace-nowrap">Tổng học phí</th>
                      <th className="py-2.5 px-3 text-right whitespace-nowrap">
                        Vốn SP (HLV / NGT)
                      </th>
                      <th className="py-2.5 px-3 text-right whitespace-nowrap">Lợi nhuận sau SP</th>
                      <th className="py-2.5 px-3 text-right whitespace-nowrap">Đã thanh toán</th>
                      <th className="py-2.5 px-3 text-right whitespace-nowrap">Còn nợ</th>
                      <th className="py-2.5 px-3 whitespace-nowrap">Trạng thái</th>
                      <th className="py-2.5 px-3 text-right whitespace-nowrap">
                        HLV dạy (Lãi / QT)
                      </th>
                      <th className="py-2.5 px-3 text-right whitespace-nowrap">
                        Người GT (Lãi / QT)
                      </th>
                      <th className="py-2.5 px-4 text-right whitespace-nowrap">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {filteredContracts.map((c) => {
                      const debt = getContractDebt(c.totalAmount, c.paidAmount);
                      const status = getContractStatus(c.totalAmount, c.paidAmount);
                      const { trainerProductCost, referrerProductCost, totalProductCost } =
                        getContractProductCosts(c);
                      const profitAfterProd = Math.round(c.totalAmount || 0) - totalProductCost;
                      const trainerProfit = getTrainerAllocation(c.allocations);
                      const referrerProfit = getReferrerAllocation(c.allocations);
                      const trainerTier = normalizeDiscountTier(
                        c.trainerDiscountTier ?? c.discountPercent,
                        50
                      );
                      const referrerTier = normalizeDiscountTier(c.referrerDiscountTier, 50);

                      return (
                        <tr key={c.id} className="hover:bg-slate-50/70 transition-colors group">
                          <td className="py-2.5 px-4 sticky left-0 bg-white group-hover:bg-slate-50 z-10 border-r border-slate-200/70 whitespace-nowrap">
                            <div className="font-semibold text-slate-900">{c.studentName}</div>
                            <div className="text-[11px] text-slate-500 font-mono tabular-nums">
                              {c.studentCode}
                              {c.phone ? ` · ${c.phone}` : ''}
                              {c.isManualAllocation ? ' · Sửa tay' : ''}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <div className="text-slate-800 font-medium">{c.trainerName || '—'}</div>
                            <div className="text-[11px] text-slate-500 font-mono tabular-nums">
                              CK {trainerTier}%
                            </div>
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <div className="text-slate-700">{c.referrerName || '—'}</div>
                            {c.referrerName && (
                              <div className="text-[11px] text-slate-500 font-mono tabular-nums">
                                CK {referrerTier}%
                              </div>
                            )}
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <div className="font-medium text-slate-800">{c.packageName}</div>
                            <div className="text-[11px] text-slate-500 font-mono tabular-nums">
                              {c.durationMonths} th · {c.startDate || '—'}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-slate-900 whitespace-nowrap">
                            {formatVnd(c.totalAmount)}
                          </td>
                          <td className="py-2.5 px-3 text-right whitespace-nowrap">
                            <div className="font-mono tabular-nums font-semibold text-slate-800">
                              {formatVnd(totalProductCost)}
                            </div>
                            <div className="text-[11px] font-mono tabular-nums text-slate-500">
                              {referrerProductCost > 0
                                ? `HLV ${formatVnd(trainerProductCost)} · NGT ${formatVnd(referrerProductCost)}`
                                : trainerProductCost > 0
                                ? `HLV ${formatVnd(trainerProductCost)}`
                                : 'Không kèm SP'}
                            </div>
                          </td>
                          <td
                            className={`py-2.5 px-3 text-right font-mono tabular-nums font-semibold whitespace-nowrap ${
                              profitAfterProd >= 0 ? 'text-emerald-700' : 'text-rose-700'
                            }`}
                          >
                            {formatVnd(profitAfterProd)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-emerald-700 whitespace-nowrap">
                            {formatVnd(c.paidAmount)}
                          </td>
                          <td
                            className={`py-2.5 px-3 text-right font-mono tabular-nums font-semibold whitespace-nowrap ${
                              debt > 0 ? 'text-amber-700' : 'text-slate-400'
                            }`}
                          >
                            {formatVnd(debt)}
                          </td>
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <span
                              className={`inline-flex items-center gap-1 font-semibold ${
                                status === 'completed'
                                  ? 'text-emerald-700'
                                  : status === 'partial'
                                  ? 'text-amber-700'
                                  : 'text-rose-700'
                              }`}
                            >
                              {status === 'completed' ? (
                                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                              ) : status === 'partial' ? (
                                <Clock className="w-3.5 h-3.5 shrink-0" />
                              ) : (
                                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                              )}
                              <span>{getContractStatusLabel(status)}</span>
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right whitespace-nowrap">
                            <div className="font-mono tabular-nums font-semibold text-emerald-700">
                              +{formatVnd(trainerProfit)}
                            </div>
                            <div className="text-[11px] font-mono tabular-nums text-slate-500">
                              QT: {formatVnd(trainerProductCost + trainerProfit)}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-right whitespace-nowrap">
                            <div className="font-mono tabular-nums font-semibold text-slate-800">
                              {referrerProfit > 0 ? `+${formatVnd(referrerProfit)}` : '0 ₫'}
                            </div>
                            <div className="text-[11px] font-mono tabular-nums text-slate-500">
                              QT: {formatVnd(referrerProductCost + referrerProfit)}
                            </div>
                          </td>
                          <td className="py-2.5 px-4 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-1">
                              {debt > 0 && (
                                <button
                                  type="button"
                                  onClick={() => setPaymentContract(c)}
                                  className="h-7 px-2 rounded-md border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                                  title="Ghi nhận thu thêm học phí"
                                >
                                  <Wallet className="w-3 h-3" />
                                  <span>Thu tiền</span>
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingContract(c);
                                  setContractModalOpen(true);
                                }}
                                className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-md cursor-pointer"
                                title="Sửa hợp đồng"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              {confirmDeleteId === c.id ? (
                                <div className="inline-flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteContract(c.id)}
                                    className="px-2 py-1 bg-rose-600 text-white text-[11px] font-semibold rounded cursor-pointer"
                                  >
                                    Xóa
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteId(null)}
                                    className="px-2 py-1 bg-slate-100 text-slate-600 text-[11px] rounded cursor-pointer"
                                  >
                                    Hủy
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteId(c.id)}
                                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md cursor-pointer"
                                  title="Xóa hợp đồng"
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
            )}
          </div>
        </div>
      )}

      {/* Modals */}
      <ContractFormModal
        open={contractModalOpen}
        editingContract={editingContract}
        suggestedCode={suggestedCode}
        isAdmin={isAdmin}
        currentUser={currentUser}
        students={isAdmin ? allStudents : students}
        trainers={trainers}
        products={products}
        packages={packages}
        onClose={() => {
          setContractModalOpen(false);
          setEditingContract(null);
        }}
        onSubmit={handleSaveContract}
      />

      <QuickPaymentModal
        contract={paymentContract}
        onClose={() => setPaymentContract(null)}
        onSubmitPayment={handleRecordPayment}
      />
    </div>
  );
};
