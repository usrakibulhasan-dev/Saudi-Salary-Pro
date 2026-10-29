import React, { useEffect, useState } from 'react';
import { CalendarCheck } from 'lucide-react';

/**
 * Returns the user's true local date in YYYY-MM-DD format (never UTC-shifted).
 */
export function getLocalTodayISO(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Returns the user's local month in YYYY-MM format.
 */
export function getLocalCurrentMonthISO(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * Formats an ISO YYYY-MM-DD date string according to user preference.
 */
export function formatDisplayDate(
  isoDate?: string,
  dateFormat: 'YYYY-MM-DD' | 'DD/MM/YYYY' = 'YYYY-MM-DD',
): string {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return isoDate || '';
  if (dateFormat === 'DD/MM/YYYY') {
    const [y, m, d] = isoDate.split('-');
    return `${d}/${m}/${y}`;
  }
  return isoDate;
}

export interface NumericInputProps {
  value: number | undefined | null;
  onChange?: (numericValue: number, rawEmpty?: boolean) => void;
  onValueChange?: (numericValue: number | undefined) => void;
  onOptionalChange?: (numericValue: number | undefined) => void;
  min?: number;
  max?: number;
  step?: number | string;
  required?: boolean;
  allowNegative?: boolean;
  placeholder?: string;
  className?: string;
  id?: string;
  name?: string;
  disabled?: boolean;
  ariaLabel?: string;
}

/**
 * Controlled numeric input that allows deleting "0" with Backspace/Delete,
 * preserves temporary empty string ("") or trailing decimal point ("12.") while editing,
 * and never forces "0" back into the field while typing.
 */
export const NumericInput: React.FC<NumericInputProps> = ({
  value,
  onChange,
  onValueChange,
  onOptionalChange,
  min,
  max,
  step = 'any',
  required = false,
  allowNegative = false,
  placeholder = '',
  className = '',
  id,
  name,
  disabled = false,
  ariaLabel,
}) => {
  const [rawText, setRawText] = useState<string>(() =>
    value === undefined || value === null || Number.isNaN(value) ? '' : String(value),
  );
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (!isFocused) {
      setRawText(
        value === undefined || value === null || Number.isNaN(value) ? '' : String(value),
      );
    }
  }, [value, isFocused]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value;

    // Allow empty string during editing so Backspace/Delete can clear "0"
    if (next === '') {
      setRawText('');
      if (onValueChange) onValueChange(undefined);
      if (onOptionalChange) onOptionalChange(undefined);
      if (onChange) onChange(0, true);
      return;
    }

    // Validate numeric pattern (digits, optional leading minus, optional single decimal point)
    const pattern = allowNegative ? /^-?\d*\.?\d*$/ : /^\d*\.?\d*$/;
    if (!pattern.test(next)) {
      return;
    }

    setRawText(next);

    // If intermediate state like "-" or "12.", keep rawText without forcing format
    if (next === '-' || next === '.' || next === '-.' || next.endsWith('.')) {
      const partialNum = Number(next.replace(/\.$/, ''));
      if (Number.isFinite(partialNum)) {
        if (onChange) onChange(partialNum, false);
        if (onValueChange) onValueChange(partialNum);
        if (onOptionalChange) onOptionalChange(partialNum);
      }
      return;
    }

    const parsed = Number(next);
    if (Number.isFinite(parsed)) {
      if (onChange) onChange(parsed, false);
      if (onValueChange) onValueChange(parsed);
      if (onOptionalChange) onOptionalChange(parsed);
    }
  };

  const handleBlur = () => {
    setIsFocused(false);
    if (rawText.trim() === '' || rawText === '-' || rawText === '.') {
      if (onValueChange) onValueChange(undefined);
      if (onOptionalChange && !required) {
        setRawText('');
        onOptionalChange(undefined);
        return;
      }
      // Keep empty if required so HTML5 required validation or form validation triggers cleanly
      if (required) {
        setRawText('');
        return;
      }
      setRawText('');
      return;
    }

    let parsed = Number(rawText);
    if (!Number.isFinite(parsed)) {
      setRawText('');
      return;
    }
    if (typeof min === 'number' && parsed < min) parsed = min;
    if (typeof max === 'number' && parsed > max) parsed = max;

    setRawText(String(parsed));
    if (onChange) onChange(parsed, false);
    if (onValueChange) onValueChange(parsed);
    if (onOptionalChange) onOptionalChange(parsed);
  };

  return (
    <input
      id={id}
      name={name}
      type="text"
      inputMode="decimal"
      required={required}
      disabled={disabled}
      aria-label={ariaLabel}
      value={rawText}
      placeholder={placeholder}
      onFocus={() => setIsFocused(true)}
      onChange={handleChange}
      onBlur={handleBlur}
      data-step={step}
      className={
        className ||
        'w-full rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-xs text-white font-mono tabular-nums'
      }
    />
  );
};

