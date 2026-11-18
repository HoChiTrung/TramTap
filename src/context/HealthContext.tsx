/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import {
  StudentProfile,
  HealthMetricRecord,
  AIAdviceRecord,
  MealLog,
  PortionStatus,
  WorkoutLog,
  PhysiquePhoto,
  Badge,
  SmartNotification,
  UserRole,
  AuthUser,
  UserAccount,
} from '../types/health';
import {
  generateInstantAIAdvice,
  detectAnomalies,
} from '../utils/healthCalculations';

interface HealthContextType {
  // Authentication & Accounts
  currentUser: AuthUser | null;
  login: (username: string, pass: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  isAdmin: boolean;
  isTrainer: boolean;
  canCreateStudent: boolean;
  users: UserAccount[];
  trainers: UserAccount[];
  createUserAccount: (params: {
    username: string;
    password: string;
    role: UserRole;
    fullName: string;
    phone?: string;
    studentId?: string;
    trainerId?: string;
  }) => Promise<{ success: boolean; user?: UserAccount; error?: string }>;
  updateUserAccount: (
    id: string,
    params: {
      username?: string;
      password?: string;
      fullName?: string;
      phone?: string;
      role?: UserRole;
      trainerId?: string;
    }
  ) => Promise<{ success: boolean; error?: string }>;
  deleteUserAccount: (id: string) => Promise<{ success: boolean; error?: string }>;
  assignStudentToTrainer: (studentId: string, trainerId: string) => Promise<void>;

  // Role & selection
  role: UserRole;
  setRole: (role: UserRole) => void;
  students: StudentProfile[];
  allStudents: StudentProfile[];
  selectedStudent: StudentProfile | null;
  setSelectedStudent: (student: StudentProfile | null) => void;
  metrics: HealthMetricRecord[];
  getStudentMetrics: (studentId: string) => HealthMetricRecord[];
  advices: AIAdviceRecord[];
  getStudentAdvices: (studentId: string) => AIAdviceRecord[];
  meals: MealLog[];
  getStudentMeals: (studentId: string) => MealLog[];
  workouts: WorkoutLog[];
  getStudentWorkouts: (studentId: string) => WorkoutLog[];
  photos: PhysiquePhoto[];
  getStudentPhotos: (studentId: string) => PhysiquePhoto[];
  badges: Badge[];
  notifications: SmartNotification[];
  unreadNotificationCount: number;
  dbStatus: { connected: boolean; name: string };

  // Operations
  addStudent: (
    student: Omit<StudentProfile, 'id' | 'createdAt'> & {
      initialUsername?: string;
      initialPassword?: string;
    }
  ) => Promise<StudentProfile>;
  updateStudent: (student: StudentProfile) => Promise<void>;
  deleteStudent: (id: string) => Promise<void>;
  addMetricRecord: (record: Omit<HealthMetricRecord, 'id' | 'timestamp'>) => Promise<void>;
  deleteMetricRecord: (id: string) => Promise<void>;
  addMealLog: (meal: Omit<MealLog, 'id' | 'loggedAt'>) => Promise<void>;
  upsertMealTicket: (params: {
    studentId: string;
    dayNumber: number;
    date: string;
    morningStatus: PortionStatus;
    afternoonStatus: PortionStatus;
    note?: string;
    attendanceStatus?: 'ate' | 'takeaway' | 'weighed_no_meal';
  }) => Promise<void>;
  resetStudentMealTickets: (studentId: string) => Promise<void>;
  addMealFeedback: (id: string, reaction: '🔥' | '💪' | '👏' | '❤️', comment?: string) => Promise<void>;
  addWorkoutLog: (workout: Omit<WorkoutLog, 'id' | 'loggedAt'>) => Promise<void>;
  addWorkoutFeedback: (id: string, reaction: '🔥' | '💪' | '👏' | '❤️', comment?: string) => Promise<void>;
  addPhysiquePhoto: (photo: Omit<PhysiquePhoto, 'id'>) => Promise<void>;
  markNotificationRead: (id: string) => Promise<void>;

  // Modals
  openReportModal: boolean;
  setOpenReportModal: (open: boolean) => void;
  openStandardsModal: boolean;
  setOpenStandardsModal: (open: boolean) => void;
}

const HealthContext = createContext<HealthContextType | undefined>(undefined);

// One-time cleanup of any legacy sample data cached in browser localStorage
function purgeLegacySampleCache() {
  try {
    if (localStorage.getItem('fit_db_clean_v2') !== 'true') {
      const keysToRemove = [
        'fit_students',
        'fit_selected_student_id',
        'fit_metrics',
        'fit_advices',
        'fit_meals',
        'fit_workouts',
        'fit_photos',
        'fit_badges',
        'fit_notifications',
        'fit_custom_users',
        'fit_deleted_students',
        'fit_deleted_metrics',
      ];
      for (const k of keysToRemove) {
        localStorage.removeItem(k);
      }
      localStorage.setItem('fit_db_clean_v2', 'true');
    }
  } catch {
    // Ignore storage error
  }
}

export const HealthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  purgeLegacySampleCache();

