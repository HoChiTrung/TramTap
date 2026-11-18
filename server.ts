/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import { Pool } from 'pg';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';
import { calculateCalorieGoalBreakdown } from './src/utils/healthCalculations.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

const getErrMessage = (err: unknown): string =>
  err instanceof Error ? err.message : String(err);

app.use(express.json({ limit: '5mb' }));

// Enable CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.header(
    'Access-Control-Allow-Headers',
    'Origin, X-Requested-With, Content-Type, Accept, Authorization, x-auth-username'
  );
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Helper to strip empty/null keys from JSONB objects so DB storage stays minimal
function compactJson<T extends Record<string, any>>(obj: T | undefined | null): Record<string, any> {
  if (!obj || typeof obj !== 'object') return {};
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && v !== null && v !== '') {
      out[k] = v;
    }
  }
  return out;
}

// Compact Server-Side Database Store (persisted to data/database.json & synced with PostgreSQL when reachable)
interface CompactDatabaseStore {
  wipedCleanV1: boolean;
  users: Array<{
    id: string;
    username: string;
    password: string;
    fullName: string;
    role: 'admin' | 'trainer' | 'student';
    phone?: string;
    studentId?: string | null;
    trainerId?: string | null;
    trainerName?: string;
    avatarUrl?: string;
    createdAt?: string;
  }>;
  students: any[];
  metrics: any[];
  advices: any[];
  meals: any[];
  workouts: any[];
  photos: any[];
  notifications: any[];
}

const DB_FILE_PATH = path.resolve(__dirname, 'data', 'database.json');

function createEmptyStore(): CompactDatabaseStore {
  const today = new Date().toISOString().split('T')[0];
  return {
    wipedCleanV1: true,
    users: [
      {
        id: 'user-admin-1',
        username: 'admin',
        password: '123',
        fullName: 'Quản Trị Viên (Admin)',
        role: 'admin',
        phone: '',
        studentId: null,
        trainerId: null,
        avatarUrl: '',
        createdAt: today,
      },
      {
        id: 'user-trainer-1',
        username: 'trunghbl',
        password: '123',
        fullName: 'Huấn Luyện Viên Trung HBL',
        role: 'trainer',
        phone: '',
        studentId: null,
        trainerId: null,
        avatarUrl: '',
        createdAt: today,
      },
    ],
    students: [],
    metrics: [],
    advices: [],
    meals: [],
    workouts: [],
    photos: [],
    notifications: [],
  };
}

function ensureAdminInStore(store: CompactDatabaseStore): CompactDatabaseStore {
  if (!Array.isArray(store.users)) {
    store.users = [];
  }
  const hasAdmin = store.users.some((u) => u.username.toLowerCase() === 'admin');
  if (!hasAdmin) {
    store.users.unshift({
      id: 'user-admin-1',
      username: 'admin',
      password: '123',
      fullName: 'Quản Trị Viên (Admin)',
      role: 'admin',
      phone: '',
      studentId: null,
      trainerId: null,
      avatarUrl: '',
      createdAt: new Date().toISOString().split('T')[0],
    });
    saveDiskStore(store);
  }
  return store;
}

function loadDiskStore(): CompactDatabaseStore {
  try {
    if (fs.existsSync(DB_FILE_PATH)) {
      const raw = fs.readFileSync(DB_FILE_PATH, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed && parsed.wipedCleanV1 === true) {
        return ensureAdminInStore(parsed);
      }
    }
  } catch (err) {
    console.warn('Could not read disk DB file, initializing clean store:', getErrMessage(err));
  }
  const cleanStore = createEmptyStore();
  saveDiskStore(cleanStore);
  return cleanStore;
}

