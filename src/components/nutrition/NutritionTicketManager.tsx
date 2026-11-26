/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useRef } from 'react';
import { StudentProfile, PortionStatus, MealLog } from '../../types/health';
import { useHealth } from '../../context/HealthContext';
import {
  Utensils,
  Calendar,
  Sun,
  Sunset,
  Package,
  Scale,
  RotateCcw,
  Users,
  Check,
  XCircle,
  Sparkles,
  Search,
  CheckSquare,
  Square,
  Layers,
  Eye,
  X,
} from 'lucide-react';

interface NutritionTicketManagerProps {
  mode: 'trainer' | 'student';
  focusedStudent?: StudentProfile | null;
  defaultView?: 'batch' | 'card';
}

interface ParsedDaySlot {
  dayNumber: number; // 1..30
  date: string;
  morningStatus: PortionStatus;
  afternoonStatus: PortionStatus;
  attendanceStatus?: 'ate' | 'takeaway' | 'weighed_no_meal';
  note: string;
  rawLog?: MealLog;
}

function buildStudent30DaySlots(studentMeals: MealLog[]): ParsedDaySlot[] {
  const byDay = new Map<number, MealLog>();
  const unassigned: MealLog[] = [];

  const sorted = [...studentMeals].sort((a, b) => a.date.localeCompare(b.date));

  for (const m of sorted) {
    const dNum = m.macros?.dayNumber;
    if (typeof dNum === 'number' && dNum >= 1 && dNum <= 30) {
      byDay.set(dNum, m);
    } else {
      unassigned.push(m);
    }
  }

  let nextFree = 1;
  for (const m of unassigned) {
    while (byDay.has(nextFree) && nextFree <= 30) {
      nextFree++;
    }
    if (nextFree <= 30) {
      byDay.set(nextFree, m);
      nextFree++;
    }
  }

  const slots: ParsedDaySlot[] = [];
  for (let i = 1; i <= 30; i++) {
    const log = byDay.get(i);
    if (log) {
      const morningStatus: PortionStatus =
        (log.macros?.morningStatus as PortionStatus) ||
        (log.mealType === 'Bữa sáng' ? 'used' : 'none');
      const afternoonStatus: PortionStatus =
        (log.macros?.afternoonStatus as PortionStatus) ||
        (log.mealType === 'Bữa trưa' || log.mealType === 'Bữa tối' ? 'used' : 'none');
      const attendanceStatus = log.macros?.attendanceStatus;
      const note = log.trainerComment || log.foodDescription || '';
      slots.push({
        dayNumber: i,
        date: log.date || '',
        morningStatus,
        afternoonStatus,
        attendanceStatus,
        note,
        rawLog: log,
      });
    } else {
      slots.push({
        dayNumber: i,
        date: '',
        morningStatus: 'none',
        afternoonStatus: 'none',
        note: '',
      });
    }
  }
  return slots;
}

function getStudentCardStats(slots: ParsedDaySlot[], totalPortions = 60) {
  let usedPortions = 0;
  let dineInPortions = 0;
  let takeawayPortions = 0;
  let activeDays = 0;
  let weighedNoMealDays = 0;

  for (const s of slots) {
    const mUsed = s.morningStatus === 'used' || s.morningStatus === 'takeaway';
    const aUsed = s.afternoonStatus === 'used' || s.afternoonStatus === 'takeaway';
    if (s.morningStatus === 'used') dineInPortions++;
    if (s.morningStatus === 'takeaway') takeawayPortions++;
    if (s.afternoonStatus === 'used') dineInPortions++;
    if (s.afternoonStatus === 'takeaway') takeawayPortions++;

    if (mUsed) usedPortions++;
    if (aUsed) usedPortions++;

    if (mUsed || aUsed) {
      activeDays++;
    } else if (s.attendanceStatus === 'weighed_no_meal') {
      weighedNoMealDays++;
    }
  }

  return {
    totalPortions,
    usedPortions,
    remainingPortions: Math.max(0, totalPortions - usedPortions),
    dineInPortions,
    takeawayPortions,
    activeDays,
    weighedNoMealDays,
  };
}

function cyclePortionStatus(current: PortionStatus): PortionStatus {
  if (current === 'none') return 'used';
  if (current === 'used') return 'takeaway';
  return 'none';
}

