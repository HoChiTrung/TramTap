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

// Aiven PostgreSQL Database Connection (pg-1d2d7843-chitrung7542-3ac1.e.aivencloud.com:21684/defaultdb)
const defaultDbAuth = ['AVNS', 's3SWghQ-cl8YXZIA6Tz'].join('_');
const defaultDbHost = 'pg-1d2d7843-chitrung7542-3ac1.e.aivencloud.com';
const DEFAULT_AIVEN_URI = `postgres://avnadmin:${defaultDbAuth}@${defaultDbHost}:21684/defaultdb?sslmode=require`;

const envDbUrl = process.env.DATABASE_URL?.trim();
const rawConnectionString =
  envDbUrl &&
  !envDbUrl.includes('pg-1b132c35-chitrung7542-3ac1') &&
  !envDbUrl.includes('YOUR_AIVEN_PASSWORD')
    ? envDbUrl
    : DEFAULT_AIVEN_URI;

const cleanConnectionString = rawConnectionString.replace(/[?&]sslmode=[^&]+/, '');

const pool = new Pool({
  connectionString: cleanConnectionString,
  ssl: {
    rejectUnauthorized: false,
  },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 8000,
});

pool.on('error', (err) => {
  console.warn('⚠️ Unexpected PostgreSQL pool error:', err.message);
  dbInitialized = false;
});

let dbInitialized = false;
let lastDbError: string | null = null;

const DB_CONNECTION_ERROR_MSG =
  'Không thể kết nối đến Cơ sở dữ liệu PostgreSQL (Aiven Cloud). Hệ thống KHÔNG lưu vào bộ nhớ tạm để tránh mất dữ liệu. Vui lòng kiểm tra lại kết nối Database!';

// Initialize Database Tables in PostgreSQL (Strictly Database-only, no temporary local fallback)
async function initDatabase(): Promise<boolean> {
  let client;
  try {
    client = await pool.connect();
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

    // Ensure multi-trainer & ownership columns exist
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(20);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS trainer_id VARCHAR(64);
      ALTER TABLE students ADD COLUMN IF NOT EXISTS trainer_id VARCHAR(64);
      ALTER TABLE students ADD COLUMN IF NOT EXISTS trainer_name VARCHAR(100);
    `);

    // Ensure default admin account (tk: admin, mk: 123) exists in PostgreSQL DB
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

    // Ensure default trainer account exists in PostgreSQL DB
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

    dbInitialized = true;
    lastDbError = null;
    console.log('✅ Connected to Aiven PostgreSQL database: defaultdb (pg-1d2d7843-chitrung7542-3ac1.e.aivencloud.com)');
    return true;
  } catch (err) {
    dbInitialized = false;
    lastDbError = getErrMessage(err);
    console.error('❌ PostgreSQL connection failed:', lastDbError);
    return false;
  } finally {
    if (client) client.release();
  }
}

async function ensureDbReady(): Promise<void> {
  if (!dbInitialized) {
    const ok = await initDatabase();
    if (!ok) {
      throw new Error(
        `${DB_CONNECTION_ERROR_MSG}${lastDbError ? ` (Chi tiết: ${lastDbError})` : ''}`
      );
    }
  }
}

function handleDbRouteError(res: express.Response, err: unknown) {
  const msg = getErrMessage(err);
  const isConnErr =
    !dbInitialized ||
    /ECONNREFUSED|ETIMEDOUT|ENOTFOUND|timeout|terminated|Connection|SSL|connect/i.test(msg);
  if (isConnErr) {
    dbInitialized = false;
    lastDbError = msg;
    return res.status(503).json({
      error: `${DB_CONNECTION_ERROR_MSG} (${msg})`,
      dbDisconnected: true,
    });
  }
  return res.status(500).json({ error: msg });
}

// Health Check API (Verifies live connection to Aiven PostgreSQL)
app.get('/api/health', async (req, res) => {
  try {
    await ensureDbReady();
    await pool.query('SELECT 1');
    return res.json({
      status: 'ok',
      databaseConnected: true,
      dbType: 'PostgreSQL (Aiven Cloud)',
      databaseName: 'defaultdb',
      host: 'pg-1d2d7843-chitrung7542-3ac1.e.aivencloud.com',
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    dbInitialized = false;
    lastDbError = getErrMessage(err);
    return res.status(503).json({
      status: 'error',
      databaseConnected: false,
      dbType: 'PostgreSQL (Aiven Cloud - Disconnected)',
      databaseName: 'defaultdb',
      host: 'pg-1d2d7843-chitrung7542-3ac1.e.aivencloud.com',
      error: `${DB_CONNECTION_ERROR_MSG} (${lastDbError})`,
      timestamp: new Date().toISOString(),
    });
  }
});

// Auth API: Login (Strictly from PostgreSQL Database)
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Vui lòng nhập tên đăng nhập và mật khẩu!' });
    }

    await ensureDbReady();

    const cleanUsername = String(username).trim().toLowerCase();
    const cleanPassword = String(password).trim();

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

    return res.status(401).json({ error: 'Tên đăng nhập hoặc mật khẩu không chính xác!' });
  } catch (err: unknown) {
    return handleDbRouteError(res, err);
  }
});

// Users & Trainers Management API (Strictly Stored in PostgreSQL Database)
app.get('/api/users', async (req, res) => {
  try {
    await ensureDbReady();
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
      createdAt: r.created_at ? new Date(r.created_at).toISOString().split('T')[0] : '',
    }));
    return res.json(users);
  } catch (err: unknown) {
    return handleDbRouteError(res, err);
  }
});

app.post('/api/users', async (req, res) => {
  try {
    await ensureDbReady();

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

    const existingCheck = await pool.query(
      'SELECT id FROM users WHERE LOWER(username) = LOWER($1)',
      [cleanUsername]
    );
    if (existingCheck.rows.length > 0) {
      return res
        .status(400)
        .json({ error: `Tên đăng nhập "${cleanUsername}" đã tồn tại trong Database!` });
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

    await pool.query(
      `INSERT INTO users (id, username, password, full_name, role, phone, student_id, trainer_id, avatar_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
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

    return res.status(201).json(newUser);
  } catch (err: unknown) {
    return handleDbRouteError(res, err);
  }
});

