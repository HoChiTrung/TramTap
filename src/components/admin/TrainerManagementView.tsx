/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { useHealth } from '../../context/HealthContext';
import { UserAccount } from '../../types/health';
import {
  ShieldCheck,
  UserPlus,
  Users,
  KeyRound,
  Trash2,
  Edit2,
  Phone,
  Check,
  X,
  UserCheck,
  Database,
} from 'lucide-react';

export const TrainerManagementView: React.FC = () => {
  const {
    users,
    allStudents,
    isAdmin,
    currentUser,
    createUserAccount,
    updateUserAccount,
    deleteUserAccount,
    assignStudentToTrainer,
  } = useHealth();

  // Form state for creating a new Trainer (or Admin) account in DB
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('123');
  const [phone, setPhone] = useState('');
  const [accountRole, setAccountRole] = useState<'trainer' | 'admin'>('trainer');
  const [formMsg, setFormMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // Inline password/profile editor for existing accounts
  const [editingUser, setEditingUser] = useState<UserAccount | null>(null);
  const [editFullName, setEditFullName] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const trainerAccounts = users.filter((u) => u.role === 'trainer' || u.role === 'admin');
  const studentAccounts = users.filter((u) => u.role === 'student');

  const handleCreateTrainer = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormMsg(null);
    if (!fullName.trim() || !username.trim() || !password.trim()) {
      setFormMsg({ type: 'error', text: 'Vui lòng nhập đầy đủ Họ tên, Tài khoản và Mật khẩu.' });
      return;
    }

    setIsCreating(true);
    const res = await createUserAccount({
      fullName: fullName.trim(),
      username: username.trim(),
      password: password.trim(),
      phone: phone.trim(),
      role: accountRole,
    });
    setIsCreating(false);

    if (res.success) {
      setFullName('');
      setUsername('');
      setPassword('123');
      setPhone('');
      setFormMsg({
        type: 'success',
        text: `Đã tạo tài khoản ${accountRole === 'admin' ? 'Admin' : 'Huấn Luyện Viên'} lưu vào Database thành công!`,
      });
    } else {
      setFormMsg({ type: 'error', text: res.error || 'Không thể tạo tài khoản' });
    }
  };

  const startEditUser = (u: UserAccount) => {
    setEditingUser(u);
    setEditFullName(u.fullName);
    setEditUsername(u.username);
    setEditPhone(u.phone || '');
    setEditPassword('');
  };

  const handleSaveEditUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    const res = await updateUserAccount(editingUser.id, {
      fullName: editFullName.trim(),
      username: editUsername.trim(),
      phone: editPhone.trim(),
      password: editPassword.trim() ? editPassword.trim() : undefined,
    });
    if (res.success) {
      setEditingUser(null);
    } else {
      setFormMsg({ type: 'error', text: res.error || 'Không thể cập nhật tài khoản' });
    }
  };

  if (!isAdmin) {
    return (
      <div className="bg-white rounded-3xl p-8 border border-slate-200 text-center">
        <ShieldCheck className="w-10 h-10 text-amber-500 mx-auto mb-2" />
        <h3 className="font-extrabold text-slate-900 text-base">
          Khu Vực Dành Cho Quản Trị Viên (Admin)
        </h3>
        <p className="text-xs text-slate-500 mt-1">
          Chỉ tài khoản Admin mới có quyền tạo thêm Huấn Luyện Viên và phân quyền tài khoản hệ thống.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-emerald-950 to-slate-900 rounded-2xl sm:rounded-3xl p-4 sm:p-6 text-white shadow-md">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                <Database className="w-3 h-3" />
                Database Account Center
              </span>
              <span className="text-xs text-slate-300">
                Đang đăng nhập quyền: <strong className="text-white">{currentUser?.fullName} (@{currentUser?.username})</strong>
              </span>
            </div>
            <h2 className="text-lg sm:text-xl font-black tracking-tight mt-1">
              Quản Lý Tài Khoản HLV, Phân Công Học Viên &amp; Database Auth
            </h2>
            <p className="text-xs text-slate-300 mt-1">
              Toàn bộ tài khoản đăng nhập (Admin, nhiều Huấn Luyện Viên và Học Viên) được lưu trữ trực tiếp trong bảng <code className="text-emerald-300 font-mono">users</code> trên Database.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center text-xs shrink-0">
            <div className="px-3 py-2 rounded-xl bg-white/10 border border-white/10">
              <div className="text-[10px] text-slate-300">Tài khoản HLV</div>
              <div className="text-base font-black text-emerald-400">
                {users.filter((u) => u.role === 'trainer').length}
              </div>
            </div>
            <div className="px-3 py-2 rounded-xl bg-white/10 border border-white/10">
              <div className="text-[10px] text-slate-300">Học viên</div>
              <div className="text-base font-black text-cyan-400">{allStudents.length}</div>
            </div>
            <div className="px-3 py-2 rounded-xl bg-white/10 border border-white/10">
              <div className="text-[10px] text-slate-300">Tổng User DB</div>
              <div className="text-base font-black text-white">{users.length}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Section 1: Create New Trainer / Admin Account + List Trainers */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Create Trainer Form */}
        <div className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-5 border border-slate-200/90 shadow-xs">
          <div className="flex items-center space-x-2 pb-3 border-b border-slate-100">
            <UserPlus className="w-5 h-5 text-emerald-600 shrink-0" />
            <div>
              <h3 className="font-extrabold text-slate-900 text-sm">
                Tạo Tài Khoản Huấn Luyện Viên Mới
              </h3>
              <p className="text-[11px] text-slate-500">
                Lưu trực tiếp vào bảng <code className="font-mono">users</code> trong Database
              </p>
            </div>
          </div>

          <form onSubmit={handleCreateTrainer} className="mt-4 space-y-3 text-xs">
            <div>
              <label className="block font-bold text-slate-700 mb-1">Họ và tên HLV *</label>
              <input
                type="text"
                required
                placeholder="VD: HLV Nguyễn Minh Tuấn"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-hidden font-medium"
              />
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Tài khoản (Username) *</label>
                <input
                  type="text"
                  required
                  placeholder="hlvtuan"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-hidden font-mono"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Mật khẩu *</label>
                <input
                  type="text"
                  required
                  placeholder="123"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-hidden font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Số điện thoại</label>
                <input
                  type="tel"
                  placeholder="0909123456"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-hidden font-mono"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Phân quyền (Role)</label>
                <select
                  value={accountRole}
                  onChange={(e: any) => setAccountRole(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-hidden font-bold text-slate-800"
                >
                  <option value="trainer">Huấn Luyện Viên (trainer)</option>
                  <option value="admin">Quản Trị Viên (admin)</option>
                </select>
              </div>
            </div>

            {formMsg && (
              <div
                className={`p-2.5 rounded-xl border text-xs font-semibold ${
                  formMsg.type === 'success'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-rose-50 border-rose-200 text-rose-700'
                }`}
              >
                {formMsg.text}
              </div>
            )}

            <button
              type="submit"
              disabled={isCreating}
              className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl transition-colors shadow-xs cursor-pointer disabled:opacity-50 flex items-center justify-center space-x-1.5"
            >
              <UserPlus className="w-4 h-4" />
              <span>{isCreating ? 'Đang lưu Database...' : 'Tạo Tài Khoản HLV Vào Database'}</span>
            </button>
          </form>
        </div>

        {/* Trainers & Admins List */}
        <div className="lg:col-span-2 bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-5 border border-slate-200/90 shadow-xs space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
            <div className="flex items-center space-x-2">
              <ShieldCheck className="w-5 h-5 text-emerald-600" />
              <div>
                <h3 className="font-extrabold text-slate-900 text-sm">
                  Danh Sách Tài Khoản Admin &amp; Huấn Luyện Viên ({trainerAccounts.length})
                </h3>
                <p className="text-[11px] text-slate-500">
                  Mỗi HLV đăng nhập sẽ quản lý danh sách học viên thuộc phụ trách của mình
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-2.5">
            {trainerAccounts.map((acc) => {
              const managedStudents = allStudents.filter((s) => s.trainerId === acc.id);
              const isEditingThis = editingUser?.id === acc.id;

              return (
                <div
                  key={acc.id}
                  className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/90 text-xs space-y-2"
                >
                  {isEditingThis ? (
                    <form onSubmit={handleSaveEditUser} className="space-y-2.5">
                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                        <div>
                          <label className="text-[10px] font-bold text-slate-500">Họ và tên</label>
                          <input
                            type="text"
                            value={editFullName}
                            onChange={(e) => setEditFullName(e.target.value)}
                            className="w-full mt-0.5 px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-semibold"
                            required
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-500">Username</label>
                          <input
                            type="text"
                            value={editUsername}
                            onChange={(e) => setEditUsername(e.target.value)}
                            className="w-full mt-0.5 px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-mono"
                            required
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-500">Số điện thoại</label>
                          <input
                            type="text"
                            value={editPhone}
                            onChange={(e) => setEditPhone(e.target.value)}
                            className="w-full mt-0.5 px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-mono"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-500">
                            Đổi mật khẩu (Để trống nếu giữ nguyên)
                          </label>
                          <input
                            type="text"
                            placeholder="Nhập mật khẩu mới..."
                            value={editPassword}
                            onChange={(e) => setEditPassword(e.target.value)}
                            className="w-full mt-0.5 px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-mono"
                          />
                        </div>
                      </div>
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setEditingUser(null)}
                          className="px-3 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg font-bold flex items-center space-x-1 cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                          <span>Hủy</span>
                        </button>
                        <button
                          type="submit"
                          className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold flex items-center space-x-1 cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Lưu Database</span>
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-extrabold text-slate-900 text-sm">
                            {acc.fullName}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              acc.role === 'admin'
                                ? 'bg-amber-100 text-amber-900 border border-amber-300'
                                : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                            }`}
                          >
                            {acc.role === 'admin' ? 'ADMIN' : 'HUẤN LUYỆN VIÊN'}
                          </span>
                          <span className="px-2 py-0.5 rounded-md bg-white border border-slate-200 font-mono text-[11px] text-slate-700">
                            TK: <strong>{acc.username}</strong>
                          </span>
                          {acc.phone && (
                            <span className="text-slate-500 flex items-center text-[11px]">
                              <Phone className="w-3 h-3 mr-1" />
                              {acc.phone}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-1">
                          Đang phụ trách:{' '}
                          <strong className="text-emerald-700">
                            {managedStudents.length} học viên
                          </strong>
                          {managedStudents.length > 0 &&
                            ` (${managedStudents.map((s) => s.fullName).join(', ')})`}
                        </div>
                      </div>

                      <div className="flex items-center space-x-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => startEditUser(acc)}
                          className="px-2.5 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl font-bold flex items-center space-x-1 cursor-pointer"
                        >
                          <Edit2 className="w-3.5 h-3.5 text-slate-500" />
                          <span>Sửa / Đổi MK</span>
                        </button>

                        {acc.username.toLowerCase() !== 'admin' && (
                          <>
                            {confirmDeleteId === acc.id ? (
                              <div className="flex items-center space-x-1">
                                <button
                                  type="button"
                                  onClick={async () => {
                                    await deleteUserAccount(acc.id);
                                    setConfirmDeleteId(null);
                                  }}
                                  className="px-2.5 py-1.5 bg-rose-600 text-white rounded-xl font-bold cursor-pointer"
                                >
                                  Xác nhận xóa
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteId(null)}
                                  className="px-2 py-1.5 bg-slate-200 text-slate-700 rounded-xl font-bold cursor-pointer"
                                >
                                  Hủy
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(acc.id)}
                                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
                                title="Xóa tài khoản HLV"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Section 2: Student-to-Trainer Assignment & Student Login Accounts */}
      <div className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-5 border border-slate-200/90 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
          <div className="flex items-center space-x-2">
            <UserCheck className="w-5 h-5 text-indigo-600" />
            <div>
              <h3 className="font-extrabold text-slate-900 text-sm">
                Phân Công Học Viên Cho Huấn Luyện Viên &amp; Tài Khoản Học Viên ({allStudents.length})
              </h3>
              <p className="text-[11px] text-slate-500">
                Quản lý rõ học viên nào thuộc HLV nào phụ trách và tài khoản đăng nhập Cổng Học Viên trong Database
              </p>
            </div>
          </div>
        </div>

        {allStudents.length === 0 ? (
          <div className="py-10 text-center text-xs text-slate-400">
            <Users className="w-8 h-8 text-slate-300 mx-auto mb-1.5" />
            Chưa có hồ sơ học viên nào trong Database.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-600 border-b border-slate-200">
                  <th className="py-2.5 px-3 font-bold">Học Viên</th>
                  <th className="py-2.5 px-3 font-bold">Số Điện Thoại</th>
                  <th className="py-2.5 px-3 font-bold">Tài Khoản Đăng Nhập (DB)</th>
                  <th className="py-2.5 px-3 font-bold">Huấn Luyện Viên Phụ Trách</th>
                  <th className="py-2.5 px-3 font-bold text-right">Đổi Mật Khẩu Học Viên</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {allStudents.map((st) => {
                  const stUser = studentAccounts.find((u) => u.studentId === st.id);
                  const isEditingStUser = stUser && editingUser?.id === stUser.id;

                  return (
                    <tr key={st.id} className="hover:bg-slate-50/80">
                      <td className="py-3 px-3 font-extrabold text-slate-900">
                        {st.fullName}
                        <span className="ml-1.5 text-[10px] font-semibold text-slate-400">
                          ({st.gender}, {st.age}t)
                        </span>
                      </td>
                      <td className="py-3 px-3 font-mono text-slate-600">{st.phone}</td>
                      <td className="py-3 px-3">
                        {stUser ? (
                          <span className="px-2 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-900 font-mono font-bold">
                            @{stUser.username}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">Chưa liên kết</span>
                        )}
                      </td>
                      <td className="py-3 px-3">
                        <select
                          value={st.trainerId || ''}
                          onChange={(e) => assignStudentToTrainer(st.id, e.target.value)}
                          className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-xl font-bold text-slate-800 focus:ring-2 focus:ring-emerald-500 outline-hidden"
                        >
                          <option value="">-- Chưa gán HLV --</option>
                          {trainerAccounts.map((tr) => (
                            <option key={tr.id} value={tr.id}>
                              {tr.fullName} (@{tr.username})
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-3 px-3 text-right">
                        {stUser ? (
                          isEditingStUser ? (
                            <form
                              onSubmit={handleSaveEditUser}
                              className="inline-flex items-center space-x-1.5"
                            >
                              <input
                                type="text"
                                placeholder="Username"
                                value={editUsername}
                                onChange={(e) => setEditUsername(e.target.value)}
                                className="w-24 px-2 py-1 border border-slate-300 rounded-lg font-mono text-xs"
                                required
                              />
                              <input
                                type="text"
                                placeholder="Mật khẩu mới"
                                value={editPassword}
                                onChange={(e) => setEditPassword(e.target.value)}
                                className="w-24 px-2 py-1 border border-slate-300 rounded-lg font-mono text-xs"
                              />
                              <button
                                type="submit"
                                className="px-2.5 py-1 bg-emerald-600 text-white rounded-lg font-bold cursor-pointer"
                              >
                                Lưu
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingUser(null)}
                                className="px-2 py-1 bg-slate-200 text-slate-700 rounded-lg font-bold cursor-pointer"
                              >
                                Hủy
                              </button>
                            </form>
                          ) : (
                            <button
                              type="button"
                              onClick={() => startEditUser(stUser)}
                              className="inline-flex items-center space-x-1 px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-bold cursor-pointer"
                            >
                              <KeyRound className="w-3.5 h-3.5 text-slate-500" />
                              <span>Đổi TK / MK</span>
                            </button>
                          )
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
