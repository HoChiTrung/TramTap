/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { StudentProfile, Gender } from '../../types/health';
import { HerbalifeProduct, TuitionPackage } from '../../types/tuition';
import { useHealth } from '../../context/HealthContext';
import { calculateCalorieGoalBreakdown } from '../../utils/healthCalculations';
import { formatVnd, getPackageMealPortions } from '../../utils/tuitionCalculations';
import { apiUrl } from '../../utils/api';
import { X, UserPlus, Target, Flame, UserCheck, Utensils, Layers, Info } from 'lucide-react';

interface AddStudentModalProps {
  initialStudent?: StudentProfile;
  onClose: () => void;
}

export const AddStudentModal: React.FC<AddStudentModalProps> = ({
  initialStudent,
  onClose,
}) => {
  const {
    addStudent,
    updateStudent,
    getStudentMetrics,
    currentUser,
    isAdmin,
    trainers,
    users,
  } = useHealth();
  const studentMetrics = initialStudent ? getStudentMetrics(initialStudent.id) : [];
  const latestMetric = studentMetrics[studentMetrics.length - 1];

  const [fullName, setFullName] = useState(initialStudent?.fullName || '');
  const [gender, setGender] = useState<Gender>(initialStudent?.gender || 'Nam');
  const [age, setAge] = useState(initialStudent ? String(initialStudent.age) : '25');
  const [height, setHeight] = useState(initialStudent ? String(initialStudent.height) : '1.70');
  const [phone, setPhone] = useState(initialStudent?.phone || '');
  const [healthGoal, setHealthGoal] = useState(initialStudent?.healthGoal || '');
  const [selectedTrainerId, setSelectedTrainerId] = useState(
    initialStudent?.trainerId || currentUser?.id || ''
  );

  // Training Package Catalog (fetched from existing tuition packages)
  const [packages, setPackages] = useState<TuitionPackage[]>([]);
  const [products, setProducts] = useState<HerbalifeProduct[]>([]);
  const [isLoadingPackages, setIsLoadingPackages] = useState(false);
  const [trainingPackageId, setTrainingPackageId] = useState(
    initialStudent?.targetMetrics?.trainingPackageId || ''
  );
  const [trainingPackageName, setTrainingPackageName] = useState(
    initialStudent?.targetMetrics?.trainingPackageName || ''
  );

  // Meal Ticket Portions Package (0, 30, 60 khẩu phần or custom; auto-selected from training package)
  const [totalMealPortions, setTotalMealPortions] = useState(
    initialStudent?.targetMetrics?.totalMealPortions !== undefined
      ? String(initialStudent.targetMetrics.totalMealPortions)
      : '60'
  );

  useEffect(() => {
    let active = true;
    setIsLoadingPackages(true);
    fetch(apiUrl('/api/tuition/packages'))
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!active || !data) return;
        if (Array.isArray(data.packages)) setPackages(data.packages);
        if (Array.isArray(data.products)) setProducts(data.products);
      })
      .catch(() => null)
      .finally(() => {
        if (active) setIsLoadingPackages(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const availablePackages = useMemo(
    () =>
      [...packages]
        .filter((p) => p.isActive || p.id === trainingPackageId)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [packages, trainingPackageId]
  );

  const selectedPackage = useMemo(
    () => packages.find((p) => p.id === trainingPackageId) || null,
    [packages, trainingPackageId]
  );

  const parsedPortionsPreview = parseInt(totalMealPortions, 10);
  const isTrainingOnly = !Number.isNaN(parsedPortionsPreview) && parsedPortionsPreview === 0;

  const existingStudentAccount = useMemo(
    () => (initialStudent ? users.find((u) => u.studentId === initialStudent.id) : undefined),
    [initialStudent, users]
  );

  // Chỉ khởi tạo tài khoản đăng nhập khi học viên dùng gói có phiếu bữa ăn (và chưa có tài khoản)
  const shouldSetupAccount = !isTrainingOnly && (!initialStudent || !existingStudentAccount);

  const handleTrainingPackageChange = (newPkgId: string) => {
    setTrainingPackageId(newPkgId);
    if (!newPkgId) {
      setTrainingPackageName('');
      return;
    }
    const matched = packages.find((p) => p.id === newPkgId);
    if (matched) {
      setTrainingPackageName(matched.name);
      const autoPortions = getPackageMealPortions(matched, products);
      setTotalMealPortions(String(autoPortions));
    }
  };

  // Targets
  const [targetWeight, setTargetWeight] = useState(
    initialStudent?.targetMetrics?.targetWeight ? String(initialStudent.targetMetrics.targetWeight) : ''
  );
  const [targetDurationWeeks, setTargetDurationWeeks] = useState(
    initialStudent?.targetMetrics?.targetDurationWeeks
      ? String(initialStudent.targetMetrics.targetDurationWeeks)
      : '8'
  );
  const [targetVisceralFat, setTargetVisceralFat] = useState(
    initialStudent?.targetMetrics?.targetVisceralFat !== undefined
      ? String(initialStudent.targetMetrics.targetVisceralFat)
      : ''
  );
  const [targetMuscleMass, setTargetMuscleMass] = useState(
    initialStudent?.targetMetrics?.targetMuscleMass ? String(initialStudent.targetMetrics.targetMuscleMass) : ''
  );
  const [targetWaist, setTargetWaist] = useState(
    initialStudent?.targetMetrics?.targetWaist ? String(initialStudent.targetMetrics.targetWaist) : ''
  );

  // Login Credentials for the Student
  const [initialUsername, setInitialUsername] = useState('');
  const [initialPassword, setInitialPassword] = useState('123');

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validatePhone = (p: string) => {
    const cleaned = p.replace(/[\s.-]+/g, '');
    return cleaned.length >= 6 && cleaned.length <= 15;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: Record<string, string> = {};

    if (!fullName.trim() || fullName.length > 100) {
      newErrors.fullName = 'Họ và tên tối đa 100 ký tự và không được để trống';
    }

    const ageNum = parseInt(age, 10);
    if (isNaN(ageNum) || ageNum < 1 || ageNum > 120) {
      newErrors.age = 'Tuổi phải từ 1 đến 120';
    }

    const heightNum = parseFloat(height.replace(',', '.'));
    if (isNaN(heightNum) || heightNum < 0.5 || heightNum > 2.5) {
      newErrors.height = 'Chiều cao phải từ 0.50m đến 2.50m (Ví dụ: 1.70)';
    }

    if (!validatePhone(phone)) {
      newErrors.phone = 'Vui lòng nhập số điện thoại hợp lệ (từ 6 đến 15 số)';
    }

    const parsedPortions = parseInt(totalMealPortions, 10);
    if (isNaN(parsedPortions) || parsedPortions < 0 || parsedPortions > 360) {
      newErrors.totalMealPortions = 'Số khẩu phần ăn phải từ 0 đến 360 (0 nếu chỉ tập luyện, thường là 30 hoặc 60)';
    }

    const isTrainingOnlySubmit = parsedPortions === 0;
    const finalGoal =
      healthGoal.trim() ||
      (isTrainingOnlySubmit
        ? 'Tập luyện nâng cao sức khỏe'
        : 'Cân đối vóc dáng, giảm mỡ nội tạng và cải thiện sức khỏe toàn diện');

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    const targetMetrics = isTrainingOnlySubmit
      ? {
          totalMealPortions: 0,
          trainingPackageId: trainingPackageId || undefined,
          trainingPackageName: (selectedPackage?.name || trainingPackageName).trim() || undefined,
        }
      : {
          targetWeight: targetWeight ? parseFloat(targetWeight) : undefined,
          targetDurationWeeks: targetDurationWeeks
            ? Math.max(1, parseInt(targetDurationWeeks, 10))
            : 8,
          targetVisceralFat: targetVisceralFat ? parseInt(targetVisceralFat, 10) : undefined,
          targetMuscleMass: targetMuscleMass ? parseFloat(targetMuscleMass) : undefined,
          targetWaist: targetWaist ? parseFloat(targetWaist) : undefined,
          totalMealPortions: parsedPortions,
          trainingPackageId: trainingPackageId || undefined,
          trainingPackageName: (selectedPackage?.name || trainingPackageName).trim() || undefined,
        };

    const resolvedDob =
      initialStudent?.dateOfBirth || `${new Date().getFullYear() - ageNum}-01-01`;

    const assignedTrainer = trainers.find((t) => t.id === selectedTrainerId);
    const resolvedTrainerId = assignedTrainer
      ? assignedTrainer.id
      : currentUser?.id || '';
    const resolvedTrainerName = assignedTrainer
      ? assignedTrainer.fullName
      : currentUser?.fullName || '';

    try {
      setIsSubmitting(true);
      if (initialStudent) {
        const shouldCreateAccountOnUpgrade = !isTrainingOnlySubmit && !existingStudentAccount;
        await updateStudent(
          {
            ...initialStudent,
            fullName: fullName.trim(),
            gender,
            age: ageNum,
            height: heightNum,
            phone: phone.trim(),
            address: '',
            dateOfBirth: resolvedDob,
            healthGoal: finalGoal,
            targetMetrics,
            avatarUrl: '',
            trainerId: resolvedTrainerId,
            trainerName: resolvedTrainerName,
          },
          shouldCreateAccountOnUpgrade
            ? {
                createAccount: true,
                initialUsername: initialUsername.trim() || phone.trim(),
                initialPassword: initialPassword.trim() || '123',
              }
            : undefined
        );
      } else {
        await addStudent({
          fullName: fullName.trim(),
          gender,
          age: ageNum,
          height: heightNum,
          phone: phone.trim(),
          dateOfBirth: resolvedDob,
          healthGoal: finalGoal,
          targetMetrics,
          trainerId: resolvedTrainerId,
          trainerName: resolvedTrainerName,
          createAccount: !isTrainingOnlySubmit,
          ...(isTrainingOnlySubmit
            ? {}
            : {
                initialUsername: initialUsername.trim() || phone.trim(),
                initialPassword: initialPassword.trim() || '123',
              }),
        });
      }
      onClose();
    } catch (err: any) {
      setErrors({ submit: err?.message || 'Không thể lưu học viên. Vui lòng thử lại.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-slate-900/60 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full min-w-0 p-4 sm:p-6 my-2 sm:my-8 max-h-[calc(100dvh-1.5rem)] sm:max-h-[90vh] overflow-y-auto overflow-x-hidden animate-in fade-in zoom-in-95 duration-150 border border-slate-100">
        <div className="flex items-start sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
          <div className="flex items-center space-x-2 min-w-0">
            <UserPlus className="w-5 h-5 text-emerald-600 shrink-0" />
            <h3 className="font-bold text-slate-900 text-sm sm:text-base break-words">
              {initialStudent ? 'Chỉnh Sửa Hồ Sơ Học Viên' : 'Tạo Hồ Sơ & Tài Khoản Học Viên Mới'}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 shrink-0 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4 text-xs">
          {/* Full Name & Gender */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="block font-semibold text-slate-700 mb-1">
                Họ và tên * <span className="text-slate-400 font-normal">(Tối đa 100 ký tự)</span>
              </label>
              <input
                type="text"
                required
                placeholder="Nguyễn Văn A"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className={`w-full px-3 py-2 border rounded-xl focus:ring-2 focus:ring-emerald-500 outline-hidden font-medium ${
                  errors.fullName ? 'border-rose-400 bg-rose-50' : 'border-slate-200'
                }`}
              />
              {errors.fullName && <p className="text-rose-500 text-[10px] mt-0.5">{errors.fullName}</p>}
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Giới tính *</label>
              <select
                value={gender}
                onChange={(e: any) => setGender(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-hidden font-medium"
              >
                <option value="Nam">Nam</option>
                <option value="Nữ">Nữ</option>
                <option value="Khác">Khác</option>
              </select>
            </div>
          </div>

          {/* Age & Height */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Tuổi * [1 - 120]</label>
              <input
                type="number"
                min={1}
                max={120}
                required
                value={age}
                onChange={(e) => setAge(e.target.value)}
                className={`w-full px-3 py-2 border rounded-xl focus:ring-2 focus:ring-emerald-500 outline-hidden font-medium ${
                  errors.age ? 'border-rose-400 bg-rose-50' : 'border-slate-200'
                }`}
              />
              {errors.age && <p className="text-rose-500 text-[10px] mt-0.5">{errors.age}</p>}
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Chiều cao (mét) *</label>
              <input
                type="number"
                step="0.01"
                required
                placeholder="1.72"
                value={height}
                onChange={(e) => setHeight(e.target.value)}
                className={`w-full px-3 py-2 border rounded-xl focus:ring-2 focus:ring-emerald-500 outline-hidden font-medium ${
                  errors.height ? 'border-rose-400 bg-rose-50' : 'border-slate-200'
                }`}
              />
              {errors.height && <p className="text-rose-500 text-[10px] mt-0.5">{errors.height}</p>}
            </div>
          </div>

          {/* Phone & Managing Trainer */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Số điện thoại * <span className="text-slate-400 font-normal">(Regex VN)</span>
              </label>
              <input
                type="tel"
                required
                placeholder="0912345678"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className={`w-full px-3 py-2 border rounded-xl focus:ring-2 focus:ring-emerald-500 outline-hidden font-mono ${
                  errors.phone ? 'border-rose-400 bg-rose-50' : 'border-slate-200'
                }`}
              />
              {errors.phone && <p className="text-rose-500 text-[10px] mt-0.5">{errors.phone}</p>}
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1 flex items-center gap-1">
                <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span>Huấn Luyện Viên phụ trách</span>
              </label>
              {isAdmin ? (
                <select
                  value={selectedTrainerId}
                  onChange={(e) => setSelectedTrainerId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-hidden font-semibold text-slate-800"
                >
                  {trainers.map((tr) => (
                    <option key={tr.id} value={tr.id}>
                      {tr.fullName} (@{tr.username})
                    </option>
                  ))}
                </select>
              ) : (
                <div className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-emerald-800 truncate">
                  {currentUser?.fullName || currentUser?.username}
                </div>
              )}
            </div>
          </div>

          {/* Training Package Selection -> Auto-selects Meal Ticket Portions */}
          <div className="p-3.5 bg-emerald-50/70 rounded-xl border border-emerald-200 space-y-3">
            {/* Step 1: Training Package */}
            <div className="space-y-1.5">
              <label className="flex items-center space-x-1.5 font-bold text-emerald-950 text-xs">
                <Layers className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Gói luyện tập</span>
                <span className="text-[11px] font-normal text-slate-500">
                  (Tự động chọn gói phiếu bữa ăn tương ứng)
                </span>
              </label>
              <select
                value={trainingPackageId}
                onChange={(e) => handleTrainingPackageChange(e.target.value)}
                disabled={isLoadingPackages}
                className="w-full px-3 py-2 bg-white border border-emerald-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-hidden font-semibold text-slate-800 text-xs"
              >
                <option value="">
                  {isLoadingPackages
                    ? 'Đang tải danh sách gói luyện tập...'
                    : '-- Chọn gói luyện tập hiện có --'}
                </option>
                {availablePackages.map((pkg) => {
                  const pkgPortions = getPackageMealPortions(pkg, products);
                  return (
                    <option key={pkg.id} value={pkg.id}>
                      {pkg.name} ({formatVnd(pkg.monthlyPrice)}/tháng ·{' '}
                      {pkgPortions === 0
                        ? 'Không kèm phiếu ăn'
                        : `${pkgPortions} khẩu phần`}
                      )
                    </option>
                  );
                })}
              </select>
            </div>

            {/* Step 2: Meal Ticket Portions Package (auto-selected from Training Package) */}
            <div className="pt-2.5 border-t border-emerald-200/70 space-y-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                <div className="flex items-center space-x-1.5 font-bold text-emerald-950 text-xs">
                  <Utensils className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Gói Phiếu Ăn Đăng Ký (Số Khẩu Phần) *</span>
                </div>
                {selectedPackage && (
                  <span className="text-[10.5px] font-bold text-emerald-800 bg-white/90 border border-emerald-200 px-2 py-0.5 rounded-lg self-start sm:self-auto">
                    Tự chọn theo {selectedPackage.name}:{' '}
                    {getPackageMealPortions(selectedPackage, products) === 0
                      ? 'Không kèm phiếu ăn (0 phần)'
                      : `${getPackageMealPortions(selectedPackage, products)} khẩu phần`}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <button
                  type="button"
                  onClick={() => setTotalMealPortions('0')}
                  className={`py-2 px-2.5 rounded-xl font-bold text-xs border transition-all cursor-pointer flex items-center justify-center ${
                    totalMealPortions === '0'
                      ? 'bg-slate-800 text-white border-slate-800 shadow-xs'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <span>0 phần (Chỉ tập)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setTotalMealPortions('30')}
                  className={`py-2 px-2.5 rounded-xl font-bold text-xs border transition-all cursor-pointer flex items-center justify-center ${
                    totalMealPortions === '30'
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-emerald-50'
                  }`}
                >
                  <span>Phiếu 30 Phần</span>
                </button>

                <button
                  type="button"
                  onClick={() => setTotalMealPortions('60')}
                  className={`py-2 px-2.5 rounded-xl font-bold text-xs border transition-all cursor-pointer flex items-center justify-center ${
                    totalMealPortions === '60'
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-emerald-50'
                  }`}
                >
                  <span>Phiếu 60 Phần</span>
                </button>

                <div className="flex items-center bg-white border border-slate-200 rounded-xl px-2.5 py-1">
                  <span className="text-[11px] text-slate-500 font-semibold mr-1.5 whitespace-nowrap">
                    Số phần:
                  </span>
                  <input
                    type="number"
                    min="0"
                    max="360"
                    required
                    value={totalMealPortions}
                    onChange={(e) => setTotalMealPortions(e.target.value)}
                    className="w-full text-right font-extrabold text-emerald-800 outline-hidden text-xs"
                  />
                </div>
              </div>
              {errors.totalMealPortions && (
                <p className="text-rose-500 text-[10px]">{errors.totalMealPortions}</p>
              )}
            </div>
          </div>

          {/* Health Goal */}
          <div>
            <label className="block font-semibold text-slate-700 mb-1">
              Mục tiêu sức khỏe <span className="text-slate-400 font-normal">(Baseline Target - Tối đa 500 ký tự)</span>
            </label>
            <textarea
              rows={2}
              placeholder="Ví dụ: Giảm 5kg mỡ, hạ mỡ nội tạng từ cấp 10 xuống cấp 6, siết cơ bụng..."
              value={healthGoal}
              onChange={(e) => setHealthGoal(e.target.value)}
              className={`w-full px-3 py-2 border rounded-xl focus:ring-2 focus:ring-emerald-500 outline-hidden font-medium ${
                errors.healthGoal ? 'border-rose-400 bg-rose-50' : 'border-slate-200'
              }`}
            />
            {errors.healthGoal && (
              <p className="text-rose-500 text-[10px] mt-0.5">{errors.healthGoal}</p>
            )}
          </div>

          {/* Notice when Training-Only Package (no meal tickets) is selected */}
          {isTrainingOnly && (
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 flex items-start gap-2.5 text-[11px] text-slate-600 leading-relaxed">
              <Info className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
              <div>
                <div className="font-bold text-slate-800">
                  Hồ sơ học viên gói chỉ tập luyện (không kèm phiếu bữa ăn)
                </div>
                <p className="mt-0.5">
                  Chưa cần nhập <strong>Chỉ Số Mục Tiêu / AI Tính Calo</strong> và chưa khởi tạo{' '}
                  <strong>Tài khoản đăng nhập</strong>. Sau này khi học viên nâng cấp lên gói kèm phiếu bữa ăn, bạn chỉ cần mở <strong>Sửa Hồ Sơ</strong> để đổi gói, nhập chỉ số mục tiêu và cấp tài khoản.
                </p>
              </div>
            </div>
          )}

          {/* Target Metrics for Gap Analysis & AI Calorie Calculation (Hidden for training-only packages) */}
          {!isTrainingOnly && (
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80 space-y-3">
              <div>
                <div className="flex items-center space-x-1.5 font-bold text-slate-800 text-xs">
                  <Target className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Chỉ Số Mục Tiêu & Cơ Sở AI Tính Calo Mỗi Ngày</span>
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  AI tính dựa trên 4 yếu tố: <strong className="text-slate-700">Cân nặng hiện tại</strong>,{' '}
                  <strong className="text-slate-700">Thời gian mong muốn</strong>,{' '}
                  <strong className="text-slate-700">Cân nặng mong muốn</strong> và{' '}
                  <strong className="text-slate-700">Mức mỡ nội tạng</strong>.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="px-2.5 py-1.5 bg-white rounded-lg border border-slate-200 flex items-center justify-between">
                  <span className="text-[11px] text-slate-500 font-medium">Cân nặng hiện tại</span>
                  <span className="text-xs font-bold text-slate-900">
                    {latestMetric ? `${latestMetric.weight} kg` : 'Theo lần đo mới nhất'}
                  </span>
                </div>
                <div className="px-2.5 py-1.5 bg-white rounded-lg border border-slate-200 flex items-center justify-between">
                  <span className="text-[11px] text-slate-500 font-medium">Mức mỡ nội tạng</span>
                  <span className="text-xs font-bold text-slate-900">
                    {latestMetric ? `Cấp ${latestMetric.visceralFat}` : 'Theo lần đo mới nhất'}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div>
                  <label className="text-[11px] text-slate-600 font-medium">Cân nặng mong muốn (kg)</label>
                  <input
                    type="number"
                    step="0.1"
                    placeholder="65.0"
                    value={targetWeight}
                    onChange={(e) => setTargetWeight(e.target.value)}
                    className="w-full mt-1 px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs"
                  />
                </div>

                <div>
                  <label className="text-[11px] text-slate-600 font-medium">Thời gian mong muốn (Tuần)</label>
                  <input
                    type="number"
                    min="1"
                    max="52"
                    placeholder="8"
                    value={targetDurationWeeks}
                    onChange={(e) => setTargetDurationWeeks(e.target.value)}
                    className="w-full mt-1 px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-emerald-800"
                  />
                </div>

                <div>
                  <label className="text-[11px] text-slate-600 font-medium">Mức mỡ nội tạng mục tiêu</label>
                  <input
                    type="number"
                    min="1"
                    max="30"
                    placeholder="5"
                    value={targetVisceralFat}
                    onChange={(e) => setTargetVisceralFat(e.target.value)}
                    className="w-full mt-1 px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs"
                  />
                </div>

                <div>
                  <label className="text-[11px] text-slate-600 font-medium">Mục tiêu Cơ bắp (kg)</label>
                  <input
                    type="number"
                    step="0.1"
                    placeholder="38.0"
                    value={targetMuscleMass}
                    onChange={(e) => setTargetMuscleMass(e.target.value)}
                    className="w-full mt-1 px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs"
                  />
                </div>
              </div>

              {latestMetric && initialStudent ? (() => {
                const previewPlan = calculateCalorieGoalBreakdown(
                  latestMetric.bmr,
                  latestMetric.weight,
                  {
                    ...initialStudent,
                    healthGoal: healthGoal.trim() || initialStudent.healthGoal,
                    targetMetrics: {
                      ...initialStudent.targetMetrics,
                      targetWeight: targetWeight ? parseFloat(targetWeight) : undefined,
                      targetDurationWeeks: targetDurationWeeks
                        ? Math.max(1, parseInt(targetDurationWeeks, 10))
                        : 8,
                      targetVisceralFat: targetVisceralFat
                        ? parseInt(targetVisceralFat, 10)
                        : undefined,
                    },
                  },
                  1.375,
                  latestMetric.visceralFat
                );
                return (
                  <div className="p-2.5 rounded-lg bg-orange-50/90 border border-orange-200 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                    <span className="flex items-center font-bold text-orange-950">
                      <Flame className="w-3.5 h-3.5 mr-1 text-orange-600 shrink-0" />
                      {previewPlan.label}:
                    </span>
                    <span className="font-black text-orange-700">
                      {previewPlan.mode === 'weight_loss'
                        ? '≤ '
                        : previewPlan.mode === 'weight_gain'
                        ? '≥ '
                        : ''}
                      {previewPlan.targetDailyCalories} Kcal/ngày
                    </span>
                  </div>
                );
              })() : (
                <div className="text-[10.5px] text-slate-500 bg-white/80 px-2.5 py-1.5 rounded-lg border border-slate-200/70">
                  Sau khi nhập lần cân đo đầu tiên (có Cân nặng hiện tại &amp; Mức mỡ nội tạng), AI sẽ tự động tính mức Calo nạp mỗi ngày.
                </div>
              )}
            </div>
          )}

          {/* Student Login Account Setup (For meal-ticket packages, on create OR when upgrading a training-only profile) */}
          {shouldSetupAccount && (
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200">
              <div className="font-bold text-slate-900 text-xs mb-1.5 flex items-center">
                <span>
                  {initialStudent
                    ? 'Cấp Tài Khoản Đăng Nhập Khi Chuyển Đổi Gói (Lưu Database)'
                    : 'Khởi Tạo Tài Khoản Đăng Nhập Cho Học Viên (Lưu Database)'}
                </span>
              </div>
              <p className="text-[10px] text-slate-500 mb-2.5">
                Cung cấp thông tin đăng nhập để học viên có thể vào Cổng Học Viên theo dõi tiến trình
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Tên đăng nhập (Username)
                  </label>
                  <input
                    type="text"
                    placeholder="Để trống sẽ dùng số điện thoại"
                    value={initialUsername}
                    onChange={(e) => setInitialUsername(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Mật khẩu khởi tạo
                  </label>
                  <input
                    type="text"
                    value={initialPassword}
                    onChange={(e) => setInitialPassword(e.target.value)}
                    placeholder="Mặc định: 123"
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono"
                  />
                </div>
              </div>
            </div>
          )}

          {Object.keys(errors).length > 0 && (
            <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
              {Object.values(errors)[0]}
            </div>
          )}

          {/* Form Actions */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 sm:flex-initial px-4 py-2 border border-slate-200 rounded-xl font-semibold text-slate-600 hover:bg-slate-50 transition-colors cursor-pointer"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 sm:flex-initial px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold transition-colors shadow-xs cursor-pointer disabled:opacity-50 whitespace-nowrap"
            >
              {isSubmitting
                ? 'Đang lưu...'
                : initialStudent
                ? shouldSetupAccount
                  ? 'Lưu & Cấp Tài Khoản'
                  : 'Lưu Thay Đổi'
                : isTrainingOnly
                ? 'Lưu Hồ Sơ Tập Luyện'
                : 'Tạo Học Viên'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
