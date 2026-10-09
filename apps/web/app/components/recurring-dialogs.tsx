import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useRevalidator } from "react-router";
import { Trash2, X } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { AmountInput } from "@/app/components/amount-input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/app/components/ui/dialog";
import { CurrencySelect } from "@/app/components/currency-select";
import { AccountSelect } from "@/app/components/account-select";
import { EXPENSE_ACCOUNT_GROUPS } from "@/app/lib/account-select-groups";
import { BudgetSelect } from "@/app/components/budget-select";
import { CategorySelect } from "@/app/components/financial/category-select";
import { useFinancialCategories } from "@/app/components/financial/use-financial-categories";
import { DeleteButton, NativeSelect } from "@/app/components/financial/form-controls";
import { TypeToggle } from "@/app/components/type-toggle";
import { readApiErrorMessage } from "@/app/lib/api-error";
import { formatLedgerDate } from "@/app/lib/format-dates";
import { centsToInputString, isPositiveAmount, parseAmount } from "@/app/lib/decimal-input";
import type { CurrencyCode } from "@amigo/db";
import { AuditHistoryPanel } from "@/app/components/audit-history-panel";
import { useToast } from "@/app/components/toast-provider";
import { useLocale } from "@/app/lib/use-locale";
import { useT } from "@/app/i18n";
import { enableReminderNotifications } from "@/app/lib/push/client";
import {
  hasNewRecurringReminderSchedules,
  MAX_RECURRING_REMINDERS,
  RecurringReminderError,
  recurringReminderDrafts,
  recurringReminderPayload,
  recurringReminderOccurrenceDate,
  rebaseRecurringReminderDrafts,
  shiftReminderDate,
  type RecurringReminderDraft,
  type RecurringReminderSchedule,
} from "@/app/lib/recurring-reminder-schedules";

type SchedulePreset =
  | "daily"
  | "weekly"
  | "biweekly"
  | "monthly-1"
  | "monthly-15"
  | "monthly-last"
  | "monthly-same"
  | "yearly"
  | "custom";

export interface RecurringFormData {
  type: "income" | "expense";
  amount: string;
  currency: string;
  categoryId: string;
  description: string;
  schedulePreset: SchedulePreset;
  customFrequency: "DAILY" | "WEEKLY" | "MONTHLY";
  customInterval: string;
  customDayOfMonth: string;
  startDate: string;
  endDate: string;
  budgetId: string | null;
  accountId: string | null;
  reminderSchedules: RecurringReminderDraft[];
  /** Reference date used to preserve reminder timing when the recurrence changes. */
  reminderOccurrenceDate?: string;
}

interface RecurringRule {
  id: string;
  amount: number;
  currency: CurrencyCode;
  categoryId: string | null;
  category: string;
  description: string | null;
  type: "income" | "expense";
  frequency: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
  interval: number;
  dayOfMonth: number | null;
  dayOfWeek: number | null;
  startDate: string;
  endDate: string | null;
  budgetId: string | null;
  accountId: string | null;
  reminderSchedules?: RecurringReminderSchedule[];
}

export function localDateString(timeZone: string): string {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date()).map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function emptyForm(currency: CurrencyCode, timeZone: string): RecurringFormData {
  const form: RecurringFormData = {
    type: "expense",
    amount: "",
    currency,
    categoryId: "",
    description: "",
    schedulePreset: "monthly-1",
    customFrequency: "MONTHLY",
    customInterval: "1",
    customDayOfMonth: "1",
    startDate: localDateString(timeZone),
    endDate: "",
    budgetId: null,
    accountId: null,
    reminderSchedules: [],
  };
  return { ...form, reminderOccurrenceDate: recurringFormOccurrenceDate(form, localDateString(timeZone)) };
}

function canSubmit(form: RecurringFormData): boolean {
  return isPositiveAmount(form.amount) && Boolean(form.categoryId && form.startDate);
}

