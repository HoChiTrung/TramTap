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
import { calculateCalorieGoalBreakdown } from './src/utils/healthCalculations.js';

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

// Aiven PostgreSQL Database Connection (via Vercel / local environment variables)
function resolveDatabaseConfig(): {
  rawUri: string;
  sourceKey: string | null;
  hasPlaceholder: boolean;
} {
  const candidates: Array<{ key: string; value: string | undefined }> = [
    { key: 'DATABASE_URL', value: process.env.DATABASE_URL },
    { key: 'POSTGRES_URL', value: process.env.POSTGRES_URL },
    { key: 'POSTGRES_URL_NON_POOLING', value: process.env.POSTGRES_URL_NON_POOLING },
    { key: 'POSTGRES_PRISMA_URL', value: process.env.POSTGRES_PRISMA_URL },
    { key: 'AIVEN_DATABASE_URL', value: process.env.AIVEN_DATABASE_URL },
    { key: 'AIVEN_POSTGRES_URL', value: process.env.AIVEN_POSTGRES_URL },
    { key: 'DATABASE_URI', value: process.env.DATABASE_URI },
    { key: 'POSTGRES_URI', value: process.env.POSTGRES_URI },
  ];

  let foundPlaceholder = false;
  for (const candidate of candidates) {
    // Strip accidental whitespace, newlines, or surrounding quotes copied from .env.example
    const cleaned = candidate.value?.trim().replace(/^["']+|["']+$/g, '').trim();
    if (!cleaned) continue;
    if (cleaned.includes('YOUR_AIVEN_PASSWORD')) {
      foundPlaceholder = true;
      continue;
    }
    return { rawUri: cleaned, sourceKey: candidate.key, hasPlaceholder: false };
  }
  return { rawUri: '', sourceKey: null, hasPlaceholder: foundPlaceholder };
}

function stripSslModeParam(uri: string): string {
  if (!uri) return '';
  try {
    const parsed = new URL(uri);
    parsed.searchParams.delete('sslmode');
    return parsed.toString();
  } catch {
    return uri
      .replace(/([?&])sslmode=[^&]*&?/i, '$1')
      .replace(/[?&]$/, '');
  }
}

const resolvedDbConfig = resolveDatabaseConfig();
const rawConnectionString = resolvedDbConfig.rawUri;
const cleanConnectionString = stripSslModeParam(rawConnectionString);

function parseDbInfo(uri: string): { host: string; databaseName: string } {
  if (!uri) {
    return { host: 'Chưa cấu hình DATABASE_URL', databaseName: 'defaultdb' };
  }
  try {
    const parsed = new URL(uri);
    return {
      host: parsed.hostname || 'aivencloud.com',
      databaseName: parsed.pathname?.replace(/^\//, '') || 'defaultdb',
    };
  } catch {
    return { host: 'Aiven Cloud PostgreSQL', databaseName: 'defaultdb' };
  }
}

const dbInfo = parseDbInfo(rawConnectionString);
const isServerless = Boolean(process.env.VERCEL);

const pool = new Pool({
  connectionString: cleanConnectionString || undefined,
  ssl: cleanConnectionString
    ? {
        rejectUnauthorized: false,
      }
    : undefined,
  max: isServerless ? 3 : 10,
  idleTimeoutMillis: isServerless ? 10000 : 30000,
  connectionTimeoutMillis: 10000,
});

pool.on('error', (err) => {
  console.warn('⚠️ Unexpected PostgreSQL pool error:', err.message);
  dbInitialized = false;
});

let dbInitialized = false;
let initPromise: Promise<boolean> | null = null;
let lastDbError: string | null = null;

const DB_CONNECTION_ERROR_MSG =
  'Không thể kết nối đến Cơ sở dữ liệu PostgreSQL (Aiven Cloud). Hệ thống KHÔNG lưu vào bộ nhớ tạm để tránh mất dữ liệu. Vui lòng kiểm tra lại biến môi trường DATABASE_URL!';

function formatDbErrorMessage(detail?: string | null): string {
  const cleanDetail = detail?.trim();
  if (!cleanDetail) return DB_CONNECTION_ERROR_MSG;
  if (cleanDetail.startsWith(DB_CONNECTION_ERROR_MSG)) return cleanDetail;
  return `${DB_CONNECTION_ERROR_MSG} (Chi tiết: ${cleanDetail})`;
}

// Initialize Database Tables in PostgreSQL (Strictly Database-only, no temporary local fallback)
async function initDatabase(): Promise<boolean> {
  if (!cleanConnectionString) {
    dbInitialized = false;
    lastDbError = resolvedDbConfig.hasPlaceholder
      ? 'Biến môi trường DATABASE_URL đang dùng mật khẩu mẫu (YOUR_AIVEN_PASSWORD). Vui lòng thay bằng Service URI thật từ Aiven Cloud rồi Redeploy!'
      : 'Thiếu biến môi trường DATABASE_URL trên máy chủ (Vercel -> Settings -> Environment Variables -> chọn Production & Preview rồi Redeploy).';
    console.error('❌', lastDbError);
    return false;
  }

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

    // Ensure multi-trainer, ownership & Herbalife discount tier columns exist
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(20);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS trainer_id VARCHAR(64);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS discount_tier INT DEFAULT 50;
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

    // Tuition, Debt, Herbalife Product Catalog, Revenue Allocation & Operating Cost Tables
    await client.query(`
      CREATE TABLE IF NOT EXISTS revenue_entities (
        id VARCHAR(64) PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        is_active BOOLEAN DEFAULT TRUE,
        sort_order INT DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS herbalife_products (
        id VARCHAR(64) PRIMARY KEY,
        name VARCHAR(160) NOT NULL,
        unit_label VARCHAR(40) NOT NULL DEFAULT 'hộp',
        portion_unit_label VARCHAR(40) NOT NULL DEFAULT 'hộp',
        portions_per_unit DECIMAL(6,2) NOT NULL DEFAULT 1,
        prices JSONB NOT NULL DEFAULT '{}'::jsonb,
        is_active BOOLEAN DEFAULT TRUE,
        sort_order INT DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS tuition_packages (
        id VARCHAR(64) PRIMARY KEY,
        name VARCHAR(120) NOT NULL,
        monthly_price BIGINT NOT NULL DEFAULT 0,
        default_duration_months DECIMAL(5,2) NOT NULL DEFAULT 1,
        default_splits JSONB DEFAULT '{}'::jsonb,
        bom_items JSONB DEFAULT '[]'::jsonb,
        is_active BOOLEAN DEFAULT TRUE,
        sort_order INT DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      ALTER TABLE tuition_packages ADD COLUMN IF NOT EXISTS bom_items JSONB DEFAULT '[]'::jsonb;

      CREATE TABLE IF NOT EXISTS tuition_contracts (
        id VARCHAR(64) PRIMARY KEY,
        student_code VARCHAR(40) NOT NULL,
        student_id VARCHAR(64),
        student_name VARCHAR(180) NOT NULL,
        phone VARCHAR(30) DEFAULT '',
        referrer_name VARCHAR(120) DEFAULT '',
        trainer_id VARCHAR(64),
        trainer_name VARCHAR(120) DEFAULT '',
        package_id VARCHAR(64),
        package_name VARCHAR(120) NOT NULL,
        start_date DATE NOT NULL,
        unit_price BIGINT NOT NULL DEFAULT 0,
        duration_months DECIMAL(5,2) NOT NULL DEFAULT 1,
        total_amount BIGINT NOT NULL DEFAULT 0,
        discount_percent DECIMAL(5,2) NOT NULL DEFAULT 0,
        discounted_price BIGINT NOT NULL DEFAULT 0,
        trainer_discount_tier INT NOT NULL DEFAULT 50,
        referrer_discount_tier INT NOT NULL DEFAULT 50,
        trainer_product_cost BIGINT NOT NULL DEFAULT 0,
        referrer_product_cost BIGINT NOT NULL DEFAULT 0,
        paid_amount BIGINT NOT NULL DEFAULT 0,
        allocations JSONB DEFAULT '{}'::jsonb,
        is_manual_allocation BOOLEAN DEFAULT FALSE,
        allocation_basis VARCHAR(20) DEFAULT 'margin',
        notes TEXT DEFAULT '',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      ALTER TABLE tuition_contracts ADD COLUMN IF NOT EXISTS discount_percent DECIMAL(5,2) NOT NULL DEFAULT 0;
      ALTER TABLE tuition_contracts ADD COLUMN IF NOT EXISTS discounted_price BIGINT NOT NULL DEFAULT 0;
      ALTER TABLE tuition_contracts ADD COLUMN IF NOT EXISTS trainer_discount_tier INT NOT NULL DEFAULT 50;
      ALTER TABLE tuition_contracts ADD COLUMN IF NOT EXISTS referrer_discount_tier INT NOT NULL DEFAULT 50;
      ALTER TABLE tuition_contracts ADD COLUMN IF NOT EXISTS trainer_product_cost BIGINT NOT NULL DEFAULT 0;
      ALTER TABLE tuition_contracts ADD COLUMN IF NOT EXISTS referrer_product_cost BIGINT NOT NULL DEFAULT 0;

      CREATE TABLE IF NOT EXISTS operating_costs (
        id VARCHAR(64) PRIMARY KEY,
        cost_date DATE NOT NULL,
        category VARCHAR(80) NOT NULL,
        title VARCHAR(200) NOT NULL,
        amount BIGINT NOT NULL DEFAULT 0,
        notes TEXT DEFAULT '',
        created_by VARCHAR(64),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    // Seed official Herbalife Vietnam Price List (Effective 08/08/2026, VAT included)
    const prodCountRes = await client.query('SELECT COUNT(*)::int AS cnt FROM herbalife_products');
    if ((prodCountRes.rows[0]?.cnt || 0) === 0) {
      const officialProducts = [
        {
          id: 'prod-f1',
          name: 'Hỗn Hợp Dinh Dưỡng Công Thức 1 (F1 - 550g)',
          unitLabel: 'hộp',
          portionUnitLabel: 'khẩu phần',
          portionsPerUnit: 22,
          prices: { '0': 1178280, '25': 922663, '35': 820418, '42': 748845, '50': 667048 },
          sortOrder: 1,
        },
        {
          id: 'prod-tea',
          name: 'Trà Thảo Mộc Cô Đặc (51g)',
          unitLabel: 'hũ',
          portionUnitLabel: 'hũ',
          portionsPerUnit: 1,
          prices: { '0': 860760, '25': 670178, '35': 593945, '42': 540582, '50': 479596 },
          sortOrder: 2,
        },
        {
          id: 'prod-rebuild',
          name: 'Herbalife 24 Rebuild Strength - Sô Cô La (1,010kg)',
          unitLabel: 'hũ',
          portionUnitLabel: 'hũ',
          portionsPerUnit: 1,
          prices: { '0': 2430000, '25': 1892402, '35': 1677363, '42': 1526835, '50': 1354804 },
          sortOrder: 3,
        },
        {
          id: 'prod-ppp',
          name: 'Bột Protein (240g)',
          unitLabel: 'hộp',
          portionUnitLabel: 'hộp',
          portionsPerUnit: 1,
          prices: { '0': 913680, '25': 711547, '35': 630694, '42': 574097, '50': 509414 },
          sortOrder: 4,
        },
        {
          id: 'prod-aloe',
          name: 'Lô Hội Thảo Mộc Cô Đặc (473ml)',
          unitLabel: 'chai',
          portionUnitLabel: 'chai',
          portionsPerUnit: 1,
          prices: { '0': 1156680, '25': 900813, '35': 798466, '42': 726823, '50': 644945 },
          sortOrder: 5,
        },
        {
          id: 'prod-fiber',
          name: 'Hỗn Hợp Chất Xơ Hoạt Hóa - Hương Táo (210g)',
          unitLabel: 'hộp',
          portionUnitLabel: 'hộp',
          portionsPerUnit: 1,
          prices: { '0': 1092960, '25': 851154, '35': 754432, '42': 686726, '50': 609348 },
          sortOrder: 6,
        },
      ];
      for (const p of officialProducts) {
        await client.query(
          `INSERT INTO herbalife_products (id, name, unit_label, portion_unit_label, portions_per_unit, prices, is_active, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6::jsonb, TRUE, $7)
           ON CONFLICT (id) DO NOTHING`,
          [
            p.id,
            p.name,
            p.unitLabel,
            p.portionUnitLabel,
            p.portionsPerUnit,
            JSON.stringify(p.prices),
            p.sortOrder,
          ]
        );
      }
    }

    // Seed default revenue entities only when catalog is empty
    const entityCountRes = await client.query('SELECT COUNT(*)::int AS cnt FROM revenue_entities');
    if ((entityCountRes.rows[0]?.cnt || 0) === 0) {
      const defaultEntities = [
        { id: 'ent-trung', name: 'HT-Trung', sortOrder: 1 },
        { id: 'ent-giac', name: 'HT-Giác', sortOrder: 2 },
        { id: 'ent-khac', name: 'HT-Khác', sortOrder: 3 },
      ];
      for (const ent of defaultEntities) {
        await client.query(
          `INSERT INTO revenue_entities (id, name, is_active, sort_order)
           VALUES ($1, $2, TRUE, $3)
           ON CONFLICT (id) DO NOTHING`,
          [ent.id, ent.name, ent.sortOrder]
        );
      }
    }

    const standardPackages = [
      {
        id: 'pkg-tap-luyen',
        name: 'Gói tập luyện',
        monthlyPrice: 300000,
        defaultDurationMonths: 1,
        defaultSplits: { trainer: 100, referrer: 0 },
        bomItems: [],
        sortOrder: 1,
      },
      {
        id: 'pkg-1tr5',
        name: 'Gói 1tr5',
        monthlyPrice: 1500000,
        defaultDurationMonths: 1,
        defaultSplits: { trainer: 50, referrer: 50 },
        bomItems: [{ productId: 'prod-f1', quantity: 30, buyerRole: 'trainer' }],
        sortOrder: 2,
      },
      {
        id: 'pkg-co-ban',
        name: 'Gói 2tr5 (Cơ bản)',
        monthlyPrice: 2500000,
        defaultDurationMonths: 1,
        defaultSplits: { trainer: 50, referrer: 50 },
        bomItems: [
          { productId: 'prod-f1', quantity: 30, buyerRole: 'trainer' },
          { productId: 'prod-tea', quantity: 1, buyerRole: 'trainer' },
        ],
        sortOrder: 3,
      },
      {
        id: 'pkg-nang-cao',
        name: 'Gói 3tr7 (Nâng cao)',
        monthlyPrice: 3700000,
        defaultDurationMonths: 1,
        defaultSplits: { trainer: 50, referrer: 50 },
        bomItems: [
          { productId: 'prod-f1', quantity: 30, buyerRole: 'trainer' },
          { productId: 'prod-tea', quantity: 1, buyerRole: 'trainer' },
          { productId: 'prod-f1', quantity: 30, buyerRole: 'referrer' },
        ],
        sortOrder: 4,
      },
      {
        id: 'pkg-toi-uu',
        name: 'Gói 5tr5 (Tối ưu)',
        monthlyPrice: 5500000,
        defaultDurationMonths: 1,
        defaultSplits: { trainer: 50, referrer: 50 },
        bomItems: [
          { productId: 'prod-f1', quantity: 30, buyerRole: 'trainer' },
          { productId: 'prod-tea', quantity: 1, buyerRole: 'trainer' },
          { productId: 'prod-f1', quantity: 30, buyerRole: 'referrer' },
          { productId: 'prod-rebuild', quantity: 1, buyerRole: 'referrer' },
        ],
        sortOrder: 5,
      },
    ];

    // Seed default tuition packages only when catalog is empty
    const pkgCountRes = await client.query('SELECT COUNT(*)::int AS cnt FROM tuition_packages');
    if ((pkgCountRes.rows[0]?.cnt || 0) === 0) {
      for (const pkg of standardPackages) {
        await client.query(
          `INSERT INTO tuition_packages (id, name, monthly_price, default_duration_months, default_splits, bom_items, is_active, sort_order)
           VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, TRUE, $7)
           ON CONFLICT (id) DO NOTHING`,
          [
            pkg.id,
            pkg.name,
            pkg.monthlyPrice,
            pkg.defaultDurationMonths,
            JSON.stringify(pkg.defaultSplits),
            JSON.stringify(pkg.bomItems),
            pkg.sortOrder,
          ]
        );
      }
    }

    // One-time idempotent migration to apply Herbalife BOMs, 2tr5 pricing, and 50/50 profit splits (>= 1tr5)
    const bomMigFlag = await client.query(
      `SELECT value FROM system_settings WHERE key = 'seed_herbalife_bom_v1'`
    );
    if (bomMigFlag.rows.length === 0) {
      for (const pkg of standardPackages) {
        const existsRes = await client.query('SELECT id FROM tuition_packages WHERE id = $1', [pkg.id]);
        if (existsRes.rows.length > 0) {
          await client.query(
            `UPDATE tuition_packages
             SET name = $1, monthly_price = $2, default_splits = $3::jsonb, bom_items = $4::jsonb, sort_order = $5
             WHERE id = $6`,
            [
              pkg.name,
              pkg.monthlyPrice,
              JSON.stringify(pkg.defaultSplits),
              JSON.stringify(pkg.bomItems),
              pkg.sortOrder,
              pkg.id,
            ]
          );
        } else {
          await client.query(
            `INSERT INTO tuition_packages (id, name, monthly_price, default_duration_months, default_splits, bom_items, is_active, sort_order)
             VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, TRUE, $7)
             ON CONFLICT (id) DO NOTHING`,
            [
              pkg.id,
              pkg.name,
              pkg.monthlyPrice,
              pkg.defaultDurationMonths,
              JSON.stringify(pkg.defaultSplits),
              JSON.stringify(pkg.bomItems),
              pkg.sortOrder,
            ]
          );
        }
      }
      await client.query(
        `INSERT INTO system_settings (key, value) VALUES ('seed_herbalife_bom_v1', 'done')
         ON CONFLICT (key) DO UPDATE SET value = 'done', updated_at = NOW()`
      );
    }

    dbInitialized = true;
    lastDbError = null;
    console.log(`✅ Connected to Aiven PostgreSQL database: ${dbInfo.databaseName} (${dbInfo.host})`);
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
  if (dbInitialized) return;
  if (!initPromise) {
    initPromise = initDatabase().finally(() => {
      initPromise = null;
    });
  }
  const ok = await initPromise;
  if (!ok) {
    throw new Error(formatDbErrorMessage(lastDbError));
  }
}

function handleDbRouteError(res: express.Response, err: unknown) {
  const msg = getErrMessage(err);
  const isConnErr =
    !dbInitialized ||
    /ECONNREFUSED|ETIMEDOUT|ENOTFOUND|timeout|terminated|Connection|SSL|connect/i.test(msg);
  if (isConnErr) {
    dbInitialized = false;
    if (!msg.startsWith(DB_CONNECTION_ERROR_MSG)) {
      lastDbError = msg;
    }
    return res.status(503).json({
      error: formatDbErrorMessage(msg),
      dbDisconnected: true,
    });
  }
  return res.status(500).json({ error: msg });
}

// Health Check API (Verifies live connection to Aiven PostgreSQL)
app.get('/api/health', async (req, res) => {
  const runtimeInfo = {
    backendRunning: true,
    runtime: isServerless ? 'vercel-serverless' : 'node-server',
    vercelEnv: process.env.VERCEL_ENV || null,
    envConfigured: Boolean(cleanConnectionString),
    envKey: resolvedDbConfig.sourceKey,
  };

  try {
    await ensureDbReady();
    await pool.query('SELECT 1');
    return res.json({
      status: 'ok',
      ...runtimeInfo,
      databaseConnected: true,
      dbType: 'PostgreSQL (Aiven Cloud)',
      databaseName: dbInfo.databaseName,
      host: dbInfo.host,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    dbInitialized = false;
    const errMsg = getErrMessage(err);
    if (!errMsg.startsWith(DB_CONNECTION_ERROR_MSG)) {
      lastDbError = errMsg;
    }
    return res.status(503).json({
      status: 'error',
      ...runtimeInfo,
      databaseConnected: false,
      dbType: 'PostgreSQL (Aiven Cloud - Disconnected)',
      databaseName: dbInfo.databaseName,
      host: dbInfo.host,
      error: formatDbErrorMessage(errMsg),
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
      'SELECT id, username, full_name, role, phone, student_id, trainer_id, avatar_url, discount_tier FROM users WHERE LOWER(username) = $1 AND password = $2',
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
          discountTier: Number.isFinite(Number(u.discount_tier)) ? Number(u.discount_tier) : 50,
        },
      });
    }

    return res.status(401).json({ error: 'Tên đăng nhập hoặc mật khẩu không chính xác!' });
  } catch (err: unknown) {
    return handleDbRouteError(res, err);
  }
});

// Row mappers shared between individual GET endpoints and /api/bootstrap
function mapUserRow(r: any) {
  return {
    id: r.id,
    username: r.username,
    password: r.password,
    fullName: r.full_name,
    role: r.role as 'admin' | 'trainer' | 'student',
    phone: r.phone || '',
    studentId: r.student_id || null,
    trainerId: r.trainer_id || null,
    discountTier: Number.isFinite(Number(r.discount_tier)) ? Number(r.discount_tier) : 50,
    createdAt: r.created_at ? new Date(r.created_at).toISOString().split('T')[0] : '',
  };
}

function mapStudentRow(r: any) {
  return {
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
  };
}

function mapMetricRow(r: any) {
  return {
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
  };
}

function mapAdviceRow(r: any) {
  return {
    id: r.id,
    studentId: r.student_id,
    metricRecordId: r.metric_record_id,
    date: r.date ? new Date(r.date).toISOString().split('T')[0] : '',
    status: r.status,
    aiDraftContent: r.ai_draft_content,
    trainerEditedContent: r.trainer_edited_content,
    trainerNote: r.trainer_note,
    approvedAt: r.approved_at,
  };
}

function mapMealRow(r: any) {
  return {
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
  };
}

function mapWorkoutRow(r: any) {
  return {
    id: r.id,
    studentId: r.student_id,
    date: r.date ? new Date(r.date).toISOString().split('T')[0] : '',
    planTitle: r.plan_title,
    durationMinutes: r.duration_minutes,
    exercises: r.exercises || [],
    trainerReaction: r.trainer_reaction,
    trainerComment: r.trainer_comment,
    loggedAt: r.logged_at,
  };
}

function mapPhotoRow(r: any) {
  return {
    id: r.id,
    studentId: r.student_id,
    date: r.date ? new Date(r.date).toISOString().split('T')[0] : '',
    imageUrl: r.image_url,
    photoType: r.photo_type,
    weight: parseFloat(r.weight),
    notes: r.notes || '',
  };
}

function mapNotificationRow(r: any) {
  return {
    id: r.id,
    useCaseId: r.use_case_id,
    studentId: r.student_id,
    title: r.title,
    message: r.message,
    priority: r.priority,
    createdAt: r.created_at,
    read: r.read,
  };
}

// Single-request bootstrap API: runs all core queries in parallel to avoid cold-start fan-out
app.get('/api/bootstrap', async (req, res) => {
  try {
    await ensureDbReady();
    const [
      usersRes,
      studentsRes,
      metricsRes,
      advicesRes,
      mealsRes,
      workoutsRes,
      photosRes,
      notificationsRes,
    ] = await Promise.all([
      pool.query(
        'SELECT id, username, password, full_name, role, phone, student_id, trainer_id, discount_tier, created_at FROM users ORDER BY created_at DESC'
      ),
      pool.query('SELECT * FROM students ORDER BY created_at DESC'),
      pool.query('SELECT * FROM health_metrics ORDER BY timestamp ASC'),
      pool.query('SELECT * FROM ai_advices ORDER BY date DESC'),
      pool.query('SELECT * FROM meal_logs ORDER BY date DESC, logged_at DESC'),
      pool.query('SELECT * FROM workout_logs ORDER BY date DESC'),
      pool.query('SELECT * FROM physique_photos ORDER BY date ASC'),
      pool.query('SELECT * FROM smart_notifications ORDER BY created_at DESC'),
    ]);

    return res.json({
      databaseConnected: true,
      databaseName: dbInfo.databaseName,
      host: dbInfo.host,
      users: usersRes.rows.map(mapUserRow),
      students: studentsRes.rows.map(mapStudentRow),
      metrics: metricsRes.rows.map(mapMetricRow),
      advices: advicesRes.rows.map(mapAdviceRow),
      meals: mealsRes.rows.map(mapMealRow),
      workouts: workoutsRes.rows.map(mapWorkoutRow),
      photos: photosRes.rows.map(mapPhotoRow),
      notifications: notificationsRes.rows.map(mapNotificationRow),
    });
  } catch (err: unknown) {
    return handleDbRouteError(res, err);
  }
});

// Users & Trainers Management API (Strictly Stored in PostgreSQL Database)
app.get('/api/users', async (req, res) => {
  try {
    await ensureDbReady();
    const result = await pool.query(
      'SELECT id, username, password, full_name, role, phone, student_id, trainer_id, discount_tier, created_at FROM users ORDER BY created_at DESC'
    );
    return res.json(result.rows.map(mapUserRow));
  } catch (err: unknown) {
    return handleDbRouteError(res, err);
  }
});

app.post('/api/users', async (req, res) => {
  try {
    await ensureDbReady();

    const { username, password, fullName, role, phone, studentId, trainerId, discountTier } = req.body;
    const cleanUsername = String(username || '').trim();
    const cleanPassword = String(password || '123').trim();
    const cleanName = String(fullName || '').trim();
    const validRole: 'admin' | 'trainer' | 'student' =
      role === 'admin' || role === 'trainer' || role === 'student' ? role : 'trainer';
    const rawTier = Number(discountTier);
    const validDiscountTier = [0, 25, 35, 42, 50].includes(rawTier) ? rawTier : 50;

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
      discountTier: validDiscountTier,
      avatarUrl: '',
      createdAt: new Date().toISOString().split('T')[0],
    };

    await pool.query(
      `INSERT INTO users (id, username, password, full_name, role, phone, student_id, trainer_id, discount_tier, avatar_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        newUser.id,
        newUser.username,
        newUser.password,
        newUser.fullName,
        newUser.role,
        newUser.phone,
        newUser.studentId,
        newUser.trainerId,
        newUser.discountTier,
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
    const { username, password, fullName, role, phone, trainerId, discountTier } = req.body;

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

    const parsedTier = Number(discountTier);
    const nextDiscountTier =
      discountTier !== undefined && [0, 25, 35, 42, 50].includes(parsedTier)
        ? parsedTier
        : Number.isFinite(Number(existing.discount_tier))
        ? Number(existing.discount_tier)
        : 50;

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
      discountTier: nextDiscountTier,
      createdAt: existing.created_at
        ? new Date(existing.created_at).toISOString().split('T')[0]
        : '',
    };

    await pool.query(
      `UPDATE users SET username = $1, password = $2, full_name = $3, role = $4, phone = $5, trainer_id = $6, discount_tier = $7 WHERE id = $8`,
      [
        updatedUser.username,
        updatedUser.password,
        updatedUser.fullName,
        updatedUser.role,
        updatedUser.phone || '',
        updatedUser.trainerId || null,
        updatedUser.discountTier,
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
    return res.json(result.rows.map(mapStudentRow));
  } catch (err: unknown) {
    return handleDbRouteError(res, err);
  }
});

app.post('/api/students', async (req, res) => {
  try {
    await ensureDbReady();

    const s = req.body;
    const studentId = s.id || `student-${Date.now()}`;
    const shouldCreateAccount = s.createAccount !== false;
    const initialUsername = String(s.initialUsername || s.phone || studentId).trim();
    const initialPassword = String(s.initialPassword || '123').trim();
    const ageNum = Number(s.age) || 25;
    const safeDob =
      s.dateOfBirth && String(s.dateOfBirth).trim()
        ? s.dateOfBirth
        : `${new Date().getFullYear() - ageNum}-01-01`;
    const safeGoal =
      s.healthGoal && String(s.healthGoal).trim()
        ? s.healthGoal.trim()
        : shouldCreateAccount
        ? 'Cân đối vóc dáng & Cải thiện sức khỏe'
        : 'Tập luyện nâng cao sức khỏe';

    // Check if username already exists for another user in PostgreSQL (only when creating account)
    if (shouldCreateAccount) {
      const dupUser = await pool.query(
        'SELECT id, student_id FROM users WHERE LOWER(username) = LOWER($1)',
        [initialUsername]
      );
      if (dupUser.rows.length > 0 && dupUser.rows[0].student_id !== studentId) {
        return res.status(400).json({
          error: `Tên đăng nhập "${initialUsername}" đã tồn tại trong Database! Vui lòng chọn tên đăng nhập khác.`,
        });
      }
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
      age: ageNum,
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

      if (shouldCreateAccount) {
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
      }

      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }

    return res.status(201).json(
      shouldCreateAccount
        ? { ...newStudentRecord, initialUsername, initialPassword }
        : newStudentRecord
    );
  } catch (err: unknown) {
    return handleDbRouteError(res, err);
  }
});

app.put('/api/students/:id', async (req, res) => {
  try {
    await ensureDbReady();

    const { id } = req.params;
    const s = req.body;
    const shouldCreateAccount = s.createAccount === true;
    const initialUsername = String(s.initialUsername || s.phone || id).trim();
    const initialPassword = String(s.initialPassword || '123').trim();

    let resolvedTrainerName = s.trainerName !== undefined ? String(s.trainerName) : '';
    if (s.trainerId && !resolvedTrainerName) {
      const trRes = await pool.query('SELECT full_name FROM users WHERE id = $1', [s.trainerId]);
      if (trRes.rows.length > 0) {
        resolvedTrainerName = trRes.rows[0].full_name;
      }
    }

    if (shouldCreateAccount) {
      const existingAcc = await pool.query('SELECT id FROM users WHERE student_id = $1', [id]);
      if (existingAcc.rows.length === 0) {
        const dupUser = await pool.query(
          'SELECT id, student_id FROM users WHERE LOWER(username) = LOWER($1)',
          [initialUsername]
        );
        if (dupUser.rows.length > 0 && dupUser.rows[0].student_id !== id) {
          return res.status(400).json({
            error: `Tên đăng nhập "${initialUsername}" đã tồn tại trong Database! Vui lòng chọn tên đăng nhập khác.`,
          });
        }
      }
    }

    const ageNum = Number(s.age) || 25;
    const safeDob =
      s.dateOfBirth && String(s.dateOfBirth).trim()
        ? s.dateOfBirth
        : `${new Date().getFullYear() - ageNum}-01-01`;

    const { createAccount: _ca, initialUsername: _iu, initialPassword: _ip, ...cleanBody } = s;
    const updatedStudent = {
      ...cleanBody,
      id,
      dateOfBirth: safeDob,
      trainerId: s.trainerId || '',
      trainerName: resolvedTrainerName,
      targetMetrics: compactJson(s.targetMetrics),
    };

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const result = await client.query(
        `UPDATE students SET
          full_name = $1, gender = $2, age = $3, height = $4, phone = $5,
          address = $6, date_of_birth = $7, health_goal = $8, target_metrics = $9, avatar_url = $10,
          trainer_id = $11, trainer_name = $12
         WHERE id = $13
         RETURNING id`,
        [
          s.fullName,
          s.gender,
          ageNum,
          s.height,
          s.phone,
          s.address || '',
          safeDob,
          s.healthGoal,
          JSON.stringify(compactJson(s.targetMetrics)),
          s.avatarUrl || '',
          s.trainerId || null,
          resolvedTrainerName || null,
          id,
        ]
      );

      if (result.rowCount === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Không tìm thấy hồ sơ học viên trong Database!' });
      }

      const existingAcc = await client.query('SELECT id FROM users WHERE student_id = $1', [id]);
      if (existingAcc.rows.length > 0) {
        await client.query(
          `UPDATE users SET full_name = $1, phone = $2, trainer_id = $3 WHERE student_id = $4`,
          [s.fullName, s.phone || '', s.trainerId || null, id]
        );
      } else if (shouldCreateAccount) {
        await client.query(
          `INSERT INTO users (id, username, password, full_name, role, phone, student_id, trainer_id, avatar_url)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            `user-${id}`,
            initialUsername,
            initialPassword,
            s.fullName,
            'student',
            s.phone || '',
            id,
            s.trainerId || null,
            s.avatarUrl || '',
          ]
        );
      }

      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }

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
    return res.json(result.rows.map(mapMetricRow));
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
    return res.json(result.rows.map(mapAdviceRow));
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
    return res.json(result.rows.map(mapMealRow));
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
    return res.json(result.rows.map(mapWorkoutRow));
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
    return res.json(result.rows.map(mapPhotoRow));
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
    return res.json(result.rows.map(mapNotificationRow));
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

// =========================================================================
// TUITION, DEBT, REVENUE ALLOCATION & OPERATING COSTS API (PostgreSQL + RBAC)
// =========================================================================

interface TuitionActor {
  id: string;
  username: string;
  fullName: string;
  role: 'admin' | 'trainer' | 'student';
}

async function resolveTuitionActor(req: express.Request): Promise<TuitionActor | null> {
  const rawUsername = req.headers['x-auth-username'];
  const username = Array.isArray(rawUsername) ? rawUsername[0] : rawUsername;
  if (!username || !String(username).trim()) return null;

  const res = await pool.query(
    'SELECT id, username, full_name, role FROM users WHERE LOWER(username) = $1 LIMIT 1',
    [String(username).trim().toLowerCase()]
  );
  if (res.rows.length === 0) return null;
  const u = res.rows[0];
  return {
    id: u.id,
    username: u.username,
    fullName: u.full_name,
    role: u.role as 'admin' | 'trainer' | 'student',
  };
}

function mapRevenueEntityRow(r: any) {
  return {
    id: r.id,
    name: r.name,
    isActive: r.is_active !== false,
    sortOrder: Number(r.sort_order) || 0,
    createdAt: r.created_at ? new Date(r.created_at).toISOString().split('T')[0] : '',
  };
}

function mapHerbalifeProductRow(r: any) {
  return {
    id: r.id,
    name: r.name,
    unitLabel: r.unit_label || 'hộp',
    portionUnitLabel: r.portion_unit_label || r.unit_label || 'hộp',
    portionsPerUnit: Number(r.portions_per_unit) || 1,
    prices: r.prices && typeof r.prices === 'object' ? r.prices : {},
    isActive: r.is_active !== false,
    sortOrder: Number(r.sort_order) || 0,
    createdAt: r.created_at ? new Date(r.created_at).toISOString().split('T')[0] : '',
  };
}

function sanitizeBomItems(raw: unknown): Array<{ productId: string; quantity: number; buyerRole: 'trainer' | 'referrer' }> {
  if (!Array.isArray(raw)) return [];
  const out: Array<{ productId: string; quantity: number; buyerRole: 'trainer' | 'referrer' }> = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    const productId = String(obj.productId || '').trim();
    const quantity = Math.round(Math.max(0, Number(obj.quantity) || 0) * 100) / 100;
    const buyerRole = obj.buyerRole === 'referrer' ? 'referrer' : 'trainer';
    if (productId && quantity > 0) {
      out.push({ productId, quantity, buyerRole });
    }
  }
  return out;
}

function mapTuitionPackageRow(r: any) {
  return {
    id: r.id,
    name: r.name,
    monthlyPrice: Number(r.monthly_price) || 0,
    defaultDurationMonths: Number(r.default_duration_months) || 1,
    defaultSplits: r.default_splits && typeof r.default_splits === 'object' ? r.default_splits : {},
    bomItems: Array.isArray(r.bom_items) ? r.bom_items : [],
    isActive: r.is_active !== false,
    sortOrder: Number(r.sort_order) || 0,
    createdAt: r.created_at ? new Date(r.created_at).toISOString().split('T')[0] : '',
  };
}

function mapTuitionContractRow(r: any) {
  const trainerProductCost = Math.max(0, Number(r.trainer_product_cost) || 0);
  const referrerProductCost = Math.max(0, Number(r.referrer_product_cost) || 0);
  const legacyDiscPrice =
    r.discounted_price !== undefined && r.discounted_price !== null
      ? Math.max(0, Number(r.discounted_price) || 0)
      : 0;
  const totalProductCost =
    trainerProductCost + referrerProductCost > 0
      ? trainerProductCost + referrerProductCost
      : legacyDiscPrice;

  return {
    id: r.id,
    studentCode: r.student_code,
    studentId: r.student_id || null,
    studentName: r.student_name,
    phone: r.phone || '',
    referrerName: r.referrer_name || '',
    trainerId: r.trainer_id || null,
    trainerName: r.trainer_name || '',
    packageId: r.package_id || null,
    packageName: r.package_name,
    startDate: r.start_date ? new Date(r.start_date).toISOString().split('T')[0] : '',
    unitPrice: Number(r.unit_price) || 0,
    durationMonths: Number(r.duration_months) || 1,
    totalAmount: Number(r.total_amount) || 0,
    discountPercent: Number(r.discount_percent) || 0,
    discountedPrice: totalProductCost,
    trainerDiscountTier: Number.isFinite(Number(r.trainer_discount_tier))
      ? Number(r.trainer_discount_tier)
      : Number(r.discount_percent) || 50,
    referrerDiscountTier: Number.isFinite(Number(r.referrer_discount_tier))
      ? Number(r.referrer_discount_tier)
      : 50,
    trainerProductCost,
    referrerProductCost,
    paidAmount: Number(r.paid_amount) || 0,
    allocations: r.allocations && typeof r.allocations === 'object' ? r.allocations : { trainer: 0, referrer: 0 },
    isManualAllocation: Boolean(r.is_manual_allocation),
    allocationBasis:
      r.allocation_basis === 'paid'
        ? 'paid'
        : r.allocation_basis === 'total'
        ? 'total'
        : 'margin',
    notes: r.notes || '',
    createdAt: r.created_at ? new Date(r.created_at).toISOString().split('T')[0] : '',
    updatedAt: r.updated_at ? new Date(r.updated_at).toISOString().split('T')[0] : '',
  };
}

function mapOperatingCostRow(r: any) {
  return {
    id: r.id,
    costDate: r.cost_date ? new Date(r.cost_date).toISOString().split('T')[0] : '',
    category: r.category,
    title: r.title,
    amount: Number(r.amount) || 0,
    notes: r.notes || '',
    createdBy: r.created_by || '',
    createdAt: r.created_at ? new Date(r.created_at).toISOString().split('T')[0] : '',
  };
}

function sanitizeNumericRecord(obj: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!obj || typeof obj !== 'object') return out;
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const n = Number(v);
    if (k && Number.isFinite(n)) {
      out[k] = Math.round(n * 100) / 100;
    }
  }
  return out;
}

function normalizeServerDiscountTier(raw: unknown, fallback = 50): number {
  const n = Number(raw);
  if (n === 37) return 35;
  return [0, 25, 35, 42, 50].includes(n) ? n : fallback;
}

// Bootstrap all tuition data scoped by authenticated role (Admin vs Trainer)
app.get('/api/tuition/bootstrap', async (req, res) => {
  try {
    await ensureDbReady();
    const actor = await resolveTuitionActor(req);
    if (!actor) {
      return res.status(401).json({ error: 'Vui lòng đăng nhập để truy cập dữ liệu học phí.' });
    }
    if (actor.role !== 'admin' && actor.role !== 'trainer') {
      return res.status(403).json({ error: 'Tài khoản không có quyền truy cập phân hệ học phí.' });
    }

    const [entitiesRes, productsRes, packagesRes] = await Promise.all([
      pool.query('SELECT * FROM revenue_entities ORDER BY sort_order ASC, created_at ASC'),
      pool.query('SELECT * FROM herbalife_products ORDER BY sort_order ASC, created_at ASC'),
      pool.query('SELECT * FROM tuition_packages ORDER BY sort_order ASC, created_at ASC'),
    ]);

    let contractsRes;
    if (actor.role === 'admin') {
      contractsRes = await pool.query(
        'SELECT * FROM tuition_contracts ORDER BY start_date DESC, created_at DESC'
      );
    } else {
      contractsRes = await pool.query(
        `SELECT tc.*
         FROM tuition_contracts tc
         LEFT JOIN students s ON s.id = tc.student_id
         WHERE tc.trainer_id = $1
            OR s.trainer_id = $1
            OR LOWER(TRIM(COALESCE(tc.trainer_name, ''))) = LOWER(TRIM($2))
         ORDER BY tc.start_date DESC, tc.created_at DESC`,
        [actor.id, actor.fullName]
      );
    }

    let operatingCosts: ReturnType<typeof mapOperatingCostRow>[] = [];
    if (actor.role === 'admin') {
      const costsRes = await pool.query(
        'SELECT * FROM operating_costs ORDER BY cost_date DESC, created_at DESC'
      );
      operatingCosts = costsRes.rows.map(mapOperatingCostRow);
    }

    return res.json({
      entities: entitiesRes.rows.map(mapRevenueEntityRow),
      products: productsRes.rows.map(mapHerbalifeProductRow),
      packages: packagesRes.rows.map(mapTuitionPackageRow),
      contracts: contractsRes.rows.map(mapTuitionContractRow),
      operatingCosts,
    });
  } catch (err: unknown) {
    return handleDbRouteError(res, err);
  }
});

// Create Tuition Contract (Admin or Trainer for their own students)
app.post('/api/tuition/contracts', async (req, res) => {
  try {
    await ensureDbReady();
    const actor = await resolveTuitionActor(req);
    if (!actor || (actor.role !== 'admin' && actor.role !== 'trainer')) {
      return res.status(403).json({ error: 'Bạn không có quyền thêm hợp đồng học phí.' });
    }

    const body = req.body || {};
    const studentName = String(body.studentName || '').trim();
    const packageName = String(body.packageName || '').trim();
    const startDate = String(body.startDate || new Date().toISOString().split('T')[0]).trim();
    const studentCode = String(body.studentCode || '').trim() || `HV-${Date.now().toString().slice(-4)}`;

    if (!studentName || !packageName) {
      return res.status(400).json({ error: 'Vui lòng nhập đầy đủ Tên học viên và Gói tập.' });
    }

    let studentId: string | null = body.studentId ? String(body.studentId).trim() : null;
    let trainerId: string | null = body.trainerId ? String(body.trainerId).trim() : null;
    let trainerName = String(body.trainerName || '').trim();

    if (actor.role === 'trainer') {
      if (studentId) {
        const stuRes = await pool.query('SELECT trainer_id FROM students WHERE id = $1', [studentId]);
        if (stuRes.rows.length > 0 && stuRes.rows[0].trainer_id && stuRes.rows[0].trainer_id !== actor.id) {
          return res
            .status(403)
            .json({ error: 'Bạn chỉ được tạo hợp đồng cho học viên thuộc quyền phụ trách của mình.' });
        }
      }
      trainerId = actor.id;
      trainerName = actor.fullName;
    } else if (trainerId && !trainerName) {
      const trRes = await pool.query('SELECT full_name FROM users WHERE id = $1', [trainerId]);
      if (trRes.rows.length > 0) trainerName = trRes.rows[0].full_name;
    }

    const unitPrice = Math.max(0, Math.round(Number(body.unitPrice) || 0));
    const durationMonths = Math.max(0.5, Number(body.durationMonths) || 1);
    const totalAmount = Math.max(0, Math.round(unitPrice * durationMonths));
    const trainerDiscountTier = normalizeServerDiscountTier(
      body.trainerDiscountTier ?? body.discountPercent,
      50
    );
    const referrerDiscountTier = normalizeServerDiscountTier(body.referrerDiscountTier, 50);
    const trainerProductCost = Math.max(0, Math.round(Number(body.trainerProductCost) || 0));
    const referrerProductCost = Math.max(0, Math.round(Number(body.referrerProductCost) || 0));
    const totalProductCost =
      trainerProductCost + referrerProductCost > 0
        ? trainerProductCost + referrerProductCost
        : Math.max(0, Math.round(Number(body.discountedPrice) || 0));
    const paidAmount = Math.max(0, Math.round(Number(body.paidAmount) || 0));
    const allocations = sanitizeNumericRecord(body.allocations);
    const isManualAllocation = Boolean(body.isManualAllocation);
    const allocationBasis =
      body.allocationBasis === 'paid'
        ? 'paid'
        : body.allocationBasis === 'total'
        ? 'total'
        : 'margin';
    const id = body.id ? String(body.id).trim() : `tc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    const insertRes = await pool.query(
      `INSERT INTO tuition_contracts (
        id, student_code, student_id, student_name, phone, referrer_name,
        trainer_id, trainer_name, package_id, package_name, start_date,
        unit_price, duration_months, total_amount, discount_percent, discounted_price,
        trainer_discount_tier, referrer_discount_tier, trainer_product_cost, referrer_product_cost,
        paid_amount, allocations, is_manual_allocation, allocation_basis, notes
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10, $11,
        $12, $13, $14, $15, $16,
        $17, $18, $19, $20,
        $21, $22::jsonb, $23, $24, $25
      ) RETURNING *`,
      [
        id,
        studentCode,
        studentId,
        studentName,
        String(body.phone || '').trim(),
        String(body.referrerName || '').trim(),
        trainerId,
        trainerName,
        body.packageId ? String(body.packageId).trim() : null,
        packageName,
        startDate,
        unitPrice,
        durationMonths,
        totalAmount,
        trainerDiscountTier,
        totalProductCost,
        trainerDiscountTier,
        referrerDiscountTier,
        trainerProductCost,
        referrerProductCost,
        paidAmount,
        JSON.stringify(allocations),
        isManualAllocation,
        allocationBasis,
        String(body.notes || '').trim(),
      ]
    );

    return res.status(201).json(mapTuitionContractRow(insertRes.rows[0]));
  } catch (err: unknown) {
    return handleDbRouteError(res, err);
  }
});

// Update Tuition Contract
app.put('/api/tuition/contracts/:id', async (req, res) => {
  try {
    await ensureDbReady();
    const actor = await resolveTuitionActor(req);
    if (!actor || (actor.role !== 'admin' && actor.role !== 'trainer')) {
      return res.status(403).json({ error: 'Bạn không có quyền chỉnh sửa hợp đồng học phí.' });
    }

    const { id } = req.params;
    const existingRes = await pool.query('SELECT * FROM tuition_contracts WHERE id = $1', [id]);
    if (existingRes.rows.length === 0) {
      return res.status(404).json({ error: 'Không tìm thấy hợp đồng học phí.' });
    }
    const existing = existingRes.rows[0];

    if (actor.role === 'trainer') {
      const ownsDirectly =
        existing.trainer_id === actor.id ||
        String(existing.trainer_name || '').trim().toLowerCase() === actor.fullName.trim().toLowerCase();
      let ownsStudent = false;
      if (!ownsDirectly && existing.student_id) {
        const sRes = await pool.query('SELECT trainer_id FROM students WHERE id = $1', [existing.student_id]);
        ownsStudent = sRes.rows[0]?.trainer_id === actor.id;
      }
      if (!ownsDirectly && !ownsStudent) {
        return res.status(403).json({ error: 'Bạn không có quyền sửa hợp đồng của HLV khác.' });
      }
    }

    const body = req.body || {};
    const studentName = String(body.studentName || existing.student_name).trim();
    const packageName = String(body.packageName || existing.package_name).trim();
    const studentCode = String(body.studentCode || existing.student_code).trim();
    const startDate = String(
      body.startDate || (existing.start_date ? new Date(existing.start_date).toISOString().split('T')[0] : '')
    ).trim();

    let trainerId: string | null =
      actor.role === 'trainer'
        ? actor.id
        : body.trainerId !== undefined
        ? body.trainerId || null
        : existing.trainer_id;
    let trainerName =
      actor.role === 'trainer'
        ? actor.fullName
        : body.trainerName !== undefined
        ? String(body.trainerName || '').trim()
        : existing.trainer_name;

    if (actor.role === 'admin' && trainerId && !trainerName) {
      const trRes = await pool.query('SELECT full_name FROM users WHERE id = $1', [trainerId]);
      if (trRes.rows.length > 0) trainerName = trRes.rows[0].full_name;
    }

    const unitPrice = Math.max(0, Math.round(Number(body.unitPrice ?? existing.unit_price) || 0));
    const durationMonths = Math.max(0.5, Number(body.durationMonths ?? existing.duration_months) || 1);
    const totalAmount = Math.max(0, Math.round(unitPrice * durationMonths));
    const trainerDiscountTier = normalizeServerDiscountTier(
      body.trainerDiscountTier ?? body.discountPercent ?? existing.trainer_discount_tier,
      50
    );
    const referrerDiscountTier = normalizeServerDiscountTier(
      body.referrerDiscountTier ?? existing.referrer_discount_tier,
      50
    );
    const trainerProductCost = Math.max(
      0,
      Math.round(Number(body.trainerProductCost ?? existing.trainer_product_cost) || 0)
    );
    const referrerProductCost = Math.max(
      0,
      Math.round(Number(body.referrerProductCost ?? existing.referrer_product_cost) || 0)
    );
    const totalProductCost =
      trainerProductCost + referrerProductCost > 0
        ? trainerProductCost + referrerProductCost
        : Math.max(0, Math.round(Number(body.discountedPrice ?? existing.discounted_price) || 0));
    const paidAmount = Math.max(0, Math.round(Number(body.paidAmount ?? existing.paid_amount) || 0));
    const allocations =
      body.allocations !== undefined ? sanitizeNumericRecord(body.allocations) : existing.allocations || {};
    const isManualAllocation =
      body.isManualAllocation !== undefined
        ? Boolean(body.isManualAllocation)
        : Boolean(existing.is_manual_allocation);
    const allocationBasis =
      body.allocationBasis !== undefined
        ? body.allocationBasis === 'paid'
          ? 'paid'
          : body.allocationBasis === 'total'
          ? 'total'
          : 'margin'
        : existing.allocation_basis || 'margin';

    const updateRes = await pool.query(
      `UPDATE tuition_contracts
       SET student_code = $1,
           student_id = $2,
           student_name = $3,
           phone = $4,
           referrer_name = $5,
           trainer_id = $6,
           trainer_name = $7,
           package_id = $8,
           package_name = $9,
           start_date = $10,
           unit_price = $11,
           duration_months = $12,
           total_amount = $13,
           discount_percent = $14,
           discounted_price = $15,
           trainer_discount_tier = $16,
           referrer_discount_tier = $17,
           trainer_product_cost = $18,
           referrer_product_cost = $19,
           paid_amount = $20,
           allocations = $21::jsonb,
           is_manual_allocation = $22,
           allocation_basis = $23,
           notes = $24,
           updated_at = NOW()
       WHERE id = $25
       RETURNING *`,
      [
        studentCode,
        body.studentId !== undefined ? body.studentId || null : existing.student_id,
        studentName,
        String(body.phone ?? existing.phone ?? '').trim(),
        String(body.referrerName ?? existing.referrer_name ?? '').trim(),
        trainerId,
        trainerName,
        body.packageId !== undefined ? body.packageId || null : existing.package_id,
        packageName,
        startDate,
        unitPrice,
        durationMonths,
        totalAmount,
        trainerDiscountTier,
        totalProductCost,
        trainerDiscountTier,
        referrerDiscountTier,
        trainerProductCost,
        referrerProductCost,
        paidAmount,
        JSON.stringify(allocations),
        isManualAllocation,
        allocationBasis,
        String(body.notes ?? existing.notes ?? '').trim(),
        id,
      ]
    );

    return res.json(mapTuitionContractRow(updateRes.rows[0]));
  } catch (err: unknown) {
    return handleDbRouteError(res, err);
  }
});

// Record quick installment payment on a contract
app.post('/api/tuition/contracts/:id/payment', async (req, res) => {
  try {
    await ensureDbReady();
    const actor = await resolveTuitionActor(req);
    if (!actor || (actor.role !== 'admin' && actor.role !== 'trainer')) {
      return res.status(403).json({ error: 'Bạn không có quyền ghi nhận thanh toán.' });
    }

    const { id } = req.params;
    const existingRes = await pool.query('SELECT * FROM tuition_contracts WHERE id = $1', [id]);
    if (existingRes.rows.length === 0) {
      return res.status(404).json({ error: 'Không tìm thấy hợp đồng học phí.' });
    }
    const existing = existingRes.rows[0];

    if (actor.role === 'trainer') {
      const ownsDirectly =
        existing.trainer_id === actor.id ||
        String(existing.trainer_name || '').trim().toLowerCase() === actor.fullName.trim().toLowerCase();
      let ownsStudent = false;
      if (!ownsDirectly && existing.student_id) {
        const sRes = await pool.query('SELECT trainer_id FROM students WHERE id = $1', [existing.student_id]);
        ownsStudent = sRes.rows[0]?.trainer_id === actor.id;
      }
      if (!ownsDirectly && !ownsStudent) {
        return res.status(403).json({ error: 'Bạn không có quyền cập nhật thanh toán cho học viên của HLV khác.' });
      }
    }

    const addAmount = Math.max(0, Math.round(Number(req.body?.amount) || 0));
    if (addAmount <= 0) {
      return res.status(400).json({ error: 'Số tiền thanh toán thêm phải lớn hơn 0.' });
    }

    const newPaidAmount = Math.round(Number(existing.paid_amount) || 0) + addAmount;
    const extraNote = String(req.body?.note || '').trim();
    const dateStamp = new Date().toISOString().split('T')[0];
    const combinedNotes = extraNote
      ? [existing.notes, `[${dateStamp} +${addAmount.toLocaleString('vi-VN')}đ: ${extraNote}]`]
          .filter(Boolean)
          .join(' ')
      : existing.notes || '';

    const updateRes = await pool.query(
      `UPDATE tuition_contracts
       SET paid_amount = $1, notes = $2, updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [newPaidAmount, combinedNotes, id]
    );

    return res.json(mapTuitionContractRow(updateRes.rows[0]));
  } catch (err: unknown) {
    return handleDbRouteError(res, err);
  }
});

// Delete Tuition Contract
app.delete('/api/tuition/contracts/:id', async (req, res) => {
  try {
    await ensureDbReady();
    const actor = await resolveTuitionActor(req);
    if (!actor || (actor.role !== 'admin' && actor.role !== 'trainer')) {
      return res.status(403).json({ error: 'Bạn không có quyền xóa hợp đồng học phí.' });
    }

    const { id } = req.params;
    const existingRes = await pool.query('SELECT * FROM tuition_contracts WHERE id = $1', [id]);
    if (existingRes.rows.length === 0) {
      return res.status(404).json({ error: 'Không tìm thấy hợp đồng học phí.' });
    }
    const existing = existingRes.rows[0];

    if (actor.role === 'trainer') {
      const ownsDirectly =
        existing.trainer_id === actor.id ||
        String(existing.trainer_name || '').trim().toLowerCase() === actor.fullName.trim().toLowerCase();
      if (!ownsDirectly) {
        return res.status(403).json({ error: 'Bạn chỉ được xóa hợp đồng thuộc quyền phụ trách của mình.' });
      }
    }

    await pool.query('DELETE FROM tuition_contracts WHERE id = $1', [id]);
    return res.json({ success: true, id });
  } catch (err: unknown) {
    return handleDbRouteError(res, err);
  }
});

// Admin-only: Herbalife Products Price Catalog CRUD
app.post('/api/tuition/products', async (req, res) => {
  try {
    await ensureDbReady();
    const actor = await resolveTuitionActor(req);
    if (!actor || actor.role !== 'admin') {
      return res.status(403).json({ error: 'Chỉ Admin mới có quyền quản lý bảng giá sản phẩm.' });
    }

    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Vui lòng nhập tên sản phẩm.' });

    const unitLabel = String(req.body?.unitLabel || 'hộp').trim() || 'hộp';
    const portionUnitLabel = String(req.body?.portionUnitLabel || unitLabel).trim() || unitLabel;
    const portionsPerUnit = Math.max(0.1, Number(req.body?.portionsPerUnit) || 1);
    const prices = sanitizeNumericRecord(req.body?.prices);
    const orderRes = await pool.query('SELECT COALESCE(MAX(sort_order), 0)::int AS max_order FROM herbalife_products');
    const sortOrder = (orderRes.rows[0]?.max_order || 0) + 1;
    const id = `prod-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;

    const insertRes = await pool.query(
      `INSERT INTO herbalife_products (id, name, unit_label, portion_unit_label, portions_per_unit, prices, is_active, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, TRUE, $7)
       RETURNING *`,
      [id, name, unitLabel, portionUnitLabel, portionsPerUnit, JSON.stringify(prices), sortOrder]
    );
    return res.status(201).json(mapHerbalifeProductRow(insertRes.rows[0]));
  } catch (err: unknown) {
    return handleDbRouteError(res, err);
  }
});

app.put('/api/tuition/products/:id', async (req, res) => {
  try {
    await ensureDbReady();
    const actor = await resolveTuitionActor(req);
    if (!actor || actor.role !== 'admin') {
      return res.status(403).json({ error: 'Chỉ Admin mới có quyền cập nhật bảng giá sản phẩm.' });
    }

    const { id } = req.params;
    const existingRes = await pool.query('SELECT * FROM herbalife_products WHERE id = $1', [id]);
    if (existingRes.rows.length === 0) {
      return res.status(404).json({ error: 'Không tìm thấy sản phẩm.' });
    }
    const existing = existingRes.rows[0];

    const name = String(req.body?.name ?? existing.name).trim();
    const unitLabel = String(req.body?.unitLabel ?? existing.unit_label ?? 'hộp').trim();
    const portionUnitLabel = String(req.body?.portionUnitLabel ?? existing.portion_unit_label ?? unitLabel).trim();
    const portionsPerUnit = Math.max(0.1, Number(req.body?.portionsPerUnit ?? existing.portions_per_unit) || 1);
    const prices =
      req.body?.prices !== undefined
        ? sanitizeNumericRecord(req.body.prices)
        : existing.prices || {};
    const isActive = req.body?.isActive !== undefined ? Boolean(req.body.isActive) : existing.is_active;

    const updateRes = await pool.query(
      `UPDATE herbalife_products
       SET name = $1, unit_label = $2, portion_unit_label = $3, portions_per_unit = $4, prices = $5::jsonb, is_active = $6
       WHERE id = $7
       RETURNING *`,
      [name, unitLabel, portionUnitLabel, portionsPerUnit, JSON.stringify(prices), isActive, id]
    );
    return res.json(mapHerbalifeProductRow(updateRes.rows[0]));
  } catch (err: unknown) {
    return handleDbRouteError(res, err);
  }
});

app.delete('/api/tuition/products/:id', async (req, res) => {
  try {
    await ensureDbReady();
    const actor = await resolveTuitionActor(req);
    if (!actor || actor.role !== 'admin') {
      return res.status(403).json({ error: 'Chỉ Admin mới có quyền xóa sản phẩm.' });
    }

    const { id } = req.params;
    await pool.query('DELETE FROM herbalife_products WHERE id = $1', [id]);
    return res.json({ success: true, id });
  } catch (err: unknown) {
    return handleDbRouteError(res, err);
  }
});

// Read-only catalog of Tuition Packages & Herbalife Products (for Student registration & Tuition forms)
app.get('/api/tuition/packages', async (req, res) => {
  try {
    await ensureDbReady();
    const [packagesRes, productsRes] = await Promise.all([
      pool.query('SELECT * FROM tuition_packages ORDER BY sort_order ASC, created_at ASC'),
      pool.query('SELECT * FROM herbalife_products ORDER BY sort_order ASC, created_at ASC'),
    ]);
    return res.json({
      packages: packagesRes.rows.map(mapTuitionPackageRow),
      products: productsRes.rows.map(mapHerbalifeProductRow),
    });
  } catch (err: unknown) {
    return handleDbRouteError(res, err);
  }
});

// Admin-only: Tuition Packages CRUD
app.post('/api/tuition/packages', async (req, res) => {
  try {
    await ensureDbReady();
    const actor = await resolveTuitionActor(req);
    if (!actor || actor.role !== 'admin') {
      return res.status(403).json({ error: 'Chỉ Admin mới có quyền cấu hình gói tập.' });
    }

    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Vui lòng nhập tên gói tập.' });

    const monthlyPrice = Math.max(0, Math.round(Number(req.body?.monthlyPrice) || 0));
    const defaultDurationMonths = Math.max(0.5, Number(req.body?.defaultDurationMonths) || 1);
    const defaultSplits = sanitizeNumericRecord(req.body?.defaultSplits);
    const bomItems = sanitizeBomItems(req.body?.bomItems);
    const orderRes = await pool.query('SELECT COALESCE(MAX(sort_order), 0)::int AS max_order FROM tuition_packages');
    const sortOrder = (orderRes.rows[0]?.max_order || 0) + 1;
    const id = `pkg-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;

    const insertRes = await pool.query(
      `INSERT INTO tuition_packages (id, name, monthly_price, default_duration_months, default_splits, bom_items, is_active, sort_order)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, TRUE, $7)
       RETURNING *`,
      [id, name, monthlyPrice, defaultDurationMonths, JSON.stringify(defaultSplits), JSON.stringify(bomItems), sortOrder]
    );
    return res.status(201).json(mapTuitionPackageRow(insertRes.rows[0]));
  } catch (err: unknown) {
    return handleDbRouteError(res, err);
  }
});

app.put('/api/tuition/packages/:id', async (req, res) => {
  try {
    await ensureDbReady();
    const actor = await resolveTuitionActor(req);
    if (!actor || actor.role !== 'admin') {
      return res.status(403).json({ error: 'Chỉ Admin mới có quyền cập nhật gói tập.' });
    }

    const { id } = req.params;
    const existingRes = await pool.query('SELECT * FROM tuition_packages WHERE id = $1', [id]);
    if (existingRes.rows.length === 0) {
      return res.status(404).json({ error: 'Không tìm thấy gói tập.' });
    }
    const existing = existingRes.rows[0];

    const name = String(req.body?.name ?? existing.name).trim();
    const monthlyPrice = Math.max(0, Math.round(Number(req.body?.monthlyPrice ?? existing.monthly_price) || 0));
    const defaultDurationMonths = Math.max(
      0.5,
      Number(req.body?.defaultDurationMonths ?? existing.default_duration_months) || 1
    );
    const defaultSplits =
      req.body?.defaultSplits !== undefined
        ? sanitizeNumericRecord(req.body.defaultSplits)
        : existing.default_splits || {};
    const bomItems =
      req.body?.bomItems !== undefined
        ? sanitizeBomItems(req.body.bomItems)
        : Array.isArray(existing.bom_items)
        ? existing.bom_items
        : [];
    const isActive = req.body?.isActive !== undefined ? Boolean(req.body.isActive) : existing.is_active;

    const updateRes = await pool.query(
      `UPDATE tuition_packages
       SET name = $1, monthly_price = $2, default_duration_months = $3, default_splits = $4::jsonb, bom_items = $5::jsonb, is_active = $6
       WHERE id = $7
       RETURNING *`,
      [name, monthlyPrice, defaultDurationMonths, JSON.stringify(defaultSplits), JSON.stringify(bomItems), isActive, id]
    );
    return res.json(mapTuitionPackageRow(updateRes.rows[0]));
  } catch (err: unknown) {
    return handleDbRouteError(res, err);
  }
});

app.delete('/api/tuition/packages/:id', async (req, res) => {
  try {
    await ensureDbReady();
    const actor = await resolveTuitionActor(req);
    if (!actor || actor.role !== 'admin') {
      return res.status(403).json({ error: 'Chỉ Admin mới có quyền xóa gói tập.' });
    }

    const { id } = req.params;
    await pool.query('DELETE FROM tuition_packages WHERE id = $1', [id]);
    return res.json({ success: true, id });
  } catch (err: unknown) {
    return handleDbRouteError(res, err);
  }
});

// Admin-only: Revenue Allocation Entities CRUD
app.post('/api/tuition/entities', async (req, res) => {
  try {
    await ensureDbReady();
    const actor = await resolveTuitionActor(req);
    if (!actor || actor.role !== 'admin') {
      return res.status(403).json({ error: 'Chỉ Admin mới có quyền quản lý đối tượng phân bổ.' });
    }

    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Vui lòng nhập tên đối tượng hệ thống.' });

    const orderRes = await pool.query('SELECT COALESCE(MAX(sort_order), 0)::int AS max_order FROM revenue_entities');
    const sortOrder = (orderRes.rows[0]?.max_order || 0) + 1;
    const id = `ent-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;

    const insertRes = await pool.query(
      `INSERT INTO revenue_entities (id, name, is_active, sort_order)
       VALUES ($1, $2, TRUE, $3)
       RETURNING *`,
      [id, name, sortOrder]
    );
    return res.status(201).json(mapRevenueEntityRow(insertRes.rows[0]));
  } catch (err: unknown) {
    return handleDbRouteError(res, err);
  }
});

app.put('/api/tuition/entities/:id', async (req, res) => {
  try {
    await ensureDbReady();
    const actor = await resolveTuitionActor(req);
    if (!actor || actor.role !== 'admin') {
      return res.status(403).json({ error: 'Chỉ Admin mới có quyền sửa đối tượng phân bổ.' });
    }

    const { id } = req.params;
    const existingRes = await pool.query('SELECT * FROM revenue_entities WHERE id = $1', [id]);
    if (existingRes.rows.length === 0) {
      return res.status(404).json({ error: 'Không tìm thấy đối tượng phân bổ.' });
    }
    const existing = existingRes.rows[0];

    const name = String(req.body?.name ?? existing.name).trim();
    const isActive = req.body?.isActive !== undefined ? Boolean(req.body.isActive) : existing.is_active;

    const updateRes = await pool.query(
      `UPDATE revenue_entities SET name = $1, is_active = $2 WHERE id = $3 RETURNING *`,
      [name, isActive, id]
    );
    return res.json(mapRevenueEntityRow(updateRes.rows[0]));
  } catch (err: unknown) {
    return handleDbRouteError(res, err);
  }
});

app.delete('/api/tuition/entities/:id', async (req, res) => {
  try {
    await ensureDbReady();
    const actor = await resolveTuitionActor(req);
    if (!actor || actor.role !== 'admin') {
      return res.status(403).json({ error: 'Chỉ Admin mới có quyền xóa đối tượng phân bổ.' });
    }

    const { id } = req.params;
    await pool.query('DELETE FROM revenue_entities WHERE id = $1', [id]);
    return res.json({ success: true, id });
  } catch (err: unknown) {
    return handleDbRouteError(res, err);
  }
});

// Admin-only: Operating Costs Ledger CRUD
app.post('/api/tuition/costs', async (req, res) => {
  try {
    await ensureDbReady();
    const actor = await resolveTuitionActor(req);
    if (!actor || actor.role !== 'admin') {
      return res.status(403).json({ error: 'Chỉ Admin mới có quyền ghi nhận chi phí vận hành.' });
    }

    const title = String(req.body?.title || '').trim();
    const category = String(req.body?.category || 'Chi phí khác').trim();
    const costDate = String(req.body?.costDate || new Date().toISOString().split('T')[0]).trim();
    const amount = Math.max(0, Math.round(Number(req.body?.amount) || 0));
    const notes = String(req.body?.notes || '').trim();

    if (!title || amount <= 0) {
      return res.status(400).json({ error: 'Vui lòng nhập nội dung chi và số tiền lớn hơn 0.' });
    }

    const id = `cost-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
    const insertRes = await pool.query(
      `INSERT INTO operating_costs (id, cost_date, category, title, amount, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [id, costDate, category, title, amount, notes, actor.username]
    );
    return res.status(201).json(mapOperatingCostRow(insertRes.rows[0]));
  } catch (err: unknown) {
    return handleDbRouteError(res, err);
  }
});

app.put('/api/tuition/costs/:id', async (req, res) => {
  try {
    await ensureDbReady();
    const actor = await resolveTuitionActor(req);
    if (!actor || actor.role !== 'admin') {
      return res.status(403).json({ error: 'Chỉ Admin mới có quyền cập nhật chi phí vận hành.' });
    }

    const { id } = req.params;
    const existingRes = await pool.query('SELECT * FROM operating_costs WHERE id = $1', [id]);
    if (existingRes.rows.length === 0) {
      return res.status(404).json({ error: 'Không tìm thấy khoản chi phí.' });
    }
    const existing = existingRes.rows[0];

    const title = String(req.body?.title ?? existing.title).trim();
    const category = String(req.body?.category ?? existing.category).trim();
    const costDate = String(
      req.body?.costDate || (existing.cost_date ? new Date(existing.cost_date).toISOString().split('T')[0] : '')
    ).trim();
    const amount = Math.max(0, Math.round(Number(req.body?.amount ?? existing.amount) || 0));
    const notes = String(req.body?.notes ?? existing.notes ?? '').trim();

    const updateRes = await pool.query(
      `UPDATE operating_costs
       SET cost_date = $1, category = $2, title = $3, amount = $4, notes = $5
       WHERE id = $6
       RETURNING *`,
      [costDate, category, title, amount, notes, id]
    );
    return res.json(mapOperatingCostRow(updateRes.rows[0]));
  } catch (err: unknown) {
    return handleDbRouteError(res, err);
  }
});

app.delete('/api/tuition/costs/:id', async (req, res) => {
  try {
    await ensureDbReady();
    const actor = await resolveTuitionActor(req);
    if (!actor || actor.role !== 'admin') {
      return res.status(403).json({ error: 'Chỉ Admin mới có quyền xóa chi phí vận hành.' });
    }

    const { id } = req.params;
    await pool.query('DELETE FROM operating_costs WHERE id = $1', [id]);
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

  if (process.env.NODE_ENV === 'production') {
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
      const vitePkg = 'vite';
      const { createServer: createViteServer } = await import(/* @vite-ignore */ vitePkg);
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });
      app.use(vite.middlewares);
      console.log('⚡ Vite HMR dev middleware enabled (auto live-reload)');
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
    console.log(`🚀 FitTrack Pro server running on http://localhost:${PORT}`);
  });
}

if (!process.env.VERCEL) {
  startServer().catch((err) => {
    console.error('Failed to start server:', err);
  });
}

export { app };
export default app;