  const [currentUser, setCurrentUser] = useState<AuthUser | null>(() => {
    try {
      const saved = localStorage.getItem('fit_auth_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [role, setRole] = useState<UserRole>(currentUser?.role || 'trainer');
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [allStudents, setAllStudents] = useState<StudentProfile[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<StudentProfile | null>(null);
  const [metrics, setMetrics] = useState<HealthMetricRecord[]>([]);
  const [advices, setAdvices] = useState<AIAdviceRecord[]>([]);
  const [meals, setMeals] = useState<MealLog[]>([]);
  const [workouts, setWorkouts] = useState<WorkoutLog[]>([]);
  const [photos, setPhotos] = useState<PhysiquePhoto[]>([]);
  const [badges] = useState<Badge[]>([]);
  const [notifications, setNotifications] = useState<SmartNotification[]>([]);

  const [dbStatus, setDbStatus] = useState<{ connected: boolean; name: string }>({
    connected: true,
    name: 'Aiven TramTap (PostgreSQL)',
  });

  const [openReportModal, setOpenReportModal] = useState(false);
  const [openStandardsModal, setOpenStandardsModal] = useState(false);

  const trainers = useMemo(
    () => users.filter((u) => u.role === 'trainer' || u.role === 'admin'),
    [users]
  );

  // Filter students based on logged-in user:
  // - Admin: sees all students
  // - Trainer: sees students assigned to them (or unassigned legacy students)
  // - Student: sees their own profile
  const students = useMemo(() => {
    if (!currentUser) return allStudents;
    if (currentUser.role === 'admin') return allStudents;
    if (currentUser.role === 'trainer') {
      return allStudents.filter(
        (s) => !s.trainerId || s.trainerId === currentUser.id
      );
    }
    if (currentUser.role === 'student' && currentUser.studentId) {
      return allStudents.filter((s) => s.id === currentUser.studentId);
    }
    return allStudents;
  }, [allStudents, currentUser]);

  // Sync role and selected student when user or students list changes
  useEffect(() => {
    if (currentUser) {
      setRole(currentUser.role);
      if (currentUser.role === 'student' && currentUser.studentId) {
        const found = allStudents.find((s) => s.id === currentUser.studentId);
        if (found) setSelectedStudent(found);
      } else if (
        (currentUser.role === 'trainer' || currentUser.role === 'admin') &&
        students.length > 0
      ) {
        if (!selectedStudent || !students.some((s) => s.id === selectedStudent.id)) {
          setSelectedStudent(students[0]);
        }
      } else if (students.length === 0) {
        setSelectedStudent(null);
      }
    }
  }, [currentUser, allStudents, students, selectedStudent]);

  const fetchUsersList = async () => {
    try {
      const res = await fetch('/api/users');
      if (res.ok) {
        const list = await res.json();
        if (Array.isArray(list)) {
          setUsers(list);
        }
      }
    } catch {
      // Ignore
    }
  };

  // Load all data directly from PostgreSQL database API
  useEffect(() => {
    async function loadDataFromDatabase() {
      try {
        const healthCheck = await fetch('/api/health').catch(() => null);
        if (healthCheck && healthCheck.ok) {
          const healthData = await healthCheck.json().catch(() => null);
          if (healthData) {
            setDbStatus({
              connected: healthData.databaseConnected ?? true,
              name: `${healthData.databaseName || 'TramTap'} (PostgreSQL)`,
            });
          }
        }

        const [resU, resS, resM, resA, resMeals, resW, resP, resN] = await Promise.allSettled([
          fetch('/api/users').then((r) => (r.ok ? r.json() : [])),
          fetch('/api/students').then((r) => (r.ok ? r.json() : [])),
          fetch('/api/metrics').then((r) => (r.ok ? r.json() : [])),
          fetch('/api/advices').then((r) => (r.ok ? r.json() : [])),
          fetch('/api/meals').then((r) => (r.ok ? r.json() : [])),
          fetch('/api/workouts').then((r) => (r.ok ? r.json() : [])),
          fetch('/api/photos').then((r) => (r.ok ? r.json() : [])),
          fetch('/api/notifications').then((r) => (r.ok ? r.json() : [])),
        ]);

        if (resU.status === 'fulfilled' && Array.isArray(resU.value)) {
          setUsers(resU.value);
        }
        if (resS.status === 'fulfilled' && Array.isArray(resS.value)) {
          setAllStudents(resS.value);
          setSelectedStudent((prev) => {
            if (prev && resS.value.some((s: StudentProfile) => s.id === prev.id)) {
              return prev;
            }
            return resS.value[0] || null;
          });
        }
        if (resM.status === 'fulfilled' && Array.isArray(resM.value)) {
          setMetrics(resM.value);
        }
        if (resA.status === 'fulfilled' && Array.isArray(resA.value)) {
          setAdvices(resA.value);
        }
        if (resMeals.status === 'fulfilled' && Array.isArray(resMeals.value)) {
          setMeals(resMeals.value);
        }
        if (resW.status === 'fulfilled' && Array.isArray(resW.value)) {
          setWorkouts(resW.value);
        }
        if (resP.status === 'fulfilled' && Array.isArray(resP.value)) {
          setPhotos(resP.value);
        }
        if (resN.status === 'fulfilled' && Array.isArray(resN.value)) {
          setNotifications(resN.value);
        }
      } catch (err) {
        console.warn('Database fetch error:', err);
      }
    }

    loadDataFromDatabase();
  }, []);

  // Login handler against PostgreSQL Database
  const login = async (username: string, pass: string) => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password: pass }),
      });
      const data = await res.json();
      if (res.ok && data.success && data.user) {
        setCurrentUser(data.user);
        setRole(data.user.role);
        localStorage.setItem('fit_auth_user', JSON.stringify(data.user));

        await fetchUsersList();

        if (data.user.role === 'student' && data.user.studentId) {
          const found = allStudents.find((s) => s.id === data.user.studentId);
          if (found) setSelectedStudent(found);
        }
        return { success: true };
      }
      return { success: false, error: data.error || 'Đăng nhập không thành công' };
    } catch {
      return { success: false, error: 'Không thể kết nối máy chủ cơ sở dữ liệu!' };
    }
  };

  const logout = () => {
    setCurrentUser(null);
    localStorage.removeItem('fit_auth_user');
  };

  const isAdmin = currentUser?.role === 'admin';
  const isTrainer = currentUser?.role === 'trainer' || currentUser?.role === 'admin';
  const canCreateStudent =
    currentUser?.role === 'trainer' || currentUser?.role === 'admin';

  // User Accounts CRUD in Database
  const createUserAccount: HealthContextType['createUserAccount'] = async (params) => {
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.error || 'Không thể tạo tài khoản' };
      }
      await fetchUsersList();
      return { success: true, user: data };
    } catch {
      return { success: false, error: 'Lỗi kết nối khi tạo tài khoản' };
    }
  };

  const updateUserAccount: HealthContextType['updateUserAccount'] = async (id, params) => {
    try {
      const res = await fetch(`/api/users/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.error || 'Không thể cập nhật tài khoản' };
      }
      await fetchUsersList();
      return { success: true };
    } catch {
      return { success: false, error: 'Lỗi kết nối khi cập nhật tài khoản' };
    }
  };

  const deleteUserAccount: HealthContextType['deleteUserAccount'] = async (id) => {
    try {
      const res = await fetch(`/api/users/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) {
        return { success: false, error: data.error || 'Không thể xóa tài khoản' };
      }
      setUsers((prev) => prev.filter((u) => u.id !== id));
      return { success: true };
    } catch {
      return { success: false, error: 'Lỗi kết nối khi xóa tài khoản' };
    }
  };

  const assignStudentToTrainer = async (studentId: string, trainerId: string) => {
    const student = allStudents.find((s) => s.id === studentId);
    if (!student) return;
    const trainer = users.find((u) => u.id === trainerId);
    const updatedStudent: StudentProfile = {
      ...student,
      trainerId: trainer ? trainer.id : '',
      trainerName: trainer ? trainer.fullName : '',
    };
    await updateStudent(updatedStudent);
    await fetchUsersList();
  };

  const getStudentMetrics = (studentId: string) => {
    return metrics
      .filter((m) => m.studentId === studentId)
      .sort((a, b) => a.timestamp - b.timestamp);
  };

  const getStudentAdvices = (studentId: string) => {
    return advices.filter((a) => a.studentId === studentId);
  };

  const getStudentMeals = (studentId: string) => {
    return meals.filter((m) => m.studentId === studentId);
  };

  const getStudentWorkouts = (studentId: string) => {
    return workouts.filter((w) => w.studentId === studentId);
  };

  const getStudentPhotos = (studentId: string) => {
    return photos.filter((p) => p.studentId === studentId);
  };

  const unreadNotificationCount = notifications.filter((n) => !n.read).length;

  // Add Student -> Saves directly to PostgreSQL database and binds to managing Trainer
  const addStudent = async (
    studentData: Omit<StudentProfile, 'id' | 'createdAt'> & {
      initialUsername?: string;
      initialPassword?: string;
    }
  ) => {
    const resolvedTrainerId =
      studentData.trainerId ||
      (currentUser?.role === 'trainer' || currentUser?.role === 'admin' ? currentUser.id : '');
    const trainerAccount = users.find((u) => u.id === resolvedTrainerId);
    const resolvedTrainerName =
      studentData.trainerName ||
      trainerAccount?.fullName ||
      (currentUser?.role === 'trainer' || currentUser?.role === 'admin'
        ? currentUser.fullName
        : '');

    const newStudent: StudentProfile = {
      fullName: studentData.fullName.trim(),
      gender: studentData.gender,
      age: Number(studentData.age) || 25,
      height: Number(studentData.height) || 1.7,
      phone: studentData.phone.trim(),
      address: studentData.address?.trim() || '',
      dateOfBirth: studentData.dateOfBirth || '2000-01-01',
      healthGoal:
        studentData.healthGoal?.trim() || 'Cân đối vóc dáng & Cải thiện sức khỏe toàn diện',
      targetMetrics: studentData.targetMetrics || {},
      avatarUrl: studentData.avatarUrl || '',
      trainerId: resolvedTrainerId,
      trainerName: resolvedTrainerName,
      id: `student-${Date.now()}`,
      createdAt: new Date().toISOString().split('T')[0],
    };

    const res = await fetch('/api/students', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-auth-username': currentUser?.username || 'admin',
      },
      body: JSON.stringify({
        ...newStudent,
        initialUsername: studentData.initialUsername || studentData.phone,
        initialPassword: studentData.initialPassword || '123',
      }),
    });

    if (res.ok) {
      const saved = await res.json();
      setAllStudents((prev) => [saved, ...prev.filter((s) => s.id !== saved.id)]);
      setSelectedStudent(saved);
      await fetchUsersList();
      return saved;
    }

    setAllStudents((prev) => [newStudent, ...prev]);
    setSelectedStudent(newStudent);
    return newStudent;
  };

  // Update Student -> Updates PostgreSQL database and recalculates AI calorie advice
  const updateStudent = async (student: StudentProfile) => {
    setAllStudents((prev) => prev.map((s) => (s.id === student.id ? student : s)));
    if (selectedStudent?.id === student.id) {
      setSelectedStudent(student);
    }

    await fetch(`/api/students/${student.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(student),
    }).catch((err) => console.warn('Could not update student on DB', err));

    // Recalculate AI advice for latest measurement when target weight / duration changes
    const studentHistory = getStudentMetrics(student.id);
    const latestRecord = studentHistory[studentHistory.length - 1];
    const previousRecord =
      studentHistory.length > 1 ? studentHistory[studentHistory.length - 2] : undefined;

    if (latestRecord) {
      const updatedContent = generateInstantAIAdvice(student, latestRecord, previousRecord);
      const existingAdvice = advices.find((a) => a.studentId === student.id);
      if (existingAdvice) {
        const updatedAdvice: AIAdviceRecord = {
          ...existingAdvice,
          aiDraftContent: updatedContent,
          trainerEditedContent: updatedContent.summary,
        };
        setAdvices((prev) => prev.map((a) => (a.id === existingAdvice.id ? updatedAdvice : a)));
        await fetch(`/api/advices/${existingAdvice.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updatedAdvice),
        }).catch(() => null);
      }
    }
  };

  // Delete Student
  const deleteStudent = async (id: string) => {
    setAllStudents((prev) => {
      const updatedList = prev.filter((s) => s.id !== id);
      if (selectedStudent?.id === id) {
        setSelectedStudent(updatedList[0] || null);
      }
      return updatedList;
    });
    setMetrics((prev) => prev.filter((m) => m.studentId !== id));
    setAdvices((prev) => prev.filter((a) => a.studentId !== id));
    setMeals((prev) => prev.filter((m) => m.studentId !== id));
    setWorkouts((prev) => prev.filter((w) => w.studentId !== id));
    setPhotos((prev) => prev.filter((p) => p.studentId !== id));
    setUsers((prev) => prev.filter((u) => u.studentId !== id));

    await fetch(`/api/students/${id}`, { method: 'DELETE' }).catch((err) =>
      console.warn('Could not delete student on DB', err)
    );
  };

  // Add Metric Record + Instant AI Advice saved to PostgreSQL
  const addMetricRecord = async (recordData: Omit<HealthMetricRecord, 'id' | 'timestamp'>) => {
    const timestamp = new Date(recordData.date).getTime() || Date.now();
    const newRecord: HealthMetricRecord = {
      ...recordData,
      id: `metric-${Date.now()}`,
      timestamp,
    };

    const studentHistory = getStudentMetrics(recordData.studentId);
    const previousRecord = studentHistory[studentHistory.length - 1];

    setMetrics((prev) => [...prev, newRecord].sort((a, b) => a.timestamp - b.timestamp));

    await fetch('/api/metrics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newRecord),
    }).catch((err) => console.warn('Could not save metric to DB', err));

    const targetStudent = allStudents.find((s) => s.id === recordData.studentId);
    if (targetStudent) {
      const adviceContent = generateInstantAIAdvice(targetStudent, newRecord, previousRecord);
      const newAdvice: AIAdviceRecord = {
        id: `advice-${Date.now()}`,
        studentId: recordData.studentId,
        metricRecordId: newRecord.id,
        date: recordData.date,
        status: 'auto_generated',
        aiDraftContent: adviceContent,
        trainerEditedContent: adviceContent.summary,
        approvedAt: new Date().toLocaleString('vi-VN'),
      };

      setAdvices((prev) => [newAdvice, ...prev]);

      await fetch('/api/advices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newAdvice),
      }).catch((err) => console.warn('Could not save advice to DB', err));

      // Request Gemini AI 3-part health analysis and update DB record
      fetch('/api/ai/analyze-health', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student: targetStudent,
          metric: newRecord,
          previousMetric: previousRecord,
        }),
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((aiData) => {
          if (aiData && aiData.success && aiData.analysis) {
            const enrichedAdvice: AIAdviceRecord = {
              ...newAdvice,
              aiDraftContent: aiData.analysis,
              trainerEditedContent: aiData.analysis.summary,
            };
            setAdvices((prev) => prev.map((a) => (a.id === newAdvice.id ? enrichedAdvice : a)));
            fetch(`/api/advices/${newAdvice.id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(enrichedAdvice),
            }).catch(() => null);
          }
        })
        .catch(() => null);

      const anomalies = detectAnomalies(targetStudent, newRecord, [...studentHistory, newRecord]);
      for (const anomaly of anomalies) {
        const notif: SmartNotification = {
          id: `notif-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          useCaseId: anomaly.type === 'PLATEAU' ? 'UC-NOTIF-03' : 'UC-NOTIF-01',
          studentId: targetStudent.id,
          title: anomaly.title,
          message: anomaly.message,
          priority: anomaly.severity === 'high' ? 'high' : 'medium',
          createdAt: new Date().toLocaleString('vi-VN'),
          read: false,
        };
        setNotifications((prev) => [notif, ...prev]);
      }
    }
  };

  // Delete Metric Record
  const deleteMetricRecord = async (id: string) => {
    setMetrics((prev) => prev.filter((m) => m.id !== id));
    setAdvices((prev) => prev.filter((a) => a.metricRecordId !== id));

    await fetch(`/api/metrics/${id}`, { method: 'DELETE' }).catch((err) =>
      console.warn('Could not delete metric from DB', err)
    );
  };

  // Add Meal Log
  const addMealLog = async (mealData: Omit<MealLog, 'id' | 'loggedAt'>) => {
    const newMeal: MealLog = {
      ...mealData,
      imageUrl: mealData.imageUrl || '',
      id: `meal-${Date.now()}`,
      loggedAt: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
    };

    setMeals((prev) => [newMeal, ...prev]);

    await fetch('/api/meals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newMeal),
    }).catch((err) => console.warn('Could not save meal to DB', err));
  };

  // Add Meal Trainer Feedback
  const addMealFeedback = async (
    id: string,
    reaction: '🔥' | '💪' | '👏' | '❤️',
    comment?: string
  ) => {
    setMeals((prev) =>
      prev.map((m) =>
        m.id === id ? { ...m, trainerReaction: reaction, trainerComment: comment } : m
      )
    );

    await fetch(`/api/meals/${id}/feedback`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reaction, comment }),
    }).catch((err) => console.warn('Could not save meal feedback', err));
  };

  // Upsert a 30-day meal ticket slot (Day 1..30, Morning & Afternoon portions)
  const upsertMealTicket = async (params: {
    studentId: string;
    dayNumber: number;
    date: string;
    morningStatus: PortionStatus;
    afternoonStatus: PortionStatus;
    note?: string;
    attendanceStatus?: 'ate' | 'takeaway' | 'weighed_no_meal';
  }) => {
    const ticketId = `ticket-${params.studentId}-d${params.dayNumber}`;
    const trimmedNote = (params.note || '').trim();
    const isEmptySlot =
      params.morningStatus === 'none' &&
      params.afternoonStatus === 'none' &&
      !trimmedNote &&
      !params.attendanceStatus;

    if (isEmptySlot) {
      setMeals((prev) => prev.filter((m) => m.id !== ticketId));
      await fetch(`/api/meals/${ticketId}`, { method: 'DELETE' }).catch((err) =>
        console.warn('Could not delete empty meal ticket slot', err)
      );
      return;
    }

    const statusSummaryParts: string[] = [];
    if (params.morningStatus === 'used') statusSummaryParts.push('Sáng: Đã dùng');
    else if (params.morningStatus === 'takeaway') statusSummaryParts.push('Sáng: Mang về');
    if (params.afternoonStatus === 'used') statusSummaryParts.push('Chiều: Đã dùng');
    else if (params.afternoonStatus === 'takeaway') statusSummaryParts.push('Chiều: Mang về');
    if (statusSummaryParts.length === 0 && params.attendanceStatus === 'weighed_no_meal') {
      statusSummaryParts.push('Cân chỉ số - Không dùng bữa');
    }

    const newTicket: MealLog = {
      id: ticketId,
      studentId: params.studentId,
      date: params.date || new Date().toISOString().split('T')[0],
      mealType: 'Phiếu ăn 30 ngày',
      imageUrl: '',
      foodDescription:
        trimmedNote || statusSummaryParts.join(' • ') || `Ngày ${params.dayNumber}/30`,
      estimatedCalories: 0,
      macros: {
        protein: 0,
        carbs: 0,
        fat: 0,
        dayNumber: params.dayNumber,
        morningStatus: params.morningStatus,
        afternoonStatus: params.afternoonStatus,
        attendanceStatus: params.attendanceStatus,
      },
      trainerComment: trimmedNote || undefined,
      loggedAt: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
    };

    setMeals((prev) => [newTicket, ...prev.filter((m) => m.id !== ticketId)]);

    await fetch('/api/meals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newTicket),
    }).catch((err) => console.warn('Could not save meal ticket to DB', err));
  };

  // Reset all 30-day meal tickets for a student (start a new 30-day card cycle)
  const resetStudentMealTickets = async (studentId: string) => {
    setMeals((prev) => prev.filter((m) => m.studentId !== studentId));
    await fetch(`/api/meals/student/${studentId}`, { method: 'DELETE' }).catch((err) =>
      console.warn('Could not reset student meal tickets', err)
    );
  };

  // Add Workout Log
  const addWorkoutLog = async (workoutData: Omit<WorkoutLog, 'id' | 'loggedAt'>) => {
    const newWorkout: WorkoutLog = {
      ...workoutData,
      id: `workout-${Date.now()}`,
      loggedAt: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
    };

    setWorkouts((prev) => [newWorkout, ...prev]);

    await fetch('/api/workouts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newWorkout),
    }).catch((err) => console.warn('Could not save workout to DB', err));
  };

  // Add Workout Feedback
  const addWorkoutFeedback = async (
    id: string,
    reaction: '🔥' | '💪' | '👏' | '❤️',
    comment?: string
  ) => {
    setWorkouts((prev) =>
      prev.map((w) =>
        w.id === id ? { ...w, trainerReaction: reaction, trainerComment: comment } : w
      )
    );

    await fetch(`/api/workouts/${id}/feedback`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reaction, comment }),
    }).catch((err) => console.warn('Could not save workout feedback', err));
  };

  // Add Physique Photo
  const addPhysiquePhoto = async (photoData: Omit<PhysiquePhoto, 'id'>) => {
    const newPhoto: PhysiquePhoto = {
      ...photoData,
      id: `photo-${Date.now()}`,
    };
    setPhotos((prev) => [...prev, newPhoto]);

    await fetch('/api/photos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newPhoto),
    }).catch((err) => console.warn('Could not save photo to DB', err));
  };

  // Mark notification read
  const markNotificationRead = async (id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));

    await fetch(`/api/notifications/${id}/read`, { method: 'PUT' }).catch((err) =>
      console.warn('Could not mark notification read', err)
    );
  };

  return (
    <HealthContext.Provider
      value={{
        currentUser,
        login,
        logout,
        isAdmin,
        isTrainer,
        canCreateStudent,
        users,
        trainers,
        createUserAccount,
        updateUserAccount,
        deleteUserAccount,
        assignStudentToTrainer,
        role,
        setRole,
        students,
        allStudents,
        selectedStudent,
        setSelectedStudent,
        metrics,
        getStudentMetrics,
        advices,
        getStudentAdvices,
        meals,
        getStudentMeals,
        workouts,
        getStudentWorkouts,
        photos,
        getStudentPhotos,
        badges,
        notifications,
        unreadNotificationCount,
        dbStatus,
        addStudent,
        updateStudent,
        deleteStudent,
        addMetricRecord,
        deleteMetricRecord,
        addMealLog,
        upsertMealTicket,
        resetStudentMealTickets,
        addMealFeedback,
        addWorkoutLog,
        addWorkoutFeedback,
        addPhysiquePhoto,
        markNotificationRead,
        openReportModal,
        setOpenReportModal,
        openStandardsModal,
        setOpenStandardsModal,
      }}
    >
      {children}
    </HealthContext.Provider>
  );
};

export const useHealth = () => {
  const context = useContext(HealthContext);
  if (!context) {
    throw new Error('useHealth must be used within a HealthProvider');
  }
  return context;
};