function presetToSchedule(preset: SchedulePreset, form: RecurringFormData) {
  switch (preset) {
    case "daily":
      return { frequency: "DAILY" as const, interval: 1, dayOfMonth: null, dayOfWeek: null };
    case "weekly":
      return { frequency: "WEEKLY" as const, interval: 1, dayOfMonth: null, dayOfWeek: new Date(form.startDate + "T00:00:00").getDay() };
    case "biweekly":
      return { frequency: "WEEKLY" as const, interval: 2, dayOfMonth: null, dayOfWeek: new Date(form.startDate + "T00:00:00").getDay() };
    case "monthly-1":
      return { frequency: "MONTHLY" as const, interval: 1, dayOfMonth: 1, dayOfWeek: null };
    case "monthly-15":
      return { frequency: "MONTHLY" as const, interval: 1, dayOfMonth: 15, dayOfWeek: null };
    case "monthly-last":
      return { frequency: "MONTHLY" as const, interval: 1, dayOfMonth: 31, dayOfWeek: null };
    case "monthly-same":
      return {
        frequency: "MONTHLY" as const,
        interval: 1,
        dayOfMonth: new Date(form.startDate + "T00:00:00").getDate(),
        dayOfWeek: null,
      };
    case "yearly":
      return { frequency: "YEARLY" as const, interval: 1, dayOfMonth: null, dayOfWeek: null };
    case "custom":
      return {
        frequency: form.customFrequency,
        interval: parseInt(form.customInterval, 10) || 1,
        dayOfMonth: form.customFrequency === "MONTHLY" ? (parseInt(form.customDayOfMonth, 10) || 1) : null,
        dayOfWeek: null,
      };
  }
}

export function recurringFormOccurrenceDate(
  form: RecurringFormData,
  today: string
): string {
  return recurringReminderOccurrenceDate({
    ...presetToSchedule(form.schedulePreset, form),
    startDate: form.startDate,
    endDate: form.endDate || null,
  }, today);
}

export function rebaseRecurringFormReminders(
  form: RecurringFormData,
  occurrenceDate: string
): RecurringFormData {
  // Native date inputs become blank while editing. Keep the last valid anchor.
  if (!occurrenceDate || form.reminderOccurrenceDate === occurrenceDate) return form;
  return {
    ...form,
    reminderOccurrenceDate: occurrenceDate,
    reminderSchedules: form.reminderOccurrenceDate
      ? rebaseRecurringReminderDrafts(form.reminderSchedules, form.reminderOccurrenceDate, occurrenceDate)
      : form.reminderSchedules,
  };
}