function saveDiskStore(store: CompactDatabaseStore) {
  try {
    const dir = path.dirname(DB_FILE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    // Minified JSON without whitespace to minimize disk footprint
    fs.writeFileSync(DB_FILE_PATH, JSON.stringify(store), 'utf-8');
  } catch (err) {
    console.warn('Could not write disk DB file:', getErrMessage(err));
  }
}

const dbStore = loadDiskStore();

// Aiven PostgreSQL Database Connection
const rawConnectionString =
  process.env.DATABASE_URL ||
  'postgres://avnadmin:AVNS_mnHs58-ghj3A7pfXzVe@pg-1b132c35-chitrung7542-3ac1.i.aivencloud.com:21684/TramTap?sslmode=require';

const cleanConnectionString = rawConnectionString.replace(/[?&]sslmode=[^&]+/, '');

const pool = new Pool({
  connectionString: cleanConnectionString,
  ssl: {
    rejectUnauthorized: false,
  },
  connectionTimeoutMillis: 6000,
});

pool.on('error', (err) => {
  console.warn('⚠️ Unexpected PostgreSQL pool error:', err.message);
});

let dbConnected = false;

// Initialize Database Tables and Wipe Sample Data (One-time Clean Reset)
async function initDatabase() {
  try {
    const client = await pool.connect();
    dbConnected = true;
    console.log('✅ Connected to Aiven PostgreSQL database: TramTap');

    await client.query(`
      CREATE TABLE IF NOT EXISTS system_settings (
        key VARCHAR(64) PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(64) PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password VARCHAR(100) NOT NULL,
        full_name VARCHAR(100) NOT NULL,
        role VARCHAR(20) NOT NULL,
        phone VARCHAR(20),
        student_id VARCHAR(64),
        trainer_id VARCHAR(64),
        avatar_url TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS students (
        id VARCHAR(64) PRIMARY KEY,
        full_name VARCHAR(100) NOT NULL,
        gender VARCHAR(10) NOT NULL,
        age INT NOT NULL,
        height DECIMAL(4,2) NOT NULL,
        phone VARCHAR(20) NOT NULL,
        address VARCHAR(255),
        date_of_birth DATE NOT NULL,
        health_goal TEXT NOT NULL,
        target_metrics JSONB DEFAULT '{}'::jsonb,
        avatar_url TEXT,
        trainer_id VARCHAR(64),
        trainer_name VARCHAR(100),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS health_metrics (
        id VARCHAR(64) PRIMARY KEY,
        student_id VARCHAR(64) REFERENCES students(id) ON DELETE CASCADE,
        date DATE NOT NULL,
        timestamp BIGINT NOT NULL,
        weight DECIMAL(5,2) NOT NULL,
        subcutaneous_fat DECIMAL(4,1) NOT NULL,
        bone_calcium DECIMAL(3,1) NOT NULL,
        body_water DECIMAL(4,1) NOT NULL,
        muscle_mass DECIMAL(5,2) NOT NULL,
        body_type VARCHAR(50) NOT NULL,
        bmr INT NOT NULL,
        biological_age INT NOT NULL,
        visceral_fat INT NOT NULL,
        waist DECIMAL(5,1) NOT NULL,
        notes TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS ai_advices (
        id VARCHAR(64) PRIMARY KEY,
        student_id VARCHAR(64) REFERENCES students(id) ON DELETE CASCADE,
        metric_record_id VARCHAR(64),
        date DATE NOT NULL,
        status VARCHAR(30) NOT NULL,
        ai_draft_content JSONB NOT NULL,
        trainer_edited_content TEXT,
        trainer_note TEXT,
        approved_at VARCHAR(50),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS meal_logs (
        id VARCHAR(64) PRIMARY KEY,
        student_id VARCHAR(64) REFERENCES students(id) ON DELETE CASCADE,
        date DATE NOT NULL,
        meal_type VARCHAR(50) NOT NULL,
        image_url TEXT,
        food_description TEXT,
        estimated_calories INT DEFAULT 0,
        macros JSONB DEFAULT '{}'::jsonb,
        trainer_reaction VARCHAR(10),
        trainer_comment TEXT,
        logged_at VARCHAR(20),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS workout_logs (
        id VARCHAR(64) PRIMARY KEY,
        student_id VARCHAR(64) REFERENCES students(id) ON DELETE CASCADE,
        date DATE NOT NULL,
        plan_title VARCHAR(255) NOT NULL,
        duration_minutes INT DEFAULT 45,
        exercises JSONB DEFAULT '[]'::jsonb,
        trainer_reaction VARCHAR(10),
        trainer_comment TEXT,
        logged_at VARCHAR(20),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS physique_photos (
        id VARCHAR(64) PRIMARY KEY,
        student_id VARCHAR(64) REFERENCES students(id) ON DELETE CASCADE,
        date DATE NOT NULL,
        image_url TEXT NOT NULL,
        photo_type VARCHAR(20) NOT NULL,
        weight DECIMAL(5,2),
        notes TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS badges (
        id VARCHAR(64) PRIMARY KEY,
        student_id VARCHAR(64) REFERENCES students(id) ON DELETE CASCADE,
        title VARCHAR(100) NOT NULL,
        description TEXT NOT NULL,
        icon VARCHAR(20) NOT NULL,
        unlocked_at VARCHAR(50),
        category VARCHAR(30) NOT NULL
      );

      CREATE TABLE IF NOT EXISTS smart_notifications (
        id VARCHAR(64) PRIMARY KEY,
        use_case_id VARCHAR(30) NOT NULL,
        student_id VARCHAR(64) REFERENCES students(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        priority VARCHAR(20) NOT NULL,
        created_at VARCHAR(50) NOT NULL,
        read BOOLEAN DEFAULT FALSE
      );
    `);

    // Add multi-trainer & ownership columns if upgrading an existing database
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(20);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS trainer_id VARCHAR(64);
      ALTER TABLE students ADD COLUMN IF NOT EXISTS trainer_id VARCHAR(64);
      ALTER TABLE students ADD COLUMN IF NOT EXISTS trainer_name VARCHAR(100);
      ALTER TABLE students DROP COLUMN IF EXISTS drive_folder_url;
      ALTER TABLE meal_logs DROP COLUMN IF EXISTS drive_folder_url;
      ALTER TABLE meal_logs DROP COLUMN IF EXISTS drive_file_url;
      ALTER TABLE meal_logs DROP COLUMN IF EXISTS ai_analyzed;
      ALTER TABLE meal_logs DROP COLUMN IF EXISTS nutrition_advice;
      ALTER TABLE meal_logs DROP COLUMN IF EXISTS items;
    `);

    // One-time clean wipe of all sample/existing records in the database
    const resetCheck = await client.query(
      `SELECT value FROM system_settings WHERE key = 'db_wiped_clean_v1'`
    );
    if (resetCheck.rows.length === 0) {
      console.log('🧹 Wiping all existing/sample data from PostgreSQL database...');
      await client.query(`
        TRUNCATE TABLE
          health_metrics,
          ai_advices,
          meal_logs,
          workout_logs,
          physique_photos,
          badges,
          smart_notifications,
          students
        RESTART IDENTITY CASCADE;
      `);
      await client.query(`DELETE FROM users WHERE role NOT IN ('admin', 'trainer');`);
      await client.query(
        `INSERT INTO system_settings (key, value) VALUES ('db_wiped_clean_v1', 'true')
         ON CONFLICT (key) DO UPDATE SET value = 'true', updated_at = NOW()`
      );
      console.log('✅ All sample/old records cleared from PostgreSQL database.');
    }

    // Ensure default admin account (tk: admin, mk: 123) exists in DB
    await client.query(
      `INSERT INTO users (id, username, password, full_name, role, phone, student_id, trainer_id, avatar_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (username) DO UPDATE SET role = 'admin'`,
      [
        'user-admin-1',
        'admin',
        '123',
        'Quản Trị Viên (Admin)',
        'admin',
        '',
        null,
        null,
        '',
      ]
    );

    // Ensure default trainer account exists in DB
    await client.query(
      `INSERT INTO users (id, username, password, full_name, role, phone, student_id, trainer_id, avatar_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (username) DO NOTHING`,
      [
        'user-trainer-1',
        'trunghbl',
        '123',
        'Huấn Luyện Viên Trung HBL',
        'trainer',
        '',
        null,
        null,
        '',
      ]
    );

    client.release();
  } catch (err) {
    console.warn('⚠️ PostgreSQL remote host unreachable, using local database engine (data/database.json).');
    dbConnected = false;
  }
}

// Auth API: Login (Strictly from Database)
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Vui lòng nhập tên đăng nhập và mật khẩu!' });
    }

    const cleanUsername = username.trim().toLowerCase();
    const cleanPassword = password.trim();

    if (dbConnected) {
      try {
        const result = await pool.query(
          'SELECT id, username, full_name, role, phone, student_id, trainer_id, avatar_url FROM users WHERE LOWER(username) = $1 AND password = $2',
          [cleanUsername, cleanPassword]
        );
        if (result.rows.length > 0) {
          const u = result.rows[0];
          return res.json({
            success: true,
            user: {
              id: u.id,
              username: u.username,
              fullName: u.full_name,
              role: u.role,
              phone: u.phone || '',
              studentId: u.student_id,
              trainerId: u.trainer_id,
              avatarUrl: u.avatar_url || '',
            },
          });
        }
      } catch {
        dbConnected = false;
      }
    }

    const matchedUser = dbStore.users.find(
      (u) => u.username.toLowerCase() === cleanUsername && u.password === cleanPassword
    );
    if (matchedUser) {
      return res.json({
        success: true,
        user: {
          id: matchedUser.id,
          username: matchedUser.username,
          fullName: matchedUser.fullName,
          role: matchedUser.role,
          phone: matchedUser.phone || '',
          studentId: matchedUser.studentId,
          trainerId: matchedUser.trainerId,
          avatarUrl: matchedUser.avatarUrl || '',
        },
      });
    }

    return res.status(401).json({ error: 'Tên đăng nhập hoặc mật khẩu không chính xác!' });
  } catch (err: unknown) {
    res.status(500).json({ error: getErrMessage(err) });
  }
});

// Users & Trainers Management API (Stored in Database)
app.get('/api/users', async (req, res) => {
  try {
    if (dbConnected) {
      try {
        const result = await pool.query(
          'SELECT id, username, password, full_name, role, phone, student_id, trainer_id, created_at FROM users ORDER BY created_at DESC'
        );
        const users = result.rows.map((r) => ({
          id: r.id,
          username: r.username,
          password: r.password,
          fullName: r.full_name,
          role: r.role as 'admin' | 'trainer' | 'student',
          phone: r.phone || '',
          studentId: r.student_id || null,
          trainerId: r.trainer_id || null,
          createdAt: r.created_at
            ? new Date(r.created_at).toISOString().split('T')[0]
            : '',
        }));
        dbStore.users = users;
        saveDiskStore(dbStore);
        return res.json(users);
      } catch {
        dbConnected = false;
      }
    }
    res.json(dbStore.users);
  } catch (err: unknown) {
    res.status(500).json({ error: getErrMessage(err) });
  }
});

app.post('/api/users', async (req, res) => {
  try {
    const { username, password, fullName, role, phone, studentId, trainerId } = req.body;
    const cleanUsername = String(username || '').trim();
    const cleanPassword = String(password || '123').trim();
    const cleanName = String(fullName || '').trim();
    const validRole: 'admin' | 'trainer' | 'student' =
      role === 'admin' || role === 'trainer' || role === 'student' ? role : 'trainer';

    if (!cleanUsername || !cleanName) {
      return res
        .status(400)
        .json({ error: 'Vui lòng nhập đầy đủ Họ tên và Tên đăng nhập!' });
    }

    const exists = dbStore.users.some(
      (u) => u.username.toLowerCase() === cleanUsername.toLowerCase()
    );
    if (exists) {
      return res.status(400).json({ error: `Tên đăng nhập "${cleanUsername}" đã tồn tại!` });
    }

    const newUser = {
      id: `user-${validRole}-${Date.now()}`,
      username: cleanUsername,
      password: cleanPassword,
      fullName: cleanName,
      role: validRole,
      phone: String(phone || '').trim(),
      studentId: studentId || null,
      trainerId: trainerId || null,
      avatarUrl: '',
      createdAt: new Date().toISOString().split('T')[0],
    };

    dbStore.users = [newUser, ...dbStore.users];
    saveDiskStore(dbStore);

    if (dbConnected) {
      try {
        await pool.query(
          `INSERT INTO users (id, username, password, full_name, role, phone, student_id, trainer_id, avatar_url)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (username) DO UPDATE SET
             password = EXCLUDED.password,
             full_name = EXCLUDED.full_name,
             role = EXCLUDED.role,
             phone = EXCLUDED.phone,
             trainer_id = EXCLUDED.trainer_id`,
          [
            newUser.id,
            newUser.username,
            newUser.password,
            newUser.fullName,
            newUser.role,
            newUser.phone,
            newUser.studentId,
            newUser.trainerId,
            '',
          ]
        );
      } catch {
        dbConnected = false;
      }
    }

    res.status(201).json(newUser);
  } catch (err: unknown) {
    res.status(500).json({ error: getErrMessage(err) });
  }
});

app.put('/api/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { username, password, fullName, role, phone, trainerId } = req.body;
    const existing = dbStore.users.find((u) => u.id === id);
    if (!existing) {
      return res.status(404).json({ error: 'Không tìm thấy tài khoản người dùng!' });
    }

    const nextUsername = username ? String(username).trim() : existing.username;
    const duplicate = dbStore.users.some(
      (u) => u.id !== id && u.username.toLowerCase() === nextUsername.toLowerCase()
    );
    if (duplicate) {
      return res.status(400).json({ error: `Tên đăng nhập "${nextUsername}" đã được sử dụng!` });
    }

    const updatedUser = {
      ...existing,
      username: nextUsername,
      password: password ? String(password).trim() : existing.password,
      fullName: fullName ? String(fullName).trim() : existing.fullName,
      role:
        role === 'admin' || role === 'trainer' || role === 'student'
          ? role
          : existing.role,
      phone: phone !== undefined ? String(phone).trim() : existing.phone,
      trainerId: trainerId !== undefined ? trainerId : existing.trainerId,
    };

    dbStore.users = dbStore.users.map((u) => (u.id === id ? updatedUser : u));

    // If this user is a trainer and their name changed, sync trainerName on their students
    if (updatedUser.role === 'trainer' && fullName) {
      dbStore.students = dbStore.students.map((s) =>
        s.trainerId === id ? { ...s, trainerName: updatedUser.fullName } : s
      );
    }

    saveDiskStore(dbStore);

    if (dbConnected) {
      try {
        await pool.query(
          `UPDATE users SET username = $1, password = $2, full_name = $3, role = $4, phone = $5, trainer_id = $6 WHERE id = $7`,
          [
            updatedUser.username,
            updatedUser.password,
            updatedUser.fullName,
            updatedUser.role,
            updatedUser.phone || '',
            updatedUser.trainerId || null,
            id,
          ]
        );
        if (updatedUser.role === 'trainer' && fullName) {
          await pool.query(
            `UPDATE students SET trainer_name = $1 WHERE trainer_id = $2`,
            [updatedUser.fullName, id]
          );
        }
      } catch {
        dbConnected = false;
      }
    }

    res.json(updatedUser);
  } catch (err: unknown) {
    res.status(500).json({ error: getErrMessage(err) });
  }
});

app.delete('/api/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const target = dbStore.users.find((u) => u.id === id);
    if (target?.username.toLowerCase() === 'admin') {
      return res.status(400).json({ error: 'Không thể xóa tài khoản Admin gốc của hệ thống!' });
    }

    dbStore.users = dbStore.users.filter((u) => u.id !== id);
    saveDiskStore(dbStore);

    if (dbConnected) {
      try {
        await pool.query('DELETE FROM users WHERE id = $1', [id]);
      } catch {
        dbConnected = false;
      }
    }

    res.json({ success: true });
  } catch (err: unknown) {
    res.status(500).json({ error: getErrMessage(err) });
  }
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    databaseConnected: true,
    dbType: dbConnected ? 'PostgreSQL (Aiven Cloud)' : 'Local Database (TramTap)',
    databaseName: 'TramTap',
    timestamp: new Date().toISOString(),
  });
});

// Students API
app.get('/api/students', async (req, res) => {
  try {
    if (dbConnected) {
      const result = await pool.query('SELECT * FROM students ORDER BY created_at DESC');
      const students = result.rows.map((r) => ({
        id: r.id,
        fullName: r.full_name,
        gender: r.gender,
        age: r.age,
        height: parseFloat(r.height),
        phone: r.phone,
        address: r.address || '',
        dateOfBirth: r.date_of_birth ? new Date(r.date_of_birth).toISOString().split('T')[0] : '',
        healthGoal: r.health_goal,
        targetMetrics: r.target_metrics || {},
        avatarUrl: r.avatar_url || '',
        trainerId: r.trainer_id || '',
        trainerName: r.trainer_name || '',
        createdAt: r.created_at,
      }));
      dbStore.students = students;
      saveDiskStore(dbStore);
      return res.json(students);
    }
    res.json(dbStore.students);
  } catch {
    dbConnected = false;
    res.json(dbStore.students);
  }
});

app.post('/api/students', async (req, res) => {
  try {
    const s = req.body;
    const studentId = s.id || `student-${Date.now()}`;
    const initialUsername = (s.initialUsername || s.phone || studentId).trim();
    const initialPassword = (s.initialPassword || '123').trim();
    const safeDob = s.dateOfBirth && String(s.dateOfBirth).trim() ? s.dateOfBirth : '2000-01-01';
    const safeGoal =
      s.healthGoal && String(s.healthGoal).trim()
        ? s.healthGoal.trim()
        : 'Cân đối vóc dáng & Cải thiện sức khỏe';

    // Resolve trainer ownership
    const trainerUser = dbStore.users.find(
      (u) =>
        (s.trainerId && u.id === s.trainerId) ||
        (req.headers['x-auth-username'] &&
          u.username.toLowerCase() === String(req.headers['x-auth-username']).toLowerCase() &&
          u.role === 'trainer')
    );
    const resolvedTrainerId = s.trainerId || trainerUser?.id || '';
    const resolvedTrainerName = s.trainerName || trainerUser?.fullName || '';

    const newStudentRecord = {
      id: studentId,
      fullName: String(s.fullName || '').trim(),
      gender: s.gender || 'Nam',
      age: Number(s.age) || 25,
      height: Number(s.height) || 1.7,
      phone: String(s.phone || '').trim().slice(0, 20),
      address: String(s.address || '').trim().slice(0, 255),
      dateOfBirth: safeDob,
      healthGoal: safeGoal,
      targetMetrics: compactJson(s.targetMetrics),
      avatarUrl: s.avatarUrl || '',
      trainerId: resolvedTrainerId,
      trainerName: resolvedTrainerName,
      createdAt: s.createdAt || new Date().toISOString().split('T')[0],
    };

    // Save to disk database
    dbStore.students = [
      newStudentRecord,
      ...dbStore.students.filter((item) => item.id !== studentId),
    ];
    dbStore.users = [
      ...dbStore.users.filter(
        (u) =>
          u.username.toLowerCase() !== initialUsername.toLowerCase() &&
          u.studentId !== newStudentRecord.id
      ),
      {
        id: `user-${newStudentRecord.id}`,
        username: initialUsername,
        password: initialPassword,
        fullName: newStudentRecord.fullName,
        role: 'student',
        phone: newStudentRecord.phone,
        studentId: newStudentRecord.id,
        trainerId: resolvedTrainerId || null,
        avatarUrl: newStudentRecord.avatarUrl,
        createdAt: newStudentRecord.createdAt,
      },
    ];
    saveDiskStore(dbStore);

    if (dbConnected) {
      try {
        await pool.query(
          `INSERT INTO students (id, full_name, gender, age, height, phone, address, date_of_birth, health_goal, target_metrics, avatar_url, trainer_id, trainer_name, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
           ON CONFLICT (id) DO UPDATE SET
             full_name = EXCLUDED.full_name,
             gender = EXCLUDED.gender,
             age = EXCLUDED.age,
             height = EXCLUDED.height,
             phone = EXCLUDED.phone,
             address = EXCLUDED.address,
             date_of_birth = EXCLUDED.date_of_birth,
             health_goal = EXCLUDED.health_goal,
             target_metrics = EXCLUDED.target_metrics,
             avatar_url = EXCLUDED.avatar_url,
             trainer_id = EXCLUDED.trainer_id,
             trainer_name = EXCLUDED.trainer_name`,
          [
            newStudentRecord.id,
            newStudentRecord.fullName,
            newStudentRecord.gender,
            newStudentRecord.age,
            newStudentRecord.height,
            newStudentRecord.phone,
            newStudentRecord.address,
            newStudentRecord.dateOfBirth,
            newStudentRecord.healthGoal,
            JSON.stringify(newStudentRecord.targetMetrics),
            newStudentRecord.avatarUrl,
            newStudentRecord.trainerId || null,
            newStudentRecord.trainerName || null,
            new Date().toISOString(),
          ]
        );

        await pool.query(
          `INSERT INTO users (id, username, password, full_name, role, phone, student_id, trainer_id, avatar_url)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (username) DO UPDATE SET
             password = EXCLUDED.password,
             full_name = EXCLUDED.full_name,
             phone = EXCLUDED.phone,
             student_id = EXCLUDED.student_id,
             trainer_id = EXCLUDED.trainer_id`,
          [
            `user-${newStudentRecord.id}`,
            initialUsername,
            initialPassword,
            newStudentRecord.fullName,
            'student',
            newStudentRecord.phone,
            newStudentRecord.id,
            newStudentRecord.trainerId || null,
            newStudentRecord.avatarUrl,
          ]
        );
      } catch {
        dbConnected = false;
      }
    }

    res.status(201).json({ ...newStudentRecord, initialUsername, initialPassword });
  } catch (err: unknown) {
    res.status(500).json({ error: getErrMessage(err) });
  }
});

app.put('/api/students/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const s = req.body;
    const trainerUser = s.trainerId
      ? dbStore.users.find((u) => u.id === s.trainerId)
      : undefined;
    const resolvedTrainerName =
      s.trainerName !== undefined
        ? s.trainerName
        : trainerUser
        ? trainerUser.fullName
        : '';

    const updatedStudent = {
      ...s,
      id,
      trainerId: s.trainerId || '',
      trainerName: resolvedTrainerName,
      targetMetrics: compactJson(s.targetMetrics),
    };
    dbStore.students = dbStore.students.map((item) =>
      item.id === id ? { ...item, ...updatedStudent } : item
    );
    // Sync trainerId and fullName on the student's user account
    dbStore.users = dbStore.users.map((u) =>
      u.studentId === id
        ? {
            ...u,
            fullName: s.fullName || u.fullName,
            phone: s.phone || u.phone,
            trainerId: s.trainerId || null,
          }
        : u
    );
    saveDiskStore(dbStore);

    if (dbConnected) {
      try {
        await pool.query(
          `UPDATE students SET
            full_name = $1, gender = $2, age = $3, height = $4, phone = $5,
            address = $6, date_of_birth = $7, health_goal = $8, target_metrics = $9, avatar_url = $10,
            trainer_id = $11, trainer_name = $12
           WHERE id = $13`,
          [
            s.fullName,
            s.gender,
            s.age,
            s.height,
            s.phone,
            s.address || '',
            s.dateOfBirth || '2000-01-01',
            s.healthGoal,
            JSON.stringify(compactJson(s.targetMetrics)),
            s.avatarUrl || '',
            s.trainerId || null,
            resolvedTrainerName || null,
            id,
          ]
        );
        await pool.query(
          `UPDATE users SET full_name = $1, phone = $2, trainer_id = $3 WHERE student_id = $4`,
          [s.fullName, s.phone || '', s.trainerId || null, id]
        );
      } catch {
        dbConnected = false;
      }
    }
    res.json(updatedStudent);
  } catch (err: unknown) {
    res.status(500).json({ error: getErrMessage(err) });
  }
});

app.delete('/api/students/:id', async (req, res) => {
  try {
    const { id } = req.params;
    dbStore.students = dbStore.students.filter((item) => item.id !== id);
    dbStore.users = dbStore.users.filter((u) => u.studentId !== id);
    dbStore.metrics = dbStore.metrics.filter((m) => m.studentId !== id);
    dbStore.advices = dbStore.advices.filter((a) => a.studentId !== id);
    dbStore.meals = dbStore.meals.filter((m) => m.studentId !== id);
    dbStore.workouts = dbStore.workouts.filter((w) => w.studentId !== id);
    dbStore.photos = dbStore.photos.filter((p) => p.studentId !== id);
    dbStore.notifications = dbStore.notifications.filter((n) => n.studentId !== id);
    saveDiskStore(dbStore);

    if (dbConnected) {
      try {
        await pool.query('DELETE FROM students WHERE id = $1', [id]);
        await pool.query('DELETE FROM users WHERE student_id = $1', [id]);
      } catch {
        dbConnected = false;
      }
    }
    res.json({ success: true, deletedId: id });
  } catch (err: unknown) {
    res.status(500).json({ error: getErrMessage(err) });
  }
});

// Health Metrics API (10 Indicators)
app.get('/api/metrics', async (req, res) => {
  try {
    const { studentId } = req.query;
    if (dbConnected) {
      const query = studentId
        ? 'SELECT * FROM health_metrics WHERE student_id = $1 ORDER BY timestamp ASC'
        : 'SELECT * FROM health_metrics ORDER BY timestamp ASC';
      const params = studentId ? [studentId] : [];
      const result = await pool.query(query, params);
      const metrics = result.rows.map((r) => ({
        id: r.id,
        studentId: r.student_id,
        date: r.date ? new Date(r.date).toISOString().split('T')[0] : '',
        timestamp: Number(r.timestamp),
        weight: parseFloat(r.weight),
        subcutaneousFat: parseFloat(r.subcutaneous_fat),
        boneCalcium: parseFloat(r.bone_calcium),
        bodyWater: parseFloat(r.body_water),
        muscleMass: parseFloat(r.muscle_mass),
        bodyType: r.body_type,
        bmr: parseInt(r.bmr, 10),
        biologicalAge: parseInt(r.biological_age, 10),
        visceralFat: parseInt(r.visceral_fat, 10),
        waist: parseFloat(r.waist),
        notes: r.notes || '',
      }));
      if (!studentId) {
        dbStore.metrics = metrics;
        saveDiskStore(dbStore);
      }
      return res.json(metrics);
    }
    const list = studentId
      ? dbStore.metrics.filter((m) => m.studentId === studentId)
      : dbStore.metrics;
    res.json(list);
  } catch {
    dbConnected = false;
    const { studentId } = req.query;
    const list = studentId
      ? dbStore.metrics.filter((m) => m.studentId === studentId)
      : dbStore.metrics;
    res.json(list);
  }
});

app.post('/api/metrics', async (req, res) => {
  try {
    const m = req.body;
    const cleanMetric = {
      ...m,
      notes: String(m.notes || '').trim(),
    };
    dbStore.metrics = [...dbStore.metrics.filter((item) => item.id !== m.id), cleanMetric].sort(
      (a, b) => a.timestamp - b.timestamp
    );
    saveDiskStore(dbStore);

    if (dbConnected) {
      try {
        await pool.query(
          `INSERT INTO health_metrics
           (id, student_id, date, timestamp, weight, subcutaneous_fat, bone_calcium, body_water, muscle_mass, body_type, bmr, biological_age, visceral_fat, waist, notes)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
          [
            m.id,
            m.studentId,
            m.date,
            m.timestamp,
            m.weight,
            m.subcutaneousFat,
            m.boneCalcium,
            m.bodyWater,
            m.muscleMass,
            m.bodyType,
            m.bmr,
            m.biologicalAge,
            m.visceralFat,
            m.waist,
            cleanMetric.notes,
          ]
        );
      } catch {
        dbConnected = false;
      }
    }
    res.status(201).json(cleanMetric);
  } catch (err: unknown) {
    res.status(500).json({ error: getErrMessage(err) });
  }
});

