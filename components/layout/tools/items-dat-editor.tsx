"use client"

import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { AnimatePresence } from "framer-motion"
import { Download, Search } from "lucide-react"
import { useVirtualizer } from "@tanstack/react-virtual"

import {
  decodeItemsDat,
  encodeItemsDat,
  protonHash,
  type ItemEntry,
  type ItemsDat,
} from "@/lib/items-dat-helper"
import { cn } from "@/lib/utils"
import { DropZone, saveBlob, StatusBadge, type Status } from "./shared"

export type LoadedItemsDatFile = {
  fileName: string
  data: ItemsDat
}

type SavePayload = {
  encoded: Uint8Array
  hash: number
  fileName: string
  editedCount: number
}

const FIELD_GROUPS: { label: string; fields: (keyof ItemEntry)[] }[] = [
  {
    label: "Identity",
    fields: ["item_id", "name", "editable_type", "item_category", "action_type", "hit_sound_type", "item_kind"],
  },
  {
    label: "Appearance",
    fields: ["texture", "texture_hash", "texture_x", "texture_y", "texture2", "spread_type", "is_stripey_wallpaper", "collision_type"],
  },
  {
    label: "Gameplay",
    fields: ["val1", "val2", "break_hits", "drop_chance", "clothing_type", "rarity", "max_amount", "is_rayman"],
  },
  {
    label: "Audio / Extra",
    fields: ["extra_file", "extra_file_hash", "audio_volume", "extra_options", "extra_options2", "punch_options"],
  },
  {
    label: "Pet",
    fields: ["pet_name", "pet_prefix", "pet_suffix", "pet_ability"],
  },
  {
    label: "Seed / Grow",
    fields: ["seed_base", "seed_overlay", "tree_base", "tree_leaves", "grow_time"],
  },
]

function isReadOnly(field: keyof ItemEntry): boolean {
  return field === "data_position_80"
}

function fieldLabel(key: string) {
  return key.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase())
}