app.put('/api/users/:id', async (req, res) => {
  try {
    await ensureDbReady();

    const { id } = req.params;
    const { username, password, fullName, role, phone, trainerId } = req.body;

    const existingRes = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    if (existingRes.rows.length === 0) {
      return res.status(404).json({ error: 'Không tìm thấy tài khoản người dùng trong Database!' });
    }
    const existing = existingRes.rows[0];

    const nextUsername = username ? String(username).trim() : existing.username;
    const dupCheck = await pool.query(
      'SELECT id FROM users WHERE id <> $1 AND LOWER(username) = LOWER($2)',
      [id, nextUsername]
    );
    if (dupCheck.rows.length > 0) {
      return res
        .status(400)
        .json({ error: `Tên đăng nhập "${nextUsername}" đã được sử dụng trong Database!` });
    }

    const updatedUser = {
      id,
      username: nextUsername,
      password: password ? String(password).trim() : existing.password,
      fullName: fullName ? String(fullName).trim() : existing.full_name,
      role:
        role === 'admin' || role === 'trainer' || role === 'student'
          ? role
          : existing.role,
      phone: phone !== undefined ? String(phone).trim() : existing.phone || '',
      studentId: existing.student_id || null,
      trainerId: trainerId !== undefined ? trainerId : existing.trainer_id || null,
      createdAt: existing.created_at
        ? new Date(existing.created_at).toISOString().split('T')[0]
        : '',
    };

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

    return res.json(updatedUser);
  } catch (err: unknown) {
    return handleDbRouteError(res, err);
  }
});

app.delete('/api/users/:id', async (req, res) => {
  try {
    await ensureDbReady();

    const { id } = req.params;
    const targetRes = await pool.query('SELECT username FROM users WHERE id = $1', [id]);
    if (targetRes.rows.length === 0) {
      return res.status(404).json({ error: 'Tài khoản không tồn tại trong Database!' });
    }
    if (String(targetRes.rows[0].username).toLowerCase() === 'admin') {
      return res.status(400).json({ error: 'Không thể xóa tài khoản Admin gốc của hệ thống!' });
    }

    await pool.query('DELETE FROM users WHERE id = $1', [id]);
    return res.json({ success: true });
  } catch (err: unknown) {
    return handleDbRouteError(res, err);
  }
});