app.delete('/api/metrics/:id', async (req, res) => {
  try {
    const { id } = req.params;
    dbStore.metrics = dbStore.metrics.filter((m) => m.id !== id);
    dbStore.advices = dbStore.advices.filter((a) => a.metricRecordId !== id);
    saveDiskStore(dbStore);

    if (dbConnected) {
      try {
        await pool.query('DELETE FROM health_metrics WHERE id = $1', [id]);
        await pool.query('DELETE FROM ai_advices WHERE metric_record_id = $1', [id]);
      } catch {
        dbConnected = false;
      }
    }
    res.json({ success: true, deletedId: id });
  } catch (err: unknown) {
    res.status(500).json({ error: getErrMessage(err) });
  }
});

// AI Advices API
app.get('/api/advices', async (req, res) => {
  try {
    const { studentId } = req.query;
    if (dbConnected) {
      const query = studentId
        ? 'SELECT * FROM ai_advices WHERE student_id = $1 ORDER BY date DESC'
        : 'SELECT * FROM ai_advices ORDER BY date DESC';
      const params = studentId ? [studentId] : [];
      const result = await pool.query(query, params);
      const advices = result.rows.map((r) => ({
        id: r.id,
        studentId: r.student_id,
        metricRecordId: r.metric_record_id,
        date: r.date ? new Date(r.date).toISOString().split('T')[0] : '',
        status: r.status,
        aiDraftContent: r.ai_draft_content,
        trainerEditedContent: r.trainer_edited_content,
        trainerNote: r.trainer_note,
        approvedAt: r.approved_at,
      }));
      if (!studentId) {
        dbStore.advices = advices;
        saveDiskStore(dbStore);
      }
      return res.json(advices);
    }
    const list = studentId
      ? dbStore.advices.filter((a) => a.studentId === studentId)
      : dbStore.advices;
    res.json(list);
  } catch {
    dbConnected = false;
    const { studentId } = req.query;
    const list = studentId
      ? dbStore.advices.filter((a) => a.studentId === studentId)
      : dbStore.advices;
    res.json(list);
  }
});