function RecurringFields({
  form,
  setForm,
  timeZone,
  initialBudgetSuggest = true,
  budgetSuggestScopeRef,
  homeCurrency,
  savedExpenseAccountId = null,
}: {
  form: RecurringFormData;
  setForm: React.Dispatch<React.SetStateAction<RecurringFormData>>;
  timeZone: string;
  /** When false, category changes won't overwrite an existing budget until the user picks a category. */
  initialBudgetSuggest?: boolean;
  /** When set, budget suggestions are ignored after this ref's value changes (e.g. edit dialog rule switch). */
  budgetSuggestScopeRef?: React.RefObject<string | null | undefined>;
  homeCurrency: CurrencyCode;
  /** Saved expense-rule account that stays listed even when it is outside the expense groups. */
  savedExpenseAccountId?: string | null;
}) {
  const t = useT();
  const locale = useLocale();
  const { categories } = useFinancialCategories();
  const [allowBudgetSuggest, setAllowBudgetSuggest] = useState(initialBudgetSuggest);
  const budgetSuggestRequestSeq = useRef(0);
  const amountId = useId();
  const currencyId = useId();
  const categoryFieldId = useId();
  const descriptionId = useId();
  const scheduleId = useId();
  const frequencyId = useId();
  const intervalId = useId();
  const intervalUnitId = useId();
  const dayOfMonthId = useId();
  const startDateId = useId();
  const endDateId = useId();
  const budgetFieldId = useId();
  const accountFieldId = useId();
  const occurrenceDate = recurringFormOccurrenceDate(form, localDateString(timeZone));
  const onAccountChange = useCallback((accountId: string | null) => {
    setForm((current) => ({ ...current, accountId }));
  }, [setForm]);

  useEffect(() => {
    setForm((previous) => rebaseRecurringFormReminders(previous, occurrenceDate));
  }, [occurrenceDate, setForm]);

  const selectType = (type: "income" | "expense") =>
    setForm((f) => {
      if (type === f.type) return f;
      return {
        ...f,
        type,
        categoryId: "",
        budgetId: type === "expense" ? f.budgetId : null,
      };
    });

  useEffect(() => {
    setAllowBudgetSuggest(initialBudgetSuggest);
  }, [initialBudgetSuggest]);

  useEffect(() => {
    const requestSeq = ++budgetSuggestRequestSeq.current;
    if (form.type !== "expense" || !allowBudgetSuggest || !form.categoryId) return;
    const requestedCategoryId = form.categoryId;
    const scopeAtRequest = budgetSuggestScopeRef?.current;
    const ac = new AbortController();
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const res = await fetch(
            `/api/budgets/match-category?${new URLSearchParams({
              categoryId: requestedCategoryId,
            })}`,
            { signal: ac.signal }
          );
          if (!res.ok) return;
          const data = (await res.json()) as { budgetId: string | null };
          if (requestSeq !== budgetSuggestRequestSeq.current) return;
          if (
            budgetSuggestScopeRef &&
            scopeAtRequest !== budgetSuggestScopeRef.current
          ) {
            return;
          }
          setForm((f) =>
            f.type === "expense" && f.categoryId === requestedCategoryId
              ? { ...f, budgetId: data.budgetId ?? null }
              : f
          );
        } catch {
          /* aborted */
        }
      })();
    }, 200);
    return () => {
      ac.abort();
      clearTimeout(timer);
    };
  }, [form.categoryId, form.type, allowBudgetSuggest, setForm, budgetSuggestScopeRef]);

  return (
    <>
      <TypeToggle
        label={t.transactions.typeLabel}
        options={[
          { value: "expense", label: t.common.expense },
          { value: "income", label: t.common.income },
        ] as const}
        value={form.type}
        onChange={selectType}
      />

      <div className="grid grid-cols-[minmax(0,1fr)_5.75rem] gap-3">
        <div className="min-w-0 space-y-1.5">
          <label htmlFor={amountId} className="text-sm font-semibold">
            {t.common.amount}
          </label>
          <AmountInput
            id={amountId}
            currency={form.currency as CurrencyCode}
            positive
            value={form.amount}
            onValueChange={(amount) => setForm((f) => ({ ...f, amount }))}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor={currencyId} className="text-sm font-semibold">
            {t.common.currency}
          </label>
          <CurrencySelect
            id={currencyId}
            compact
            value={form.currency}
            onChange={(v) => setForm((f) => ({ ...f, currency: v }))}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor={categoryFieldId} className="text-sm font-semibold">
          {t.common.category}
        </label>
        <CategorySelect
          id={categoryFieldId}
          value={form.categoryId}
          onChange={(categoryId) => {
            setAllowBudgetSuggest(true);
            setForm((f) => ({ ...f, categoryId, budgetId: null }));
          }}
          type={form.type}
          categories={categories}
        />
      </div>
      <div className="space-y-1.5">
        <label htmlFor={descriptionId} className="text-sm font-semibold">
          {t.common.descriptionOptional}
        </label>
        <Input
          id={descriptionId}
          value={form.description}
          onChange={(e) =>
            setForm((f) => ({ ...f, description: e.target.value }))
          }
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor={scheduleId} className="text-sm font-semibold">
          {t.recurring.schedule}
        </label>
        <NativeSelect
          id={scheduleId}
          value={form.schedulePreset}
          onChange={(e) =>
            setForm((f) => ({
              ...f,
              schedulePreset: e.target.value as SchedulePreset,
            }))
          }
        >
          <option value="daily">{t.recurring.presets.daily}</option>
          <option value="weekly">{t.recurring.presets.weekly}</option>
          <option value="biweekly">{t.recurring.presets.biweekly}</option>
          <option value="monthly-1">{t.recurring.presets.monthly1}</option>
          <option value="monthly-15">{t.recurring.presets.monthly15}</option>
          <option value="monthly-last">{t.recurring.presets.monthlyLast}</option>
          <option value="monthly-same">{t.recurring.presets.monthlySame}</option>
          <option value="yearly">{t.recurring.presets.yearly}</option>
          <option value="custom">{t.recurring.presets.custom}</option>
        </NativeSelect>
      </div>

      {form.schedulePreset === "custom" && (
        <div className="space-y-3 rounded-xl border border-border p-3">
          <div className="space-y-1.5">
            <label htmlFor={frequencyId} className="text-sm font-semibold">
              {t.recurring.frequency}
            </label>
            <NativeSelect
              id={frequencyId}
              value={form.customFrequency}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  customFrequency: e.target.value as "DAILY" | "WEEKLY" | "MONTHLY",
                }))
              }
            >
              <option value="DAILY">{t.common.frequencies.DAILY}</option>
              <option value="WEEKLY">{t.common.frequencies.WEEKLY}</option>
              <option value="MONTHLY">{t.common.frequencies.MONTHLY}</option>
            </NativeSelect>
          </div>
          <div className="space-y-1.5">
            <label htmlFor={intervalId} className="text-sm font-semibold">
              {t.recurring.repeatEvery}
            </label>
            <div className="flex items-center gap-2">
              <Input
                id={intervalId}
                type="number"
                min="1"
                value={form.customInterval}
                onChange={(e) =>
                  setForm((f) => ({ ...f, customInterval: e.target.value }))
                }
                aria-describedby={intervalUnitId}
                className="w-24"
              />
              <span id={intervalUnitId} className="text-sm text-muted-foreground">
                {t.recurring.units[form.customFrequency]}
              </span>
            </div>
          </div>
          {form.customFrequency === "MONTHLY" && (
            <div className="space-y-1.5">
              <label htmlFor={dayOfMonthId} className="text-sm font-semibold">
                {t.recurring.dayOfMonth}
              </label>
              <Input
                id={dayOfMonthId}
                type="number"
                min="1"
                max="31"
                value={form.customDayOfMonth}
                onChange={(e) =>
                  setForm((f) => ({ ...f, customDayOfMonth: e.target.value }))
                }
              />
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label htmlFor={startDateId} className="text-sm font-semibold">
            {t.recurring.startDate}
          </label>
          <Input
            id={startDateId}
            type="date"
            value={form.startDate}
            onChange={(e) =>
              setForm((f) => ({ ...f, startDate: e.target.value }))
            }
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor={endDateId} className="text-sm font-semibold">
            {t.recurring.endDateOptional}
          </label>
          <Input
            id={endDateId}
            type="date"
            value={form.endDate}
            onChange={(e) =>
              setForm((f) => ({ ...f, endDate: e.target.value }))
            }
          />
        </div>
      </div>

      {form.type === "expense" && (
        <div className="space-y-1.5">
          <label htmlFor={budgetFieldId} className="text-sm font-semibold">
            {t.transactions.budgetOptional}
          </label>
          <BudgetSelect
            id={budgetFieldId}
            value={form.budgetId}
            onChange={(v) => {
              setAllowBudgetSuggest(false);
              budgetSuggestRequestSeq.current += 1;
              setForm((f) => ({ ...f, budgetId: v }));
            }}
          />
        </div>
      )}

      <div className="space-y-1.5">
        <label htmlFor={accountFieldId} className="text-sm font-semibold">
          {t.transactions.account}
        </label>
        <AccountSelect
          id={accountFieldId}
          value={form.accountId}
          onChange={onAccountChange}
          homeCurrency={homeCurrency}
          groups={form.type === "expense" ? EXPENSE_ACCOUNT_GROUPS : undefined}
          keepId={savedExpenseAccountId}
        />
      </div>

      <fieldset className="space-y-3 rounded-lg border border-border p-3">
        <legend className="px-1 text-sm font-semibold">{t.recurring.reminders}</legend>
        <p className="text-xs text-muted-foreground">{t.recurring.remindersHint(timeZone)}</p>
        {occurrenceDate && (
          <p className="text-xs text-muted-foreground">
            {t.recurring.reminderReference} <span className="font-mono">{formatLedgerDate(occurrenceDate, locale)}</span>
          </p>
        )}
        {form.reminderSchedules.map((reminder, index) => (
          <div key={index} className="grid grid-cols-[minmax(0,1fr)_2.5rem] items-end gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(9rem,1fr)_2.5rem]">
            <div className="col-span-2 min-w-0 space-y-1 sm:col-span-1">
              <label className="block text-xs text-muted-foreground" htmlFor={`${scheduleId}-reminder-date-${index}`}>
                {t.common.date}
              </label>
              <Input id={`${scheduleId}-reminder-date-${index}`} type="date" required
                value={reminder.date} className="min-w-0"
                aria-label={t.recurring.reminderDateNumber(index + 1)}
                onChange={(event) => {
                  const date = event.target.value;
                  setForm((previous) => ({ ...previous,
                    reminderSchedules: previous.reminderSchedules.map((saved, i) => i === index ? { ...saved, date } : saved),
                  }));
                }} />
            </div>
            <div className="min-w-0 space-y-1">
              <label className="block text-xs text-muted-foreground" htmlFor={`${scheduleId}-reminder-time-${index}`}>
                {t.recurring.reminderTime}
              </label>
              <Input id={`${scheduleId}-reminder-time-${index}`} type="time" step="60" required value={reminder.time}
                className="min-w-0"
                aria-label={t.recurring.reminderTimeNumber(index + 1)}
                onChange={(event) => {
                  const time = event.target.value;
                  setForm((previous) => ({ ...previous,
                    reminderSchedules: previous.reminderSchedules.map((saved, i) => i === index ? { ...saved, time } : saved),
                  }));
                }} />
            </div>
            <Button type="button" variant="outline" size="icon"
              aria-label={t.recurring.removeReminder(index + 1)}
              onClick={() => setForm((previous) => ({ ...previous,
                reminderSchedules: previous.reminderSchedules.filter((_, i) => i !== index),
              }))}>
              <X aria-hidden />
            </Button>
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm"
            disabled={!occurrenceDate || form.reminderSchedules.length >= MAX_RECURRING_REMINDERS}
            onClick={() => setForm((previous) => ({ ...previous,
              reminderSchedules: [...previous.reminderSchedules, { date: occurrenceDate, time: "09:00" }],
            }))}>
            {t.recurring.addReminder}
          </Button>
          <Button type="button" variant="outline" size="sm"
            disabled={!occurrenceDate || form.reminderSchedules.length >= MAX_RECURRING_REMINDERS}
            onClick={() => setForm((previous) => ({ ...previous,
              reminderSchedules: [...previous.reminderSchedules, { date: shiftReminderDate(occurrenceDate, -1), time: "09:00" }],
            }))}>
            {t.recurring.dayBeforeReminder}
          </Button>
        </div>
      </fieldset>
    </>
  );
}

export function recurringRequestBody(form: RecurringFormData, today: string) {
  const occurrenceDate = recurringFormOccurrenceDate(form, today);
  const reminders = form.reminderOccurrenceDate && form.reminderOccurrenceDate !== occurrenceDate
    ? rebaseRecurringReminderDrafts(form.reminderSchedules, form.reminderOccurrenceDate, occurrenceDate)
    : form.reminderSchedules;
  const schedule = presetToSchedule(form.schedulePreset, form);
  return {
    type: form.type,
    // API expects dollars; server applies toCents() (same contract as transactions).
    amount: parseAmount(form.amount),
    currency: form.currency,
    categoryId: form.categoryId,
    description: form.description || null,
    frequency: schedule.frequency,
    interval: schedule.interval,
    dayOfMonth: schedule.dayOfMonth,
    dayOfWeek: schedule.dayOfWeek,
    startDate: form.startDate,
    endDate: form.endDate || null,
    budgetId: form.type === "expense" ? form.budgetId : null,
    accountId: form.accountId,
    reminderSchedules: recurringReminderPayload(reminders, occurrenceDate),
  };
}

// ── Add Dialog ──────────────────────────────────────────────────────────────

interface AddRecurringDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultCurrency?: CurrencyCode;
  timeZone: string;
}

export function AddRecurringDialog({
  open,
  onOpenChange,
  defaultCurrency = "CAD",
  timeZone,
}: AddRecurringDialogProps) {
  const t = useT();
  const toast = useToast();
  const revalidator = useRevalidator();
  const [form, setForm] = useState<RecurringFormData>(() => emptyForm(defaultCurrency, timeZone));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleOpenChange(next: boolean) {
    if (!next) {
      setForm(emptyForm(defaultCurrency, timeZone));
      setError(null);
    }
    onOpenChange(next);
  }

  async function handleSubmit() {
    if (submitting || !canSubmit(form)) return;
    setSubmitting(true);
    setError(null);
    try {
      const body = recurringRequestBody(form, localDateString(timeZone));
      // Start permission setup directly from the submit gesture, before any other await.
      const notificationSetup = hasNewRecurringReminderSchedules(body.reminderSchedules)
        ? enableReminderNotifications("recurringNotifications")
        : null;
      const res = await fetch("/api/recurring", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setError(
          (await readApiErrorMessage(res)) ?? t.common.couldNot(t.recurring.addAction)
        );
        return;
      }
      setForm(emptyForm(defaultCurrency, timeZone));
      onOpenChange(false);
      revalidator.revalidate();
      void notificationSetup?.then((failure) => {
        if (!failure) return;
        toast(t.notifications.reminderSetupFailed(failure.step, t.notifications.reason[failure.code]), { variant: "error" });
      });
    } catch (err) {
      setError(err instanceof RecurringReminderError
        ? t.recurring.reminderErrors[err.code]
        : t.common.couldNotConnection(t.recurring.addAction));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog key={defaultCurrency} open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{t.recurring.addTitle}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleSubmit();
          }}
          className="space-y-4"
        >
          <RecurringFields
            form={form}
            setForm={setForm}
            timeZone={timeZone}
            homeCurrency={defaultCurrency}
          />
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={submitting}
            >
              {t.common.cancel}
            </Button>
            <Button type="submit" disabled={submitting || !canSubmit(form)}>
              {submitting ? t.common.adding : t.recurring.add}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Edit Dialog ─────────────────────────────────────────────────────────────

interface EditRecurringDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rule: RecurringRule | null;
  onDelete: () => void;
  deleting: boolean;
  timeZone: string;
  homeCurrency: CurrencyCode;
}

function ruleToPreset(rule: RecurringRule): SchedulePreset {
  if (rule.frequency === "DAILY" && rule.interval === 1) return "daily";
  if (rule.frequency === "WEEKLY" && rule.interval === 1) return "weekly";
  if (rule.frequency === "WEEKLY" && rule.interval === 2) return "biweekly";
  if (rule.frequency === "MONTHLY" && rule.interval === 1) {
    if (rule.dayOfMonth === 1) return "monthly-1";
    if (rule.dayOfMonth === 15) return "monthly-15";
    if (rule.dayOfMonth === 31) return "monthly-last";
    return rule.dayOfMonth === Number(rule.startDate.slice(8, 10)) ? "monthly-same" : "custom";
  }
  if (rule.frequency === "YEARLY" && rule.interval === 1) return "yearly";
  return "custom";
}

function ruleToForm(rule: RecurringRule, locale: string, timeZone: string): RecurringFormData {
  const preset = ruleToPreset(rule);
  const form: RecurringFormData = {
    type: rule.type,
    amount: centsToInputString(rule.amount, rule.currency, locale),
    currency: rule.currency,
    categoryId: rule.categoryId ?? "",
    description: rule.description ?? "",
    schedulePreset: preset,
    customFrequency: rule.frequency === "YEARLY" ? "MONTHLY" : (rule.frequency as "DAILY" | "WEEKLY" | "MONTHLY"),
    customInterval: String(rule.interval),
    customDayOfMonth: String(rule.dayOfMonth ?? 1),
    startDate: rule.startDate,
    endDate: rule.endDate ?? "",
    budgetId: rule.budgetId,
    accountId: rule.accountId,
    reminderSchedules: [],
  };
  const occurrenceDate = recurringFormOccurrenceDate(form, localDateString(timeZone));
  return {
    ...form,
    reminderOccurrenceDate: occurrenceDate,
    reminderSchedules: recurringReminderDrafts(rule.reminderSchedules ?? [], occurrenceDate),
  };
}

export function EditRecurringDialog({
  open,
  onOpenChange,
  rule,
  onDelete,
  deleting,
  timeZone,
  homeCurrency,
}: EditRecurringDialogProps) {
  const t = useT();
  const toast = useToast();
  const locale = useLocale();
  const revalidator = useRevalidator();
  const [form, setForm] = useState<RecurringFormData>(() =>
    emptyForm(rule?.currency ?? "CAD", timeZone)
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [initialized, setInitialized] = useState<string | null>(null);
  const budgetSuggestScopeRef = useRef<string | null>(rule?.id ?? null);
  budgetSuggestScopeRef.current = rule?.id ?? null;

  // Sync form state when the rule changes
  if (rule && initialized !== rule.id) {
    setForm(ruleToForm(rule, locale, timeZone));
    setError(null);
    setInitialized(rule.id);
  }
  if (!rule && initialized !== null) {
    setInitialized(null);
  }

  const busy = submitting || deleting;

  async function handleSubmit() {
    if (!rule || busy || !canSubmit(form)) return;
    setSubmitting(true);
    setError(null);
    try {
      const body = recurringRequestBody(form, localDateString(timeZone));
      // Start permission setup directly from the submit gesture, before any other await.
      const notificationSetup = hasNewRecurringReminderSchedules(body.reminderSchedules, rule.reminderSchedules ?? [])
        ? enableReminderNotifications("recurringNotifications")
        : null;
      const res = await fetch(`/api/recurring/${rule.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setError(
          (await readApiErrorMessage(res)) ?? t.common.couldNot(t.recurring.saveAction)
        );
        return;
      }
      onOpenChange(false);
      revalidator.revalidate();
      void notificationSetup?.then((failure) => {
        if (!failure) return;
        toast(t.notifications.reminderSetupFailed(failure.step, t.notifications.reason[failure.code]), { variant: "error" });
      });
    } catch (err) {
      setError(err instanceof RecurringReminderError
        ? t.recurring.reminderErrors[err.code]
        : t.common.couldNotConnection(t.recurring.saveAction));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{t.recurring.editTitle}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleSubmit();
          }}
          className="space-y-4"
        >
          <RecurringFields
            key={rule?.id ?? "none"}
            form={form}
            setForm={setForm}
            timeZone={timeZone}
            initialBudgetSuggest={false}
            budgetSuggestScopeRef={budgetSuggestScopeRef}
            homeCurrency={homeCurrency}
            savedExpenseAccountId={rule?.type === "expense" ? rule.accountId : null}
          />
          {rule ? (
            <AuditHistoryPanel
              recordId={rule.id}
              table="recurring_transactions"
            />
          ) : null}
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          <DialogFooter>
            <DeleteButton onClick={onDelete} disabled={busy} className="sm:mr-auto">
              <Trash2 />
              {deleting ? t.common.deleting : t.common.delete}
            </DeleteButton>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={busy}
            >
              {t.common.cancel}
            </Button>
            <Button type="submit" disabled={busy || !canSubmit(form)}>
              {submitting ? t.common.saving : t.recurring.save}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