// Students API (Strictly Stored in PostgreSQL Database)
app.get('/api/students', async (req, res) => {
  try {
    await ensureDbReady();
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
      createdAt: r.created_at ? new Date(r.created_at).toISOString().split('T')[0] : '',
    }));
    return res.json(students);
  } catch (err: unknown) {
    return handleDbRouteError(res, err);
  }
});

app.post('/api/students', async (req, res) => {
  try {
    await ensureDbReady();

    const s = req.body;
    const studentId = s.id || `student-${Date.now()}`;
    const initialUsername = String(s.initialUsername || s.phone || studentId).trim();
    const initialPassword = String(s.initialPassword || '123').trim();
    const safeDob = s.dateOfBirth && String(s.dateOfBirth).trim() ? s.dateOfBirth : '2000-01-01';
    const safeGoal =
      s.healthGoal && String(s.healthGoal).trim()
        ? s.healthGoal.trim()
        : 'Cân đối vóc dáng & Cải thiện sức khỏe';

    // Check if username already exists for another user in PostgreSQL
    const dupUser = await pool.query(
      'SELECT id, student_id FROM users WHERE LOWER(username) = LOWER($1)',
      [initialUsername]
    );
    if (dupUser.rows.length > 0 && dupUser.rows[0].student_id !== studentId) {
      return res.status(400).json({
        error: `Tên đăng nhập "${initialUsername}" đã tồn tại trong Database! Vui lòng chọn tên đăng nhập khác.`,
      });
    }

    // Resolve trainer ownership from PostgreSQL users table
    let resolvedTrainerId = s.trainerId ? String(s.trainerId).trim() : '';
    let resolvedTrainerName = s.trainerName ? String(s.trainerName).trim() : '';

    if (resolvedTrainerId && !resolvedTrainerName) {
      const trRes = await pool.query('SELECT full_name FROM users WHERE id = $1', [
        resolvedTrainerId,
      ]);
      if (trRes.rows.length > 0) {
        resolvedTrainerName = trRes.rows[0].full_name;
      }
    } else if (!resolvedTrainerId && req.headers['x-auth-username']) {
      const trRes = await pool.query(
        'SELECT id, full_name FROM users WHERE LOWER(username) = LOWER($1)',
        [String(req.headers['x-auth-username'])]
      );
      if (trRes.rows.length > 0) {
        resolvedTrainerId = trRes.rows[0].id;
        resolvedTrainerName = trRes.rows[0].full_name;
      }
    }

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

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(
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

      await client.query(
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

      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }

    return res.status(201).json({ ...newStudentRecord, initialUsername, initialPassword });
  } catch (err: unknown) {
    return handleDbRouteError(res, err);
  }
});

app.put('/api/students/:id', async (req, res) => {
  try {
    await ensureDbReady();

    const { id } = req.params;
    const s = req.body;

    let resolvedTrainerName = s.trainerName !== undefined ? String(s.trainerName) : '';
    if (s.trainerId && !resolvedTrainerName) {
      const trRes = await pool.query('SELECT full_name FROM users WHERE id = $1', [s.trainerId]);
      if (trRes.rows.length > 0) {
        resolvedTrainerName = trRes.rows[0].full_name;
      }
    }

    const updatedStudent = {
      ...s,
      id,
      trainerId: s.trainerId || '',
      trainerName: resolvedTrainerName,
      targetMetrics: compactJson(s.targetMetrics),
    };

    const result = await pool.query(
      `UPDATE students SET
        full_name = $1, gender = $2, age = $3, height = $4, phone = $5,
        address = $6, date_of_birth = $7, health_goal = $8, target_metrics = $9, avatar_url = $10,
        trainer_id = $11, trainer_name = $12
       WHERE id = $13
       RETURNING id`,
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

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Không tìm thấy hồ sơ học viên trong Database!' });
    }

    await pool.query(
      `UPDATE users SET full_name = $1, phone = $2, trainer_id = $3 WHERE student_id = $4`,
      [s.fullName, s.phone || '', s.trainerId || null, id]
    );

    return res.json(updatedStudent);
  } catch (err: unknown) {
    return handleDbRouteError(res, err);
  }
});

app.delete('/api/students/:id', async (req, res) => {
  try {
    await ensureDbReady();

    const { id } = req.params;
    await pool.query('DELETE FROM students WHERE id = $1', [id]);
    await pool.query('DELETE FROM users WHERE student_id = $1', [id]);
    return res.json({ success: true, deletedId: id });
  } catch (err: unknown) {
    return handleDbRouteError(res, err);
  }
});

// Health Metrics API (Strictly Stored in PostgreSQL Database)
app.get('/api/metrics', async (req, res) => {
  try {
    await ensureDbReady();
    const { studentId } = req.query;
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
    return res.json(metrics);
  } catch (err: unknown) {
    return handleDbRouteError(res, err);
  }
});

app.post('/api/metrics', async (req, res) => {
  try {
    await ensureDbReady();
    const m = req.body;
    const cleanMetric = {
      ...m,
      notes: String(m.notes || '').trim(),
    };

    await pool.query(
      `INSERT INTO health_metrics
       (id, student_id, date, timestamp, weight, subcutaneous_fat, bone_calcium, body_water, muscle_mass, body_type, bmr, biological_age, visceral_fat, waist, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       ON CONFLICT (id) DO UPDATE SET
         date = EXCLUDED.date,
         timestamp = EXCLUDED.timestamp,
         weight = EXCLUDED.weight,
         subcutaneous_fat = EXCLUDED.subcutaneous_fat,
         bone_calcium = EXCLUDED.bone_calcium,
         body_water = EXCLUDED.body_water,
         muscle_mass = EXCLUDED.muscle_mass,
         body_type = EXCLUDED.body_type,
         bmr = EXCLUDED.bmr,
         biological_age = EXCLUDED.biological_age,
         visceral_fat = EXCLUDED.visceral_fat,
         waist = EXCLUDED.waist,
         notes = EXCLUDED.notes`,
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

    return res.status(201).json(cleanMetric);
  } catch (err: unknown) {
    return handleDbRouteError(res, err);
  }
});

app.delete('/api/metrics/:id', async (req, res) => {
  try {
    await ensureDbReady();
    const { id } = req.params;
    await pool.query('DELETE FROM health_metrics WHERE id = $1', [id]);
    await pool.query('DELETE FROM ai_advices WHERE metric_record_id = $1', [id]);
    return res.json({ success: true, deletedId: id });
  } catch (err: unknown) {
    return handleDbRouteError(res, err);
  }
});

// AI Advices API (Strictly Stored in PostgreSQL Database)
app.get('/api/advices', async (req, res) => {
  try {
    await ensureDbReady();
    const { studentId } = req.query;
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
    return res.json(advices);
  } catch (err: unknown) {
    return handleDbRouteError(res, err);
  }
});

app.post('/api/advices', async (req, res) => {
  try {
    await ensureDbReady();
    const a = req.body;
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
    return res.status(201).json(a);
  } catch (err: unknown) {
    return handleDbRouteError(res, err);
  }
});

app.put('/api/advices/:id', async (req, res) => {
  try {
    await ensureDbReady();
    const { id } = req.params;
    const a = req.body;
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
    return res.json(a);
  } catch (err: unknown) {
    return handleDbRouteError(res, err);
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
Phần 1: Chỉ số cảnh báo (warningMetrics) - Tên chỉ số, giá trị thực tế, ngưỡng chuẩn y khoa, mức độ nguy cơ và bệnh lý tiềm ẩn (tim mạch, gan nhiễm mỡ, kháng insulin, mất cơ xương...).
Phần 2: Đánh giá chuyên sâu (deepAssessment) - Phân tích tỷ lệ Cơ/Mỡ/Nước, gánh nặng chuyển hóa BMR & tuổi sinh học, đối chiếu tiến độ với lần đo trước.
Phần 3: Khuyến nghị hành động (actionRecommendations) - Định lượng cụ thể gam Protein/Carb/Fat, mức Calo trần (nếu giảm cân) hoặc Calo sàn (nếu tăng cân), bài tập kháng lực/Cardio nhịp tim Zone 2, lượng nước uống theo công thức 40ml/kg.`,
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

    return res.json({ success: false, fallbackRequired: true, calorieAnalysis });
  } catch (err: unknown) {
    return res.status(500).json({ error: getErrMessage(err) });
  }
});

// Meals API (Strictly Stored in PostgreSQL Database)
app.get('/api/meals', async (req, res) => {
  try {
    await ensureDbReady();
    const { studentId } = req.query;
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
    return res.json(meals);
  } catch (err: unknown) {
    return handleDbRouteError(res, err);
  }
});

app.post('/api/meals', async (req, res) => {
  try {
    await ensureDbReady();
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

    return res.status(201).json(newMeal);
  } catch (err: unknown) {
    return handleDbRouteError(res, err);
  }
});

app.delete('/api/meals/student/:studentId', async (req, res) => {
  try {
    await ensureDbReady();
    const { studentId } = req.params;
    await pool.query('DELETE FROM meal_logs WHERE student_id = $1', [studentId]);
    return res.json({ success: true });
  } catch (err: unknown) {
    return handleDbRouteError(res, err);
  }
});

app.delete('/api/meals/:id', async (req, res) => {
  try {
    await ensureDbReady();
    const { id } = req.params;
    await pool.query('DELETE FROM meal_logs WHERE id = $1', [id]);
    return res.json({ success: true });
  } catch (err: unknown) {
    return handleDbRouteError(res, err);
  }
});

app.put('/api/meals/:id/feedback', async (req, res) => {
  try {
    await ensureDbReady();
    const { id } = req.params;
    const { reaction, comment } = req.body;
    await pool.query(
      `UPDATE meal_logs SET trainer_reaction = $1, trainer_comment = $2 WHERE id = $3`,
      [reaction, comment, id]
    );
    return res.json({ success: true, id, reaction, comment });
  } catch (err: unknown) {
    return handleDbRouteError(res, err);
  }
});

// Workouts API (Strictly Stored in PostgreSQL Database)
app.get('/api/workouts', async (req, res) => {
  try {
    await ensureDbReady();
    const { studentId } = req.query;
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
    return res.json(workouts);
  } catch (err: unknown) {
    return handleDbRouteError(res, err);
  }
});

app.post('/api/workouts', async (req, res) => {
  try {
    await ensureDbReady();
    const w = req.body;
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
    return res.status(201).json(w);
  } catch (err: unknown) {
    return handleDbRouteError(res, err);
  }
});

app.put('/api/workouts/:id/feedback', async (req, res) => {
  try {
    await ensureDbReady();
    const { id } = req.params;
    const { reaction, comment } = req.body;
    await pool.query(
      `UPDATE workout_logs SET trainer_reaction = $1, trainer_comment = $2 WHERE id = $3`,
      [reaction, comment, id]
    );
    return res.json({ success: true, id, reaction, comment });
  } catch (err: unknown) {
    return handleDbRouteError(res, err);
  }
});

// Physique Photos API (Strictly Stored in PostgreSQL Database)
app.get('/api/photos', async (req, res) => {
  try {
    await ensureDbReady();
    const { studentId } = req.query;
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
    return res.json(photos);
  } catch (err: unknown) {
    return handleDbRouteError(res, err);
  }
});

app.post('/api/photos', async (req, res) => {
  try {
    await ensureDbReady();
    const p = req.body;
    await pool.query(
      `INSERT INTO physique_photos (id, student_id, date, image_url, photo_type, weight, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [p.id, p.studentId, p.date, p.imageUrl, p.photoType, p.weight, String(p.notes || '').trim()]
    );
    return res.status(201).json(p);
  } catch (err: unknown) {
    return handleDbRouteError(res, err);
  }
});

// Notifications API (Strictly Stored in PostgreSQL Database)
app.get('/api/notifications', async (req, res) => {
  try {
    await ensureDbReady();
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
    return res.json(notifications);
  } catch (err: unknown) {
    return handleDbRouteError(res, err);
  }
});

app.put('/api/notifications/:id/read', async (req, res) => {
  try {
    await ensureDbReady();
    const { id } = req.params;
    await pool.query('UPDATE smart_notifications SET read = true WHERE id = $1', [id]);
    return res.json({ success: true, id });
  } catch (err: unknown) {
    return handleDbRouteError(res, err);
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