app.post('/api/advices', async (req, res) => {
  try {
    const a = req.body;
    dbStore.advices = [a, ...dbStore.advices.filter((item) => item.id !== a.id)];
    saveDiskStore(dbStore);

    if (dbConnected) {
      try {
        await pool.query(
          `INSERT INTO ai_advices (id, student_id, metric_record_id, date, status, ai_draft_content, trainer_edited_content, trainer_note, approved_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (id) DO UPDATE SET
             ai_draft_content = EXCLUDED.ai_draft_content,
             trainer_edited_content = EXCLUDED.trainer_edited_content,
             approved_at = EXCLUDED.approved_at`,
          [
            a.id,
            a.studentId,
            a.metricRecordId,
            a.date,
            a.status,
            JSON.stringify(a.aiDraftContent),
            a.trainerEditedContent || null,
            a.trainerNote || null,
            a.approvedAt || null,
          ]
        );
      } catch {
        dbConnected = false;
      }
    }
    res.status(201).json(a);
  } catch (err: unknown) {
    res.status(500).json({ error: getErrMessage(err) });
  }
});

app.put('/api/advices/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const a = req.body;
    dbStore.advices = dbStore.advices.map((item) => (item.id === id ? { ...item, ...a } : item));
    saveDiskStore(dbStore);

    if (dbConnected) {
      try {
        await pool.query(
          `UPDATE ai_advices SET
            status = COALESCE($1, status),
            ai_draft_content = COALESCE($2, ai_draft_content),
            trainer_edited_content = $3,
            trainer_note = $4,
            approved_at = $5
           WHERE id = $6`,
          [
            a.status,
            a.aiDraftContent ? JSON.stringify(a.aiDraftContent) : null,
            a.trainerEditedContent,
            a.trainerNote,
            a.approvedAt,
            id,
          ]
        );
      } catch {
        dbConnected = false;
      }
    }
    res.json(a);
  } catch (err: unknown) {
    res.status(500).json({ error: getErrMessage(err) });
  }
});

