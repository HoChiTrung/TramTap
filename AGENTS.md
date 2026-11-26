# AGENTS.md

## 1. Tech Stack & Môi trường
- **Runtime & Ngôn ngữ**: Node.js, TypeScript `~5.8` (ESM `"type": "module"`).
- **Frontend**: React 19, Vite 8, Tailwind CSS v4, `vite-plugin-pwa`, `lucide-react`, `motion`.
- **Backend**: Express 4 (`server.ts` dùng chung cho dev và Vercel Serverless qua `api/index.ts`), `@google/genai`.
- **Database**: PostgreSQL trên Aiven Cloud (`pg`, kết nối qua `process.env.DATABASE_URL`).

## 2. Kiến trúc thư mục
- `api/index.ts`: Entry point cho Vercel Serverless (import `server.ts`).
- `server.ts`: Express API, kết nối PostgreSQL, gắn Vite middleware khi chạy dev.
- `public/`: Tài nguyên tĩnh và bộ icon PWA (`icon.svg`, `pwa-*`, `apple-touch-icon`).
- `src/components/`: UI chia theo domain (`admin`, `modals`, `nutrition`, `student`, `tuition`...).
- `src/context/`: State toàn cục và tầng gọi API trung tâm (`HealthContext.tsx`).
- `src/hooks/`: Custom hooks (`usePWAInstall`, `useOnlineStatus`...).
- `src/utils/`, `src/data/`, `src/types/`: API client (`api.ts`), logic tính toán, dữ liệu tĩnh, TypeScript types.
- `vercel.json` & `.env.example`: Route `/api/*` → `api/index.ts`; biến server bắt buộc `DATABASE_URL`, `GEMINI_API_KEY`.

## 3. Lệnh kiểm tra & Vận hành
- `npm run dev`: Chạy Express + Vite (`tsx server.ts`, cổng `3000`).
- `npm run lint`: Kiểm tra kiểu TypeScript (`tsc --noEmit`).
- `npm run build`: Build frontend (`vite build`) + bundle backend (`esbuild` → `dist/server.js`).
- `npm start`: Chạy production (`node server.ts`).

## 4. Quy chuẩn Code & Bảo mật (BẮT BUỘC)
- **Đặt tên**: Component `PascalCase.tsx`; hooks `use*.ts`; utils/data/types `camelCase.ts`.
- **ESM Backend**: Mọi đường dẫn import tương đối phía backend BẮT BUỘC có đuôi `.js` (vd: `./src/utils/x.js`).
- **Tương thích Serverless**: `server.ts` chạy trên Vercel Serverless — KHÔNG lưu state lâu dài trong RAM (in-memory) hoặc tạo `setInterval` chạy nền.
- **Database & Bảo mật**:
  - Truy vấn PostgreSQL BẮT BUỘC dùng parameterized query (`$1, $2...`) chống SQL Injection.
  - TUYỆT ĐỐI KHÔNG đưa `DATABASE_URL`, `GEMINI_API_KEY` hoặc logic gọi `@google/genai` vào `src/` hay biến `VITE_*`.
- **UI & Styling**: Dùng thuần Tailwind CSS v4; tránh inline style, tránh CSS rời và không tự ý tạo cấu hình kiểu Tailwind v3 cũ.

## 5. Quy tắc làm việc cho AI (Tối ưu Quota & An toàn)
- **Đọc ngữ cảnh tối thiểu**: Không quét toàn bộ dự án hay đọc thư mục ngoài phạm vi (`node_modules`, `dist`, `public`) khi thông tin đã có trong file này. Chỉ đọc đúng file liên quan đến task.
- **Thay đổi tối thiểu (Minimal Diff)**: Chỉ sửa đúng phần được yêu cầu. KHÔNG tự ý refactor, đổi tên biến, thay cấu trúc thư mục hoặc cài thêm thư viện ngoài khi chưa được đồng ý.
- **Tự kiểm chứng**: Sau khi sửa TypeScript/Backend, ưu tiên đối chiếu kiểu dữ liệu và nhắc/chạy `npm run lint` để đảm bảo không vỡ build ESM hay lỗi type.
- **Định dạng phản hồi**: Trả lời bằng tiếng Việt ngắn gọn, đi thẳng vào vấn đề; chỉ xuất phần code thay đổi hoặc tóm tắt ngắn các file đã sửa, không giải thích dài dòng.