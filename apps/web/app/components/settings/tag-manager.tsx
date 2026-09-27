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

export interface ManagedTag {
  id: string;
  name: string;
  color: string;
  itemCount: number;
}

function itemsLabel(count: number): string {
  return `${count} ${count === 1 ? "item" : "items"}`;
}

export function TagManager({ tags }: { tags: ManagedTag[] }) {
  const toast = useToast();
  const confirm = useConfirm();
  const revalidator = useRevalidator();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState<TagColorKey>("blue");
  // One tag mutation at a time, so an earlier request can't unlock a later one.
  const [busyId, setBusyId] = useState<string | null>(null);
  const busyRef = useRef(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState<TagColorKey>("blue");
  const [creating, setCreating] = useState(false);
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
    if (!name || creating) return;
    if (tags.some((t) => t.name.toLowerCase() === name.toLowerCase())) {
      setCreateError(`“${name}” already exists.`);
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch("/api/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, color: newColor }),
      });
      if (!res.ok) {
        await toastMutationFailure(toast, res, "Add tag");
        return;
      }
      revalidator.revalidate();
      // 200 means another member added the same name first.
      if (res.status !== 201) {
        setCreateError(`“${name}” already exists.`);
        return;
      }
      closeAdd();
    } catch {
      toast(connectionFailedMessage("Add tag"), { variant: "error" });
    } finally {
      setCreating(false);
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
        await toastMutationFailure(toast, res, "Save tag");
        return;
      }
      // Leave another tag's editor open if one was started mid-save.
      setEditingId((current) => (current === tag.id ? null : current));
      revalidator.revalidate();
    } catch {
      toast(connectionFailedMessage("Save tag"), { variant: "error" });
    } finally {
      busyRef.current = false;
      setBusyId(null);
    }
  }

  async function remove(tag: ManagedTag) {
    const ok = await confirm({
      title: `Delete “${tag.name}”?`,
      description:
        tag.itemCount > 0
          ? `It comes off ${itemsLabel(tag.itemCount)} on your list and in history. The items stay.`
          : "No items use it.",
      confirmText: "Delete tag",
      cancelText: "Cancel",
      variant: "destructive",
    });
    if (!ok || busyRef.current) return;
    busyRef.current = true;
    setBusyId(tag.id);
    try {
      const res = await fetch(`/api/tags/${tag.id}`, { method: "DELETE" });
      if (!res.ok) {
        await toastMutationFailure(toast, res, "Delete tag");
        return;
      }
      setEditingId((current) => (current === tag.id ? null : current));
      revalidator.revalidate();
    } catch {
      toast(connectionFailedMessage("Delete tag"), { variant: "error" });
    } finally {
      busyRef.current = false;
      setBusyId(null);
    }
  }

  return (
    <LedgerSection
      id="grocery-tags"
      title="Grocery tags"
      aside={
        !adding && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setAdding(true)}
          >
            <Plus />
            Add tag
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
            placeholder="Costco, Produce, Kids…"
            maxLength={50}
            aria-label="New tag name"
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
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={!newName.trim() || creating}
            >
              {creating ? "Adding…" : "Add tag"}
            </Button>
          </div>
        </form>
      )}

      {tags.length === 0 ? (
        <p className="py-4 text-sm text-muted-foreground">
          No grocery tags yet. Add one here, or from the tag button on any item
          in{" "}
          <Link
            to="/groceries"
            className="underline decoration-muted-foreground/60 underline-offset-4 hover:text-foreground hover:decoration-foreground"
          >
            Groceries
          </Link>
          .
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
                  aria-label="Tag name"
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
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => void save(tag)}
                    disabled={!editName.trim() || busyId !== null}
                  >
                    {busyId === tag.id ? "Saving…" : "Save tag"}
                  </Button>
                </div>
              </li>
            ) : (
              <li key={tag.id} className="flex items-center justify-between gap-4 py-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <TagDot color={tag.color} className="h-3 w-3" />
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{tag.name}</p>
                    <p className="text-sm text-muted-foreground">{itemsLabel(tag.itemCount)}</p>
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => startEdit(tag)}
                    disabled={busyId !== null}
                    aria-label={`Edit tag ${tag.name}`}
                  >
                    <Pencil />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => void remove(tag)}
                    disabled={busyId !== null}
                    aria-label={`Delete tag ${tag.name}`}
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