export interface DateInputWithTodayProps {
  value: string;
  onChange: (isoDate: string) => void;
  required?: boolean;
  min?: string;
  max?: string;
  className?: string;
  id?: string;
  name?: string;
  disabled?: boolean;
  ariaLabel?: string;
  todayLabel?: string;
}

/**
 * Reusable Date Picker with an explicit "Today" button that selects the user's true local date.
 */
export const DateInputWithToday: React.FC<DateInputWithTodayProps> = ({
  value,
  onChange,
  required = false,
  min,
  max,
  className = '',
  id,
  name,
  disabled = false,
  ariaLabel,
  todayLabel = 'Today',
}) => {
  const handleSelectToday = () => {
    if (disabled) return;
    const todayLocal = getLocalTodayISO();
    onChange(todayLocal);
  };

  return (
    <div className="flex items-center gap-1.5 w-full">
      <input
        id={id}
        name={name}
        type="date"
        required={required}
        min={min}
        max={max}
        disabled={disabled}
        aria-label={ariaLabel}
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        className={
          className ||
          'flex-1 min-w-0 rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-xs text-white font-mono tabular-nums'
        }
      />
      <button
        type="button"
        disabled={disabled}
        onClick={handleSelectToday}
        title="Set to Today's Local Date"
        className="px-2 py-1.5 rounded-lg bg-slate-800 hover:bg-emerald-600/30 hover:border-emerald-500/50 border border-slate-700 text-[11px] font-medium text-emerald-300 inline-flex items-center gap-1 shrink-0 transition"
      >
        <CalendarCheck className="w-3 h-3 shrink-0" />
        <span>{todayLabel}</span>
      </button>
    </div>
  );
};

export interface MonthInputWithTodayProps {
  value: string;
  onChange: (isoMonth: string) => void;
  required?: boolean;
  className?: string;
  id?: string;
  ariaLabel?: string;
  todayLabel?: string;
}

/**
 * Reusable Month Picker (YYYY-MM) with a quick "Today" button that selects the current local month.
 */
export const MonthInputWithToday: React.FC<MonthInputWithTodayProps> = ({
  value,
  onChange,
  required = false,
  className = '',
  id,
  ariaLabel,
  todayLabel = 'Today',
}) => {
  const handleSelectCurrentMonth = () => {
    onChange(getLocalCurrentMonthISO());
  };

  return (
    <div className="inline-flex items-center gap-1.5">
      <input
        id={id}
        type="month"
        required={required}
        aria-label={ariaLabel}
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        className={
          className ||
          'rounded-lg bg-slate-950 border border-slate-700 px-2.5 py-1.5 text-xs text-white font-mono tabular-nums'
        }
      />
      <button
        type="button"
        onClick={handleSelectCurrentMonth}
        title="Set to Current Local Month"
        className="px-2 py-1.5 rounded-lg bg-slate-800 hover:bg-emerald-600/30 hover:border-emerald-500/50 border border-slate-700 text-[11px] font-medium text-emerald-300 inline-flex items-center gap-1 shrink-0 transition"
      >
        <CalendarCheck className="w-3 h-3 shrink-0" />
        <span>{todayLabel}</span>
      </button>
    </div>
  );
};
