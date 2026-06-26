import { useId, useState } from "react";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import {
  buildCategoryTree,
  useFinancialCategories,
} from "@/app/components/financial/use-financial-categories";
import { parseApiError } from "@/app/lib/parse-api-error";
import type { FinancialCategoryType } from "@/app/lib/financial-category-types";

export function CategoryManagementPanel() {
  const nameId = useId();
  const typeId = useId();
  const parentId = useId();
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
        setFeedback(parseApiError(body, "Failed to create category"));
        return;
      }
      setName("");
      setParentCategoryId("");
      await reload();
    } catch {
      setFeedback("Network error — could not create category");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleArchive(categoryId: string) {
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
        setFeedback(parseApiError(body, "Failed to archive category"));
        return;
      }
      await reload();
    } catch {
      setFeedback("Network error — could not archive category");
    }
  }

  async function handleDelete(categoryId: string) {
    setFeedback(null);
    try {
      const res = await fetch(`/api/categories/${categoryId}`, { method: "DELETE" });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
          message?: string;
        } | null;
        setFeedback(parseApiError(body, "Failed to remove category"));
        return;
      }
      await reload();
    } catch {
      setFeedback("Network error — could not remove category");
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleCreate} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor={nameId} className="text-sm font-medium">
              Name
            </label>
            <Input
              id={nameId}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Streaming"
            />
          </div>
          <div>
            <label htmlFor={typeId} className="text-sm font-medium">
              Type
            </label>
            <select
              id={typeId}
              value={type}
              onChange={(e) => {
                setType(e.target.value as FinancialCategoryType);
                setParentCategoryId("");
              }}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="expense">Expense</option>
              <option value="income">Income</option>
            </select>
          </div>
        </div>
        {parentOptions.length > 0 ? (
          <div>
            <label htmlFor={parentId} className="text-sm font-medium">
              Parent category (optional)
            </label>
            <select
              id={parentId}
              value={parentCategoryId}
              onChange={(e) => setParentCategoryId(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">Top-level category</option>
              {parentOptions.map((row) => (
                <option key={row.parent.id} value={row.parent.id}>
                  {row.parent.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <Button type="submit" size="sm" disabled={submitting || !name.trim()}>
          Add category
        </Button>
      </form>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading categories…</p>
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : (
        <div className="space-y-3">
          {tree.length === 0 ? (
            <p className="text-sm text-muted-foreground">No categories yet.</p>
          ) : (
            tree.map((row) => (
              <div key={row.parent.id} className="space-y-1">
                <CategoryRow
                  name={row.parent.name}
                  type={row.parent.type}
                  archived={row.parent.archived}
                  onArchive={() => void handleArchive(row.parent.id)}
                  onDelete={() => void handleDelete(row.parent.id)}
                />
                {row.children.map((child) => (
                  <CategoryRow
                    key={child.id}
                    name={child.name}
                    type={child.type}
                    archived={child.archived}
                    nested
                    onArchive={() => void handleArchive(child.id)}
                    onDelete={() => void handleDelete(child.id)}
                  />
                ))}
              </div>
            ))
          )}
        </div>
      )}

      {feedback ? <p className="text-sm text-destructive">{feedback}</p> : null}
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
    <div
      className={`flex items-center justify-between gap-3 rounded-md border px-3 py-2 ${
        nested ? "ml-4" : ""
      } ${archived ? "opacity-60" : ""}`}
    >
      <div>
        <p className="text-sm font-medium">{name}</p>
        <p className="text-xs text-muted-foreground capitalize">
          {type}
          {archived ? " · archived" : ""}
        </p>
      </div>
      {!archived ? (
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onArchive}>
            Archive
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={onDelete}>
            Remove
          </Button>
        </div>
      ) : null}
    </div>
  );
}
