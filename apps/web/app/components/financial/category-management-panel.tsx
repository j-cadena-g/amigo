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

const CATEGORY_TYPE_OPTIONS = [
  { value: "expense", label: "Expense" },
  { value: "income", label: "Income" },
] as const;

export function CategoryManagementPanel() {
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
        setFeedback(parseApiError(body, "Couldn't add the category. Try again."));
        return;
      }
      setName("");
      setParentCategoryId("");
      await reload();
    } catch {
      setFeedback("Couldn't add the category. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleArchive(categoryId: string) {
    const confirmed = await confirm({
      title: "Archive category?",
      description:
        "It and its subcategories will disappear from pickers. Existing transactions keep their category history.",
      confirmText: "Archive",
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
        setFeedback(parseApiError(body, "Couldn't archive the category. Try again."));
        return;
      }
      await reload();
    } catch {
      setFeedback("Couldn't archive the category. Check your connection and try again.");
    }
  }

  async function handleDelete(categoryId: string) {
    const confirmed = await confirm({
      title: "Remove category?",
      description:
        "If it's used by transactions or recurring rules, it will be archived instead so history is preserved. Otherwise it and its subcategories are permanently removed.",
      confirmText: "Remove",
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
        setFeedback(parseApiError(body, "Couldn't remove the category. Try again."));
        return;
      }
      await reload();
    } catch {
      setFeedback("Couldn't remove the category. Check your connection and try again.");
    }
  }

  return (
    <div className="space-y-5">
      <form onSubmit={handleCreate} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <div className="space-y-1.5">
            <label htmlFor={nameId} className="text-sm font-semibold">
              Name
            </label>
            <Input
              id={nameId}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Streaming"
            />
          </div>
          <TypeToggle
            label="Category type"
            options={CATEGORY_TYPE_OPTIONS}
            value={type}
            onChange={selectType}
          />
        </div>
        {parentOptions.length > 0 ? (
          <div className="space-y-1.5">
            <label htmlFor={parentId} className="text-sm font-semibold">
              Parent category (optional)
            </label>
            <NativeSelect
              id={parentId}
              value={parentCategoryId}
              onChange={(e) => setParentCategoryId(e.target.value)}
            >
              <option value="">None (top level)</option>
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
          {submitting ? "Adding…" : "Add category"}
        </Button>
      </form>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading categories…</p>
      ) : error ? (
        <p className="text-sm text-destructive" role="alert">{error}</p>
      ) : tree.length === 0 ? (
        <p className="text-sm text-muted-foreground">No categories yet.</p>
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
          {type === "income" ? "Income" : "Expense"}
          {archived ? " · Archived" : ""}
        </p>
      </div>
      {!archived ? (
        <div className="flex shrink-0 gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onArchive}
            aria-label={`Archive ${name}`}
          >
            Archive
          </Button>
          <DeleteButton size="sm" onClick={onDelete} aria-label={`Remove ${name}`}>
            Remove
          </DeleteButton>
        </div>
      ) : null}
    </li>
  );
}