// AI Health Analysis Endpoint
app.post('/api/ai/analyze-health', async (req, res) => {
  try {
    const { student, metric, previousMetric } = req.body;
    if (!student || !metric) {
      return res.status(400).json({ error: 'Thiếu dữ liệu học viên hoặc chỉ số đo lường.' });
    }

    const calorieAnalysis = calculateCalorieGoalBreakdown(
      metric.bmr,
      metric.weight,
      student,
      1.375,
      metric.visceralFat
    );

    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey && apiKey !== 'MY_GEMINI_API_KEY') {
      const client = new GoogleGenAI({
        apiKey,
        httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
      });

      const userPrompt = `
HỌC VIÊN: ${student.fullName} (${student.gender}, ${student.age} tuổi, ${student.height}m).
Mục tiêu sức khỏe: "${student.healthGoal}".
CƠ SỞ TÍNH CALO (4 YẾU TỐ):
- Cân nặng hiện tại: ${calorieAnalysis.currentWeightKg} kg
- Cân nặng mong muốn: ${calorieAnalysis.targetWeightKg} kg (${calorieAnalysis.mode === 'weight_loss' ? `Giảm ${calorieAnalysis.weightDiffKg} kg` : calorieAnalysis.mode === 'weight_gain' ? `Tăng +${calorieAnalysis.weightDiffKg} kg` : 'Duy trì cân nặng'})
- Thời gian mong muốn đạt mục tiêu: ${calorieAnalysis.durationWeeks} tuần (${calorieAnalysis.durationDays} ngày)
- Mức mỡ nội tạng hiện tại: Cấp ${metric.visceralFat}${calorieAnalysis.targetVisceralFat ? ` (Mục tiêu: Cấp ${calorieAnalysis.targetVisceralFat})` : ''}
- BMR nghỉ ngơi: ${calorieAnalysis.bmr} Kcal/ngày • TDEE tiêu hao: ${calorieAnalysis.tdee} Kcal/ngày
- Chênh lệch năng lượng mỗi ngày (bao gồm điều chỉnh mỡ nội tạng): ${calorieAnalysis.dailyCalorieAdjustment > 0 ? `+${calorieAnalysis.dailyCalorieAdjustment}` : calorieAnalysis.dailyCalorieAdjustment} Kcal/ngày
- ${calorieAnalysis.label}: ${calorieAnalysis.targetDailyCalories} Kcal/ngày (Đạm: ${calorieAnalysis.recommendedMacros.proteinGrams}g, Tinh bột: ${calorieAnalysis.recommendedMacros.carbsGrams}g, Chất béo: ${calorieAnalysis.recommendedMacros.fatGrams}g).

LẦN ĐO HIỆN TẠI (${metric.date}):
- Cân nặng: ${metric.weight}kg, Mỡ dưới da: ${metric.subcutaneousFat}%, Canxi xương: ${metric.boneCalcium}, Lượng nước: ${metric.bodyWater}%, Cơ bắp: ${metric.muscleMass}kg, Thể hình: "${metric.bodyType}", BMR: ${metric.bmr} Kcal, Tuổi sinh học: ${metric.biologicalAge} tuổi, Mỡ nội tạng: Cấp ${metric.visceralFat}, Vòng eo: ${metric.waist}cm.
${previousMetric ? `LẦN ĐO TRƯỚC (${previousMetric.date}): Cân nặng: ${previousMetric.weight}kg, Cơ bắp: ${previousMetric.muscleMass}kg, Mỡ dưới da: ${previousMetric.subcutaneousFat}%, Mỡ nội tạng: Cấp ${previousMetric.visceralFat}, Tuổi sinh học: ${previousMetric.biologicalAge} tuổi.` : 'Lần đo đầu tiên.'}

YÊU CẦU: Trả về JSON theo đúng 3 phần bắt buộc:
1. warningMetrics: Danh sách các chỉ số bất thường kèm rủi ro bệnh lý cụ thể.
2. deepAssessment: Đánh giá chuyên sâu 4 khía cạnh (overview, bodyCompositionAnalysis, visceralAndAgingRisk, progressComparison).
3. actionRecommendations: Khuyến nghị hành động định lượng cụ thể về Dinh dưỡng (phải phân tích rõ mức Calo tối đa nạp mỗi ngày nếu giảm cân hoặc tối thiểu nạp mỗi ngày nếu tăng cân dựa trên cân nặng hiện tại ${calorieAnalysis.currentWeightKg}kg, cân nặng mục tiêu ${calorieAnalysis.targetWeightKg}kg, thời gian ${calorieAnalysis.durationWeeks} tuần và mức mỡ nội tạng cấp ${metric.visceralFat}), Tập luyện, Lối sống & Chuyển hóa.`;

      try {
        const response = await client.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: userPrompt,
          config: {
            systemInstruction: `Bạn là Chuyên gia Cao cấp về Y học Thể thao & Dinh dưỡng Chuyển hóa tại FitTrack Pro.
QUY TẮC BẮT BUỘC: Tuyệt đối không mô tả chung chung. Bắt buộc phân tích sâu theo cấu trúc 3 phần:
Phần 1: Chỉ số cảnh báo (warningMetrics) - Tên chỉ số, giá trị thực tế, ngưỡng chuẩn, mức độ (danger/warning/safe) và nguy cơ bệnh lý tim mạch/chuyển hóa/xương khớp cụ thể.
Phần 2: Đánh giá chuyên sâu (deepAssessment) - Tổng quan thể trạng (overview), ma trận cơ-mỡ-nước-xương (bodyCompositionAnalysis), mỡ nội tạng & lão hóa sinh học (visceralAndAgingRisk), so sánh tiến trình định lượng (progressComparison).
Phần 3: Khuyến nghị hành động cụ thể (actionRecommendations) - Chia rõ 3 nhóm:
- Nhóm 'Dinh dưỡng': Bắt buộc phân tích dựa trên cân nặng hiện tại, cân nặng mong muốn, thời gian mong muốn (số tuần/ngày) và mức mỡ nội tạng để chỉ rõ MỨC CALO TỐI ĐA nạp mỗi ngày (đối với người giảm cân / hạ mỡ nội tạng) hoặc MỨC CALO TỐI THIỂU nạp mỗi ngày (đối với người tăng cân), kèm số gram Protein, Tinh bột, Chất béo.
- Nhóm 'Tập luyện': Số buổi & dạng bài tập cụ thể.
- Nhóm 'Lối sống & Chuyển hóa': Lít nước & giấc ngủ.`,
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                warningMetrics: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      name: { type: Type.STRING },
                      value: { type: Type.STRING },
                      standard: { type: Type.STRING },
                      level: { type: Type.STRING, enum: ['danger', 'warning', 'safe'] },
                      risk: { type: Type.STRING },
                    },
                    required: ['name', 'value', 'standard', 'level', 'risk'],
                  },
                },
                deepAssessment: {
                  type: Type.OBJECT,
                  properties: {
                    overview: { type: Type.STRING },
                    bodyCompositionAnalysis: { type: Type.STRING },
                    visceralAndAgingRisk: { type: Type.STRING },
                    progressComparison: { type: Type.STRING },
                  },
                  required: [
                    'overview',
                    'bodyCompositionAnalysis',
                    'visceralAndAgingRisk',
                    'progressComparison',
                  ],
                },
                actionRecommendations: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      area: {
                        type: Type.STRING,
                        enum: ['Dinh dưỡng', 'Tập luyện', 'Lối sống & Chuyển hóa'],
                      },
                      action: { type: Type.STRING },
                      target: { type: Type.STRING },
                      notes: { type: Type.STRING },
                    },
                    required: ['area', 'action', 'target'],
                  },
                },
                summary: { type: Type.STRING },
                nutritionAdvice: { type: Type.STRING },
                workoutAdvice: { type: Type.STRING },
                lifestyleTip: { type: Type.STRING },
                waterTargetLiters: { type: Type.NUMBER },
                calorieTargetKcal: { type: Type.INTEGER },
              },
              required: [
                'warningMetrics',
                'deepAssessment',
                'actionRecommendations',
                'summary',
                'nutritionAdvice',
                'workoutAdvice',
                'lifestyleTip',
                'waterTargetLiters',
                'calorieTargetKcal',
              ],
            },
          },
        });

        const rawText = (response.text || '').trim();
        const parsed = JSON.parse(rawText);
        if (parsed && Array.isArray(parsed.warningMetrics)) {
          parsed.calorieAnalysis = calorieAnalysis;
          parsed.calorieTargetKcal = calorieAnalysis.targetDailyCalories;
          return res.json({ success: true, analysis: parsed, source: 'gemini-ai' });
        }
      } catch (geminiErr) {
        console.warn('Gemini health analysis warning:', getErrMessage(geminiErr));
      }
    }

    res.json({ success: false, fallbackRequired: true, calorieAnalysis });
  } catch (err: unknown) {
    res.status(500).json({ error: getErrMessage(err) });
  }
});

