/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { OPERATING_COST_CATEGORIES, OperatingCost } from '../../types/tuition';
import { formatVnd } from '../../utils/tuitionCalculations';
import { Plus, Trash2, Edit2, Check, X, Receipt, AlertTriangle } from 'lucide-react';

interface OperatingCostsPanelProps {
  costs: OperatingCost[];
  selectedMonth: string; // 'ALL' or 'YYYY-MM'
  onCreateCost: (payload: {
    costDate: string;
    category: string;
    title: string;
    amount: number;
    notes: string;
  }) => Promise<{ success: boolean; error?: string }>;
  onUpdateCost: (
    id: string,
    payload: {
      costDate: string;
      category: string;
      title: string;
      amount: number;
      notes: string;
    }
  ) => Promise<{ success: boolean; error?: string }>;
  onDeleteCost: (id: string) => Promise<{ success: boolean; error?: string }>;
}

export const OperatingCostsPanel: React.FC<OperatingCostsPanelProps> = ({
  costs,
  selectedMonth,
  onCreateCost,
  onUpdateCost,
  onDeleteCost,
}) => {
  const [costDate, setCostDate] = useState(new Date().toISOString().split('T')[0]);
  const [category, setCategory] = useState<string>(OPERATING_COST_CATEGORIES[0]);
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState<number>(0);
  const [notes, setNotes] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [formMsg, setFormMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const filteredCosts = useMemo(() => {
    return costs.filter((c) => {
      if (selectedMonth !== 'ALL' && !c.costDate.startsWith(selectedMonth)) return false;
      if (categoryFilter !== 'ALL' && c.category !== categoryFilter) return false;
      return true;
    });
  }, [costs, selectedMonth, categoryFilter]);

  const totalAmount = useMemo(
    () => filteredCosts.reduce((sum, c) => sum + Math.round(c.amount || 0), 0),
    [filteredCosts]
  );

  const categoryTotals = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of filteredCosts) {
      map.set(c.category, (map.get(c.category) || 0) + Math.round(c.amount || 0));
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [filteredCosts]);

  const resetForm = () => {
    setEditingId(null);
    setCostDate(new Date().toISOString().split('T')[0]);
    setCategory(OPERATING_COST_CATEGORIES[0]);
    setTitle('');
    setAmount(0);
    setNotes('');
  };

  const handleStartEdit = (cost: OperatingCost) => {
    setFormMsg(null);
    setEditingId(cost.id);
    setCostDate(cost.costDate);
    setCategory(cost.category);
    setTitle(cost.title);
    setAmount(cost.amount);
    setNotes(cost.notes || '');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormMsg(null);

    if (!title.trim() || amount <= 0) {
      setFormMsg({ type: 'error', text: 'Vui lòng nhập nội dung khoản chi và số tiền lớn hơn 0.' });
      return;
    }

    setIsSaving(true);
    const payload = {
      costDate,
      category,
      title: title.trim(),
      amount: Math.round(amount),
      notes: notes.trim(),
    };
    const res = editingId ? await onUpdateCost(editingId, payload) : await onCreateCost(payload);
    setIsSaving(false);

    if (res.success) {
      setFormMsg({
        type: 'success',
        text: editingId ? 'Đã cập nhật khoản chi phí vận hành.' : 'Đã thêm khoản chi phí mới vào sổ.',
      });
      resetForm();
    } else {
      setFormMsg({ type: 'error', text: res.error || 'Không thể lưu khoản chi phí.' });
    }
  };

  const handleConfirmDelete = async (id: string) => {
    const res = await onDeleteCost(id);
    setConfirmDeleteId(null);
    if (!res.success) {
      setFormMsg({ type: 'error', text: res.error || 'Không thể xóa khoản chi phí.' });
    }
  };

  return (
    <div className="space-y-5">
      {/* Input Form */}
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              {editingId ? 'Chỉnh Sửa Khoản Chi Phí' : 'Ghi Nhận Khoản Chi Vận Hành'}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Tổng các khoản chi này tự động cộng vào chỉ số Tổng Chi Phí &amp; tính Lợi Nhuận Thuần cho Admin
            </p>
          </div>
          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              className="text-xs font-semibold text-slate-600 hover:text-slate-900 inline-flex items-center gap-1 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              <span>Hủy chỉnh sửa</span>
            </button>
          )}
        </div>

        {formMsg && (
          <div
            className={`mb-4 p-3 rounded-lg border text-xs flex items-center gap-2 ${
              formMsg.type === 'error'
                ? 'bg-rose-50 border-rose-200 text-rose-800'
                : 'bg-emerald-50 border-emerald-200 text-emerald-800'
            }`}
          >
            {formMsg.type === 'error' ? (
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            ) : (
              <Check className="w-4 h-4 text-emerald-600 shrink-0" />
            )}
            <span>{formMsg.text}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-slate-600 mb-1">Ngày chi</label>
            <input
              type="date"
              value={costDate}
              onChange={(e) => setCostDate(e.target.value)}
              required
              className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm font-mono tabular-nums text-slate-900 focus:outline-none focus:border-emerald-600"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-slate-600 mb-1">Danh mục</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm text-slate-900 focus:outline-none focus:border-emerald-600"
            >
              {OPERATING_COST_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-3">
            <label className="block text-xs font-medium text-slate-600 mb-1">Nội dung chi</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="VD: Thuê mặt bằng tháng 11, nhập hàng..."
              required
              className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm text-slate-900 focus:outline-none focus:border-emerald-600"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-slate-600 mb-1">Số tiền (VNĐ)</label>
            <input
              type="number"
              min={1}
              step={1}
              value={amount}
              onChange={(e) => setAmount(Math.max(0, Number(e.target.value) || 0))}
              required
              className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm font-mono tabular-nums text-right text-slate-900 focus:outline-none focus:border-emerald-600"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-slate-600 mb-1">Ghi chú</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Tuỳ chọn"
              className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm text-slate-900 focus:outline-none focus:border-emerald-600"
            />
          </div>

          <div className="sm:col-span-1">
            <button
              type="submit"
              disabled={isSaving}
              className="w-full h-10 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold inline-flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50 whitespace-nowrap"
            >
              {editingId ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
              <span>{editingId ? 'Lưu' : 'Thêm'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* Cost Ledger Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Sổ Chi Phí Vận Hành</h3>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mt-0.5">
              <span>{filteredCosts.length} khoản chi</span>
              <span aria-hidden="true">·</span>
              <span>
                Tổng cộng:{' '}
                <strong className="font-mono tabular-nums text-rose-700">
                  {formatVnd(totalAmount)}
                </strong>
              </span>
              {categoryTotals.slice(0, 3).map(([cat, sum]) => (
                <React.Fragment key={cat}>
                  <span aria-hidden="true">·</span>
                  <span>
                    {cat}: <span className="font-mono tabular-nums">{formatVnd(sum)}</span>
                  </span>
                </React.Fragment>
              ))}
            </div>
          </div>

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="h-9 px-3 rounded-lg border border-slate-200 bg-slate-50 text-xs font-medium text-slate-700 focus:outline-none focus:border-emerald-600"
          >
            <option value="ALL">Tất cả danh mục</option>
            {OPERATING_COST_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>

        {filteredCosts.length === 0 ? (
          <div className="py-12 px-4 text-center">
            <Receipt className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-semibold text-slate-700">
              Chưa có khoản chi phí vận hành nào trong kỳ này
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Thêm khoản chi phí ở biểu mẫu phía trên để hệ thống tự động tính Tổng chi phí và Lợi nhuận thuần.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-500">
                  <th className="py-2.5 px-4 whitespace-nowrap">Ngày chi</th>
                  <th className="py-2.5 px-4 whitespace-nowrap">Danh mục</th>
                  <th className="py-2.5 px-4">Nội dung</th>
                  <th className="py-2.5 px-4 text-right whitespace-nowrap">Số tiền (VNĐ)</th>
                  <th className="py-2.5 px-4">Ghi chú</th>
                  <th className="py-2.5 px-4 text-right whitespace-nowrap">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredCosts.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-4 font-mono tabular-nums text-slate-600 whitespace-nowrap">
                      {c.costDate}
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-700 whitespace-nowrap">
                      {c.category}
                    </td>
                    <td className="py-3 px-4 font-semibold text-slate-900">{c.title}</td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums font-bold text-rose-700 whitespace-nowrap">
                      {formatVnd(c.amount)}
                    </td>
                    <td className="py-3 px-4 text-slate-500 max-w-xs truncate">{c.notes || '—'}</td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleStartEdit(c)}
                          className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-md cursor-pointer"
                          title="Chỉnh sửa"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        {confirmDeleteId === c.id ? (
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleConfirmDelete(c.id)}
                              className="px-2 py-1 bg-rose-600 text-white text-[11px] font-semibold rounded-md cursor-pointer"
                            >
                              Xóa
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="px-2 py-1 bg-slate-100 text-slate-600 text-[11px] font-medium rounded-md cursor-pointer"
                            >
                              Hủy
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(c.id)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md cursor-pointer"
                            title="Xóa khoản chi"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
