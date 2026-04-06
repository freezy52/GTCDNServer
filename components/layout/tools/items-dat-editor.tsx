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

const ITEM_ROW_HEIGHT = 40
const BASIC_FIELDS = new Set<keyof ItemEntry>([
  "item_id",
  "name",
  "editable_type",
  "item_category",
  "action_type",
  "hit_sound_type",
  "item_kind",
  "texture",
  "texture_hash",
  "texture_x",
  "texture_y",
  "collision_type",
  "break_hits",
  "rarity",
  "max_amount",
  "grow_time",
  "seed_base",
  "seed_overlay",
  "tree_base",
  "tree_leaves",
  "extra_file",
  "extra_options",
  "punch_options",
])

type CreationPreset = "generic" | "block" | "seed" | "door" | "clothing"
type ViewMode = "basic" | "advanced"
type AssetField = "texture" | "extra_file"
type ImportedJsonValue = string | number | null | undefined

const ITEM_IMPORT_ALIAS_MAP: Partial<Record<keyof ItemEntry, string[]>> = {
  name: ["name"],
  texture: ["texture"],
  texture_hash: ["texture_hash"],
  texture_x: ["texture_x"],
  texture_y: ["texture_y"],
  collision_type: ["collision_type"],
  break_hits: ["break_hits"],
  rarity: ["rarity"],
  max_amount: ["max_amount"],
  extra_file: ["extra_file"],
  extra_file_hash: ["extra_file_hash"],
  audio_volume: ["audio_volume"],
  pet_name: ["pet_name"],
  pet_prefix: ["pet_prefix"],
  pet_suffix: ["pet_suffix"],
  pet_ability: ["pet_ability"],
  seed_base: ["seed_base"],
  seed_overlay: ["seed_overlay"],
  tree_base: ["tree_base"],
  tree_leaves: ["tree_leaves"],
  grow_time: ["grow_time"],
  extra_options: ["extra_options"],
  texture2: ["texture2"],
  extra_options2: ["extra_options2"],
  punch_options: ["punch_options"],
  editable_type: ["editable_type"],
  item_category: ["item_category"],
  action_type: ["action_type"],
  hit_sound_type: ["hit_sound_type"],
  item_kind: ["item_kind"],
  val1: ["val1"],
  spread_type: ["spread_type"],
  is_stripey_wallpaper: ["is_stripey_wallpaper"],
  drop_chance: ["drop_chance"],
  clothing_type: ["clothing_type", "body_part_type"],
  val2: ["val2"],
  is_rayman: ["is_rayman"],
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
  return field === "data_position_80" || field === "item_id"
}

function fieldLabel(key: string) {
  return key.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase())
}