// Meals API (Stored directly in Database with compressed WebP/JPEG thumbnails)
app.get('/api/meals', async (req, res) => {
  try {
    const { studentId } = req.query;
    if (dbConnected) {
      const query = studentId
        ? 'SELECT * FROM meal_logs WHERE student_id = $1 ORDER BY date DESC, logged_at DESC'
        : 'SELECT * FROM meal_logs ORDER BY date DESC, logged_at DESC';
      const params = studentId ? [studentId] : [];
      const result = await pool.query(query, params);
      const meals = result.rows.map((r) => ({
        id: r.id,
        studentId: r.student_id,
        date: r.date ? new Date(r.date).toISOString().split('T')[0] : '',
        mealType: r.meal_type,
        imageUrl: r.image_url || '',
        foodDescription: r.food_description || '',
        estimatedCalories: r.estimated_calories || 0,
        macros: r.macros || { protein: 0, carbs: 0, fat: 0 },
        trainerReaction: r.trainer_reaction,
        trainerComment: r.trainer_comment,
        loggedAt: r.logged_at,
      }));
      if (!studentId) {
        dbStore.meals = meals;
        saveDiskStore(dbStore);
      }
      return res.json(meals);
    }
    const list = studentId
      ? dbStore.meals.filter((m) => m.studentId === studentId)
      : dbStore.meals;
    res.json(list);
  } catch {
    dbConnected = false;
    const { studentId } = req.query;
    const list = studentId
      ? dbStore.meals.filter((m) => m.studentId === studentId)
      : dbStore.meals;
    res.json(list);
  }
});