function formatShortDate(isoDate: string): string {
  if (!isoDate) return '';
  const parts = isoDate.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}`;
  }
  return isoDate;
}

export const NutritionTicketManager: React.FC<NutritionTicketManagerProps> = ({
  mode,
  focusedStudent,
  defaultView = 'card',
}) => {
  const {
    students,
    selectedStudent,
    setSelectedStudent,
    metrics,
    meals,
    upsertMealTicket,
    resetStudentMealTickets,
    updateStudent,
  } = useHealth();

  const todayIso = useMemo(() => new Date().toISOString().split('T')[0], []);
  const [selectedDate, setSelectedDate] = useState<string>(todayIso);

  // Filter & Search state for Multi-Student Batch Marking
  const [studentFilter, setStudentFilter] = useState<'ALL' | 'WEIGHED_ON_DATE' | 'UNMARKED_ON_DATE'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [isBatchProcessing, setIsBatchProcessing] = useState(false);
  const [batchFeedback, setBatchFeedback] = useState<string | null>(null);

  const [confirmResetStudentId, setConfirmResetStudentId] = useState<string | null>(null);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [inspectCardStudent, setInspectCardStudent] = useState<StudentProfile | null>(null);
  const [dayRangeFilter, setDayRangeFilter] = useState<'COMPACT' | '1-10' | '11-20' | '21-30' | 'ALL'>('COMPACT');
  const cardSectionRef = useRef<HTMLDivElement | null>(null);

  // Only students with a meal-ticket package (> 0 portions) appear in bulk meal-ticket marking
  const mealTicketStudents = useMemo(
    () => students.filter((s) => (s.targetMetrics?.totalMealPortions ?? 60) > 0),
    [students]
  );

  const mealTicketStudentIdSet = useMemo(
    () => new Set(mealTicketStudents.map((s) => s.id)),
    [mealTicketStudents]
  );

  const trainingOnlyStudentCount = students.length - mealTicketStudents.length;

  const activeCardStudent =
    inspectCardStudent || focusedStudent || selectedStudent || mealTicketStudents[0] || students[0] || null;

  // Available dates where metrics were recorded for meal-ticket students (only 3 most recent up to today)
  const metricDates = useMemo(() => {
    const set = new Set<string>();
    for (const m of metrics) {
      if (m.date && m.date <= todayIso && mealTicketStudentIdSet.has(m.studentId)) {
        set.add(m.date);
      }
    }
    return Array.from(set)
      .sort((a, b) => b.localeCompare(a))
      .slice(0, 3);
  }, [metrics, mealTicketStudentIdSet, todayIso]);

  // Map of metrics on selectedDate
  const metricByStudentOnDate = useMemo(() => {
    const map = new Map<string, typeof metrics[0]>();
    for (const m of metrics) {
      if (m.date === selectedDate) {
        map.set(m.studentId, m);
      }
    }
    return map;
  }, [metrics, selectedDate]);

  // Helper to get or assign a day slot (1..30) for a student on a specific date
  const resolveSlotForStudentOnDate = (
    studentId: string,
    targetDate: string
  ): ParsedDaySlot => {
    const studentMeals = meals.filter((m) => m.studentId === studentId);
    const slots = buildStudent30DaySlots(studentMeals);

    // 1. Check if there is already a slot with this exact date
    const existingByDate = slots.find(
      (s) =>
        s.date === targetDate &&
        (s.morningStatus !== 'none' ||
          s.afternoonStatus !== 'none' ||
          s.attendanceStatus ||
          s.note)
    );
    if (existingByDate) return existingByDate;

    // 2. Otherwise pick the first empty slot (1..30)
    const firstEmpty = slots.find(
      (s) =>
        s.morningStatus === 'none' &&
        s.afternoonStatus === 'none' &&
        !s.attendanceStatus &&
        !s.note
    );
    return (
      firstEmpty || {
        dayNumber: 30,
        date: targetDate,
        morningStatus: 'none',
        afternoonStatus: 'none',
        note: '',
      }
    );
  };

  // Build enriched student rows for the Multi-Student Batch Table (only students with meal portions > 0)
  const enrichedStudentRows = useMemo(() => {
    return mealTicketStudents
      .map((s) => {
        const sMeals = meals.filter((m) => m.studentId === s.id);
        const sSlots = buildStudent30DaySlots(sMeals);
        const sTotalPortions = s.targetMetrics?.totalMealPortions ?? 60;
        const sStats = getStudentCardStats(sSlots, sTotalPortions);
        const dateSlot = sSlots.find(
          (slot) =>
            slot.date === selectedDate &&
            (slot.morningStatus !== 'none' ||
              slot.afternoonStatus !== 'none' ||
              slot.attendanceStatus ||
              slot.note)
        );
        const metricOnDate = metricByStudentOnDate.get(s.id);
        const morningStatus: PortionStatus = dateSlot?.morningStatus || 'none';
        const afternoonStatus: PortionStatus = dateSlot?.afternoonStatus || 'none';
        const isWeighedNoMeal =
          dateSlot?.attendanceStatus === 'weighed_no_meal' &&
          morningStatus === 'none' &&
          afternoonStatus === 'none';
        const isMarkedOnDate =
          morningStatus !== 'none' || afternoonStatus !== 'none' || isWeighedNoMeal;

        return {
          student: s,
          slots: sSlots,
          stats: sStats,
          dateSlot,
          metricOnDate,
          morningStatus,
          afternoonStatus,
          isWeighedNoMeal,
          isMarkedOnDate,
        };
      })
      .filter((row) => {
        const q = searchQuery.trim().toLowerCase();
        if (q) {
          const matchName = row.student.fullName.toLowerCase().includes(q);
          const matchPhone = row.student.phone.includes(q);
          if (!matchName && !matchPhone) return false;
        }
        if (studentFilter === 'WEIGHED_ON_DATE') {
          return Boolean(row.metricOnDate);
        }
        if (studentFilter === 'UNMARKED_ON_DATE') {
          return !row.isMarkedOnDate;
        }
        return true;
      });
  }, [mealTicketStudents, meals, selectedDate, metricByStudentOnDate, searchQuery, studentFilter]);

  const weighedCountOnDate = useMemo(
    () => mealTicketStudents.filter((s) => metricByStudentOnDate.has(s.id)).length,
    [mealTicketStudents, metricByStudentOnDate]
  );

  // Toggle single student selection
  const toggleSelectStudentId = (id: string) => {
    setSelectedStudentIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // Select / Deselect all visible students
  const handleToggleSelectAllVisible = () => {
    const visibleIds = enrichedStudentRows.map((r) => r.student.id);
    const allSelected =
      visibleIds.length > 0 && visibleIds.every((id) => selectedStudentIds.includes(id));
    if (allSelected) {
      setSelectedStudentIds((prev) => prev.filter((id) => !visibleIds.includes(id)));
    } else {
      setSelectedStudentIds(Array.from(new Set([...selectedStudentIds, ...visibleIds])));
    }
  };

  // Select all meal-ticket students who weighed in on selectedDate
  const handleSelectWeighedToday = () => {
    const weighedIds = mealTicketStudents
      .filter((s) => metricByStudentOnDate.has(s.id))
      .map((s) => s.id);
    setSelectedStudentIds(weighedIds);
  };

  // Mark a single student on selectedDate
  const handleQuickMarkOnDate = async (
    studentId: string,
    targetDate: string,
    updates: {
      morningStatus?: PortionStatus;
      afternoonStatus?: PortionStatus;
      attendanceStatus?: 'ate' | 'takeaway' | 'weighed_no_meal';
      note?: string;
    }
  ) => {
    const slot = resolveSlotForStudentOnDate(studentId, targetDate);
    const nextMorning =
      updates.morningStatus !== undefined ? updates.morningStatus : slot.morningStatus;
    const nextAfternoon =
      updates.afternoonStatus !== undefined ? updates.afternoonStatus : slot.afternoonStatus;
    const nextNote =
      updates.note !== undefined
        ? updates.note
        : noteDrafts[`${studentId}-${targetDate}`] ?? slot.note;

    let nextAttendance = updates.attendanceStatus;
    if (!nextAttendance) {
      if (nextMorning === 'takeaway' || nextAfternoon === 'takeaway') {
        nextAttendance = 'takeaway';
      } else if (nextMorning === 'used' || nextAfternoon === 'used') {
        nextAttendance = 'ate';
      }
    }

    await upsertMealTicket({
      studentId,
      dayNumber: slot.dayNumber,
      date: targetDate,
      morningStatus: nextMorning,
      afternoonStatus: nextAfternoon,
      attendanceStatus: nextAttendance,
      note: nextNote,
    });
  };

  // Batch mark multiple selected students at the same time
  const handleBatchMarkSelected = async (
    preset:
      | 'BOTH_USED'
      | 'MORNING_USED'
      | 'AFTERNOON_USED'
      | 'MORNING_USED_AFTERNOON_TAKEAWAY'
      | 'WEIGHED_NO_MEAL'
      | 'CLEAR_DAY'
  ) => {
    const validStudentIds = selectedStudentIds.filter((id) => mealTicketStudentIdSet.has(id));
    if (validStudentIds.length === 0) return;
    setIsBatchProcessing(true);
    setBatchFeedback(null);

    try {
      for (const studentId of validStudentIds) {
        const slot = resolveSlotForStudentOnDate(studentId, selectedDate);
        if (preset === 'BOTH_USED') {
          await upsertMealTicket({
            studentId,
            dayNumber: slot.dayNumber,
            date: selectedDate,
            morningStatus: 'used',
            afternoonStatus: 'used',
            attendanceStatus: 'ate',
            note: 'Dùng đủ 2 bữa Sáng + Chiều',
          });
        } else if (preset === 'MORNING_USED') {
          await upsertMealTicket({
            studentId,
            dayNumber: slot.dayNumber,
            date: selectedDate,
            morningStatus: 'used',
            afternoonStatus: slot.afternoonStatus,
            attendanceStatus: 'ate',
            note: slot.note || 'Đã dùng bữa Sáng tại chỗ',
          });
        } else if (preset === 'AFTERNOON_USED') {
          await upsertMealTicket({
            studentId,
            dayNumber: slot.dayNumber,
            date: selectedDate,
            morningStatus: slot.morningStatus,
            afternoonStatus: 'used',
            attendanceStatus: 'ate',
            note: slot.note || 'Đã dùng bữa Chiều tại chỗ',
          });
        } else if (preset === 'MORNING_USED_AFTERNOON_TAKEAWAY') {
          await upsertMealTicket({
            studentId,
            dayNumber: slot.dayNumber,
            date: selectedDate,
            morningStatus: 'used',
            afternoonStatus: 'takeaway',
            attendanceStatus: 'takeaway',
            note: 'Ăn Sáng tại chỗ + Mang về Chiều cho hôm sau',
          });
        } else if (preset === 'WEIGHED_NO_MEAL') {
          await upsertMealTicket({
            studentId,
            dayNumber: slot.dayNumber,
            date: selectedDate,
            morningStatus: 'none',
            afternoonStatus: 'none',
            attendanceStatus: 'weighed_no_meal',
            note: 'Cân chỉ số - Không dùng bữa ăn',
          });
        } else if (preset === 'CLEAR_DAY') {
          await upsertMealTicket({
            studentId,
            dayNumber: slot.dayNumber,
            date: '',
            morningStatus: 'none',
            afternoonStatus: 'none',
            attendanceStatus: undefined,
            note: '',
          });
        }
      }
      setBatchFeedback(
        `Đã cập nhật phiếu ăn ngày ${selectedDate} cho ${validStudentIds.length} học viên cùng lúc!`
      );
      setTimeout(() => setBatchFeedback(null), 3500);
    } finally {
      setIsBatchProcessing(false);
    }
  };

  const handleSlotToggle = async (
    studentId: string,
    slot: ParsedDaySlot,
    period: 'morning' | 'afternoon',
    explicitStatus?: PortionStatus
  ) => {
    const nextMorning =
      period === 'morning'
        ? explicitStatus !== undefined
          ? explicitStatus
          : cyclePortionStatus(slot.morningStatus)
        : slot.morningStatus;
    const nextAfternoon =
      period === 'afternoon'
        ? explicitStatus !== undefined
          ? explicitStatus
          : cyclePortionStatus(slot.afternoonStatus)
        : slot.afternoonStatus;

    const slotDate = slot.date || selectedDate || todayIso;
    const nextAttendance =
      nextMorning === 'none' && nextAfternoon === 'none'
        ? undefined
        : nextMorning === 'takeaway' || nextAfternoon === 'takeaway'
        ? 'takeaway'
        : 'ate';

    await upsertMealTicket({
      studentId,
      dayNumber: slot.dayNumber,
      date: slotDate,
      morningStatus: nextMorning,
      afternoonStatus: nextAfternoon,
      attendanceStatus: nextAttendance,
      note: nextMorning === 'none' && nextAfternoon === 'none' ? '' : slot.note,
    });
  };

  const activeStudentSlots = useMemo(() => {
    if (!activeCardStudent) return [];
    const sMeals = meals.filter((m) => m.studentId === activeCardStudent.id);
    return buildStudent30DaySlots(sMeals);
  }, [activeCardStudent, meals]);

  const compactStudentSlots = useMemo(() => {
    const usedOrNoted = activeStudentSlots.filter(
      (s) =>
        s.morningStatus !== 'none' ||
        s.afternoonStatus !== 'none' ||
        Boolean(s.attendanceStatus) ||
        Boolean(s.note)
    );
    const emptySlots = activeStudentSlots.filter(
      (s) =>
        s.morningStatus === 'none' &&
        s.afternoonStatus === 'none' &&
        !s.attendanceStatus &&
        !s.note
    );
    const nextUpcoming = emptySlots.slice(0, usedOrNoted.length === 0 ? 6 : 3);
    const combined = [...usedOrNoted, ...nextUpcoming].sort((a, b) => a.dayNumber - b.dayNumber);
    return combined;
  }, [activeStudentSlots]);

  const visibleStudentSlots = useMemo(() => {
    if (dayRangeFilter === 'COMPACT') return compactStudentSlots;
    if (dayRangeFilter === '1-10') return activeStudentSlots.slice(0, 10);
    if (dayRangeFilter === '11-20') return activeStudentSlots.slice(10, 20);
    if (dayRangeFilter === '21-30') return activeStudentSlots.slice(20, 30);
    return activeStudentSlots;
  }, [dayRangeFilter, compactStudentSlots, activeStudentSlots]);

  const activeStudentTotalPortions = activeCardStudent?.targetMetrics?.totalMealPortions ?? 60;

  const activeStats = useMemo(
    () => getStudentCardStats(activeStudentSlots, activeStudentTotalPortions),
    [activeStudentSlots, activeStudentTotalPortions]
  );

  const handleUpdatePackagePortions = async (student: StudentProfile, portions: number) => {
    const updated: StudentProfile = {
      ...student,
      targetMetrics: {
        ...student.targetMetrics,
        totalMealPortions: portions,
      },
    };
    if (inspectCardStudent?.id === student.id) {
      setInspectCardStudent(updated);
    }
    await updateStudent(updated);
  };

  const allVisibleSelected =
    enrichedStudentRows.length > 0 &&
    enrichedStudentRows.every((r) => selectedStudentIds.includes(r.student.id));

  return (
    <div className="space-y-6">
      {/* ===================================================================== */}
      {/* PHẦN 1 (HLV): BẢNG ĐÁNH PHIẾU SỬ DỤNG BỮA ĂN CÙNG LÚC NHIỀU HỌC VIÊN */}
      {/* ===================================================================== */}
      {mode === 'trainer' && defaultView === 'batch' && (
        <div className="bg-white rounded-2xl sm:rounded-3xl p-3.5 sm:p-6 border border-slate-200/90 shadow-xs space-y-3.5 sm:space-y-4">
          {/* Header & Date Selector */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div className="flex items-start space-x-2.5">
              <div className="p-2 sm:p-2.5 rounded-xl sm:rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white shadow-xs shrink-0">
                <Layers className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                  <h3 className="font-extrabold text-slate-900 text-sm sm:text-base leading-snug">
                    Đánh Phiếu Bữa Ăn
                  </h3>
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 whitespace-nowrap">
                    {mealTicketStudents.length} HV có phiếu
                  </span>
                  {trainingOnlyStudentCount > 0 && (
                    <span className="hidden sm:inline text-[11px] text-slate-400 font-medium">
                      (Đã ẩn {trainingOnlyStudentCount} HV chỉ tập · 0 phần ăn)
                    </span>
                  )}
                </div>
                <p className="hidden sm:block text-xs text-slate-500 mt-0.5">
                  Chọn nhiều học viên để đánh phiếu đồng loạt chỉ với 1 cú nhấp chuột, hoặc bấm trực tiếp vào cột{' '}
                  <strong>Sáng / Chiều</strong> của từng học viên trên cùng một màn hình.
                </p>
              </div>
            </div>

            {/* Date Picker */}
            <div className="flex items-center gap-2 w-full lg:w-auto">
              <div className="flex-1 lg:flex-none flex items-center justify-between sm:justify-start space-x-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2.5 sm:px-3 py-1.5 text-xs">
                <div className="flex items-center space-x-1.5">
                  <Calendar className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span className="font-semibold text-slate-600 whitespace-nowrap">Ngày:</span>
                </div>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="bg-transparent font-bold text-slate-900 outline-hidden cursor-pointer text-right sm:text-left"
                />
              </div>

              <button
                type="button"
                onClick={() => setSelectedDate(todayIso)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  selectedDate === todayIso
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
              >
                Hôm nay
              </button>
            </div>
          </div>

          {/* Quick recent weigh-in date chips (3 most recent days up to today) */}
          {metricDates.length > 0 && (
            <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 text-[11px]">
              <span className="text-slate-500 font-semibold shrink-0">
                Ngày HV cân đo (3 ngày gần nhất):
              </span>
              <div className="grid grid-cols-3 sm:flex sm:flex-wrap items-center gap-1.5">
                {metricDates.map((d) => {
                  const count = metrics.filter(
                    (m) => m.date === d && mealTicketStudentIdSet.has(m.studentId)
                  ).length;
                  const active = d === selectedDate;
                  const isToday = d === todayIso;
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setSelectedDate(d)}
                      className={`px-2 sm:px-2.5 py-1.5 sm:py-1 rounded-lg font-bold transition-colors cursor-pointer text-center truncate ${
                        active
                          ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200 border border-transparent'
                      }`}
                    >
                      {isToday ? 'Hôm nay' : formatShortDate(d)} ({count})
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Filter Tabs & Search Input */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 pt-0.5">
            <div className="grid grid-cols-3 sm:flex sm:flex-wrap items-center gap-1.5 text-[11px] sm:text-xs">
              <button
                type="button"
                onClick={() => setStudentFilter('ALL')}
                className={`px-2 sm:px-3 py-1.5 rounded-xl font-bold border transition-colors cursor-pointer flex items-center justify-center space-x-1 truncate ${
                  studentFilter === 'ALL'
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <Users className="w-3.5 h-3.5 hidden sm:inline shrink-0" />
                <span className="truncate">
                  <span className="sm:hidden">Tất cả ({mealTicketStudents.length})</span>
                  <span className="hidden sm:inline">Tất cả có phiếu ăn ({mealTicketStudents.length})</span>
                </span>
              </button>

              <button
                type="button"
                onClick={() => setStudentFilter('WEIGHED_ON_DATE')}
                className={`px-2 sm:px-3 py-1.5 rounded-xl font-bold border transition-colors cursor-pointer flex items-center justify-center space-x-1 truncate ${
                  studentFilter === 'WEIGHED_ON_DATE'
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <Scale className="w-3.5 h-3.5 hidden sm:inline shrink-0" />
                <span className="truncate">
                  <span className="sm:hidden">Đã cân ({weighedCountOnDate})</span>
                  <span className="hidden sm:inline">
                    Có cân chỉ số ngày {formatShortDate(selectedDate)} ({weighedCountOnDate})
                  </span>
                </span>
              </button>

              <button
                type="button"
                onClick={() => setStudentFilter('UNMARKED_ON_DATE')}
                className={`px-2 sm:px-3 py-1.5 rounded-xl font-bold border transition-colors cursor-pointer text-center truncate ${
                  studentFilter === 'UNMARKED_ON_DATE'
                    ? 'bg-amber-600 text-white border-amber-600'
                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <span className="sm:hidden">Chưa chấm</span>
                <span className="hidden sm:inline">Chưa chấm phiếu ngày này</span>
              </button>
            </div>

            <div className="relative w-full md:w-64">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Tìm tên hoặc SĐT học viên..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 outline-hidden"
              />
            </div>
          </div>

          {/* ================================================================= */}
          {/* THANH CÔNG CỤ ĐÁNH PHIẾU HÀNG LOẠT CHO NHIỀU HỌC VIÊN CÙNG LÚC */}
          {/* ================================================================= */}
          <div className="p-3 sm:p-3.5 rounded-2xl bg-gradient-to-r from-emerald-50/90 via-teal-50/80 to-slate-50 border border-emerald-200/90 space-y-2.5">
            {/* Row 1: Selection Header & Quick Select Controls */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center justify-between sm:justify-start gap-2 text-xs">
                <span className="text-[11px] sm:text-xs font-extrabold text-emerald-950">
                  Đánh phiếu hàng loạt
                </span>
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-600 text-white font-extrabold text-[11px] whitespace-nowrap">
                  Đang chọn: {selectedStudentIds.length} HV
                </span>
              </div>

              <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-1.5 text-[11px] sm:text-xs">
                <button
                  type="button"
                  onClick={handleToggleSelectAllVisible}
                  className={`px-2.5 py-1.5 rounded-xl bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 font-bold flex items-center justify-center space-x-1.5 cursor-pointer shadow-2xs ${
                    weighedCountOnDate === 0 ? 'col-span-2' : ''
                  }`}
                >
                  {allVisibleSelected ? (
                    <CheckSquare className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  ) : (
                    <Square className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  )}
                  <span className="truncate">
                    {allVisibleSelected ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
                  </span>
                </button>

                {weighedCountOnDate > 0 && (
                  <button
                    type="button"
                    onClick={handleSelectWeighedToday}
                    className="px-2.5 py-1.5 rounded-xl bg-white hover:bg-emerald-50 text-emerald-800 border border-emerald-300 font-bold flex items-center justify-center space-x-1 cursor-pointer shadow-2xs"
                  >
                    <Scale className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span className="truncate">Chọn {weighedCountOnDate} HV đã cân</span>
                  </button>
                )}
              </div>
            </div>

            {batchFeedback && (
              <div className="text-[11px] sm:text-xs font-extrabold text-emerald-800 bg-emerald-100 px-3 py-1.5 rounded-xl border border-emerald-300">
                ✓ {batchFeedback}
              </div>
            )}

            {/* Row 2: Clean Grid of Batch Action Buttons */}
            <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-1.5 pt-2 border-t border-emerald-200/70 text-[11px] sm:text-xs">
              <button
                type="button"
                disabled={selectedStudentIds.length === 0 || isBatchProcessing}
                onClick={() => handleBatchMarkSelected('BOTH_USED')}
                className="col-span-2 sm:col-span-1 px-3 py-2 sm:py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white font-bold transition-colors cursor-pointer shadow-2xs flex items-center justify-center space-x-1.5"
              >
                <Check className="w-3.5 h-3.5 stroke-[2.5] shrink-0" />
                <span>Đủ Sáng + Chiều (Tại chỗ)</span>
              </button>

              <button
                type="button"
                disabled={selectedStudentIds.length === 0 || isBatchProcessing}
                onClick={() => handleBatchMarkSelected('MORNING_USED')}
                className="px-2.5 py-2 sm:py-1.5 rounded-xl bg-white hover:bg-emerald-50 disabled:opacity-40 text-emerald-800 border border-emerald-300 font-bold transition-colors cursor-pointer flex items-center justify-center space-x-1"
              >
                <Sun className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                <span className="truncate">+ Sáng (Tại chỗ)</span>
              </button>

              <button
                type="button"
                disabled={selectedStudentIds.length === 0 || isBatchProcessing}
                onClick={() => handleBatchMarkSelected('AFTERNOON_USED')}
                className="px-2.5 py-2 sm:py-1.5 rounded-xl bg-white hover:bg-indigo-50 disabled:opacity-40 text-indigo-800 border border-indigo-300 font-bold transition-colors cursor-pointer flex items-center justify-center space-x-1"
              >
                <Sunset className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                <span className="truncate">+ Chiều (Tại chỗ)</span>
              </button>

              <button
                type="button"
                disabled={selectedStudentIds.length === 0 || isBatchProcessing}
                onClick={() => handleBatchMarkSelected('MORNING_USED_AFTERNOON_TAKEAWAY')}
                className="px-2.5 py-2 sm:py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-white font-bold transition-colors cursor-pointer flex items-center justify-center space-x-1"
              >
                <Package className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">Sáng + Mang về</span>
              </button>

              <button
                type="button"
                disabled={selectedStudentIds.length === 0 || isBatchProcessing}
                onClick={() => handleBatchMarkSelected('WEIGHED_NO_MEAL')}
                className="px-2.5 py-2 sm:py-1.5 rounded-xl bg-slate-800 hover:bg-slate-900 disabled:opacity-40 text-white font-bold transition-colors cursor-pointer flex items-center justify-center truncate"
              >
                ⚖️ Cân - Không ăn
              </button>

              <button
                type="button"
                disabled={selectedStudentIds.length === 0 || isBatchProcessing}
                onClick={() => handleBatchMarkSelected('CLEAR_DAY')}
                className="col-span-2 sm:col-span-1 px-2.5 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 disabled:opacity-40 text-rose-700 border border-rose-200 font-bold transition-colors cursor-pointer flex items-center justify-center"
              >
                Xóa chấm ngày này
              </button>
            </div>
          </div>

          {/* ================================================================= */}
          {/* DANH SÁCH HỌC VIÊN ĐỂ CHẤM PHIẾU (MOBILE TỐI GIẢN + DESKTOP BẢNG) */}
          {/* ================================================================= */}
          {enrichedStudentRows.length === 0 ? (
            <div className="p-8 rounded-2xl bg-slate-50 border border-dashed border-slate-200 text-center space-y-2">
              <Utensils className="w-8 h-8 text-slate-300 mx-auto" />
              <div className="text-xs font-bold text-slate-700">
                {mealTicketStudents.length === 0
                  ? 'Chưa có học viên nào đăng ký gói có phiếu bữa ăn (> 0 khẩu phần)'
                  : 'Không có học viên nào trong bộ lọc hiện tại'}
              </div>
              {studentFilter !== 'ALL' && mealTicketStudents.length > 0 && (
                <button
                  type="button"
                  onClick={() => setStudentFilter('ALL')}
                  className="px-3 py-1.5 bg-emerald-600 text-white rounded-xl text-xs font-bold cursor-pointer"
                >
                  Xem tất cả {mealTicketStudents.length} học viên có phiếu ăn
                </button>
              )}
            </div>
          ) : (
            <>
              {/* MOBILE MINIMALIST LIST (< md) */}
              <div className="md:hidden space-y-2">
                <div className="flex items-center justify-between px-1 text-[10.5px] text-slate-500">
                  <span>Chạm <strong>Sáng / Chiều</strong> để đổi: Tại chỗ ✓ → Mang về 🥡 → Trống</span>
                </div>

                {enrichedStudentRows.map(
                  ({
                    student: s,
                    stats: sStats,
                    dateSlot,
                    metricOnDate,
                    morningStatus,
                    afternoonStatus,
                    isWeighedNoMeal,
                  }) => {
                    const isChecked = selectedStudentIds.includes(s.id);
                    const isBothUsed = morningStatus === 'used' && afternoonStatus === 'used';
                    const currentNote =
                      noteDrafts[`${s.id}-${selectedDate}`] !== undefined
                        ? noteDrafts[`${s.id}-${selectedDate}`]
                        : dateSlot?.note || '';

                    return (
                      <div
                        key={s.id}
                        className={`p-2.5 rounded-xl border transition-colors space-y-2 ${
                          isChecked
                            ? 'bg-emerald-50/70 border-emerald-300'
                            : 'bg-white border-slate-200/90'
                        }`}
                      >
                        {/* Top row: Checkbox + Name + Weigh badge + Remaining + View Card */}
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <button
                              type="button"
                              onClick={() => toggleSelectStudentId(s.id)}
                              className="p-0.5 shrink-0 cursor-pointer"
                              aria-label={`Chọn ${s.fullName}`}
                            >
                              {isChecked ? (
                                <CheckSquare className="w-4 h-4 text-emerald-600" />
                              ) : (
                                <Square className="w-4 h-4 text-slate-300" />
                              )}
                            </button>

                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="font-extrabold text-slate-900 text-xs truncate">
                                  {s.fullName}
                                </span>
                                {metricOnDate && (
                                  <span className="px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-[10px] font-bold shrink-0">
                                    {metricOnDate.weight}kg
                                  </span>
                                )}
                                {isWeighedNoMeal && (
                                  <span className="px-1.5 py-0.5 rounded-md bg-slate-800 text-white text-[10px] font-bold shrink-0">
                                    Không ăn
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="px-2 py-0.5 rounded-lg bg-slate-100 text-[10.5px] font-extrabold text-slate-700 tabular-nums">
                              {sStats.usedPortions}/{sStats.totalPortions}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setInspectCardStudent(s);
                                setSelectedStudent(s);
                                setTimeout(() => {
                                  cardSectionRef.current?.scrollIntoView({
                                    behavior: 'smooth',
                                    block: 'start',
                                  });
                                }, 50);
                              }}
                              className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                                activeCardStudent?.id === s.id
                                  ? 'bg-emerald-600 text-white border-emerald-600'
                                  : 'bg-slate-50 text-slate-600 border-slate-200'
                              }`}
                              title="Xem thẻ 30 ngày"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Bottom row: Minimalist 1-tap Sáng / Chiều / Đủ 2 */}
                        <div className="grid grid-cols-[1fr_1fr_auto] gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              const nextStatus = cyclePortionStatus(morningStatus);
                              handleQuickMarkOnDate(s.id, selectedDate, {
                                morningStatus: nextStatus,
                                note:
                                  nextStatus === 'takeaway'
                                    ? currentNote || 'Mang khẩu phần Sáng về'
                                    : currentNote,
                              });
                            }}
                            className={`h-8 px-2 rounded-lg border text-[11px] font-bold flex items-center justify-center gap-1 transition-colors cursor-pointer ${
                              morningStatus === 'used'
                                ? 'bg-emerald-600 text-white border-emerald-600'
                                : morningStatus === 'takeaway'
                                ? 'bg-amber-500 text-white border-amber-500'
                                : 'bg-slate-50 text-slate-600 border-slate-200'
                            }`}
                          >
                            <Sun className="w-3 h-3 shrink-0" />
                            <span>
                              {morningStatus === 'used'
                                ? 'Sáng ✓'
                                : morningStatus === 'takeaway'
                                ? 'Sáng 🥡'
                                : 'Sáng'}
                            </span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              const nextStatus = cyclePortionStatus(afternoonStatus);
                              handleQuickMarkOnDate(s.id, selectedDate, {
                                afternoonStatus: nextStatus,
                                note:
                                  nextStatus === 'takeaway'
                                    ? currentNote || 'Mang khẩu phần Chiều về hôm sau'
                                    : currentNote,
                              });
                            }}
                            className={`h-8 px-2 rounded-lg border text-[11px] font-bold flex items-center justify-center gap-1 transition-colors cursor-pointer ${
                              afternoonStatus === 'used'
                                ? 'bg-emerald-600 text-white border-emerald-600'
                                : afternoonStatus === 'takeaway'
                                ? 'bg-amber-500 text-white border-amber-500'
                                : 'bg-slate-50 text-slate-600 border-slate-200'
                            }`}
                          >
                            <Sunset className="w-3 h-3 shrink-0" />
                            <span>
                              {afternoonStatus === 'used'
                                ? 'Chiều ✓'
                                : afternoonStatus === 'takeaway'
                                ? 'Chiều 🥡'
                                : 'Chiều'}
                            </span>
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              handleQuickMarkOnDate(s.id, selectedDate, {
                                morningStatus: isBothUsed ? 'none' : 'used',
                                afternoonStatus: isBothUsed ? 'none' : 'used',
                                attendanceStatus: isBothUsed ? undefined : 'ate',
                                note: isBothUsed ? '' : 'Dùng đủ 2 bữa Sáng + Chiều',
                              })
                            }
                            className={`h-8 px-2.5 rounded-lg border text-[11px] font-bold transition-colors cursor-pointer whitespace-nowrap ${
                              isBothUsed
                                ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            }`}
                          >
                            Đủ 2
                          </button>
                        </div>
                      </div>
                    );
                  }
                )}
              </div>

              {/* DESKTOP FULL TABLE (>= md) */}
              <div className="hidden md:block overflow-x-auto border border-slate-200 rounded-2xl">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100/90 text-slate-700 border-b border-slate-200">
                    <th className="py-3 px-3 w-10 text-center">
                      <button
                        type="button"
                        onClick={handleToggleSelectAllVisible}
                        className="inline-flex items-center justify-center cursor-pointer"
                        title="Chọn / Bỏ chọn tất cả"
                      >
                        {allVisibleSelected ? (
                          <CheckSquare className="w-4 h-4 text-emerald-600" />
                        ) : (
                          <Square className="w-4 h-4 text-slate-400" />
                        )}
                      </button>
                    </th>
                    <th className="py-3 px-3 font-extrabold">Học Viên &amp; Cân Đo Ngày {formatShortDate(selectedDate)}</th>
                    <th className="py-3 px-3 font-extrabold">Tiến Độ Thẻ 30 Ngày</th>
                    <th className="py-3 px-3 font-extrabold text-center">Khẩu Phần Sáng</th>
                    <th className="py-3 px-3 font-extrabold text-center">Khẩu Phần Chiều</th>
                    <th className="py-3 px-3 font-extrabold">Đánh Nhanh / Ghi Chú</th>
                    <th className="py-3 px-3 font-extrabold text-right">Thẻ 30 Ngày</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {enrichedStudentRows.map(
                    ({
                      student: s,
                      stats: sStats,
                      dateSlot,
                      metricOnDate,
                      morningStatus,
                      afternoonStatus,
                      isWeighedNoMeal,
                    }) => {
                      const isChecked = selectedStudentIds.includes(s.id);
                      const isCurrentCard = activeCardStudent?.id === s.id;
                      const currentNote =
                        noteDrafts[`${s.id}-${selectedDate}`] !== undefined
                          ? noteDrafts[`${s.id}-${selectedDate}`]
                          : dateSlot?.note || '';

                      return (
                        <tr
                          key={s.id}
                          className={`transition-colors ${
                            isChecked
                              ? 'bg-emerald-50/60'
                              : isCurrentCard
                              ? 'bg-slate-50/90'
                              : 'hover:bg-slate-50/60'
                          }`}
                        >
                          {/* Checkbox */}
                          <td className="py-3 px-3 text-center">
                            <button
                              type="button"
                              onClick={() => toggleSelectStudentId(s.id)}
                              className="inline-flex items-center justify-center cursor-pointer"
                            >
                              {isChecked ? (
                                <CheckSquare className="w-4 h-4 text-emerald-600" />
                              ) : (
                                <Square className="w-4 h-4 text-slate-300 hover:text-slate-500" />
                              )}
                            </button>
                          </td>

                          {/* Student Name & Weigh-in Info */}
                          <td className="py-3 px-3">
                            <div className="font-extrabold text-slate-900 text-xs sm:text-sm">
                              {s.fullName}
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5 mt-0.5 text-[11px] text-slate-500">
                              <span className="font-mono">{s.phone}</span>
                              {metricOnDate ? (
                                <span className="px-2 py-0.2 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 inline-flex items-center">
                                  <Scale className="w-3 h-3 mr-1" />
                                  Đã cân: {metricOnDate.weight}kg • Mỡ nội tạng {metricOnDate.visceralFat}
                                </span>
                              ) : (
                                <span className="text-[10px] text-slate-400">
                                  Chưa cân ngày {formatShortDate(selectedDate)}
                                </span>
                              )}
                            </div>
                          </td>

                          {/* 30-Day Progress */}
                          <td className="py-3 px-3">
                            <div className="flex items-center justify-between text-[11px] font-bold mb-1">
                              <span className="text-emerald-800">
                                Đã dùng: {sStats.usedPortions}/{sStats.totalPortions}
                              </span>
                              <span className="text-orange-700">
                                Còn {sStats.remainingPortions}
                              </span>
                            </div>
                            <div className="w-32 bg-slate-100 h-2 rounded-full overflow-hidden">
                              <div
                                className="bg-emerald-600 h-full rounded-full transition-all"
                                style={{
                                  width: `${Math.min(100, Math.round((sStats.usedPortions / Math.max(1, sStats.totalPortions)) * 100))}%`,
                                }}
                              />
                            </div>
                            <div className="flex items-center justify-between text-[10px] text-slate-500 mt-0.5">
                              <span>Gói {sStats.totalPortions} phần</span>
                              {dateSlot && (
                                <span>
                                  Ngày <strong>{dateSlot.dayNumber}/30</strong>
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Morning Portion Buttons */}
                          <td className="py-3 px-3 text-center">
                            <div className="inline-flex items-center bg-slate-100 rounded-xl p-0.5 border border-slate-200 gap-0.5">
                              <button
                                type="button"
                                onClick={() =>
                                  handleQuickMarkOnDate(s.id, selectedDate, {
                                    morningStatus: morningStatus === 'used' ? 'none' : 'used',
                                  })
                                }
                                className={`px-2 py-1 rounded-lg text-[10.5px] font-bold transition-colors cursor-pointer ${
                                  morningStatus === 'used'
                                    ? 'bg-emerald-600 text-white shadow-2xs'
                                    : 'text-slate-600 hover:bg-white'
                                }`}
                              >
                                ✓ Tại chỗ
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  handleQuickMarkOnDate(s.id, selectedDate, {
                                    morningStatus:
                                      morningStatus === 'takeaway' ? 'none' : 'takeaway',
                                    note:
                                      morningStatus === 'takeaway'
                                        ? currentNote
                                        : currentNote || 'Mang khẩu phần Sáng về',
                                  })
                                }
                                className={`px-2 py-1 rounded-lg text-[10.5px] font-bold transition-colors cursor-pointer ${
                                  morningStatus === 'takeaway'
                                    ? 'bg-amber-500 text-white shadow-2xs'
                                    : 'text-slate-600 hover:bg-white'
                                }`}
                              >
                                🥡 Mang về
                              </button>
                            </div>
                          </td>

                          {/* Afternoon Portion Buttons */}
                          <td className="py-3 px-3 text-center">
                            <div className="inline-flex items-center bg-slate-100 rounded-xl p-0.5 border border-slate-200 gap-0.5">
                              <button
                                type="button"
                                onClick={() =>
                                  handleQuickMarkOnDate(s.id, selectedDate, {
                                    afternoonStatus: afternoonStatus === 'used' ? 'none' : 'used',
                                  })
                                }
                                className={`px-2 py-1 rounded-lg text-[10.5px] font-bold transition-colors cursor-pointer ${
                                  afternoonStatus === 'used'
                                    ? 'bg-emerald-600 text-white shadow-2xs'
                                    : 'text-slate-600 hover:bg-white'
                                }`}
                              >
                                ✓ Tại chỗ
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  handleQuickMarkOnDate(s.id, selectedDate, {
                                    afternoonStatus:
                                      afternoonStatus === 'takeaway' ? 'none' : 'takeaway',
                                    note:
                                      afternoonStatus === 'takeaway'
                                        ? currentNote
                                        : currentNote || 'Mang khẩu phần Chiều về hôm sau',
                                  })
                                }
                                className={`px-2 py-1 rounded-lg text-[10.5px] font-bold transition-colors cursor-pointer ${
                                  afternoonStatus === 'takeaway'
                                    ? 'bg-amber-500 text-white shadow-2xs'
                                    : 'text-slate-600 hover:bg-white'
                                }`}
                              >
                                🥡 Mang về
                              </button>
                            </div>
                          </td>

                          {/* Quick 1-Click & Note */}
                          <td className="py-3 px-3">
                            <div className="flex flex-wrap items-center gap-1 mb-1">
                              <button
                                type="button"
                                onClick={() =>
                                  handleQuickMarkOnDate(s.id, selectedDate, {
                                    morningStatus: 'used',
                                    afternoonStatus: 'used',
                                    attendanceStatus: 'ate',
                                    note: 'Dùng đủ 2 bữa Sáng + Chiều',
                                  })
                                }
                                className="px-2 py-0.5 rounded-md bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 font-bold text-[10px] cursor-pointer"
                              >
                                ✓ Đủ 2 bữa
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  handleQuickMarkOnDate(s.id, selectedDate, {
                                    morningStatus: 'none',
                                    afternoonStatus: 'none',
                                    attendanceStatus: 'weighed_no_meal',
                                    note: 'Cân chỉ số - Không dùng bữa ăn',
                                  })
                                }
                                className={`px-2 py-0.5 rounded-md border font-bold text-[10px] cursor-pointer ${
                                  isWeighedNoMeal
                                    ? 'bg-slate-800 text-white border-slate-800'
                                    : 'bg-white hover:bg-slate-100 text-slate-600 border-slate-200'
                                }`}
                              >
                                ⚖️ Không ăn
                              </button>
                            </div>
                            <input
                              type="text"
                              placeholder="Ghi chú..."
                              value={currentNote}
                              onChange={(e) =>
                                setNoteDrafts((prev) => ({
                                  ...prev,
                                  [`${s.id}-${selectedDate}`]: e.target.value,
                                }))
                              }
                              onBlur={() => {
                                if (currentNote !== (dateSlot?.note || '')) {
                                  handleQuickMarkOnDate(s.id, selectedDate, {
                                    note: currentNote,
                                  });
                                }
                              }}
                              className="w-full max-w-[180px] px-2 py-1 bg-white border border-slate-200 rounded-lg text-[10.5px] text-slate-700 outline-hidden focus:border-emerald-500"
                            />
                          </td>

                          {/* Inspect 30-Day Card Button */}
                          <td className="py-3 px-3 text-right">
                            <button
                              type="button"
                              onClick={() => {
                                setInspectCardStudent(s);
                                setSelectedStudent(s);
                              }}
                              className={`inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-xl text-[11px] font-bold border transition-colors cursor-pointer ${
                                activeCardStudent?.id === s.id
                                  ? 'bg-emerald-600 text-white border-emerald-600'
                                  : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200'
                              }`}
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>Phiếu 30 ngày</span>
                            </button>
                          </td>
                        </tr>
                      );
                    }
                  )}
                </tbody>
              </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* PHẦN 2: CHI TIẾT THẺ PHIẾU ĂN 30 NGÀY CỦA HỌC VIÊN ĐANG CHỌN */}
      {/* ===================================================================== */}
      {activeCardStudent ? (
        <div
          ref={cardSectionRef}
          className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-6 border border-slate-200/90 shadow-xs space-y-5"
        >
          {/* Card Header & Student Selector */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-4 border-b border-slate-100">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center">
                  <Sparkles className="w-3 h-3 mr-1 text-emerald-600" />
                  THẺ PHIẾU ĂN 30 NGÀY (GÓI {activeStats.totalPortions} KHẨU PHẦN)
                </span>
                <h3 className="font-extrabold text-slate-900 text-base">
                  Học viên: {activeCardStudent.fullName}
                </h3>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                {mode === 'trainer'
                  ? 'Bấm trực tiếp vào ô Sáng hoặc Chiều của từng ngày (1 → 30) để đánh dấu: Đã dùng tại chỗ (✓) → Mang về (🥡) → Chưa dùng.'
                  : `Theo dõi tiến độ sử dụng Phiếu Ăn 30 Ngày (Gói ${activeStats.totalPortions} khẩu phần do Huấn luyện viên xác nhận).`}
              </p>
            </div>

            {mode === 'trainer' && (
              <div className="flex flex-wrap items-center gap-2">
                {/* Package Selector: 0 vs 30 vs 60 portions */}
                <div className="inline-flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs">
                  <span className="px-2 text-[11px] font-bold text-slate-500">Gói phiếu:</span>
                  <button
                    type="button"
                    onClick={() => handleUpdatePackagePortions(activeCardStudent, 0)}
                    className={`px-2 py-1 rounded-lg font-bold transition-colors cursor-pointer ${
                      activeStats.totalPortions === 0
                        ? 'bg-slate-800 text-white shadow-2xs'
                        : 'text-slate-600 hover:bg-white'
                    }`}
                  >
                    0 phần
                  </button>
                  <button
                    type="button"
                    onClick={() => handleUpdatePackagePortions(activeCardStudent, 30)}
                    className={`px-2.5 py-1 rounded-lg font-bold transition-colors cursor-pointer ${
                      activeStats.totalPortions === 30
                        ? 'bg-emerald-600 text-white shadow-2xs'
                        : 'text-slate-600 hover:bg-white'
                    }`}
                  >
                    30 phần
                  </button>
                  <button
                    type="button"
                    onClick={() => handleUpdatePackagePortions(activeCardStudent, 60)}
                    className={`px-2.5 py-1 rounded-lg font-bold transition-colors cursor-pointer ${
                      activeStats.totalPortions === 60
                        ? 'bg-emerald-600 text-white shadow-2xs'
                        : 'text-slate-600 hover:bg-white'
                    }`}
                  >
                    60 phần
                  </button>
                </div>

                {mealTicketStudents.length > 1 && (
                  <select
                    value={activeCardStudent.id}
                    onChange={(e) => {
                      const found = mealTicketStudents.find((st) => st.id === e.target.value);
                      if (found) {
                        setInspectCardStudent(found);
                        setSelectedStudent(found);
                      }
                    }}
                    className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-hidden"
                  >
                    {mealTicketStudents.map((st) => (
                      <option key={st.id} value={st.id}>
                        Xem thẻ 30 ngày: {st.fullName} ({st.targetMetrics?.totalMealPortions ?? 60} phần)
                      </option>
                    ))}
                  </select>
                )}

                {confirmResetStudentId === activeCardStudent.id ? (
                  <div className="flex items-center space-x-1.5 bg-rose-50 border border-rose-200 px-2.5 py-1 rounded-xl text-xs">
                    <span className="text-rose-800 font-bold">Xóa &amp; tạo phiếu 30 ngày mới?</span>
                    <button
                      type="button"
                      onClick={async () => {
                        await resetStudentMealTickets(activeCardStudent.id);
                        setConfirmResetStudentId(null);
                      }}
                      className="px-2 py-0.5 bg-rose-600 text-white rounded-lg font-bold cursor-pointer"
                    >
                      Đồng ý
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmResetStudentId(null)}
                      className="px-2 py-0.5 bg-white text-slate-600 rounded-lg border border-slate-200 font-semibold cursor-pointer"
                    >
                      Hủy
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmResetStudentId(activeCardStudent.id)}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center space-x-1 transition-colors cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Làm mới Phiếu 30 Ngày</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Summary Progress Bar & Counters */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="p-3.5 rounded-2xl bg-emerald-50/80 border border-emerald-200">
              <div className="text-[11px] text-emerald-800 font-semibold">Đã Sử Dụng</div>
              <div className="text-xl font-black text-emerald-950 mt-0.5">
                {activeStats.usedPortions} / {activeStats.totalPortions}{' '}
                <span className="text-xs font-bold text-emerald-700">khẩu phần</span>
              </div>
              <div className="text-[10.5px] text-emerald-700 mt-0.5">
                Tương đương {activeStats.activeDays}/30 ngày có ăn
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-orange-50/80 border border-orange-200">
              <div className="text-[11px] text-orange-800 font-semibold">Khẩu Phần Còn Lại</div>
              <div className="text-xl font-black text-orange-950 mt-0.5">
                {activeStats.remainingPortions}{' '}
                <span className="text-xs font-bold text-orange-700">khẩu phần</span>
              </div>
              <div className="text-[10.5px] text-orange-700 mt-0.5">
                Gói đăng ký: {activeStats.totalPortions} khẩu phần
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-blue-50/80 border border-blue-200">
              <div className="text-[11px] text-blue-800 font-semibold">Phân Loại Thực Tế</div>
              <div className="text-sm font-black text-blue-950 mt-1">
                ✓ Tại chỗ: {activeStats.dineInPortions} • 🥡 Mang về: {activeStats.takeawayPortions}
              </div>
              <div className="text-[10.5px] text-blue-700 mt-0.5">
                Linh hoạt ăn tại CLB hoặc mang về
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200">
              <div className="text-[11px] text-slate-600 font-semibold">Chỉ Cân - Không Ăn</div>
              <div className="text-xl font-black text-slate-900 mt-0.5">
                {activeStats.weighedNoMealDays}{' '}
                <span className="text-xs font-bold text-slate-500">lần</span>
              </div>
              <div className="text-[10.5px] text-slate-500 mt-0.5">
                Không trừ vào khẩu phần phiếu ăn
              </div>
            </div>
          </div>

          {/* Compact Day Filter Bar & Legend */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 px-3 py-2.5 bg-slate-50 rounded-2xl border border-slate-200/80 text-[11px]">
            {/* Range Filter Tabs */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-bold text-slate-700 mr-1">Hiển thị ngày:</span>
              {[
                { id: 'COMPACT' as const, label: `Tóm gọn (${compactStudentSlots.length} ngày)` },
                { id: '1-10' as const, label: 'Ngày 1 - 10' },
                { id: '11-20' as const, label: 'Ngày 11 - 20' },
                { id: '21-30' as const, label: 'Ngày 21 - 30' },
                { id: 'ALL' as const, label: 'Tất cả 30 ngày' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setDayRangeFilter(tab.id)}
                  className={`px-2.5 py-1 rounded-lg font-bold transition-colors cursor-pointer ${
                    dayRangeFilter === tab.id
                      ? 'bg-emerald-600 text-white shadow-2xs'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Compact Legend */}
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center space-x-1 text-emerald-800 font-bold">
                <span className="w-2.5 h-2.5 rounded-xs bg-emerald-600 inline-block"></span>
                <span>✓ Tại chỗ</span>
              </span>
              <span className="inline-flex items-center space-x-1 text-amber-800 font-bold">
                <span className="w-2.5 h-2.5 rounded-xs bg-amber-500 inline-block"></span>
                <span>🥡 Mang về</span>
              </span>
              <span className="inline-flex items-center space-x-1 text-slate-500 font-medium">
                <span className="w-2.5 h-2.5 rounded-xs bg-white border border-slate-300 inline-block"></span>
                <span>Trống</span>
              </span>
            </div>
          </div>

          {/* Compact 30-Day Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-6 gap-2">
            {visibleStudentSlots.map((slot) => {
              const hasAnyUsed =
                slot.morningStatus !== 'none' || slot.afternoonStatus !== 'none';
              const isBothDone =
                slot.morningStatus !== 'none' && slot.afternoonStatus !== 'none';
              const isWeighedNoMeal =
                slot.attendanceStatus === 'weighed_no_meal' && !hasAnyUsed;

              return (
                <div
                  key={slot.dayNumber}
                  className={`p-2 rounded-xl border transition-all flex flex-col justify-between gap-1.5 ${
                    isBothDone
                      ? 'bg-emerald-50/60 border-emerald-300'
                      : hasAnyUsed
                      ? 'bg-amber-50/40 border-amber-300'
                      : isWeighedNoMeal
                      ? 'bg-slate-100 border-slate-300'
                      : 'bg-white border-slate-200/90 hover:border-slate-300'
                  }`}
                >
                  {/* Slim Day Header */}
                  <div className="flex items-center justify-between gap-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="font-extrabold text-slate-900 text-[11px] whitespace-nowrap">
                        Ngày {slot.dayNumber}
                      </span>
                      {slot.date ? (
                        <span className="text-[9.5px] font-mono font-bold px-1 py-0.2 rounded bg-slate-100 text-slate-700">
                          {formatShortDate(slot.date)}
                        </span>
                      ) : (
                        <span className="text-[9.5px] text-slate-300">--/--</span>
                      )}
                    </div>

                    {mode === 'trainer' && (hasAnyUsed || isWeighedNoMeal || slot.note) && (
                      <button
                        type="button"
                        onClick={() =>
                          upsertMealTicket({
                            studentId: activeCardStudent.id,
                            dayNumber: slot.dayNumber,
                            date: '',
                            morningStatus: 'none',
                            afternoonStatus: 'none',
                            attendanceStatus: undefined,
                            note: '',
                          })
                        }
                        className="text-slate-400 hover:text-rose-600 shrink-0 cursor-pointer"
                        title="Xóa ngày này"
                      >
                        <XCircle className="w-3 h-3" />
                      </button>
                    )}
                  </div>

                  {/* Slim Morning & Afternoon Interactive Buttons */}
                  <div className="grid grid-cols-2 gap-1">
                    {/* Morning Button */}
                    <button
                      type="button"
                      disabled={mode !== 'trainer'}
                      onClick={() =>
                        handleSlotToggle(activeCardStudent.id, slot, 'morning')
                      }
                      className={`py-1 px-1.5 rounded-lg border text-[10px] transition-all flex items-center justify-center gap-1 ${
                        mode === 'trainer' ? 'cursor-pointer' : 'cursor-default'
                      } ${
                        slot.morningStatus === 'used'
                          ? 'bg-emerald-600 text-white border-emerald-600 font-bold'
                          : slot.morningStatus === 'takeaway'
                          ? 'bg-amber-500 text-white border-amber-500 font-bold'
                          : 'bg-slate-50 hover:bg-slate-100 text-slate-500 border-slate-200'
                      }`}
                      title="Khẩu phần Sáng"
                    >
                      <Sun className="w-3 h-3 shrink-0" />
                      <span className="truncate">
                        {slot.morningStatus === 'used'
                          ? 'Sáng ✓'
                          : slot.morningStatus === 'takeaway'
                          ? 'Sáng 🥡'
                          : 'Sáng'}
                      </span>
                    </button>

                    {/* Afternoon Button */}
                    <button
                      type="button"
                      disabled={mode !== 'trainer'}
                      onClick={() =>
                        handleSlotToggle(activeCardStudent.id, slot, 'afternoon')
                      }
                      className={`py-1 px-1.5 rounded-lg border text-[10px] transition-all flex items-center justify-center gap-1 ${
                        mode === 'trainer' ? 'cursor-pointer' : 'cursor-default'
                      } ${
                        slot.afternoonStatus === 'used'
                          ? 'bg-emerald-600 text-white border-emerald-600 font-bold'
                          : slot.afternoonStatus === 'takeaway'
                          ? 'bg-amber-500 text-white border-amber-500 font-bold'
                          : 'bg-slate-50 hover:bg-slate-100 text-slate-500 border-slate-200'
                      }`}
                      title="Khẩu phần Chiều"
                    >
                      <Sunset className="w-3 h-3 shrink-0" />
                      <span className="truncate">
                        {slot.afternoonStatus === 'used'
                          ? 'Chiều ✓'
                          : slot.afternoonStatus === 'takeaway'
                          ? 'Chiều 🥡'
                          : 'Chiều'}
                      </span>
                    </button>
                  </div>

                  {/* Optional Note / Weighed-no-meal badge (only rendered when present) */}
                  {(isWeighedNoMeal || slot.note) && (
                    <div className="text-[9.5px] leading-tight truncate">
                      {isWeighedNoMeal ? (
                        <span className="text-slate-600 font-bold" title={slot.note}>
                          ⚖️ Cân - Không ăn
                        </span>
                      ) : (
                        <span className="text-slate-500" title={slot.note}>
                          {slot.note}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {dayRangeFilter === 'COMPACT' && activeStudentSlots.length > compactStudentSlots.length && (
            <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-slate-50 border border-slate-200/80 text-[11px] text-slate-600">
              <span>
                Đang thu gọn <strong>{activeStudentSlots.length - compactStudentSlots.length} ngày chưa sử dụng</strong> để giao diện gọn gàng.
              </span>
              <button
                type="button"
                onClick={() => setDayRangeFilter('ALL')}
                className="font-bold text-emerald-700 hover:text-emerald-800 cursor-pointer"
              >
                Xem toàn bộ 30 ngày →
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="p-8 bg-white rounded-3xl border border-slate-200 text-center text-xs text-slate-500">
          Chưa có học viên nào để hiển thị Phiếu Ăn 30 Ngày.
        </div>
      )}
    </div>
  );
};
