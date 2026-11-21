/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
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
import { HerbalifeProduct, TuitionPackage } from '../types/tuition';
import {
  generateInstantAIAdvice,
  detectAnomalies,
} from '../utils/healthCalculations';
import { apiUrl } from '../utils/api';

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
    discountTier?: number;
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
      discountTier?: number;
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
  dbStatus: { connected: boolean; name: string; host?: string; error?: string };
  dbError: string | null;
  clearDbError: () => void;
  refreshDatabase: () => Promise<void>;
  tuitionPackages: TuitionPackage[];
  herbalifeProducts: HerbalifeProduct[];
  refreshTuitionCatalog: () => Promise<{
    packages: TuitionPackage[];
    products: HerbalifeProduct[];
  } | null>;

  // Operations
  addStudent: (
    student: Omit<StudentProfile, 'id' | 'createdAt'> & {
      createAccount?: boolean;
      initialUsername?: string;
      initialPassword?: string;
    }
  ) => Promise<StudentProfile>;
  updateStudent: (
    student: StudentProfile,
    accountOptions?: {
      createAccount?: boolean;
      initialUsername?: string;
      initialPassword?: string;
    }
  ) => Promise<void>;
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

const DEFAULT_DB_DISCONNECTED_MSG =
  'Không thể kết nối đến Cơ sở dữ liệu PostgreSQL (Aiven Cloud). Hệ thống KHÔNG lưu vào bộ nhớ tạm của trình duyệt để tránh mất dữ liệu. Vui lòng kiểm tra lại kết nối Database!';

