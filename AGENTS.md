# AGENTS.md

## 1. Tech Stack
- **Ngôn ngữ**: TypeScript (`~5.8`, ESM `"type": "module"`).
- **Frontend**: React 19, Vite 8, Tailwind CSS v4, `vite-plugin-pwa`, `lucide-react`, `motion`.
- **Backend**: Node.js, Express 4 (`server.ts`, Vercel Serverless `api/index.ts`), `@google/genai`.
- **Database**: PostgreSQL trên Aiven Cloud (`pg`, kết nối qua `process.env.DATABASE_URL`).

## 2. Cấu trúc thư mục
- `api/`: Entry point serverless trên Vercel (`api/index.ts` import `server.ts`).
- `server.ts`: Backend Express API, kết nối PostgreSQL và gắn Vite middleware ở chế độ dev.
- `public/`: Tài nguyên tĩnh và bộ icon PWA (`apple-touch-icon`, `pwa-*`, `icon.svg`).
- `src/components/`: UI React theo tính năng (`admin`, `modals`, `nutrition`, `student`, `tuition`...).
- `src/context/`: State toàn cục và luồng gọi API trung tâm (`HealthContext.tsx`).
- `src/hooks/`: Custom React hooks (`usePWAInstall`, `useOnlineStatus`...).
- `src/utils/`, `src/data/`, `src/types/`: Cấu hình gọi API (`api.ts`), tính toán sức khỏe, dữ liệu y khoa, kiểu TS.
- `vercel.json` & `.env.example`: Định tuyến `/api/*` → `api/index.ts`; biến server bắt buộc `DATABASE_URL`, `GEMINI_API_KEY`.

## 3. Lệnh thường dùng
- `npm run dev`: Chạy Express + Vite dev server (`tsx server.ts`, cổng `3000`).
- `npm run build`: Build frontend (`vite build`) và bundle backend (`esbuild` ra `dist/server.js`).
- `npm run lint`: Kiểm tra lỗi kiểu TypeScript (`tsc --noEmit`).
- `npm start`: Chạy server production (`node server.ts`).

## 4. Quy ước code
- Component React dùng `PascalCase.tsx`; hooks dùng `use*.ts`; utils/data/types dùng `camelCase.ts`.
- Import phía backend dùng chuẩn ESM kèm đuôi `.js` cho đường dẫn tương đối (`./src/.../file.js`).
- Styling thuần Tailwind CSS v4; tránh inline style/CSS rời; luôn giữ khóa bí mật trong `process.env`.

## 5. Luật cho AI
- Luôn đọc `AGENTS.md` trước khi lập kế hoạch hoặc sửa code ở mọi phiên mới; không quét toàn bộ dự án khi thông tin đã có ở đây.
- Chỉ sửa đúng file/phần liên quan đến yêu cầu; không tự ý refactor hay viết lại cả file nếu không cần thiết.
- Ưu tiên giữ nguyên cấu trúc thư mục, kiến trúc hiện có và biến môi trường phía server.
- Giải thích ngắn gọn, đơn giản, đi thẳng vào vấn đề.