app.post('/api/meals', async (req, res) => {
  try {
    const m = req.body;
    const mealId = m.id || `meal-${Date.now()}`;
    const loggedAt =
      m.loggedAt || new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    const compactMacros: Record<string, unknown> = {
      protein: Number(m.macros?.protein) || 0,
      carbs: Number(m.macros?.carbs) || 0,
      fat: Number(m.macros?.fat) || 0,
    };
    if (m.macros?.dayNumber !== undefined) compactMacros.dayNumber = Number(m.macros.dayNumber);
    if (m.macros?.morningStatus) compactMacros.morningStatus = String(m.macros.morningStatus);
    if (m.macros?.afternoonStatus) compactMacros.afternoonStatus = String(m.macros.afternoonStatus);
    if (m.macros?.attendanceStatus) compactMacros.attendanceStatus = String(m.macros.attendanceStatus);

    const newMeal = {
      id: mealId,
      studentId: m.studentId,
      date: m.date || new Date().toISOString().split('T')[0],
      mealType: m.mealType || 'Phiếu ăn 30 ngày',
      imageUrl: m.imageUrl || '',
      foodDescription: String(m.foodDescription || '').trim(),
      estimatedCalories: Number(m.estimatedCalories) || 0,
      macros: compactMacros as {
        protein: number;
        carbs: number;
        fat: number;
        dayNumber?: number;
        morningStatus?: string;
        afternoonStatus?: string;
        attendanceStatus?: string;
      },
      trainerReaction: m.trainerReaction,
      trainerComment: m.trainerComment,
      loggedAt,
    };

    dbStore.meals = [newMeal, ...dbStore.meals.filter((item) => item.id !== mealId)];
    saveDiskStore(dbStore);

    if (dbConnected) {
      try {
        await pool.query(
          `INSERT INTO meal_logs (id, student_id, date, meal_type, image_url, food_description, estimated_calories, macros, trainer_reaction, trainer_comment, logged_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           ON CONFLICT (id) DO UPDATE SET
             date = EXCLUDED.date,
             meal_type = EXCLUDED.meal_type,
             image_url = EXCLUDED.image_url,
             food_description = EXCLUDED.food_description,
             estimated_calories = EXCLUDED.estimated_calories,
             macros = EXCLUDED.macros,
             trainer_reaction = EXCLUDED.trainer_reaction,
             trainer_comment = EXCLUDED.trainer_comment,
             logged_at = EXCLUDED.logged_at`,
          [
            newMeal.id,
            newMeal.studentId,
            newMeal.date,
            newMeal.mealType,
            newMeal.imageUrl,
            newMeal.foodDescription,
            newMeal.estimatedCalories,
            JSON.stringify(compactMacros),
            m.trainerReaction || null,
            m.trainerComment || null,
            loggedAt,
          ]
        );
      } catch {
        dbConnected = false;
      }
    }

    res.status(201).json(newMeal);
  } catch (err: unknown) {
    res.status(500).json({ error: getErrMessage(err) });
  }
});

app.delete('/api/meals/student/:studentId', async (req, res) => {
  try {
    const { studentId } = req.params;
    dbStore.meals = dbStore.meals.filter((m) => m.studentId !== studentId);
    saveDiskStore(dbStore);

    if (dbConnected) {
      try {
        await pool.query('DELETE FROM meal_logs WHERE student_id = $1', [studentId]);
      } catch {
        dbConnected = false;
      }
    }
    res.json({ success: true });
  } catch (err: unknown) {
    res.status(500).json({ error: getErrMessage(err) });
  }
});

app.delete('/api/meals/:id', async (req, res) => {
  try {
    const { id } = req.params;
    dbStore.meals = dbStore.meals.filter((m) => m.id !== id);
    saveDiskStore(dbStore);

    if (dbConnected) {
      try {
        await pool.query('DELETE FROM meal_logs WHERE id = $1', [id]);
      } catch {
        dbConnected = false;
      }
    }
    res.json({ success: true });
  } catch (err: unknown) {
    res.status(500).json({ error: getErrMessage(err) });
  }
});

app.put('/api/meals/:id/feedback', async (req, res) => {
  try {
    const { id } = req.params;
    const { reaction, comment } = req.body;
    dbStore.meals = dbStore.meals.map((m) =>
      m.id === id ? { ...m, trainerReaction: reaction, trainerComment: comment } : m
    );
    saveDiskStore(dbStore);

    if (dbConnected) {
      try {
        await pool.query(
          `UPDATE meal_logs SET trainer_reaction = $1, trainer_comment = $2 WHERE id = $3`,
          [reaction, comment, id]
        );
      } catch {
        dbConnected = false;
      }
    }
    res.json({ success: true, id, reaction, comment });
  } catch (err: unknown) {
    res.status(500).json({ error: getErrMessage(err) });
  }
});

