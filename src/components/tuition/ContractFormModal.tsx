/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  AllocationBasis,
  ContractAllocations,
  DISCOUNT_TIERS,
  HerbalifeProduct,
  TuitionContract,
  TuitionPackage,
} from '../../types/tuition';
import { AuthUser, StudentProfile, UserAccount } from '../../types/health';
import {
  computeAutoAllocations,
  computePackageProductCosts,
  formatPercent,
  formatVnd,
  getAllocationBasisAmount,
  getContractDebt,
  getContractProductCosts,
  getContractStatus,
  getContractStatusLabel,
  getContractTotal,
  getPackageSplitPercentages,
  getReferrerAllocation,
  getTrainerAllocation,
  hasDistinctReferrer,
  normalizeDiscountTier,
} from '../../utils/tuitionCalculations';
import { X, RotateCcw, AlertTriangle, Check, UserCheck, Users } from 'lucide-react';

interface ContractFormModalProps {
  open: boolean;
  editingContract: TuitionContract | null;
  suggestedCode: string;
  isAdmin: boolean;
  currentUser: AuthUser;
  students: StudentProfile[];
  trainers: UserAccount[];
  products: HerbalifeProduct[];
  packages: TuitionPackage[];
  onClose: () => void;
  onSubmit: (
    payload: Omit<TuitionContract, 'id' | 'createdAt' | 'updatedAt'>,
    editingId?: string
  ) => Promise<{ success: boolean; error?: string }>;
}

