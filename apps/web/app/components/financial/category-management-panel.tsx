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
import type {
  FinancialCategoryItem,
  FinancialCategoryType,
} from "@/app/lib/financial-category-types";
import { cn } from "@/app/lib/utils";
import { useT } from "@/app/i18n";

export function CategoryManagementPanel() {
  const t = useT();
  const nameId = useId();
  const descriptionId = useId();
  const descriptionHintId = useId();
  const parentId = useId();
  const confirm = useConfirm();
  const { categories, loading, error, reload } = useFinancialCategories({
    includeArchived: true,
  });
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<FinancialCategoryType>("expense");
  const [parentCategoryId, setParentCategoryId] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [savingDescription, setSavingDescription] = useState(false);

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
          description: description.trim() || null,
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
      setDescription("");
      setParentCategoryId("");
      await reload();
    } catch {
      setFeedback(t.common.couldNotConnection(t.categories.addAction));
    } finally {
      setSubmitting(false);
    }
  }

  function beginDescriptionEdit(category: FinancialCategoryItem) {
    setEditingId(category.id);
    setDescriptionDraft(category.description ?? "");
    setFeedback(null);
  }

  function cancelDescriptionEdit() {
    setEditingId(null);
    setDescriptionDraft("");
    setFeedback(null);
  }

  async function saveDescription(categoryId: string) {
    if (savingDescription) return;
    setSavingDescription(true);
    setFeedback(null);
    try {
      const res = await fetch(`/api/categories/${categoryId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: descriptionDraft.trim() || null }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
          message?: string;
        } | null;
        setFeedback(
          parseApiError(body, t.common.couldNot(t.categories.saveDescriptionAction))
        );
        return;
      }
      setEditingId(null);
      setDescriptionDraft("");
      await reload();
    } catch {
      setFeedback(t.common.couldNotConnection(t.categories.saveDescriptionAction));
    } finally {
      setSavingDescription(false);
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
        <div className="space-y-1.5">
          <label htmlFor={descriptionId} className="text-sm font-semibold">
            {t.common.description}
          </label>
          <Input
            id={descriptionId}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={300}
            aria-describedby={descriptionHintId}
          />
          <p id={descriptionHintId} className="text-xs text-muted-foreground">
            {t.categories.descriptionHint}
          </p>
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
              category={row.parent}
              editing={editingId === row.parent.id}
              draft={descriptionDraft}
              saving={savingDescription}
              onDraftChange={setDescriptionDraft}
              onStartEdit={() => beginDescriptionEdit(row.parent)}
              onCancelEdit={cancelDescriptionEdit}
              onSaveDescription={() => void saveDescription(row.parent.id)}
              onArchive={() => void handleArchive(row.parent.id)}
              onDelete={() => void handleDelete(row.parent.id)}
            />,
            ...row.children.map((child) => (
              <CategoryRow
                key={child.id}
                category={child}
                nested
                editing={editingId === child.id}
                draft={descriptionDraft}
                saving={savingDescription}
                onDraftChange={setDescriptionDraft}
                onStartEdit={() => beginDescriptionEdit(child)}
                onCancelEdit={cancelDescriptionEdit}
                onSaveDescription={() => void saveDescription(child.id)}
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
  category,
  nested,
  editing,
  draft,
  saving,
  onDraftChange,
  onStartEdit,
  onCancelEdit,
  onSaveDescription,
  onArchive,
  onDelete,
}: {
  category: FinancialCategoryItem;
  nested?: boolean;
  editing: boolean;
  draft: string;
  saving: boolean;
  onDraftChange: (value: string) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveDescription: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const t = useT();
  const { name, type, archived, description } = category;

  if (editing) {
    return (
      <li className={cn("min-w-0 space-y-2 py-2", nested && "pl-5")}>
        <p className="truncate text-sm font-semibold">{name}</p>
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            onSaveDescription();
          }}
        >
          <Input
            value={draft}
            onChange={(e) => onDraftChange(e.target.value)}
            maxLength={300}
            autoFocus
            disabled={saving}
            aria-label={t.categories.editDescriptionNamed(name)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                onCancelEdit();
              }
            }}
          />
          <div className="flex flex-wrap gap-1">
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? t.common.saving : t.common.save}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onCancelEdit}
              disabled={saving}
            >
              {t.common.cancel}
            </Button>
          </div>
        </form>
      </li>
    );
  }

  return (
    <li
      className={cn(
        "flex flex-wrap items-start justify-between gap-x-3 gap-y-2 py-2",
        nested && "pl-5",
        archived && "text-muted-foreground"
      )}
    >
      <div className="min-w-0 w-full sm:w-auto sm:flex-1">
        <p className="truncate text-sm font-semibold">{name}</p>
        {description ? (
          <p className="truncate text-xs text-muted-foreground">{description}</p>
        ) : null}
        <p className="text-xs text-muted-foreground">
          {type === "income" ? t.common.income : t.common.expense}
          {archived ? ` · ${t.categories.archived}` : ""}
        </p>
      </div>
      {!archived ? (
        <div className="flex max-w-full flex-wrap gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onStartEdit}
            aria-label={t.categories.editDescriptionNamed(name)}
          >
            {t.categories.editDescription}
          </Button>
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