const ItemEditorForm = memo(function ItemEditorForm({
  item,
  onChange,
}: {
  item: ItemEntry
  onChange: (updated: ItemEntry) => void
}) {
  const handleChange = (key: keyof ItemEntry, value: string) => {
    const current = item[key]

    if (typeof current === "number") {
      onChange({ ...item, [key]: Number(value) })
      return
    }

    onChange({ ...item, [key]: value })
  }

  return (
    <div className="space-y-6">
      {FIELD_GROUPS.map((group) => {
        const visible = group.fields.filter((field) => item[field] !== undefined)
        if (visible.length === 0) return null

        return (
          <div key={group.label}>
            <p className="mb-3 text-[0.68rem] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
              {group.label}
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {visible.map((field) => {
                const value = item[field]
                const readOnly = isReadOnly(field)
                const displayValue =
                  value !== null && typeof value === "object"
                    ? Object.values(value).join(",")
                    : String(value ?? "")

                return (
                  <div key={field} className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-muted-foreground">
                      {fieldLabel(field)}
                    </label>
                    <input
                      type="text"
                      readOnly={readOnly}
                      defaultValue={displayValue}
                      onBlur={(event) => {
                        if (!readOnly) handleChange(field, event.target.value)
                      }}
                      className={`h-8 rounded-md border border-border/60 bg-muted/30 px-3 font-mono text-xs text-foreground outline-none transition-colors focus:border-primary focus:bg-card focus:ring-1 focus:ring-primary/30 ${
                        readOnly ? "cursor-default opacity-50" : ""
                      }`}
                    />
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
})

function VirtualItemList({
  items,
  selectedId,
  editedIds,
  onSelect,
}: {
  items: ItemEntry[]
  selectedId: number | null
  editedIds: Set<number>
  onSelect: (id: number) => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 36,
    overscan: 8,
  })

  return (
    <div ref={scrollRef} className="tools-scroll flex-1 overflow-y-auto">
      {items.length === 0 ? (
        <p className="px-3 py-4 text-center text-xs text-muted-foreground">No results</p>
      ) : (
        <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
          {virtualizer.getVirtualItems().map((virtualItem) => {
            const item = items[virtualItem.index]
            const isSelected = item.item_id === selectedId
            const isDirty = editedIds.has(item.item_id)

            return (
              <button
                key={item.item_id}
                type="button"
                data-index={virtualItem.index}
                ref={virtualizer.measureElement}
                onClick={() => onSelect(item.item_id)}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${virtualItem.start}px)`,
                }}
                className={`flex items-center gap-2 px-3 py-2 text-left transition-colors ${
                  isSelected
                    ? "bg-primary/10 text-primary"
                    : "text-foreground hover:bg-muted/60"
                }`}
              >
                <span className="w-8 shrink-0 font-mono text-[0.65rem] text-muted-foreground">
                  {item.item_id}
                </span>
                <span className="min-w-0 flex-1 truncate text-xs">
                  {item.name || <span className="italic text-muted-foreground">unnamed</span>}
                </span>
                {isDirty ? <span className="size-1.5 shrink-0 rounded-full bg-primary" /> : null}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function ItemsDatEditor({
  initialFile = null,
  allowFileLoad = true,
  saveLabel = "Export .dat",
  resetLabel = "Load new file",
  emptyLabel = "Drop items.dat here",
  emptySublabel = "or click to browse - binary .dat file",
  emptyDescription,
  onSave,
  className,
}: {
  initialFile?: LoadedItemsDatFile | null
  allowFileLoad?: boolean
  saveLabel?: string
  resetLabel?: string
  emptyLabel?: string
  emptySublabel?: string
  emptyDescription?: ReactNode
  onSave?: (payload: SavePayload) => Promise<string | void> | string | void
  className?: string
}) {
  const [loadedFile, setLoadedFile] = useState<LoadedItemsDatFile | null>(initialFile)
  const [itemIndex, setItemIndex] = useState<Map<number, ItemEntry>>(new Map())
  const [searchRaw, setSearchRaw] = useState("")
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [status, setStatus] = useState<Status>({ type: "idle" })
  const [loadStatus, setLoadStatus] = useState<Status>({ type: "idle" })
  const [edits, setEdits] = useState<Record<number, ItemEntry>>({})
  const [saving, setSaving] = useState(false)
  const search = useDeferredValue(searchRaw)

  useEffect(() => {
    setLoadedFile(initialFile)
    setSearchRaw("")
    setStatus({ type: "idle" })
    setLoadStatus({ type: "idle" })
    setEdits({})

    if (!initialFile) {
      setItemIndex(new Map())
      setSelectedId(null)
      return
    }

    const nextIndex = new Map<number, ItemEntry>()
    for (const item of initialFile.data.items) {
      nextIndex.set(item.item_id, item)
    }

    setItemIndex(nextIndex)
    setSelectedId(initialFile.data.items[0]?.item_id ?? null)
  }, [initialFile])

  const applyLoadedFile = useCallback((nextFile: LoadedItemsDatFile, successMessage?: string) => {
    const nextIndex = new Map<number, ItemEntry>()
    for (const item of nextFile.data.items) {
      nextIndex.set(item.item_id, item)
    }

    setLoadedFile(nextFile)
    setItemIndex(nextIndex)
    setEdits({})
    setSearchRaw("")
    setSelectedId(nextFile.data.items[0]?.item_id ?? null)
    setStatus({ type: "idle" })
    setLoadStatus({
      type: "success",
      message:
        successMessage ??
        `Loaded ${nextFile.data.item_count.toLocaleString()} items (v${nextFile.data.version})`,
    })
  }, [])

  const handleFile = useCallback((file: File) => {
    setLoadStatus({ type: "idle" })
    const reader = new FileReader()
    reader.readAsArrayBuffer(file)
    reader.onload = (event) => {
      try {
        const buffer = new Uint8Array(event.target?.result as ArrayBuffer)
        const data = decodeItemsDat(buffer)
        applyLoadedFile({ fileName: file.name, data })
      } catch (error) {
        setLoadStatus({
          type: "error",
          message: error instanceof Error ? error.message : "Failed to load file",
        })
      }
    }
  }, [applyLoadedFile])

  const filteredItems = useMemo(() => {
    if (!loadedFile) return []

    const query = search.toLowerCase().trim()
    if (!query) return loadedFile.data.items

    return loadedFile.data.items.filter(
      (item) => item.name.toLowerCase().includes(query) || String(item.item_id).includes(query)
    )
  }, [loadedFile, search])

  const selectedItem = useMemo(() => {
    if (selectedId === null) return null
    return edits[selectedId] ?? itemIndex.get(selectedId) ?? null
  }, [selectedId, edits, itemIndex])

  const editedIds = useMemo(() => new Set(Object.keys(edits).map(Number)), [edits])

  const handleItemChange = useCallback((updated: ItemEntry) => {
    setEdits((current) => ({ ...current, [updated.item_id]: updated }))
  }, [])

  const handleReset = useCallback(() => {
    setLoadedFile(null)
    setItemIndex(new Map())
    setSearchRaw("")
    setSelectedId(null)
    setStatus({ type: "idle" })
    setLoadStatus({ type: "idle" })
    setEdits({})
  }, [])

  const handleSave = useCallback(async () => {
    if (!loadedFile) return

    setStatus({ type: "idle" })
    setSaving(true)

    try {
      const merged: ItemsDat = {
        ...loadedFile.data,
        items: loadedFile.data.items.map((item) => edits[item.item_id] ?? item),
      }
      const encoded = encodeItemsDat(merged)
      const hash = protonHash(encoded)
      const editedCount = Object.keys(edits).length

      const message =
        (await onSave?.({
          encoded,
          hash,
          fileName: loadedFile.fileName,
          editedCount,
        })) ??
        `Exported ${loadedFile.fileName} - hash: ${hash >>> 0}`

      if (!onSave) {
        saveBlob(encoded.buffer as ArrayBuffer, loadedFile.fileName)
      }

      setStatus({ type: "success", message })
    } catch (error) {
      setStatus({
        type: "error",
        message: error instanceof Error ? error.message : "Save failed",
      })
    } finally {
      setSaving(false)
    }
  }, [edits, loadedFile, onSave])

  if (!loadedFile) {
    return (
      <div className={cn("flex flex-col gap-6", className)}>
        <p className="text-sm text-muted-foreground">
          {emptyDescription ?? (
            <>
              Load a binary{" "}
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">items.dat</code>{" "}
              to browse and edit every item field, then export a modified{" "}
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">items.dat</code>.
            </>
          )}
        </p>
        {allowFileLoad ? (
          <DropZone
            accept="*"
            label={emptyLabel}
            sublabel={emptySublabel}
            onFile={handleFile}
          />
        ) : null}
        <AnimatePresence>
          <StatusBadge status={loadStatus} />
        </AnimatePresence>
      </div>
    )
  }

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col gap-4", className)}>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <AnimatePresence>
            <StatusBadge status={loadStatus} />
          </AnimatePresence>
          <AnimatePresence>
            <StatusBadge status={status} />
          </AnimatePresence>
          <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
            {loadedFile.fileName}
          </span>
          {Object.keys(edits).length > 0 ? (
            <span className="rounded-full bg-primary/12 px-2.5 py-0.5 text-xs font-semibold text-primary">
              {Object.keys(edits).length} edited
            </span>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          {allowFileLoad ? (
            <button
              type="button"
              onClick={handleReset}
              className="rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {resetLabel}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-70"
          >
            <Download className="size-3.5" />
            {saving ? "Saving..." : saveLabel}
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 gap-3">
        <div className="flex w-48 shrink-0 flex-col overflow-hidden rounded-xl border border-border/60 bg-muted/20 sm:w-56">
          <div className="relative shrink-0 border-b border-border/60 p-2">
            <Search className="absolute top-1/2 left-4 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search..."
              value={searchRaw}
              onChange={(event) => setSearchRaw(event.target.value)}
              className="h-7 w-full rounded-md bg-background pl-7 pr-2 text-xs text-foreground outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-primary/30"
            />
          </div>
          <VirtualItemList
            items={filteredItems}
            selectedId={selectedId}
            editedIds={editedIds}
            onSelect={setSelectedId}
          />
        </div>

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-border/60">
          {selectedItem ? (
            <div className="tools-scroll flex-1 overflow-y-auto p-5">
              <ItemEditorForm
                key={selectedItem.item_id}
                item={selectedItem}
                onChange={handleItemChange}
              />
            </div>
          ) : (
            <div className="flex flex-1 items-center justify-center">
              <p className="text-sm text-muted-foreground">Select an item</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