export const ContractFormModal: React.FC<ContractFormModalProps> = ({
  open,
  editingContract,
  suggestedCode,
  isAdmin,
  currentUser,
  students,
  trainers,
  products,
  packages,
  onClose,
  onSubmit,
}) => {
  const activePackages = useMemo(
    () => [...packages].filter((p) => p.isActive).sort((a, b) => a.sortOrder - b.sortOrder),
    [packages]
  );

  const [sourceMode, setSourceMode] = useState<'existing' | 'custom'>('existing');
  const [studentCode, setStudentCode] = useState('');
  const [studentId, setStudentId] = useState<string>('');
  const [studentName, setStudentName] = useState('');
  const [phone, setPhone] = useState('');
  const [referrerName, setReferrerName] = useState('');
  const [trainerId, setTrainerId] = useState<string>('');
  const [trainerName, setTrainerName] = useState('');
  const [packageId, setPackageId] = useState<string>('');
  const [packageName, setPackageName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [unitPrice, setUnitPrice] = useState<number>(0);
  const [durationMonths, setDurationMonths] = useState<number>(1);

  // Dual discount tiers & product purchase costs (HLV dạy vs Người giới thiệu)
  const [trainerDiscountTier, setTrainerDiscountTier] = useState<number>(50);
  const [referrerDiscountTier, setReferrerDiscountTier] = useState<number>(50);
  const [trainerProductCost, setTrainerProductCost] = useState<number>(0);
  const [referrerProductCost, setReferrerProductCost] = useState<number>(0);
  const [isManualProductCost, setIsManualProductCost] = useState(false);

  const [paidAmount, setPaidAmount] = useState<number>(0);
  const [paidPreset, setPaidPreset] = useState<'none' | '50' | '100' | 'custom'>('none');
  const [allocationBasis, setAllocationBasis] = useState<AllocationBasis>('margin');
  const [allocations, setAllocations] = useState<ContractAllocations>({ trainer: 0, referrer: 0 });
  const [isManualAllocation, setIsManualAllocation] = useState(false);
  const [notes, setNotes] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const selectedPackage = useMemo(
    () => packages.find((p) => p.id === packageId) || null,
    [packages, packageId]
  );

  const effectiveTrainerName = isAdmin ? trainerName : currentUser.fullName;
  const distinctReferrer = useMemo(
    () => hasDistinctReferrer(effectiveTrainerName, referrerName),
    [effectiveTrainerName, referrerName]
  );

  // Initialize form whenever modal opens
  useEffect(() => {
    if (!open) return;
    setErrorMsg(null);

    if (editingContract) {
      const pkg = packages.find((p) => p.id === editingContract.packageId) || null;
      const tTier = normalizeDiscountTier(
        editingContract.trainerDiscountTier ?? editingContract.discountPercent,
        50
      );
      const rTier = normalizeDiscountTier(editingContract.referrerDiscountTier, 50);
      const savedCosts = getContractProductCosts(editingContract);
      const hasRef = hasDistinctReferrer(editingContract.trainerName, editingContract.referrerName);
      const autoBom = computePackageProductCosts({
        bomItems: pkg?.bomItems,
        products,
        trainerTier: tTier,
        referrerTier: rTier,
        hasReferrer: hasRef,
        durationMonths: editingContract.durationMonths || 1,
      });

      setSourceMode(editingContract.studentId ? 'existing' : 'custom');
      setStudentCode(editingContract.studentCode);
      setStudentId(editingContract.studentId || '');
      setStudentName(editingContract.studentName);
      setPhone(editingContract.phone || '');
      setReferrerName(editingContract.referrerName || '');
      setTrainerId(editingContract.trainerId || '');
      setTrainerName(editingContract.trainerName || '');
      setPackageId(editingContract.packageId || '');
      setPackageName(editingContract.packageName);
      setStartDate(editingContract.startDate || new Date().toISOString().split('T')[0]);
      setUnitPrice(editingContract.unitPrice);
      setDurationMonths(editingContract.durationMonths || 1);
      setTrainerDiscountTier(tTier);
      setReferrerDiscountTier(rTier);
      setTrainerProductCost(savedCosts.trainerProductCost);
      setReferrerProductCost(savedCosts.referrerProductCost);
      setIsManualProductCost(
        savedCosts.trainerProductCost !== autoBom.trainerProductCost ||
          savedCosts.referrerProductCost !== autoBom.referrerProductCost
      );
      setPaidAmount(editingContract.paidAmount);
      setPaidPreset('custom');
      setAllocationBasis(editingContract.allocationBasis || 'margin');
      setAllocations({
        trainer: getTrainerAllocation(editingContract.allocations),
        referrer: getReferrerAllocation(editingContract.allocations),
      });
      setIsManualAllocation(Boolean(editingContract.isManualAllocation));
      setNotes(editingContract.notes || '');
      return;
    }

    const defaultPkg =
      activePackages.find((p) => p.id === 'pkg-co-ban') || activePackages[0] || null;
    const initUnit = defaultPkg ? defaultPkg.monthlyPrice : 0;
    const initDuration = defaultPkg ? defaultPkg.defaultDurationMonths || 1 : 1;
    const initTotal = getContractTotal(initUnit, initDuration);
    const defaultTrainerAccount = !isAdmin
      ? trainers.find((t) => t.id === currentUser.id)
      : trainers[0];
    const initTrainerTier = normalizeDiscountTier(
      defaultTrainerAccount?.discountTier ?? currentUser.discountTier,
      50
    );
    const autoBom = computePackageProductCosts({
      bomItems: defaultPkg?.bomItems,
      products,
      trainerTier: initTrainerTier,
      referrerTier: 50,
      hasReferrer: false,
      durationMonths: initDuration,
    });
    const initBasis = getAllocationBasisAmount(initTotal, 0, autoBom.totalProductCost, 'margin');

    setSourceMode(students.length > 0 ? 'existing' : 'custom');
    setStudentCode(suggestedCode);
    setStudentId('');
    setStudentName('');
    setPhone('');
    setReferrerName('');
    setTrainerId(isAdmin ? defaultTrainerAccount?.id || '' : currentUser.id);
    setTrainerName(isAdmin ? defaultTrainerAccount?.fullName || '' : currentUser.fullName);
    setPackageId(defaultPkg?.id || '');
    setPackageName(defaultPkg?.name || '');
    setStartDate(new Date().toISOString().split('T')[0]);
    setUnitPrice(initUnit);
    setDurationMonths(initDuration);
    setTrainerDiscountTier(initTrainerTier);
    setReferrerDiscountTier(50);
    setTrainerProductCost(autoBom.trainerProductCost);
    setReferrerProductCost(autoBom.referrerProductCost);
    setIsManualProductCost(false);
    setPaidAmount(0);
    setPaidPreset('none');
    setAllocationBasis('margin');
    setIsManualAllocation(false);
    setAllocations(computeAutoAllocations(initBasis, defaultPkg?.defaultSplits, false));
    setNotes('');
  }, [
    open,
    editingContract,
    suggestedCode,
    isAdmin,
    currentUser,
    students.length,
    activePackages,
    packages,
    products,
    trainers,
  ]);

  const totalAmount = useMemo(
    () => getContractTotal(unitPrice, durationMonths),
    [unitPrice, durationMonths]
  );

  const debtAmount = useMemo(
    () => getContractDebt(totalAmount, paidAmount),
    [totalAmount, paidAmount]
  );

  const status = useMemo(
    () => getContractStatus(totalAmount, paidAmount),
    [totalAmount, paidAmount]
  );

  // Keep paidAmount synced if user chose a quick-pay preset (50% / 100%) and then changes package/months
  useEffect(() => {
    if (!open) return;
    if (paidPreset === '100') {
      setPaidAmount(totalAmount);
    } else if (paidPreset === '50') {
      setPaidAmount(Math.round(totalAmount / 2));
    }
  }, [open, totalAmount, paidPreset]);

  // Live Herbalife BOM cost breakdown from selected package & tiers
  const autoBomResult = useMemo(
    () =>
      computePackageProductCosts({
        bomItems: selectedPackage?.bomItems,
        products,
        trainerTier: trainerDiscountTier,
        referrerTier: referrerDiscountTier,
        hasReferrer: distinctReferrer,
        durationMonths,
      }),
    [
      selectedPackage,
      products,
      trainerDiscountTier,
      referrerDiscountTier,
      distinctReferrer,
      durationMonths,
    ]
  );

  // Auto-sync product costs whenever BOM inputs change (unless manually overridden)
  useEffect(() => {
    if (!open || isManualProductCost) return;
    setTrainerProductCost(autoBomResult.trainerProductCost);
    setReferrerProductCost(autoBomResult.referrerProductCost);
  }, [open, isManualProductCost, autoBomResult.trainerProductCost, autoBomResult.referrerProductCost]);

  const totalProductCost = trainerProductCost + referrerProductCost;
  const rawProfitAfterProducts = totalAmount - totalProductCost;

  const basisAmount = useMemo(
    () => getAllocationBasisAmount(totalAmount, paidAmount, totalProductCost, allocationBasis),
    [totalAmount, paidAmount, totalProductCost, allocationBasis]
  );

  const pkgSplits = useMemo(
    () => getPackageSplitPercentages(selectedPackage?.defaultSplits),
    [selectedPackage]
  );

  // Recalculate auto profit splits whenever basis, package, or distinct referrer changes
  useEffect(() => {
    if (!open || isManualAllocation) return;
    setAllocations(
      computeAutoAllocations(basisAmount, selectedPackage?.defaultSplits, distinctReferrer)
    );
  }, [open, isManualAllocation, basisAmount, selectedPackage, distinctReferrer]);

  const handleSelectExistingStudent = (id: string) => {
    setStudentId(id);
    const stu = students.find((s) => s.id === id);
    if (!stu) return;
    setStudentName(stu.fullName);
    setPhone(stu.phone || '');
    if (isAdmin && stu.trainerId) {
      setTrainerId(stu.trainerId);
      const tr = trainers.find((t) => t.id === stu.trainerId);
      setTrainerName(tr?.fullName || stu.trainerName || '');
      if (tr && tr.discountTier !== undefined) {
        setTrainerDiscountTier(normalizeDiscountTier(tr.discountTier, 50));
        setIsManualProductCost(false);
      }
    }
    if (stu.targetMetrics?.trainingPackageId) {
      const matchedPkg = packages.find((p) => p.id === stu.targetMetrics.trainingPackageId);
      if (matchedPkg) {
        setPackageId(matchedPkg.id);
        setPackageName(matchedPkg.name);
        setUnitPrice(matchedPkg.monthlyPrice);
        setIsManualProductCost(false);
        if (!editingContract) {
          setDurationMonths(matchedPkg.defaultDurationMonths || 1);
        }
      }
    }
  };

  const handleTrainerChange = (newTrainerId: string) => {
    setTrainerId(newTrainerId);
    const tr = trainers.find((t) => t.id === newTrainerId);
    setTrainerName(tr ? tr.fullName : '');
    if (tr && tr.discountTier !== undefined) {
      setTrainerDiscountTier(normalizeDiscountTier(tr.discountTier, 50));
      setIsManualProductCost(false);
    }
  };

  const handleReferrerChange = (newRefName: string) => {
    setReferrerName(newRefName);
    const refTrainer = trainers.find((t) => t.fullName === newRefName);
    if (refTrainer && refTrainer.discountTier !== undefined) {
      setReferrerDiscountTier(normalizeDiscountTier(refTrainer.discountTier, 50));
    }
    setIsManualProductCost(false);
  };

  const handlePackageChange = (newPkgId: string) => {
    setPackageId(newPkgId);
    const pkg = packages.find((p) => p.id === newPkgId);
    if (!pkg) return;
    setPackageName(pkg.name);
    setUnitPrice(pkg.monthlyPrice);
    setIsManualProductCost(false);
    if (!editingContract) {
      setDurationMonths(pkg.defaultDurationMonths || 1);
    }
  };

  const handleManualAllocationChange = (field: 'trainer' | 'referrer', rawVal: string) => {
    const parsed = Math.max(0, Math.round(Number(rawVal) || 0));
    setIsManualAllocation(true);
    setAllocations((prev) => ({ ...prev, [field]: parsed }));
  };

  const handleResetToAutoSplits = () => {
    setIsManualAllocation(false);
    setAllocations(
      computeAutoAllocations(basisAmount, selectedPackage?.defaultSplits, distinctReferrer)
    );
  };

  const handleResetToAutoProductCosts = () => {
    setIsManualProductCost(false);
    setTrainerProductCost(autoBomResult.trainerProductCost);
    setReferrerProductCost(autoBomResult.referrerProductCost);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!studentName.trim()) {
      setErrorMsg('Vui lòng chọn học viên hoặc nhập họ và tên học viên.');
      return;
    }
    if (!packageName.trim()) {
      setErrorMsg('Vui lòng chọn hoặc nhập tên gói tập.');
      return;
    }
    if (durationMonths <= 0) {
      setErrorMsg('Thời hạn gói tập phải lớn hơn 0.');
      return;
    }

    setIsSaving(true);
    const res = await onSubmit(
      {
        studentCode: studentCode.trim() || suggestedCode,
        studentId: sourceMode === 'existing' && studentId ? studentId : null,
        studentName: studentName.trim(),
        phone: phone.trim(),
        referrerName: referrerName.trim(),
        trainerId: isAdmin ? trainerId || null : currentUser.id,
        trainerName: isAdmin ? trainerName.trim() : currentUser.fullName,
        packageId: packageId || null,
        packageName: packageName.trim(),
        startDate: startDate || new Date().toISOString().split('T')[0],
        unitPrice: Math.max(0, Math.round(unitPrice)),
        durationMonths: Math.max(0.5, Number(durationMonths) || 1),
        totalAmount,
        discountPercent: normalizeDiscountTier(trainerDiscountTier, 50),
        discountedPrice: totalProductCost,
        trainerDiscountTier: normalizeDiscountTier(trainerDiscountTier, 50),
        referrerDiscountTier: normalizeDiscountTier(referrerDiscountTier, 50),
        trainerProductCost: Math.max(0, Math.round(trainerProductCost)),
        referrerProductCost: Math.max(0, Math.round(referrerProductCost)),
        paidAmount: Math.max(0, Math.round(paidAmount)),
        allocations: {
          trainer: Math.max(0, Math.round(allocations.trainer || 0)),
          referrer: Math.max(0, Math.round(allocations.referrer || 0)),
        },
        isManualAllocation,
        allocationBasis,
        notes: notes.trim(),
      },
      editingContract?.id
    );
    setIsSaving(false);

    if (res.success) {
      onClose();
    } else {
      setErrorMsg(res.error || 'Không thể lưu hợp đồng học phí vào cơ sở dữ liệu.');
    }
  };

  if (!open) return null;

  const displayTrainerName = isAdmin ? trainerName || 'Chưa chọn HLV dạy' : currentUser.fullName;
  const allocatedProfitSum = (allocations.trainer || 0) + (allocations.referrer || 0);
  const trainerSettlement = trainerProductCost + (allocations.trainer || 0);
  const referrerSettlement = referrerProductCost + (allocations.referrer || 0);
  const hasBom = (selectedPackage?.bomItems?.length || 0) > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-[2px] p-3 sm:p-5 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-4xl my-auto shadow-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              {editingContract ? 'Cập Nhật Hợp Đồng Học Phí' : 'Thêm Hợp Đồng Học Phí Mới'}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Tự động tính vốn sản phẩm Herbalife theo mức chiết khấu riêng của HLV dạy &amp; Người giới thiệu, sau đó chia lợi nhuận dư
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            aria-label="Đóng"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleFormSubmit} className="p-5 space-y-5 max-h-[84vh] overflow-y-auto">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs font-medium text-rose-800 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Student Source Switcher */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-700">Thông tin học viên &amp; HLV</span>
              <div className="inline-flex items-center p-1 bg-slate-100 rounded-lg border border-slate-200/80">
                <button
                  type="button"
                  onClick={() => setSourceMode('existing')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                    sourceMode === 'existing'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <UserCheck className="w-3.5 h-3.5" />
                  <span>Chọn từ hồ sơ sẵn có</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSourceMode('custom');
                    setStudentId('');
                  }}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                    sourceMode === 'custom'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>Nhập ngoài / Nhóm học viên</span>
                </button>
              </div>
            </div>

            {sourceMode === 'existing' && (
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Chọn học viên trong FitTrack Pro
                </label>
                <select
                  value={studentId}
                  onChange={(e) => handleSelectExistingStudent(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-600"
                >
                  <option value="">-- Chọn học viên để tự điền thông tin --</option>
                  {students.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.fullName} {s.phone ? `· ${s.phone}` : ''}{' '}
                      {s.trainerName ? `(${s.trainerName})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
              <div className="sm:col-span-3">
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Mã học viên <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={studentCode}
                  onChange={(e) => setStudentCode(e.target.value)}
                  placeholder="HV-001"
                  required
                  className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm font-mono tabular-nums text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-600"
                />
              </div>

              <div className="sm:col-span-5">
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Họ và tên / Tên nhóm <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={studentName}
                  onChange={(e) => setStudentName(e.target.value)}
                  placeholder="VD: Nguyễn Văn A hoặc ĐẠT, CHI, NGUYÊN"
                  required
                  className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-600"
                />
              </div>

              <div className="sm:col-span-4">
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Số điện thoại
                </label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="09xxxxxxxx"
                  className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm font-mono tabular-nums text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-600"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  HLV dạy (Phụ trách)
                </label>
                {isAdmin ? (
                  <select
                    value={trainerId}
                    onChange={(e) => handleTrainerChange(e.target.value)}
                    className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-600"
                  >
                    <option value="">-- Chọn HLV dạy --</option>
                    {trainers.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.fullName} (@{t.username} · CK {t.discountTier ?? 50}%)
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={currentUser.fullName}
                    disabled
                    className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-600"
                  />
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Người giới thiệu (HLV trong hệ thống)
                </label>
                <select
                  value={referrerName}
                  onChange={(e) => handleReferrerChange(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-600"
                >
                  <option value="">-- Không có người giới thiệu --</option>
                  {trainers.map((t) => (
                    <option key={t.id} value={t.fullName}>
                      {t.fullName} (@{t.username} · CK {t.discountTier ?? 50}%)
                    </option>
                  ))}
                  {referrerName && !trainers.some((t) => t.fullName === referrerName) && (
                    <option value={referrerName}>{referrerName} (Khác)</option>
                  )}
                </select>
              </div>
            </div>
          </div>

          <hr className="border-slate-200" />

          {/* Package & Payment */}
          <div className="space-y-3">
            <span className="text-xs font-semibold text-slate-700 block">
              Gói tập &amp; Thanh toán học phí
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
              <div className="sm:col-span-5">
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Gói tập <span className="text-rose-500">*</span>
                </label>
                <select
                  value={packageId}
                  onChange={(e) => handlePackageChange(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-600"
                >
                  <option value="">-- Chọn gói tập --</option>
                  {activePackages.map((pkg) => (
                    <option key={pkg.id} value={pkg.id}>
                      {pkg.name} ({formatVnd(pkg.monthlyPrice)}/tháng)
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-3">
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Ngày bắt đầu
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  required
                  className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm font-mono tabular-nums text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-600"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Đơn giá/Tháng
                </label>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={unitPrice}
                  onChange={(e) => setUnitPrice(Math.max(0, Number(e.target.value) || 0))}
                  className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm font-mono tabular-nums text-right text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-600"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Thời hạn (Tháng)
                </label>
                <input
                  type="number"
                  min={0.5}
                  step={0.5}
                  value={durationMonths}
                  onChange={(e) => setDurationMonths(Math.max(0.5, Number(e.target.value) || 1))}
                  className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm font-mono tabular-nums text-right text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-600"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 pt-1">
              <div className="sm:col-span-3 p-3 rounded-xl bg-slate-50 border border-slate-200 flex flex-col justify-between">
                <div className="text-xs text-slate-500">Tổng học phí</div>
                <div className="text-base font-bold font-mono tabular-nums text-slate-900 mt-1">
                  {formatVnd(totalAmount)}
                </div>
              </div>

              <div className="sm:col-span-6 p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-xs text-slate-700 font-semibold">Đã thanh toán (VNĐ)</label>
                  <span className="text-[11px] font-mono tabular-nums font-medium text-slate-500">
                    {totalAmount > 0 ? `${Math.min(999, Math.round((paidAmount / totalAmount) * 100))}%` : '0%'}
                  </span>
                </div>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={paidAmount}
                  onChange={(e) => {
                    setPaidPreset('custom');
                    setPaidAmount(Math.max(0, Number(e.target.value) || 0));
                  }}
                  className="w-full h-9 px-2.5 rounded-lg border border-slate-300 bg-white text-sm font-mono tabular-nums text-right font-semibold text-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-600"
                />
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    disabled={totalAmount <= 0}
                    onClick={() => {
                      setPaidPreset('100');
                      setPaidAmount(totalAmount);
                    }}
                    className={`flex-1 min-w-[140px] h-8 px-3 rounded-lg text-xs font-semibold border transition-colors inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                      totalAmount > 0 && paidAmount === totalAmount
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                        : 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100'
                    }`}
                  >
                    <Check className="w-3.5 h-3.5 shrink-0" />
                    <span className="whitespace-nowrap">Đóng đủ 100%</span>
                  </button>
                  <button
                    type="button"
                    disabled={totalAmount <= 0}
                    onClick={() => {
                      setPaidPreset('50');
                      setPaidAmount(Math.round(totalAmount / 2));
                    }}
                    className={`h-8 px-2.5 rounded-lg text-xs font-semibold font-mono tabular-nums border transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                      totalAmount > 0 && paidAmount === Math.round(totalAmount / 2)
                        ? 'bg-slate-800 text-white border-slate-800'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    50%
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPaidPreset('none');
                      setPaidAmount(0);
                    }}
                    className={`h-8 px-2.5 rounded-lg text-xs font-semibold font-mono tabular-nums border transition-colors cursor-pointer ${
                      paidAmount === 0
                        ? 'bg-slate-800 text-white border-slate-800'
                        : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    0%
                  </button>
                </div>
              </div>

              <div className="sm:col-span-3 p-3 rounded-xl bg-slate-50 border border-slate-200 flex flex-col justify-between">
                <div className="flex items-center justify-between text-xs gap-1">
                  <span className="text-slate-500">Còn nợ</span>
                  <span
                    className={`font-semibold whitespace-nowrap ${
                      status === 'completed'
                        ? 'text-emerald-700'
                        : status === 'partial'
                        ? 'text-amber-700'
                        : 'text-rose-700'
                    }`}
                  >
                    {getContractStatusLabel(status)}
                  </span>
                </div>
                <div
                  className={`text-base font-bold font-mono tabular-nums mt-1 ${
                    debtAmount > 0 ? 'text-amber-700' : 'text-emerald-700'
                  }`}
                >
                  {formatVnd(debtAmount)}
                </div>
              </div>
            </div>
          </div>

          <hr className="border-slate-200" />

          {/* Herbalife Product Cost Calculation (Dual Buyer Discount Tiers) */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="text-xs font-semibold text-slate-700">
                  Chi phí mua sản phẩm Herbalife (Theo mức chiết khấu từng bên)
                </span>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  {hasBom
                    ? distinctReferrer
                      ? 'Mỗi bên tự tính vốn sản phẩm theo bảng giá Herbalife 08/08/2026 (30 khẩu phần F1 = 30/22 hộp)'
                      : 'Không có người giới thiệu riêng — HLV dạy mua toàn bộ sản phẩm của gói'
                    : 'Gói tập này không kèm sản phẩm Herbalife (Vốn SP = 0 ₫)'}
                </div>
              </div>
              {isManualProductCost && (
                <button
                  type="button"
                  onClick={handleResetToAutoProductCosts}
                  className="h-8 px-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-emerald-700 inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Tính lại theo bảng giá Herbalife</span>
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Teaching Trainer Product Cost Card */}
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-slate-900">1. Phần SP của HLV dạy</div>
                    <div className="text-[11px] text-slate-500 truncate">{displayTrainerName}</div>
                  </div>
                  <span className="text-xs font-mono tabular-nums font-bold text-slate-700">
                    CK {trainerDiscountTier}%
                  </span>
                </div>

                <div className="flex flex-wrap gap-1">
                  {DISCOUNT_TIERS.map((tier) => (
                    <button
                      key={tier}
                      type="button"
                      onClick={() => {
                        setTrainerDiscountTier(tier);
                        setIsManualProductCost(false);
                      }}
                      className={`h-7 px-2.5 rounded-md text-[11px] font-semibold font-mono tabular-nums border transition-colors cursor-pointer ${
                        trainerDiscountTier === tier
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                      }`}
                    >
                      {tier}%
                    </button>
                  ))}
                </div>

                {autoBomResult.trainerItems.length > 0 ? (
                  <div className="space-y-1 pt-1 border-t border-slate-200/80 text-[11px]">
                    {autoBomResult.trainerItems.map((line, i) => (
                      <div
                        key={`${line.productId}-${i}`}
                        className="flex items-center justify-between gap-2 text-slate-600"
                      >
                        <span className="truncate">
                          {line.quantity} {line.portionUnitLabel} · {line.productName}
                        </span>
                        <span className="font-mono tabular-nums font-semibold text-slate-800 shrink-0">
                          {formatVnd(line.cost)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-[11px] text-slate-400 pt-1 border-t border-slate-200/80">
                    Không có sản phẩm gán cho HLV dạy
                  </div>
                )}

                <div className="pt-1">
                  <label className="block text-[11px] text-slate-500 mb-1">
                    Vốn SP HLV dạy bỏ ra (VNĐ)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={trainerProductCost}
                    onChange={(e) => {
                      setIsManualProductCost(true);
                      setTrainerProductCost(Math.max(0, Math.round(Number(e.target.value) || 0)));
                    }}
                    className="w-full h-9 px-2.5 rounded-lg border border-slate-300 bg-white text-sm font-mono tabular-nums text-right font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-600"
                  />
                </div>
              </div>

              {/* Referrer Product Cost Card */}
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-slate-900">
                      2. Phần SP của Người giới thiệu
                    </div>
                    <div className="text-[11px] text-slate-500 truncate">
                      {distinctReferrer ? referrerName : 'Không có người giới thiệu riêng'}
                    </div>
                  </div>
                  <span className="text-xs font-mono tabular-nums font-bold text-slate-700">
                    {distinctReferrer ? `CK ${referrerDiscountTier}%` : '—'}
                  </span>
                </div>

                <div className="flex flex-wrap gap-1">
                  {DISCOUNT_TIERS.map((tier) => (
                    <button
                      key={tier}
                      type="button"
                      disabled={!distinctReferrer}
                      onClick={() => {
                        setReferrerDiscountTier(tier);
                        setIsManualProductCost(false);
                      }}
                      className={`h-7 px-2.5 rounded-md text-[11px] font-semibold font-mono tabular-nums border transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                        referrerDiscountTier === tier && distinctReferrer
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                      }`}
                    >
                      {tier}%
                    </button>
                  ))}
                </div>

                {autoBomResult.referrerItems.length > 0 ? (
                  <div className="space-y-1 pt-1 border-t border-slate-200/80 text-[11px]">
                    {autoBomResult.referrerItems.map((line, i) => (
                      <div
                        key={`${line.productId}-${i}`}
                        className="flex items-center justify-between gap-2 text-slate-600"
                      >
                        <span className="truncate">
                          {line.quantity} {line.portionUnitLabel} · {line.productName}
                        </span>
                        <span className="font-mono tabular-nums font-semibold text-slate-800 shrink-0">
                          {formatVnd(line.cost)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-[11px] text-slate-400 pt-1 border-t border-slate-200/80">
                    {distinctReferrer
                      ? 'Gói này Người giới thiệu không cần mua sản phẩm'
                      : 'Chưa chọn Người giới thiệu riêng'}
                  </div>
                )}

                <div className="pt-1">
                  <label className="block text-[11px] text-slate-500 mb-1">
                    Vốn SP Người GT bỏ ra (VNĐ)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={referrerProductCost}
                    onChange={(e) => {
                      setIsManualProductCost(true);
                      setReferrerProductCost(Math.max(0, Math.round(Number(e.target.value) || 0)));
                    }}
                    className="w-full h-9 px-2.5 rounded-lg border border-slate-300 bg-white text-sm font-mono tabular-nums text-right font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-600"
                  />
                </div>
              </div>
            </div>

            {/* Profit Summary Strip */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 p-3 rounded-xl bg-slate-900 text-white text-xs">
              <div>
                <div className="text-[11px] text-slate-400">Tổng học phí thu khách</div>
                <div className="text-sm font-bold font-mono tabular-nums mt-0.5">
                  {formatVnd(totalAmount)}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-400">Tổng vốn mua SP (HLV + NGT)</div>
                <div className="text-sm font-bold font-mono tabular-nums text-amber-300 mt-0.5">
                  − {formatVnd(totalProductCost)}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-400">Lợi nhuận dư để chia</div>
                <div
                  className={`text-sm font-bold font-mono tabular-nums mt-0.5 ${
                    rawProfitAfterProducts >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  = {formatVnd(rawProfitAfterProducts)}
                </div>
              </div>
            </div>
          </div>

          <hr className="border-slate-200" />

          {/* Profit Split & Final Settlement Preview */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="text-xs font-semibold text-slate-700">
                  Chia lợi nhuận &amp; Quyết toán cuối cùng (Hoàn vốn SP + Lãi được chia)
                </span>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  {isManualAllocation
                    ? 'Đang nhập tay phần lợi nhuận chia'
                    : distinctReferrer && pkgSplits.referrer > 0
                    ? `Tự động chia lợi nhuận dư: ${pkgSplits.trainer}% HLV dạy / ${pkgSplits.referrer}% Người giới thiệu`
                    : !distinctReferrer
                    ? 'Không có Người giới thiệu riêng — 100% lợi nhuận về HLV dạy'
                    : 'Gói dưới 1tr5 — 100% lợi nhuận về HLV dạy'}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={allocationBasis}
                  onChange={(e) => {
                    const v = e.target.value;
                    setAllocationBasis(v === 'paid' ? 'paid' : v === 'total' ? 'total' : 'margin');
                  }}
                  className="h-8 px-2.5 rounded-lg border border-slate-200 bg-slate-50 text-xs font-medium text-slate-700 focus:outline-none focus:border-emerald-600"
                >
                  <option value="margin">Cơ sở chia: Lợi nhuận sau trừ SP</option>
                  <option value="total">Cơ sở chia: Tổng học phí</option>
                  <option value="paid">Cơ sở chia: Đã thanh toán</option>
                </select>

                {isManualAllocation && (
                  <button
                    type="button"
                    onClick={handleResetToAutoSplits}
                    className="h-8 px-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Áp dụng lại % gói</span>
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Teaching Trainer Profit + Settlement */}
              <div className="p-3.5 rounded-xl border border-slate-200 bg-white space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-900">Lãi HLV dạy (VNĐ)</span>
                  <span className="font-mono tabular-nums text-[11px] text-emerald-700 font-semibold">
                    {basisAmount > 0
                      ? formatPercent(((allocations.trainer || 0) / basisAmount) * 100)
                      : '0,0%'}
                  </span>
                </div>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={allocations.trainer || 0}
                  onChange={(e) => handleManualAllocationChange('trainer', e.target.value)}
                  className="w-full h-9 px-2.5 rounded-lg border border-slate-300 text-sm font-mono tabular-nums text-right font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-600"
                />
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                  <span className="text-slate-500">Tổng quyết toán HLV dạy</span>
                  <span className="font-mono tabular-nums font-bold text-emerald-700">
                    {formatVnd(trainerSettlement)}
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 font-mono tabular-nums">
                  Hoàn vốn {formatVnd(trainerProductCost)} + Lãi {formatVnd(allocations.trainer || 0)}
                </div>
              </div>

              {/* Referrer Profit + Settlement */}
              <div className="p-3.5 rounded-xl border border-slate-200 bg-white space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-900">Lãi Người giới thiệu (VNĐ)</span>
                  <span className="font-mono tabular-nums text-[11px] text-emerald-700 font-semibold">
                    {basisAmount > 0
                      ? formatPercent(((allocations.referrer || 0) / basisAmount) * 100)
                      : '0,0%'}
                  </span>
                </div>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={allocations.referrer || 0}
                  onChange={(e) => handleManualAllocationChange('referrer', e.target.value)}
                  className="w-full h-9 px-2.5 rounded-lg border border-slate-300 text-sm font-mono tabular-nums text-right font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-600"
                />
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                  <span className="text-slate-500">Tổng quyết toán Người GT</span>
                  <span className="font-mono tabular-nums font-bold text-slate-900">
                    {formatVnd(referrerSettlement)}
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 font-mono tabular-nums">
                  Hoàn vốn {formatVnd(referrerProductCost)} + Lãi {formatVnd(allocations.referrer || 0)}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-500 px-1 gap-2">
              <span>
                Tổng quyết toán 2 bên:{' '}
                <strong className="font-mono tabular-nums text-slate-800">
                  {formatVnd(trainerSettlement + referrerSettlement)}
                </strong>
                {' · '}Tổng lãi chia:{' '}
                <strong className="font-mono tabular-nums text-emerald-700">
                  {formatVnd(allocatedProfitSum)}
                </strong>
              </span>
              {rawProfitAfterProducts < 0 && (
                <span className="text-rose-700 font-medium inline-flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span>Cảnh báo: Tiền mua sản phẩm đang cao hơn Tổng học phí</span>
                </span>
              )}
              {rawProfitAfterProducts >= 0 && allocatedProfitSum > basisAmount && (
                <span className="text-amber-700 font-medium inline-flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span>Tổng lãi chia đang vượt quá Lợi nhuận dư</span>
                </span>
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Ghi chú hợp đồng</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ghi chú chuyển khoản, lịch đóng đợt 2, ưu đãi..."
              className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-600"
            />
          </div>

          {/* Footer Buttons */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="h-10 px-4 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 transition-colors cursor-pointer"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="h-10 px-5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
            >
              <Check className="w-4 h-4" />
              <span>
                {isSaving
                  ? 'Đang lưu...'
                  : editingContract
                  ? 'Lưu Thay Đổi'
                  : 'Tạo Hợp Đồng'}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