// Workouts API
app.get('/api/workouts', async (req, res) => {
  try {
    const { studentId } = req.query;
    if (dbConnected) {
      const query = studentId
        ? 'SELECT * FROM workout_logs WHERE student_id = $1 ORDER BY date DESC'
        : 'SELECT * FROM workout_logs ORDER BY date DESC';
      const params = studentId ? [studentId] : [];
      const result = await pool.query(query, params);
      const workouts = result.rows.map((r) => ({
        id: r.id,
        studentId: r.student_id,
        date: r.date ? new Date(r.date).toISOString().split('T')[0] : '',
        planTitle: r.plan_title,
        durationMinutes: r.duration_minutes,
        exercises: r.exercises || [],
        trainerReaction: r.trainer_reaction,
        trainerComment: r.trainer_comment,
        loggedAt: r.logged_at,
      }));
      if (!studentId) {
        dbStore.workouts = workouts;
        saveDiskStore(dbStore);
      }
      return res.json(workouts);
    }
    const list = studentId
      ? dbStore.workouts.filter((w) => w.studentId === studentId)
      : dbStore.workouts;
    res.json(list);
  } catch {
    dbConnected = false;
    const { studentId } = req.query;
    const list = studentId
      ? dbStore.workouts.filter((w) => w.studentId === studentId)
      : dbStore.workouts;
    res.json(list);
  }
});

app.post('/api/workouts', async (req, res) => {
  try {
    const w = req.body;
    dbStore.workouts = [w, ...dbStore.workouts.filter((item) => item.id !== w.id)];
    saveDiskStore(dbStore);

    if (dbConnected) {
      try {
        await pool.query(
          `INSERT INTO workout_logs (id, student_id, date, plan_title, duration_minutes, exercises, trainer_reaction, trainer_comment, logged_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            w.id,
            w.studentId,
            w.date,
            w.planTitle,
            w.durationMinutes,
            JSON.stringify(w.exercises || []),
            w.trainerReaction || null,
            w.trainerComment || null,
            w.loggedAt,
          ]
        );
      } catch {
        dbConnected = false;
      }
    }
    res.status(201).json(w);
  } catch (err: unknown) {
    res.status(500).json({ error: getErrMessage(err) });
  }
});

app.put('/api/workouts/:id/feedback', async (req, res) => {
  try {
    const { id } = req.params;
    const { reaction, comment } = req.body;
    dbStore.workouts = dbStore.workouts.map((w) =>
      w.id === id ? { ...w, trainerReaction: reaction, trainerComment: comment } : w
    );
    saveDiskStore(dbStore);

    if (dbConnected) {
      try {
        await pool.query(
          `UPDATE workout_logs SET trainer_reaction = $1, trainer_comment = $2 WHERE id = $3`,
          [reaction, comment, id]
        );
      } catch {
        dbConnected = false;
      }
    }
    res.json({ success: true, id, reaction, comment });
  } catch (err: unknown) {
    res.status(500).json({ error: getErrMessage(err) });
  }
});

// Physique Photos API
app.get('/api/photos', async (req, res) => {
  try {
    const { studentId } = req.query;
    if (dbConnected) {
      const query = studentId
        ? 'SELECT * FROM physique_photos WHERE student_id = $1 ORDER BY date ASC'
        : 'SELECT * FROM physique_photos ORDER BY date ASC';
      const params = studentId ? [studentId] : [];
      const result = await pool.query(query, params);
      const photos = result.rows.map((r) => ({
        id: r.id,
        studentId: r.student_id,
        date: r.date ? new Date(r.date).toISOString().split('T')[0] : '',
        imageUrl: r.image_url,
        photoType: r.photo_type,
        weight: parseFloat(r.weight),
        notes: r.notes || '',
      }));
      if (!studentId) {
        dbStore.photos = photos;
        saveDiskStore(dbStore);
      }
      return res.json(photos);
    }
    const list = studentId
      ? dbStore.photos.filter((p) => p.studentId === studentId)
      : dbStore.photos;
    res.json(list);
  } catch {
    dbConnected = false;
    const { studentId } = req.query;
    const list = studentId
      ? dbStore.photos.filter((p) => p.studentId === studentId)
      : dbStore.photos;
    res.json(list);
  }
});

app.post('/api/photos', async (req, res) => {
  try {
    const p = req.body;
    dbStore.photos = [...dbStore.photos, p];
    saveDiskStore(dbStore);

    if (dbConnected) {
      try {
        await pool.query(
          `INSERT INTO physique_photos (id, student_id, date, image_url, photo_type, weight, notes)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [p.id, p.studentId, p.date, p.imageUrl, p.photoType, p.weight, String(p.notes || '').trim()]
        );
      } catch {
        dbConnected = false;
      }
    }
    res.status(201).json(p);
  } catch (err: unknown) {
    res.status(500).json({ error: getErrMessage(err) });
  }
});

// Notifications API
app.get('/api/notifications', async (req, res) => {
  try {
    if (dbConnected) {
      const result = await pool.query('SELECT * FROM smart_notifications ORDER BY created_at DESC');
      const notifications = result.rows.map((r) => ({
        id: r.id,
        useCaseId: r.use_case_id,
        studentId: r.student_id,
        title: r.title,
        message: r.message,
        priority: r.priority,
        createdAt: r.created_at,
        read: r.read,
      }));
      dbStore.notifications = notifications;
      saveDiskStore(dbStore);
      return res.json(notifications);
    }
    res.json(dbStore.notifications);
  } catch {
    dbConnected = false;
    res.json(dbStore.notifications);
  }
});

app.put('/api/notifications/:id/read', async (req, res) => {
  try {
    const { id } = req.params;
    dbStore.notifications = dbStore.notifications.map((n) =>
      n.id === id ? { ...n, read: true } : n
    );
    saveDiskStore(dbStore);

    if (dbConnected) {
      try {
        await pool.query('UPDATE smart_notifications SET read = true WHERE id = $1', [id]);
      } catch {
        dbConnected = false;
      }
    }
    res.json({ success: true, id });
  } catch (err: unknown) {
    res.status(500).json({ error: getErrMessage(err) });
  }
});

// Start Express server and attach Vite middleware
async function startServer() {
  await initDatabase();

  const candidatePaths = [
    path.resolve(__dirname, 'dist'),
    path.resolve(process.cwd(), 'dist'),
    path.resolve(__dirname),
  ];
  const distDir = candidatePaths.find((p) => fs.existsSync(path.resolve(p, 'index.html')));

  if (process.env.NODE_ENV === 'production' || (!process.env.NODE_ENV && distDir)) {
    if (distDir) {
      console.log(`📦 Serving static production build from: ${distDir}`);
      app.use(express.static(distDir));
      app.get('*', (req, res) => {
        res.sendFile(path.resolve(distDir, 'index.html'));
      });
    } else {
      console.warn('⚠️ No dist/index.html found for production mode.');
    }
  } else {
    try {
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });
      app.use(vite.middlewares);
    } catch (err) {
      console.warn('Vite dev middleware could not be loaded, falling back to static:', err);
      if (distDir) {
        app.use(express.static(distDir));
        app.get('*', (req, res) => {
          res.sendFile(path.resolve(distDir, 'index.html'));
        });
      }
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 FitTrack Pro server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
});
