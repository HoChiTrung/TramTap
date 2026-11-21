/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { TuitionContract } from '../../types/tuition';
import { formatVnd, getContractDebt } from '../../utils/tuitionCalculations';
import { X, Wallet, Check, AlertTriangle } from 'lucide-react';

interface QuickPaymentModalProps {
  contract: TuitionContract | null;
  onClose: () => void;
  onSubmitPayment: (
    contractId: string,
    amount: number,
    note: string
  ) => Promise<{ success: boolean; error?: string }>;
}

export const QuickPaymentModal: React.FC<QuickPaymentModalProps> = ({
  contract,
  onClose,
  onSubmitPayment,
}) => {
  const [amount, setAmount] = useState<number>(0);
  const [note, setNote] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const remainingDebt = contract
    ? getContractDebt(contract.totalAmount, contract.paidAmount)
    : 0;

  useEffect(() => {
    if (!contract) return;
    setAmount(getContractDebt(contract.totalAmount, contract.paidAmount));
    setNote('');
    setErrorMsg(null);
  }, [contract]);

  if (!contract) return null;

  const projectedPaid = contract.paidAmount + Math.max(0, Math.round(amount));
  const projectedDebt = getContractDebt(contract.totalAmount, projectedPaid);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (amount <= 0) {
      setErrorMsg('Số tiền thu thêm phải lớn hơn 0.');
      return;
    }

    setIsSubmitting(true);
    const res = await onSubmitPayment(contract.id, Math.round(amount), note.trim());
    setIsSubmitting(false);

    if (res.success) {
      onClose();
    } else {
      setErrorMsg(res.error || 'Không thể ghi nhận khoản thanh toán.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-[2px] p-4">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md shadow-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <Wallet className="w-4 h-4 text-emerald-600" />
            <h3 className="text-sm font-bold text-slate-900">Ghi Nhận Thu Học Phí</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer"
            aria-label="Đóng"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Học viên</span>
              <span className="font-bold text-slate-900">
                {contract.studentCode} · {contract.studentName}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Tổng học phí</span>
              <span className="font-mono tabular-nums font-semibold text-slate-800">
                {formatVnd(contract.totalAmount)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Đã thanh toán</span>
              <span className="font-mono tabular-nums font-semibold text-emerald-700">
                {formatVnd(contract.paidAmount)}
              </span>
            </div>
            <div className="flex items-center justify-between pt-1 border-t border-slate-200">
              <span className="font-medium text-slate-700">Đang còn nợ</span>
              <span className="font-mono tabular-nums font-bold text-amber-700">
                {formatVnd(remainingDebt)}
              </span>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-700">
                Số tiền thu đợt này (VNĐ)
              </label>
              <div className="flex items-center gap-2">
                {remainingDebt > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={() => setAmount(Math.round(remainingDebt / 2))}
                      className="text-[11px] font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
                    >
                      50% nợ
                    </button>
                    <span className="text-slate-300">/</span>
                    <button
                      type="button"
                      onClick={() => setAmount(remainingDebt)}
                      className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 cursor-pointer"
                    >
                      Thu hết nợ
                    </button>
                  </>
                )}
              </div>
            </div>
            <input
              type="number"
              min={1}
              step={1}
              value={amount}
              onChange={(e) => setAmount(Math.max(0, Number(e.target.value) || 0))}
              required
              className="w-full h-11 px-3 rounded-lg border border-slate-300 text-base font-bold font-mono tabular-nums text-right text-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-600"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Ghi chú thu tiền (tuỳ chọn)
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="VD: Chuyển khoản đợt 2, tiền mặt..."
              className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-600"
            />
          </div>

          <div className="flex items-center justify-between text-xs px-1 text-slate-600">
            <span>Sau khi thu, còn nợ:</span>
            <span
              className={`font-mono tabular-nums font-bold ${
                projectedDebt === 0 ? 'text-emerald-700' : 'text-amber-700'
              }`}
            >
              {formatVnd(projectedDebt)}
              {projectedDebt === 0 ? ' (Hoàn thành)' : ''}
            </span>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="h-9 px-4 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="h-9 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Check className="w-4 h-4" />
              <span>{isSubmitting ? 'Đang lưu...' : 'Xác Nhận Thu Tiền'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
