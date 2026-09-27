import { useId, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { useConfirm } from "@/app/components/confirm-provider";
import { TypeToggle } from "@/app/components/type-toggle";
import { DeleteButton, NativeSelect } from "@/app/components/financial/form-controls";
import {
  buildCategoryTree,
  useFinancialCategories,
} from "@/app/components/financial/use-financial-categories";
import { parseApiError } from "@/app/lib/parse-api-error";
import type { FinancialCategoryType } from "@/app/lib/financial-category-types";
import { cn } from "@/app/lib/utils";
import { useT } from "@/app/i18n";

export function CategoryManagementPanel() {
  const t = useT();
  const nameId = useId();
  const parentId = useId();
  const confirm = useConfirm();
  const { categories, loading, error, reload } = useFinancialCategories({
    includeArchived: true,
  });
  const [name, setName] = useState("");
  const [type, setType] = useState<FinancialCategoryType>("expense");
  const [parentCategoryId, setParentCategoryId] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const tree = buildCategoryTree(categories.filter((c) => !c.archived));
  const parentOptions = tree.filter((row) => row.parent.type === type);

  function selectType(next: FinancialCategoryType) {
    if (next === type) return;
    setType(next);
    setParentCategoryId("");
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          type,
          parentId: parentCategoryId || null,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
          message?: string;
        } | null;
        setFeedback(parseApiError(body, t.common.couldNot(t.categories.addAction)));
        return;
      }
      setName("");
      setParentCategoryId("");
      await reload();
    } catch {
      setFeedback(t.common.couldNotConnection(t.categories.addAction));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleArchive(categoryId: string) {
    const confirmed = await confirm({
      title: t.categories.archiveTitle,
      description: t.categories.archiveBody,
      confirmText: t.categories.archive,
    });
    if (!confirmed) return;
    setFeedback(null);
    try {
      const res = await fetch(`/api/categories/${categoryId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived: true }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
          message?: string;
        } | null;
        setFeedback(parseApiError(body, t.common.couldNot(t.categories.archiveAction)));
        return;
      }
      await reload();
    } catch {
      setFeedback(t.common.couldNotConnection(t.categories.archiveAction));
    }
  }

  async function handleDelete(categoryId: string) {
    const confirmed = await confirm({
      title: t.categories.removeTitle,
      description: t.categories.removeBody,
      confirmText: t.common.remove,
      variant: "destructive",
    });
    if (!confirmed) return;
    setFeedback(null);
    try {
      const res = await fetch(`/api/categories/${categoryId}`, { method: "DELETE" });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
          message?: string;
        } | null;
        setFeedback(parseApiError(body, t.common.couldNot(t.categories.removeAction)));
        return;
      }
      await reload();
    } catch {
      setFeedback(t.common.couldNotConnection(t.categories.removeAction));
    }
  }

  return (
    <div className="space-y-5">
      <form onSubmit={handleCreate} className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <div className="space-y-1.5">
            <label htmlFor={nameId} className="text-sm font-semibold">
              {t.common.name}
            </label>
            <Input
              id={nameId}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t.categories.namePlaceholder}
            />
          </div>
          <TypeToggle
            label={t.categories.typeLabel}
            options={[
              { value: "expense", label: t.common.expense },
              { value: "income", label: t.common.income },
            ] as const}
            value={type}
            onChange={selectType}
          />
        </div>
        {parentOptions.length > 0 ? (
          <div className="space-y-1.5">
            <label htmlFor={parentId} className="text-sm font-semibold">
              {t.categories.parentOptional}
            </label>
            <NativeSelect
              id={parentId}
              value={parentCategoryId}
              onChange={(e) => setParentCategoryId(e.target.value)}
            >
              <option value="">{t.categories.topLevel}</option>
              {parentOptions.map((row) => (
                <option key={row.parent.id} value={row.parent.id}>
                  {row.parent.name}
                </option>
              ))}
            </NativeSelect>
          </div>
        ) : null}
        <Button type="submit" size="sm" disabled={submitting || !name.trim()}>
          <Plus />
          {submitting ? t.common.adding : t.categories.add}
        </Button>
      </form>

      {loading ? (
        <p className="text-sm text-muted-foreground">{t.categories.loading}</p>
      ) : error ? (
        <p className="text-sm text-destructive" role="alert">{error}</p>
      ) : tree.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t.categories.none}</p>
      ) : (
        <ul className="divide-y divide-border border-t border-border">
          {tree.flatMap((row) => [
            <CategoryRow
              key={row.parent.id}
              name={row.parent.name}
              type={row.parent.type}
              archived={row.parent.archived}
              onArchive={() => void handleArchive(row.parent.id)}
              onDelete={() => void handleDelete(row.parent.id)}
            />,
            ...row.children.map((child) => (
              <CategoryRow
                key={child.id}
                name={child.name}
                type={child.type}
                archived={child.archived}
                nested
                onArchive={() => void handleArchive(child.id)}
                onDelete={() => void handleDelete(child.id)}
              />
            )),
          ])}
        </ul>
      )}

      {feedback ? <p className="text-sm text-destructive" role="alert">{feedback}</p> : null}
    </div>
  );
}

function CategoryRow({
  name,
  type,
  archived,
  nested,
  onArchive,
  onDelete,
}: {
  name: string;
  type: FinancialCategoryType;
  archived: boolean;
  nested?: boolean;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const t = useT();
  return (
    <li
      className={cn(
        "flex items-center justify-between gap-3 py-2",
        nested && "pl-5",
        archived && "text-muted-foreground"
      )}
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">{name}</p>
        <p className="text-xs text-muted-foreground">
          {type === "income" ? t.common.income : t.common.expense}
          {archived ? ` · ${t.categories.archived}` : ""}
        </p>
      </div>
      {!archived ? (
        <div className="flex shrink-0 gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onArchive}
            aria-label={t.categories.archiveNamed(name)}
          >
            {t.categories.archive}
          </Button>
          <DeleteButton size="sm" onClick={onDelete} aria-label={t.categories.removeNamed(name)}>
            {t.common.remove}
          </DeleteButton>
        </div>
      ) : null}
    </li>
  );
}