const ItemEditorForm = memo(function ItemEditorForm({
  item,
  viewMode,
  assetFolderOptions,
  onAssetUpload,
  onChange,
}: {
  item: ItemEntry
  viewMode: ViewMode
  assetFolderOptions: string[]
  onAssetUpload?: (
    field: AssetField,
    file: File,
    targetFolder: string
  ) => Promise<{ storedPath: string; hash: number }>
  onChange: (updated: ItemEntry) => void
}) {
  const textureFileInputRef = useRef<HTMLInputElement>(null)
  const extraFileInputRef = useRef<HTMLInputElement>(null)
  const [textureTargetFolder, setTextureTargetFolder] = useState(
    assetFolderOptions[0] ?? "game"
  )
  const [extraTargetFolder, setExtraTargetFolder] = useState(
    assetFolderOptions[0] ?? "game"
  )
  const [uploadingField, setUploadingField] = useState<AssetField | null>(null)

  const handleChange = (key: keyof ItemEntry, value: string) => {
    const current = item[key]
    const nextItem = { ...item }

    if (typeof current === "number") {
      ;(nextItem as Record<keyof ItemEntry, unknown>)[key] = Number(value)
      onChange(nextItem)
      return
    }

    ;(nextItem as Record<keyof ItemEntry, unknown>)[key] = value

    onChange(nextItem)
  }

  const handleHashFileSelect = useCallback(
    async (target: AssetField, file: File | null) => {
      if (!file) return

      const targetFolder =
        target === "texture" ? textureTargetFolder : extraTargetFolder

      setUploadingField(target)

      try {
        const buffer = new Uint8Array(await file.arrayBuffer())
        const hash = protonHash(buffer)

        if (onAssetUpload) {
          const uploaded = await onAssetUpload(target, file, targetFolder)
          onChange({
            ...item,
            [target]: uploaded.storedPath,
            [target === "texture" ? "texture_hash" : "extra_file_hash"]:
              uploaded.hash,
          })
          return
        }

        onChange({
          ...item,
          [target]: file.name,
          [target === "texture" ? "texture_hash" : "extra_file_hash"]: hash,
        })
      } catch {
        onChange({
          ...item,
          [target]: file.name,
        })
      } finally {
        setUploadingField(null)
      }
    },
    [
      extraTargetFolder,
      item,
      onAssetUpload,
      onChange,
      textureTargetFolder,
    ]
  )

  return (
    <div className="space-y-6">
      {FIELD_GROUPS.map((group) => {
        const visible = group.fields.filter(
          (field) =>
            item[field] !== undefined &&
            (viewMode === "advanced" || BASIC_FIELDS.has(field))
        )
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
                      value={displayValue}
                      onChange={(event) => {
                        if (!readOnly) handleChange(field, event.target.value)
                      }}
                      className={`h-8 rounded-md border border-border/60 bg-muted/30 px-3 font-mono text-xs text-foreground outline-none transition-colors focus:border-primary focus:bg-card focus:ring-1 focus:ring-primary/30 ${
                        readOnly ? "cursor-default opacity-50" : ""
                      }`}
                    />
                    {field === "texture" ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          ref={textureFileInputRef}
                          type="file"
                          className="hidden"
                          onChange={async (event) => {
                            await handleHashFileSelect(
                              "texture",
                              event.target.files?.[0] ?? null
                            )
                            event.target.value = ""
                          }}
                        />
                        {onAssetUpload ? (
                          <select
                            value={textureTargetFolder}
                            onChange={(event) =>
                              setTextureTargetFolder(event.target.value)
                            }
                            className="rounded-md border border-border/60 bg-background px-2 py-1 text-[11px] text-foreground outline-none"
                          >
                            {assetFolderOptions.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => textureFileInputRef.current?.click()}
                          className="text-[11px] font-medium text-primary hover:underline"
                        >
                          {uploadingField === "texture"
                            ? "Yukleniyor..."
                            : onAssetUpload
                              ? "Sec, yukle, hash doldur"
                              : "RTTEX sec ve dogru hash doldur"}
                        </button>
                        <p className="text-[11px] text-muted-foreground">
                          {onAssetUpload
                            ? "Secilen klasore yuklenir ve dosya iceriginden hash hesaplanir."
                            : "Dosya iceriginden hesaplanir."}
                        </p>
                      </div>
                    ) : null}
                    {field === "extra_file" ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          ref={extraFileInputRef}
                          type="file"
                          className="hidden"
                          onChange={async (event) => {
                            await handleHashFileSelect(
                              "extra_file",
                              event.target.files?.[0] ?? null
                            )
                            event.target.value = ""
                          }}
                        />
                        {onAssetUpload ? (
                          <select
                            value={extraTargetFolder}
                            onChange={(event) =>
                              setExtraTargetFolder(event.target.value)
                            }
                            className="rounded-md border border-border/60 bg-background px-2 py-1 text-[11px] text-foreground outline-none"
                          >
                            {assetFolderOptions.map((option) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => extraFileInputRef.current?.click()}
                          className="text-[11px] font-medium text-primary hover:underline"
                        >
                          {uploadingField === "extra_file"
                            ? "Yukleniyor..."
                            : onAssetUpload
                              ? "Sec, yukle, hash doldur"
                              : "Dosya sec ve hash doldur"}
                        </button>
                        <p className="text-[11px] text-muted-foreground">
                          {onAssetUpload
                            ? "Secilen klasore yuklenir ve dosya iceriginden hash hesaplanir."
                            : "Dosya iceriginden hesaplanir."}
                        </p>
                      </div>
                    ) : null}
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

const VirtualItemList = memo(function VirtualItemList({
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
    estimateSize: () => ITEM_ROW_HEIGHT,
    getItemKey: (index) => items[index]?.item_id ?? index,
    overscan: 5,
  })

  return (
    <div
      ref={scrollRef}
      className="tools-scroll h-full flex-1 overflow-y-auto overscroll-contain touch-pan-y"
      style={{ contain: "strict", WebkitOverflowScrolling: "touch" }}
    >
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
                onClick={() => onSelect(item.item_id)}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: ITEM_ROW_HEIGHT,
                  transform: `translateY(${virtualItem.start}px)`,
                }}
                className={`flex items-center gap-2 px-3 text-left transition-colors ${
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
})

function getNextItemId(items: ItemEntry[]) {
  return items.reduce((max, item) => Math.max(max, item.item_id), -1) + 1
}

function readImportedValue(
  record: Record<string, unknown>,
  keys: string[]
): ImportedJsonValue {
  for (const key of keys) {
    const value = record[key]
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      value === null ||
      value === undefined
    ) {
      return value
    }
  }

  return undefined
}

function applyImportedScalar(
  target: ItemEntry,
  key: keyof ItemEntry,
  value: ImportedJsonValue
) {
  if (value === undefined || value === null) return

  const current = target[key]

  if (typeof current === "number") {
    const next = Number(value)
    if (!Number.isNaN(next)) {
      ;(target as Record<keyof ItemEntry, unknown>)[key] = next
    }
    return
  }

  if (typeof current === "string") {
    ;(target as Record<keyof ItemEntry, unknown>)[key] = String(value)
  }
}

function buildImportedItem({
  base,
  nextId,
  raw,
}: {
  base: ItemEntry
  nextId: number
  raw: unknown
}) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Each imported item must be a JSON object")
  }

  const record = raw as Record<string, unknown>
  const nextItem: ItemEntry = {
    ...base,
    item_id: nextId,
    name:
      typeof record.name === "string" && record.name.trim().length > 0
        ? record.name
        : `Imported Item ${nextId}`,
  }

  for (const [field, aliases] of Object.entries(ITEM_IMPORT_ALIAS_MAP) as Array<
    [keyof ItemEntry, string[]]
  >) {
    applyImportedScalar(nextItem, field, readImportedValue(record, aliases))
  }

  return nextItem
}

function getBaseItemForImport({
  data,
  edits,
  selectedId,
}: {
  data: ItemsDat
  edits: Record<number, ItemEntry>
  selectedId: number | null
}) {
  return (
    (selectedId !== null
      ? edits[selectedId] ?? data.items.find((item) => item.item_id === selectedId)
      : null) ?? data.items[0] ?? null
  )
}

function getAssetFileName(path: string) {
  const normalized = path.replace(/\\/g, "/")
  const parts = normalized.split("/")
  return parts[parts.length - 1] ?? path
}

function getAssetTargetFolder(path: string) {
  const normalized = path.replace(/\\/g, "/").replace(/^cache\/+/, "")
  const lastSlash = normalized.lastIndexOf("/")
  if (lastSlash <= 0) return "game"
  return normalized.slice(0, lastSlash)
}

function buildPresetItem({
  base,
  nextId,
  preset,
}: {
  base: ItemEntry
  nextId: number
  preset: CreationPreset
}): ItemEntry {
  const nextItem: ItemEntry = {
    ...base,
    item_id: nextId,
    name: `New Item ${nextId}`,
    texture: base.texture || "unknown.rttex",
    texture_hash: 0,
    extra_file: "",
    extra_file_hash: 0,
    extra_options: "",
    extra_options2: "",
    punch_options: base.punch_options ?? "",
    pet_name: "",
    pet_prefix: "",
    pet_suffix: "",
    pet_ability: "",
  }

  switch (preset) {
    case "block":
      return {
        ...nextItem,
        name: `New Block ${nextId}`,
        action_type: 0,
        collision_type: 1,
        break_hits: 6,
        rarity: 1,
      }
    case "seed":
      return {
        ...nextItem,
        name: `New Seedable Item ${nextId}`,
        action_type: 0,
        collision_type: 1,
        break_hits: 6,
        seed_base: Math.max(1, nextItem.seed_base),
        seed_overlay: Math.max(1, nextItem.seed_overlay),
        tree_base: Math.max(1, nextItem.tree_base),
        tree_leaves: Math.max(1, nextItem.tree_leaves),
        grow_time: Math.max(60, nextItem.grow_time),
      }
    case "door":
      return {
        ...nextItem,
        name: `New Door ${nextId}`,
        action_type: 3,
        collision_type: 1,
        break_hits: 6,
      }
    case "clothing":
      return {
        ...nextItem,
        name: `New Clothing ${nextId}`,
        action_type: 20,
        collision_type: 0,
        clothing_type: nextItem.clothing_type || 1,
        max_amount: 1,
      }
    default:
      return nextItem
  }
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
  assetFolderOptions = ["game", "interface", "audio", "images"],
  onAssetUpload,
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
  assetFolderOptions?: string[]
  onAssetUpload?: (
    field: AssetField,
    file: File,
    targetFolder: string
  ) => Promise<{ storedPath: string; hash: number }>
  className?: string
}) {
  const [loadedFile, setLoadedFile] = useState<LoadedItemsDatFile | null>(initialFile)
  const [searchRaw, setSearchRaw] = useState("")
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>("basic")
  const [creationPreset, setCreationPreset] = useState<CreationPreset>("generic")
  const [status, setStatus] = useState<Status>({ type: "idle" })
  const [loadStatus, setLoadStatus] = useState<Status>({ type: "idle" })
  const [edits, setEdits] = useState<Record<number, ItemEntry>>({})
  const [saving, setSaving] = useState(false)
  const search = useDeferredValue(searchRaw)
  const jsonImportInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setLoadedFile(initialFile)
    setSearchRaw("")
    setStatus({ type: "idle" })
    setLoadStatus({ type: "idle" })
    setEdits({})

    if (!initialFile) {
      setSelectedId(null)
      return
    }

    setSelectedId(initialFile.data.items[0]?.item_id ?? null)
  }, [initialFile])

  const applyLoadedFile = useCallback((nextFile: LoadedItemsDatFile, successMessage?: string) => {
    setLoadedFile(nextFile)
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

  const displayItems = useMemo(() => {
    if (!loadedFile) return []
    return loadedFile.data.items.map((item) => edits[item.item_id] ?? item)
  }, [edits, loadedFile])

  const filteredItems = useMemo(() => {
    if (!loadedFile) return []

    const query = search.toLowerCase().trim()
    if (!query) return displayItems

    return displayItems.filter(
      (item) => item.name.toLowerCase().includes(query) || String(item.item_id).includes(query)
    )
  }, [displayItems, loadedFile, search])

  const itemLookup = useMemo(() => {
    if (!loadedFile) return new Map<number, ItemEntry>()

    return new Map(
      displayItems.map((item) => [item.item_id, item] as const)
    )
  }, [displayItems, loadedFile])

  const selectedItem = useMemo(() => {
    if (!loadedFile || selectedId === null) return null
    return (
      edits[selectedId] ??
      itemLookup.get(selectedId) ??
      null
    )
  }, [selectedId, edits, itemLookup, loadedFile])

  const editedIds = useMemo(() => new Set(Object.keys(edits).map(Number)), [edits])

  const handleItemChange = useCallback((updated: ItemEntry) => {
    setEdits((current) => {
      if (selectedId === null) return current
      return { ...current, [selectedId]: updated }
    })
  }, [selectedId])

  const handleCreateItem = useCallback((mode: "new" | "clone") => {
    setLoadedFile((current) => {
      if (!current) return current

      const baseItem =
        (selectedId !== null
          ? edits[selectedId] ?? current.data.items.find((item) => item.item_id === selectedId)
          : null) ??
        current.data.items[0]

      if (!baseItem) return current

      const nextId = getNextItemId(current.data.items)
      const nextItem =
        mode === "clone"
          ? {
              ...baseItem,
              item_id: nextId,
              name: `${baseItem.name} Copy`,
            }
          : buildPresetItem({
              base: baseItem,
              nextId,
              preset: creationPreset,
            })

      const nextItems = [...current.data.items, nextItem].sort(
        (left, right) => left.item_id - right.item_id
      )

      window.requestAnimationFrame(() => {
        setSelectedId(nextId)
        setStatus({
          type: "success",
          message:
            mode === "clone"
              ? `Cloned item into #${nextId}`
              : `Created ${creationPreset} item #${nextId}`,
        })
      })

      return {
        ...current,
        data: {
          ...current.data,
          item_count: nextItems.length,
          items: nextItems,
        },
      }
    })
  }, [creationPreset, edits, selectedId])

  const handleReset = useCallback(() => {
    setLoadedFile(null)
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
        item_count: loadedFile.data.items.length,
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

  const handleImportJson = useCallback(
    async (rawText: string, assetFiles: File[] = []) => {
      if (!loadedFile) return

      const trimmed = rawText.trim()
      if (!trimmed) {
        setStatus({
          type: "error",
          message: "Selected JSON file is empty",
        })
        return
      }

      try {
        const parsed = JSON.parse(trimmed) as unknown
        const importedItems = Array.isArray(parsed) ? parsed : [parsed]
        if (importedItems.length === 0) {
          throw new Error("Import array is empty")
        }

        const baseItem = getBaseItemForImport({
          data: loadedFile.data,
          edits,
          selectedId,
        })

        if (!baseItem) {
          throw new Error("No base item available for import")
        }

        let nextId = getNextItemId(loadedFile.data.items)
        const createdItems = importedItems.map((raw) =>
          buildImportedItem({
            base: { ...baseItem },
            nextId: nextId++,
            raw,
          })
        )

        if (assetFiles.length > 0 && onAssetUpload) {
          const fileLookup = new Map(
            assetFiles.map((file) => [file.name.toLowerCase(), file] as const)
          )
          const uploadCache = new Map<
            string,
            Promise<{ storedPath: string; hash: number }>
          >()

          for (const item of createdItems) {
            const textureName = getAssetFileName(item.texture).toLowerCase()
            const textureFile = fileLookup.get(textureName)
            if (textureFile && item.texture) {
              const folder = getAssetTargetFolder(item.texture)
              const cacheKey = `texture:${folder}:${textureFile.name.toLowerCase()}`
              const uploaded =
                uploadCache.get(cacheKey) ??
                onAssetUpload("texture", textureFile, folder)
              uploadCache.set(cacheKey, uploaded)
              const result = await uploaded
              item.texture = result.storedPath
              item.texture_hash = result.hash
            }

            const texture2Name = getAssetFileName(item.texture2).toLowerCase()
            const texture2File = fileLookup.get(texture2Name)
            if (texture2File && item.texture2) {
              const folder = getAssetTargetFolder(item.texture2)
              const cacheKey = `texture2:${folder}:${texture2File.name.toLowerCase()}`
              const uploaded =
                uploadCache.get(cacheKey) ??
                onAssetUpload("texture", texture2File, folder)
              uploadCache.set(cacheKey, uploaded)
              const result = await uploaded
              item.texture2 = result.storedPath
            }

            const extraName = getAssetFileName(item.extra_file).toLowerCase()
            const extraFile = fileLookup.get(extraName)
            if (extraFile && item.extra_file) {
              const folder = getAssetTargetFolder(item.extra_file)
              const cacheKey = `extra_file:${folder}:${extraFile.name.toLowerCase()}`
              const uploaded =
                uploadCache.get(cacheKey) ??
                onAssetUpload("extra_file", extraFile, folder)
              uploadCache.set(cacheKey, uploaded)
              const result = await uploaded
              item.extra_file = result.storedPath
              item.extra_file_hash = result.hash
            }
          }
        }

        const nextItems = [...loadedFile.data.items, ...createdItems].sort(
          (left, right) => left.item_id - right.item_id
        )
        const firstImportedId = createdItems[0]?.item_id ?? null

        setLoadedFile({
          ...loadedFile,
          data: {
            ...loadedFile.data,
            item_count: nextItems.length,
            items: nextItems,
          },
        })
        setSelectedId(firstImportedId)
        setStatus({
          type: "success",
          message:
            assetFiles.length > 0
              ? `${createdItems.length} item imported with assets`
              : `${createdItems.length} item imported from JSON`,
        })
      } catch (error) {
        setStatus({
          type: "error",
          message:
            error instanceof Error ? error.message : "Failed to import JSON",
        })
      }
    },
    [edits, loadedFile, onAssetUpload, selectedId]
  )

  const handleImportBundleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return

      const allFiles = Array.from(files)
      const jsonFile =
        allFiles.find((file) => file.name.toLowerCase().endsWith(".json")) ??
        null

      if (!jsonFile) {
        setStatus({
          type: "error",
          message: "Select a JSON file together with any RTTEX files",
        })
        return
      }

      const assetFiles = allFiles.filter(
        (file) => file !== jsonFile && file.name.toLowerCase().endsWith(".rttex")
      )

      try {
        const text = await jsonFile.text()
        await handleImportJson(text, assetFiles)
      } catch (error) {
        setStatus({
          type: "error",
          message:
            error instanceof Error
              ? error.message
              : "Failed to read import files",
        })
      }
    },
    [handleImportJson]
  )

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
    <div className={cn("flex min-h-0 flex-1 flex-col gap-4 overflow-hidden", className)}>
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
          <div className="flex items-center gap-2 rounded-md border border-border/60 bg-muted/30 px-2 py-1.5">
            <label className="text-xs text-muted-foreground">View</label>
            <select
              value={viewMode}
              onChange={(event) => setViewMode(event.target.value as ViewMode)}
              className="bg-transparent text-xs font-medium text-foreground outline-none"
            >
              <option value="basic">Basic</option>
              <option value="advanced">Advanced</option>
            </select>
          </div>
          <div className="flex items-center gap-2 rounded-md border border-border/60 bg-muted/30 px-2 py-1.5">
            <label className="text-xs text-muted-foreground">Preset</label>
            <select
              value={creationPreset}
              onChange={(event) =>
                setCreationPreset(event.target.value as CreationPreset)
              }
              className="bg-transparent text-xs font-medium text-foreground outline-none"
            >
              <option value="generic">Generic</option>
              <option value="block">Block</option>
              <option value="seed">Seedable</option>
              <option value="door">Door</option>
              <option value="clothing">Clothing</option>
            </select>
          </div>
          <button
            type="button"
            onClick={() => handleCreateItem("new")}
            className="rounded-md border border-border/60 px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
          >
            New item
          </button>
          <input
            ref={jsonImportInputRef}
            type="file"
            accept=".json,.rttex,application/json"
            multiple
            className="hidden"
            onChange={async (event) => {
              await handleImportBundleFiles(event.target.files)
              event.target.value = ""
            }}
          />
          <button
            type="button"
            onClick={() => jsonImportInputRef.current?.click()}
            className="rounded-md border border-border/60 px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
          >
            Import JSON + RTTEX
          </button>
          <button
            type="button"
            onClick={() => handleCreateItem("clone")}
            disabled={!selectedItem}
            className="rounded-md border border-border/60 px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
          >
            Clone selected
          </button>
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

      <div className="flex min-h-0 flex-1 gap-3 overflow-hidden">
        <div className="flex h-full min-h-0 w-48 shrink-0 flex-col overflow-hidden rounded-xl border border-border/60 bg-muted/20 sm:w-56">
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

        <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-border/60">
          {selectedItem ? (
            <div className="tools-scroll flex-1 overflow-y-auto p-5">
              <ItemEditorForm
                key={selectedItem.item_id}
                item={selectedItem}
                viewMode={viewMode}
                assetFolderOptions={assetFolderOptions}
                onAssetUpload={onAssetUpload}
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