// Cleanup any legacy cached data in browser localStorage so the app never uses temporary browser data
function purgeLegacySampleCache() {
  try {
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
  const [tuitionPackages, setTuitionPackages] = useState<TuitionPackage[]>([]);
  const [herbalifeProducts, setHerbalifeProducts] = useState<HerbalifeProduct[]>([]);

  const [dbStatus, setDbStatus] = useState<{
    connected: boolean;
    name: string;
    host?: string;
    error?: string;
  }>({
    connected: true,
    name: 'defaultdb (PostgreSQL)',
    host: 'pg-1d2d7843-chitrung7542-3ac1.e.aivencloud.com',
  });
  const [dbError, setDbError] = useState<string | null>(null);

  const clearDbError = useCallback(() => {
    setDbError(null);
  }, []);

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

  const handleApiErrorResponse = async (res: Response, fallbackMsg: string): Promise<string> => {
    let errText = fallbackMsg;
    try {
      const body = await res.json();
      if (body && body.error) {
        errText = body.error;
      }
      if (res.status === 503 || body?.dbDisconnected) {
        setDbStatus((prev) => ({
          ...prev,
          connected: false,
          error: errText,
        }));
      }
    } catch {
      if (res.status === 503) {
        errText = DEFAULT_DB_DISCONNECTED_MSG;
        setDbStatus((prev) => ({
          ...prev,
          connected: false,
          error: errText,
        }));
      }
    }
    setDbError(errText);
    return errText;
  };

  const fetchUsersList = useCallback(async () => {
    try {
      const res = await fetch(apiUrl('/api/users'));
      if (res.ok) {
        const list = await res.json();
        if (Array.isArray(list)) {
          setUsers(list);
        }
      } else {
        await handleApiErrorResponse(res, DEFAULT_DB_DISCONNECTED_MSG);
      }
    } catch {
      setDbStatus((prev) => ({
        ...prev,
        connected: false,
        error: DEFAULT_DB_DISCONNECTED_MSG,
      }));
      setDbError(DEFAULT_DB_DISCONNECTED_MSG);
    }
  }, []);

  const refreshTuitionCatalog = useCallback(async () => {
    const parseCatalogResponse = async (res: Response | null) => {
      if (!res || !res.ok) return null;
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) return null;
      const data = await res.json().catch(() => null);
      if (!data || !Array.isArray(data.packages)) return null;
      return {
        packages: data.packages as TuitionPackage[],
        products: Array.isArray(data.products) ? (data.products as HerbalifeProduct[]) : [],
      };
    };

    try {
      // Primary endpoint: lightweight read-only packages + products catalog
      const primaryRes = await fetch(apiUrl('/api/tuition/packages')).catch(() => null);
      const primaryData = await parseCatalogResponse(primaryRes);
      if (primaryData && primaryData.packages.length > 0) {
        setTuitionPackages(primaryData.packages);
        setHerbalifeProducts(primaryData.products);
        return primaryData;
      }

      // Fallback endpoint: /api/tuition/bootstrap (works even if backend hasn't rolled out GET /api/tuition/packages yet)
      if (currentUser?.username) {
        const fallbackRes = await fetch(apiUrl('/api/tuition/bootstrap'), {
          headers: { 'x-auth-username': currentUser.username },
        }).catch(() => null);
        const fallbackData = await parseCatalogResponse(fallbackRes);
        if (fallbackData) {
          setTuitionPackages(fallbackData.packages);
          setHerbalifeProducts(fallbackData.products);
          return fallbackData;
        }
      }

      if (primaryData) {
        setTuitionPackages(primaryData.packages);
        setHerbalifeProducts(primaryData.products);
        return primaryData;
      }
      return null;
    } catch {
      return null;
    }
  }, [currentUser?.username]);

  // Load all data directly from PostgreSQL database API (Never from local storage)
  const refreshDatabase = useCallback(async () => {
    try {
      const healthCheck = await fetch(apiUrl('/api/health')).catch(() => null);
      if (!healthCheck) {
        setDbStatus({
          connected: false,
          name: 'defaultdb (PostgreSQL)',
          host: 'pg-1d2d7843-chitrung7542-3ac1.e.aivencloud.com',
          error: DEFAULT_DB_DISCONNECTED_MSG,
        });
        setDbError(DEFAULT_DB_DISCONNECTED_MSG);
        return;
      }

      const healthData = await healthCheck.json().catch(() => null);
      if (!healthCheck.ok || !healthData?.databaseConnected) {
        const errMsg = healthData?.error || DEFAULT_DB_DISCONNECTED_MSG;
        setDbStatus({
          connected: false,
          name: `${healthData?.databaseName || 'defaultdb'} (PostgreSQL)`,
          host: healthData?.host || 'pg-1d2d7843-chitrung7542-3ac1.e.aivencloud.com',
          error: errMsg,
        });
        setDbError(errMsg);
        return;
      }

      setDbStatus({
        connected: true,
        name: `${healthData.databaseName || 'defaultdb'} (PostgreSQL)`,
        host: healthData.host || 'pg-1d2d7843-chitrung7542-3ac1.e.aivencloud.com',
      });
      setDbError(null);

      const [resU, resS, resM, resA, resMeals, resW, resP, resN] = await Promise.allSettled([
        fetch(apiUrl('/api/users')).then((r) => (r.ok ? r.json() : Promise.reject(r))),
        fetch(apiUrl('/api/students')).then((r) => (r.ok ? r.json() : Promise.reject(r))),
        fetch(apiUrl('/api/metrics')).then((r) => (r.ok ? r.json() : Promise.reject(r))),
        fetch(apiUrl('/api/advices')).then((r) => (r.ok ? r.json() : Promise.reject(r))),
        fetch(apiUrl('/api/meals')).then((r) => (r.ok ? r.json() : Promise.reject(r))),
        fetch(apiUrl('/api/workouts')).then((r) => (r.ok ? r.json() : Promise.reject(r))),
        fetch(apiUrl('/api/photos')).then((r) => (r.ok ? r.json() : Promise.reject(r))),
        fetch(apiUrl('/api/notifications')).then((r) => (r.ok ? r.json() : Promise.reject(r))),
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
    } catch {
      setDbStatus((prev) => ({
        ...prev,
        connected: false,
        error: DEFAULT_DB_DISCONNECTED_MSG,
      }));
      setDbError(DEFAULT_DB_DISCONNECTED_MSG);
    }
  }, []);

  useEffect(() => {
    refreshDatabase();
  }, [refreshDatabase]);

  useEffect(() => {
    refreshTuitionCatalog();
  }, [refreshTuitionCatalog]);

  // Login handler against PostgreSQL Database
  const login = async (username: string, pass: string) => {
    try {
      const res = await fetch(apiUrl('/api/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password: pass }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success && data.user) {
        setCurrentUser(data.user);
        setRole(data.user.role);
        localStorage.setItem('fit_auth_user', JSON.stringify(data.user));
        setDbStatus((prev) => ({ ...prev, connected: true, error: undefined }));
        setDbError(null);

        await refreshDatabase();

        if (data.user.role === 'student' && data.user.studentId) {
          const found = allStudents.find((s) => s.id === data.user.studentId);
          if (found) setSelectedStudent(found);
        }
        return { success: true };
      }
      if (res.status === 503 || data.dbDisconnected) {
        const msg = data.error || DEFAULT_DB_DISCONNECTED_MSG;
        setDbStatus((prev) => ({ ...prev, connected: false, error: msg }));
        setDbError(msg);
        return { success: false, error: msg };
      }
      return { success: false, error: data.error || 'Đăng nhập không thành công' };
    } catch {
      setDbStatus((prev) => ({
        ...prev,
        connected: false,
        error: DEFAULT_DB_DISCONNECTED_MSG,
      }));
      setDbError(DEFAULT_DB_DISCONNECTED_MSG);
      return { success: false, error: DEFAULT_DB_DISCONNECTED_MSG };
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

  // User Accounts CRUD in PostgreSQL Database (No local memory fallback)
  const createUserAccount: HealthContextType['createUserAccount'] = async (params) => {
    try {
      const res = await fetch(apiUrl('/api/users'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      if (!res.ok) {
        const errMsg = await handleApiErrorResponse(
          res,
          'Không thể lưu tài khoản vào Database!'
        );
        return { success: false, error: errMsg };
      }
      const data = await res.json();
      setDbStatus((prev) => ({ ...prev, connected: true, error: undefined }));
      setDbError(null);
      await fetchUsersList();
      return { success: true, user: data };
    } catch {
      setDbStatus((prev) => ({ ...prev, connected: false, error: DEFAULT_DB_DISCONNECTED_MSG }));
      setDbError(DEFAULT_DB_DISCONNECTED_MSG);
      return { success: false, error: DEFAULT_DB_DISCONNECTED_MSG };
    }
  };

  const updateUserAccount: HealthContextType['updateUserAccount'] = async (id, params) => {
    try {
      const res = await fetch(apiUrl(`/api/users/${id}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      if (!res.ok) {
        const errMsg = await handleApiErrorResponse(
          res,
          'Không thể cập nhật tài khoản vào Database!'
        );
        return { success: false, error: errMsg };
      }
      setDbStatus((prev) => ({ ...prev, connected: true, error: undefined }));
      setDbError(null);
      await fetchUsersList();
      // If trainer name changed, refresh students to reflect new trainerName
      if (params.fullName) {
        const resS = await fetch(apiUrl('/api/students'));
        if (resS.ok) {
          const sList = await resS.json();
          if (Array.isArray(sList)) setAllStudents(sList);
        }
      }
      return { success: true };
    } catch {
      setDbStatus((prev) => ({ ...prev, connected: false, error: DEFAULT_DB_DISCONNECTED_MSG }));
      setDbError(DEFAULT_DB_DISCONNECTED_MSG);
      return { success: false, error: DEFAULT_DB_DISCONNECTED_MSG };
    }
  };

  const deleteUserAccount: HealthContextType['deleteUserAccount'] = async (id) => {
    try {
      const res = await fetch(apiUrl(`/api/users/${id}`), { method: 'DELETE' });
      if (!res.ok) {
        const errMsg = await handleApiErrorResponse(
          res,
          'Không thể xóa tài khoản trên Database!'
        );
        return { success: false, error: errMsg };
      }
      setDbStatus((prev) => ({ ...prev, connected: true, error: undefined }));
      setDbError(null);
      setUsers((prev) => prev.filter((u) => u.id !== id));
      return { success: true };
    } catch {
      setDbStatus((prev) => ({ ...prev, connected: false, error: DEFAULT_DB_DISCONNECTED_MSG }));
      setDbError(DEFAULT_DB_DISCONNECTED_MSG);
      return { success: false, error: DEFAULT_DB_DISCONNECTED_MSG };
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

  // Add Student -> Saves strictly to PostgreSQL database; throws error if DB is unreachable
  const addStudent = async (
    studentData: Omit<StudentProfile, 'id' | 'createdAt'> & {
      createAccount?: boolean;
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

    const shouldCreateAccount = studentData.createAccount !== false;
    const ageNum = Number(studentData.age) || 25;
    const newStudent: StudentProfile = {
      fullName: studentData.fullName.trim(),
      gender: studentData.gender,
      age: ageNum,
      height: Number(studentData.height) || 1.7,
      phone: studentData.phone.trim(),
      address: studentData.address?.trim() || '',
      dateOfBirth: studentData.dateOfBirth || `${new Date().getFullYear() - ageNum}-01-01`,
      healthGoal:
        studentData.healthGoal?.trim() ||
        (shouldCreateAccount
          ? 'Cân đối vóc dáng & Cải thiện sức khỏe toàn diện'
          : 'Tập luyện nâng cao sức khỏe'),
      targetMetrics: studentData.targetMetrics || {},
      avatarUrl: studentData.avatarUrl || '',
      trainerId: resolvedTrainerId,
      trainerName: resolvedTrainerName,
      id: `student-${Date.now()}`,
      createdAt: new Date().toISOString().split('T')[0],
    };

    let res: Response;
    try {
      res = await fetch(apiUrl('/api/students'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-auth-username': currentUser?.username || 'admin',
        },
        body: JSON.stringify({
          ...newStudent,
          createAccount: shouldCreateAccount,
          ...(shouldCreateAccount
            ? {
                initialUsername: studentData.initialUsername || studentData.phone,
                initialPassword: studentData.initialPassword || '123',
              }
            : {}),
        }),
      });
    } catch {
      setDbStatus((prev) => ({ ...prev, connected: false, error: DEFAULT_DB_DISCONNECTED_MSG }));
      setDbError(DEFAULT_DB_DISCONNECTED_MSG);
      throw new Error(DEFAULT_DB_DISCONNECTED_MSG);
    }

    if (!res.ok) {
      const errMsg = await handleApiErrorResponse(
        res,
        'Không thể lưu hồ sơ & tài khoản học viên vào Database!'
      );
      throw new Error(errMsg);
    }

    const saved = await res.json();
    setDbStatus((prev) => ({ ...prev, connected: true, error: undefined }));
    setDbError(null);
    setAllStudents((prev) => [saved, ...prev.filter((s) => s.id !== saved.id)]);
    setSelectedStudent(saved);
    if (shouldCreateAccount) {
      await fetchUsersList();
    }
    return saved;
  };

  // Update Student -> Saves strictly to PostgreSQL database FIRST; throws error if DB fails
  const updateStudent = async (
    student: StudentProfile,
    accountOptions?: {
      createAccount?: boolean;
      initialUsername?: string;
      initialPassword?: string;
    }
  ) => {
    let res: Response;
    try {
      res = await fetch(apiUrl(`/api/students/${student.id}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...student,
          ...(accountOptions?.createAccount
            ? {
                createAccount: true,
                initialUsername: accountOptions.initialUsername || student.phone,
                initialPassword: accountOptions.initialPassword || '123',
              }
            : {}),
        }),
      });
    } catch {
      setDbStatus((prev) => ({ ...prev, connected: false, error: DEFAULT_DB_DISCONNECTED_MSG }));
      setDbError(DEFAULT_DB_DISCONNECTED_MSG);
      throw new Error(DEFAULT_DB_DISCONNECTED_MSG);
    }

    if (!res.ok) {
      const errMsg = await handleApiErrorResponse(
        res,
        'Không thể cập nhật thông tin học viên vào Database!'
      );
      throw new Error(errMsg);
    }

    const savedStudent = await res.json();
    setDbStatus((prev) => ({ ...prev, connected: true, error: undefined }));
    setDbError(null);

    setAllStudents((prev) =>
      prev.map((s) => (s.id === student.id ? { ...student, ...savedStudent } : s))
    );
    if (selectedStudent?.id === student.id) {
      setSelectedStudent({ ...student, ...savedStudent });
    }
    if (accountOptions?.createAccount) {
      await fetchUsersList();
    }

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
        const advRes = await fetch(apiUrl(`/api/advices/${existingAdvice.id}`), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updatedAdvice),
        }).catch(() => null);
        if (advRes && advRes.ok) {
          setAdvices((prev) =>
            prev.map((a) => (a.id === existingAdvice.id ? updatedAdvice : a))
          );
        }
      }
    }
  };

  // Delete Student -> Strictly deletes in PostgreSQL database first
  const deleteStudent = async (id: string) => {
    let res: Response;
    try {
      res = await fetch(apiUrl(`/api/students/${id}`), { method: 'DELETE' });
    } catch {
      setDbStatus((prev) => ({ ...prev, connected: false, error: DEFAULT_DB_DISCONNECTED_MSG }));
      setDbError(DEFAULT_DB_DISCONNECTED_MSG);
      throw new Error(DEFAULT_DB_DISCONNECTED_MSG);
    }

    if (!res.ok) {
      const errMsg = await handleApiErrorResponse(
        res,
        'Không thể xóa học viên trên Database!'
      );
      throw new Error(errMsg);
    }

    setDbStatus((prev) => ({ ...prev, connected: true, error: undefined }));
    setDbError(null);
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
  };

  // Add Metric Record + Instant AI Advice saved strictly to PostgreSQL first
  const addMetricRecord = async (recordData: Omit<HealthMetricRecord, 'id' | 'timestamp'>) => {
    const timestamp = new Date(recordData.date).getTime() || Date.now();
    const newRecord: HealthMetricRecord = {
      ...recordData,
      id: `metric-${Date.now()}`,
      timestamp,
    };

    let res: Response;
    try {
      res = await fetch(apiUrl('/api/metrics'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newRecord),
      });
    } catch {
      setDbStatus((prev) => ({ ...prev, connected: false, error: DEFAULT_DB_DISCONNECTED_MSG }));
      setDbError(DEFAULT_DB_DISCONNECTED_MSG);
      throw new Error(DEFAULT_DB_DISCONNECTED_MSG);
    }

    if (!res.ok) {
      const errMsg = await handleApiErrorResponse(
        res,
        'Không thể lưu chỉ số cân đo vào Database!'
      );
      throw new Error(errMsg);
    }

    setDbStatus((prev) => ({ ...prev, connected: true, error: undefined }));
    setDbError(null);

    const studentHistory = getStudentMetrics(recordData.studentId);
    const previousRecord = studentHistory[studentHistory.length - 1];

    setMetrics((prev) => [...prev, newRecord].sort((a, b) => a.timestamp - b.timestamp));

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

      const advRes = await fetch(apiUrl('/api/advices'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newAdvice),
      }).catch(() => null);

      if (advRes && advRes.ok) {
        setAdvices((prev) => [newAdvice, ...prev]);
      }

      // Request Gemini AI 3-part health analysis and update DB record
      fetch(apiUrl('/api/ai/analyze-health'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student: targetStudent,
          metric: newRecord,
          previousMetric: previousRecord,
        }),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((aiData) => {
          if (aiData && aiData.success && aiData.analysis) {
            const enrichedAdvice: AIAdviceRecord = {
              ...newAdvice,
              aiDraftContent: aiData.analysis,
              trainerEditedContent: aiData.analysis.summary,
            };
            fetch(apiUrl(`/api/advices/${newAdvice.id}`), {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(enrichedAdvice),
            })
              .then((putRes) => {
                if (putRes.ok) {
                  setAdvices((prev) =>
                    prev.map((a) => (a.id === newAdvice.id ? enrichedAdvice : a))
                  );
                }
              })
              .catch(() => null);
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

  // Delete Metric Record -> Strictly deletes in PostgreSQL first
  const deleteMetricRecord = async (id: string) => {
    let res: Response;
    try {
      res = await fetch(apiUrl(`/api/metrics/${id}`), { method: 'DELETE' });
    } catch {
      setDbStatus((prev) => ({ ...prev, connected: false, error: DEFAULT_DB_DISCONNECTED_MSG }));
      setDbError(DEFAULT_DB_DISCONNECTED_MSG);
      throw new Error(DEFAULT_DB_DISCONNECTED_MSG);
    }

    if (!res.ok) {
      const errMsg = await handleApiErrorResponse(
        res,
        'Không thể xóa bản ghi cân đo trên Database!'
      );
      throw new Error(errMsg);
    }

    setDbStatus((prev) => ({ ...prev, connected: true, error: undefined }));
    setDbError(null);
    setMetrics((prev) => prev.filter((m) => m.id !== id));
    setAdvices((prev) => prev.filter((a) => a.metricRecordId !== id));
  };

  // Add Meal Log -> Strictly saves to PostgreSQL first
  const addMealLog = async (mealData: Omit<MealLog, 'id' | 'loggedAt'>) => {
    const newMeal: MealLog = {
      ...mealData,
      imageUrl: mealData.imageUrl || '',
      id: `meal-${Date.now()}`,
      loggedAt: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
    };

    let res: Response;
    try {
      res = await fetch(apiUrl('/api/meals'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newMeal),
      });
    } catch {
      setDbStatus((prev) => ({ ...prev, connected: false, error: DEFAULT_DB_DISCONNECTED_MSG }));
      setDbError(DEFAULT_DB_DISCONNECTED_MSG);
      throw new Error(DEFAULT_DB_DISCONNECTED_MSG);
    }

    if (!res.ok) {
      const errMsg = await handleApiErrorResponse(res, 'Không thể lưu nhật ký bữa ăn vào Database!');
      throw new Error(errMsg);
    }

    setDbStatus((prev) => ({ ...prev, connected: true, error: undefined }));
    setDbError(null);
    setMeals((prev) => [newMeal, ...prev]);
  };

  // Add Meal Trainer Feedback
  const addMealFeedback = async (
    id: string,
    reaction: '🔥' | '💪' | '👏' | '❤️',
    comment?: string
  ) => {
    let res: Response;
    try {
      res = await fetch(apiUrl(`/api/meals/${id}/feedback`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reaction, comment }),
      });
    } catch {
      setDbStatus((prev) => ({ ...prev, connected: false, error: DEFAULT_DB_DISCONNECTED_MSG }));
      setDbError(DEFAULT_DB_DISCONNECTED_MSG);
      throw new Error(DEFAULT_DB_DISCONNECTED_MSG);
    }

    if (!res.ok) {
      const errMsg = await handleApiErrorResponse(res, 'Không thể lưu phản hồi bữa ăn vào Database!');
      throw new Error(errMsg);
    }

    setDbStatus((prev) => ({ ...prev, connected: true, error: undefined }));
    setDbError(null);
    setMeals((prev) =>
      prev.map((m) =>
        m.id === id ? { ...m, trainerReaction: reaction, trainerComment: comment } : m
      )
    );
  };

  // Upsert a 30-day meal ticket slot -> Strictly saves to PostgreSQL first
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
      let delRes: Response;
      try {
        delRes = await fetch(apiUrl(`/api/meals/${ticketId}`), { method: 'DELETE' });
      } catch {
        setDbStatus((prev) => ({ ...prev, connected: false, error: DEFAULT_DB_DISCONNECTED_MSG }));
        setDbError(DEFAULT_DB_DISCONNECTED_MSG);
        throw new Error(DEFAULT_DB_DISCONNECTED_MSG);
      }

      if (!delRes.ok) {
        const errMsg = await handleApiErrorResponse(delRes, 'Không thể cập nhật phiếu ăn vào Database!');
        throw new Error(errMsg);
      }

      setDbStatus((prev) => ({ ...prev, connected: true, error: undefined }));
      setDbError(null);
      setMeals((prev) => prev.filter((m) => m.id !== ticketId));
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

    let res: Response;
    try {
      res = await fetch(apiUrl('/api/meals'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newTicket),
      });
    } catch {
      setDbStatus((prev) => ({ ...prev, connected: false, error: DEFAULT_DB_DISCONNECTED_MSG }));
      setDbError(DEFAULT_DB_DISCONNECTED_MSG);
      throw new Error(DEFAULT_DB_DISCONNECTED_MSG);
    }

    if (!res.ok) {
      const errMsg = await handleApiErrorResponse(
        res,
        'Không thể lưu phiếu bữa ăn vào Database!'
      );
      throw new Error(errMsg);
    }

    setDbStatus((prev) => ({ ...prev, connected: true, error: undefined }));
    setDbError(null);
    setMeals((prev) => [newTicket, ...prev.filter((m) => m.id !== ticketId)]);
  };

  // Reset all 30-day meal tickets for a student -> Strictly deletes in PostgreSQL first
  const resetStudentMealTickets = async (studentId: string) => {
    let res: Response;
    try {
      res = await fetch(apiUrl(`/api/meals/student/${studentId}`), { method: 'DELETE' });
    } catch {
      setDbStatus((prev) => ({ ...prev, connected: false, error: DEFAULT_DB_DISCONNECTED_MSG }));
      setDbError(DEFAULT_DB_DISCONNECTED_MSG);
      throw new Error(DEFAULT_DB_DISCONNECTED_MSG);
    }

    if (!res.ok) {
      const errMsg = await handleApiErrorResponse(
        res,
        'Không thể làm mới phiếu ăn 30 ngày trên Database!'
      );
      throw new Error(errMsg);
    }

    setDbStatus((prev) => ({ ...prev, connected: true, error: undefined }));
    setDbError(null);
    setMeals((prev) => prev.filter((m) => m.studentId !== studentId));
  };

  // Add Workout Log
  const addWorkoutLog = async (workoutData: Omit<WorkoutLog, 'id' | 'loggedAt'>) => {
    const newWorkout: WorkoutLog = {
      ...workoutData,
      id: `workout-${Date.now()}`,
      loggedAt: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
    };

    let res: Response;
    try {
      res = await fetch(apiUrl('/api/workouts'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newWorkout),
      });
    } catch {
      setDbStatus((prev) => ({ ...prev, connected: false, error: DEFAULT_DB_DISCONNECTED_MSG }));
      setDbError(DEFAULT_DB_DISCONNECTED_MSG);
      throw new Error(DEFAULT_DB_DISCONNECTED_MSG);
    }

    if (!res.ok) {
      const errMsg = await handleApiErrorResponse(res, 'Không thể lưu nhật ký tập vào Database!');
      throw new Error(errMsg);
    }

    setDbStatus((prev) => ({ ...prev, connected: true, error: undefined }));
    setDbError(null);
    setWorkouts((prev) => [newWorkout, ...prev]);
  };

  // Add Workout Feedback
  const addWorkoutFeedback = async (
    id: string,
    reaction: '🔥' | '💪' | '👏' | '❤️',
    comment?: string
  ) => {
    let res: Response;
    try {
      res = await fetch(apiUrl(`/api/workouts/${id}/feedback`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reaction, comment }),
      });
    } catch {
      setDbStatus((prev) => ({ ...prev, connected: false, error: DEFAULT_DB_DISCONNECTED_MSG }));
      setDbError(DEFAULT_DB_DISCONNECTED_MSG);
      throw new Error(DEFAULT_DB_DISCONNECTED_MSG);
    }

    if (!res.ok) {
      const errMsg = await handleApiErrorResponse(res, 'Không thể lưu phản hồi vào Database!');
      throw new Error(errMsg);
    }

    setDbStatus((prev) => ({ ...prev, connected: true, error: undefined }));
    setDbError(null);
    setWorkouts((prev) =>
      prev.map((w) =>
        w.id === id ? { ...w, trainerReaction: reaction, trainerComment: comment } : w
      )
    );
  };

  // Add Physique Photo
  const addPhysiquePhoto = async (photoData: Omit<PhysiquePhoto, 'id'>) => {
    const newPhoto: PhysiquePhoto = {
      ...photoData,
      id: `photo-${Date.now()}`,
    };

    let res: Response;
    try {
      res = await fetch(apiUrl('/api/photos'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newPhoto),
      });
    } catch {
      setDbStatus((prev) => ({ ...prev, connected: false, error: DEFAULT_DB_DISCONNECTED_MSG }));
      setDbError(DEFAULT_DB_DISCONNECTED_MSG);
      throw new Error(DEFAULT_DB_DISCONNECTED_MSG);
    }

    if (!res.ok) {
      const errMsg = await handleApiErrorResponse(res, 'Không thể lưu ảnh vào Database!');
      throw new Error(errMsg);
    }

    setDbStatus((prev) => ({ ...prev, connected: true, error: undefined }));
    setDbError(null);
    setPhotos((prev) => [...prev, newPhoto]);
  };

  // Mark notification read
  const markNotificationRead = async (id: string) => {
    const res = await fetch(apiUrl(`/api/notifications/${id}/read`), { method: 'PUT' }).catch(() => null);
    if (res && res.ok) {
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    }
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
        dbError,
        clearDbError,
        refreshDatabase,
        tuitionPackages,
        herbalifeProducts,
        refreshTuitionCatalog,
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
