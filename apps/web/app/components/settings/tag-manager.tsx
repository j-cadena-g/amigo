import { useRef, useState, type FormEvent } from "react";
import { Link, useRevalidator } from "react-router";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useConfirm } from "@/app/components/confirm-provider";
import { useToast } from "@/app/components/toast-provider";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { LedgerSection } from "@/app/components/ledger";
import { TagDot } from "@/app/components/groceries/tag-badge";
import { TagColorPicker } from "@/app/components/groceries/tag-color-picker";
import { tagColorKey, type TagColorKey } from "@/app/components/groceries/constants";
import { connectionFailedMessage, toastMutationFailure } from "@/app/lib/api-error";
import { useT } from "@/app/i18n";

export interface ManagedTag {
  id: string;
  name: string;
  color: string;
  itemCount: number;
}

const NEW_TAG = "new";

export function TagManager({ tags }: { tags: ManagedTag[] }) {
  const t = useT();
  const toast = useToast();
  const confirm = useConfirm();
  const revalidator = useRevalidator();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState<TagColorKey>("blue");
  // One tag mutation at a time (add, save, or delete), so an earlier request
  // can't unlock a later one and an add can't race a rename to the same name.
  const [busyId, setBusyId] = useState<string | null>(null);
  const busyRef = useRef(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState<TagColorKey>("blue");
  const [createError, setCreateError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  function closeAdd() {
    setAdding(false);
    setNewName("");
    setCreateError(null);
  }

  async function create(e: FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name || busyRef.current) return;
    if (tags.some((tag) => tag.name.toLowerCase() === name.toLowerCase())) {
      setCreateError(t.groceries.tags.duplicate(name));
      return;
    }
    busyRef.current = true;
    setBusyId(NEW_TAG);
    setCreateError(null);
    try {
      const res = await fetch("/api/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, color: newColor }),
      });
      if (!res.ok) {
        await toastMutationFailure(toast, res, t.groceries.actions.addTag, t.common);
        return;
      }
      revalidator.revalidate();
      // 200 means another member added the same name first.
      if (res.status !== 201) {
        setCreateError(t.groceries.tags.duplicate(name));
        return;
      }
      closeAdd();
    } catch {
      toast(connectionFailedMessage(t.common, t.groceries.actions.addTag), { variant: "error" });
    } finally {
      busyRef.current = false;
      setBusyId(null);
    }
  }

  function startEdit(tag: ManagedTag) {
    setEditingId(tag.id);
    setEditName(tag.name);
    setEditColor(tagColorKey(tag.color));
  }

  async function save(tag: ManagedTag) {
    const name = editName.trim();
    if (!name || busyRef.current) return;
    busyRef.current = true;
    setBusyId(tag.id);
    try {
      const res = await fetch(`/api/tags/${tag.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, color: editColor }),
      });
      if (!res.ok) {
        await toastMutationFailure(toast, res, t.groceries.actions.saveTag, t.common);
        return;
      }
      // Leave another tag's editor open if one was started mid-save.
      setEditingId((current) => (current === tag.id ? null : current));
      revalidator.revalidate();
    } catch {
      toast(connectionFailedMessage(t.common, t.groceries.actions.saveTag), { variant: "error" });
    } finally {
      busyRef.current = false;
      setBusyId(null);
    }
  }

  async function remove(tag: ManagedTag) {
    const ok = await confirm({
      title: t.groceries.tags.deleteTitle(tag.name),
      description: t.groceries.tags.deleteBody(tag.itemCount),
      confirmText: t.groceries.tags.delete,
      cancelText: t.common.cancel,
      variant: "destructive",
    });
    if (!ok || busyRef.current) return;
    busyRef.current = true;
    setBusyId(tag.id);
    try {
      const res = await fetch(`/api/tags/${tag.id}`, { method: "DELETE" });
      if (!res.ok) {
        await toastMutationFailure(toast, res, t.groceries.actions.deleteTag, t.common);
        return;
      }
      setEditingId((current) => (current === tag.id ? null : current));
      revalidator.revalidate();
    } catch {
      toast(connectionFailedMessage(t.common, t.groceries.actions.deleteTag), { variant: "error" });
    } finally {
      busyRef.current = false;
      setBusyId(null);
    }
  }

  return (
    <LedgerSection
      id="grocery-tags"
      title={t.groceries.tags.title}
      aside={
        !adding && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setAdding(true)}
          >
            <Plus />
            {t.groceries.tags.add}
          </Button>
        )
      }
    >
      {adding && (
        <form
          onSubmit={create}
          onKeyDown={(e) => {
            if (e.key === "Escape") closeAdd();
          }}
          className="space-y-3 border-b border-border py-4"
        >
          <Input
            type="text"
            value={newName}
            onChange={(e) => {
              setNewName(e.target.value);
              setCreateError(null);
            }}
            placeholder={t.groceries.tags.newTagPlaceholder}
            maxLength={50}
            aria-label={t.groceries.tags.newTagName}
            aria-describedby={createError ? "new-tag-error" : undefined}
            autoFocus
          />
          <TagColorPicker value={newColor} onChange={setNewColor} />
          {createError && (
            <p id="new-tag-error" role="alert" className="text-sm">
              {createError}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={closeAdd}>
              {t.common.cancel}
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={!newName.trim() || busyId !== null}
            >
              {busyId === NEW_TAG ? t.common.adding : t.groceries.tags.add}
            </Button>
          </div>
        </form>
      )}

      {tags.length === 0 ? (
        <p className="py-4 text-sm text-muted-foreground">
          {t.groceries.tags.emptyHint((text) => (
            <Link
              to="/groceries"
              className="underline decoration-muted-foreground/60 underline-offset-4 hover:text-foreground hover:decoration-foreground"
            >
              {text}
            </Link>
          ))}
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {tags.map((tag) =>
            editingId === tag.id ? (
              <li key={tag.id} className="space-y-3 py-3">
                <Input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void save(tag);
                    if (e.key === "Escape") setEditingId(null);
                  }}
                  maxLength={50}
                  disabled={busyId === tag.id}
                  aria-label={t.groceries.tags.tagName}
                  autoFocus
                />
                <TagColorPicker value={editColor} onChange={setEditColor} />
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditingId(null)}
                  >
                    {t.common.cancel}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => void save(tag)}
                    disabled={!editName.trim() || busyId !== null}
                  >
                    {busyId === tag.id ? t.common.saving : t.groceries.tags.save}
                  </Button>
                </div>
              </li>
            ) : (
              <li key={tag.id} className="flex items-center justify-between gap-4 py-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <TagDot color={tag.color} className="h-3 w-3" />
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{tag.name}</p>
                    <p className="text-sm text-muted-foreground">{t.groceries.tags.itemCount(tag.itemCount)}</p>
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => startEdit(tag)}
                    disabled={busyId !== null}
                    aria-label={t.groceries.tags.editNamed(tag.name)}
                  >
                    <Pencil />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => void remove(tag)}
                    disabled={busyId !== null}
                    aria-label={t.groceries.tags.deleteNamed(tag.name)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 />
                  </Button>
                </div>
              </li>
            )
          )}
        </ul>
      )}
    </LedgerSection>
  );
}
