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
  type SeedColor,
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
  "seed_color",
  "seed_overlay_color",
  "data_position_80",
  "data_version_12",
  "int_version_13",
  "int_version_14",
  "data_version_15",
  "str_version_15",
  "str_version_16",
  "int_version_17",
  "int_version_18",
])

type CreationPreset = "generic" | "block" | "seed" | "door" | "clothing"
type ViewMode = "basic" | "advanced"
type AssetField = "texture" | "extra_file" | "renderer_file"
type ImportedJsonValue = string | number | null | undefined
const RENDERER_XML_FOLDER = "GameData/ItemRenderers"

function buildAssetPath(targetFolder: string, fileName: string) {
  const normalizedFolder = targetFolder.trim().replace(/^\/+|\/+$/g, "")
  return normalizedFolder ? `${normalizedFolder}/${fileName}` : fileName
}

function getRendererOptionLabel(path: string) {
  return path
    .replace(/^GameData\/ItemRenderers\/+/i, "")
    .replace(/^game\/gamedata\/+/i, "")
    .replace(/^gamedata\/+/i, "")
}

function getRendererStoredValue(path: string) {
  return getAssetFileName(path)
}

const ITEM_IMPORT_ALIAS_MAP: Partial<Record<keyof ItemEntry, string[]>> = {
  item_id: ["item_id", "id"],
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
  editable_type: ["editable_type", "type"],
  item_category: ["item_category", "category"],
  action_type: ["action_type"],
  hit_sound_type: ["hit_sound_type"],
  item_kind: ["item_kind", "material_type"],
  val1: ["val1"],
  spread_type: ["spread_type"],
  is_stripey_wallpaper: ["is_stripey_wallpaper"],
  drop_chance: ["drop_chance"],
  clothing_type: ["clothing_type", "body_part_type"],
  val2: ["val2"],
  is_rayman: ["is_rayman"],
  str_version_16: ["str_version_16", "item_renderer"],
  int_version_18: ["int_version_18", "item_renderer_hash"],
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
    fields: ["seed_base", "seed_overlay", "tree_base", "tree_leaves", "seed_color", "seed_overlay_color", "grow_time"],
  },
  {
    label: "Renderer",
    fields: ["str_version_16", "int_version_18"],
  },
  {
    label: "Version / Raw",
    fields: ["data_position_80", "data_version_12", "int_version_13", "int_version_14", "data_version_15", "str_version_15", "int_version_17"],
  },
]

const FIELD_LABELS: Partial<Record<keyof ItemEntry, string>> = {
  editable_type: "Type",
  item_category: "Category",
  item_kind: "Material Type",
  spread_type: "Visual Effect Type",
  clothing_type: "Body Part Type",
  str_version_16: "Renderer XML",
  int_version_18: "Renderer Hash",
  data_position_80: "Raw Data (80 bytes)",
  data_version_12: "Version 12 Data",
  data_version_15: "Version 15 Data",
  str_version_15: "Version 15 String",
}

function isReadOnly(field: keyof ItemEntry): boolean {
  return field === "data_position_80" || field === "item_id"
}

function fieldLabel(key: string) {
  return FIELD_LABELS[key as keyof ItemEntry]
    ?? key.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase())
}

function getAssetValueField(target: AssetField): keyof ItemEntry {
  if (target === "texture") return "texture"
  if (target === "extra_file") return "extra_file"
  return "str_version_16"
}

function getAssetHashField(target: AssetField): keyof ItemEntry {
  if (target === "texture") return "texture_hash"
  if (target === "extra_file") return "extra_file_hash"
  return "int_version_18"
}

function parseImportedColor(value: unknown, fallback: SeedColor): SeedColor {
  if (typeof value === "number") {
    const normalized = value >>> 0
    return {
      a: (normalized >>> 24) & 0xff,
      r: (normalized >>> 16) & 0xff,
      g: (normalized >>> 8) & 0xff,
      b: normalized & 0xff,
    }
  }

  if (value && typeof value === "object" && !Array.isArray(value)) {
    const source = value as Partial<Record<keyof SeedColor, unknown>>
    return {
      a: Number(source.a ?? fallback.a),
      r: Number(source.r ?? fallback.r),
      g: Number(source.g ?? fallback.g),
      b: Number(source.b ?? fallback.b),
    }
  }

  return fallback
}

const ItemEditorForm = memo(function ItemEditorForm({
  item,
  viewMode,
  assetFolderOptions,
  rendererFileOptions,
  onSelectExistingRendererFile,
  onAssetUpload,
  onChange,
}: {
  item: ItemEntry
  viewMode: ViewMode
  assetFolderOptions: string[]
  rendererFileOptions: string[]
  onSelectExistingRendererFile?: (
    key: string
  ) => Promise<{ storedPath: string; hash: number }>
  onAssetUpload?: (
    field: AssetField,
    file: File,
    targetFolder: string
  ) => Promise<{ storedPath: string; hash: number }>
  onChange: (updated: ItemEntry) => void
}) {
  const textureFileInputRef = useRef<HTMLInputElement>(null)
  const extraFileInputRef = useRef<HTMLInputElement>(null)
  const rendererFileInputRef = useRef<HTMLInputElement>(null)
  const [textureTargetFolder, setTextureTargetFolder] = useState(
    assetFolderOptions[0] ?? "game"
  )
  const [extraTargetFolder, setExtraTargetFolder] = useState(
    assetFolderOptions[0] ?? "game"
  )
  const [selectedRendererFile, setSelectedRendererFile] = useState("")
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

  const handleColorChange = (
    key: "seed_color" | "seed_overlay_color",
    channel: keyof SeedColor,
    value: string
  ) => {
    const current = item[key]
    const nextColor = {
      ...(current ?? { a: 255, r: 255, g: 255, b: 255 }),
      [channel]: Number(value),
    }

    onChange({
      ...item,
      [key]: nextColor,
    })
  }

  const handleHashFileSelect = useCallback(
    async (target: AssetField, file: File | null) => {
      if (!file) return

      const targetFolder =
        target === "texture"
          ? textureTargetFolder
          : target === "extra_file"
            ? extraTargetFolder
            : RENDERER_XML_FOLDER
      const valueField = getAssetValueField(target)
      const hashField = getAssetHashField(target)

      setUploadingField(target)

      try {
        const buffer = new Uint8Array(await file.arrayBuffer())
        const hash = protonHash(buffer)

        if (onAssetUpload) {
          const uploaded = await onAssetUpload(target, file, targetFolder)
          onChange({
            ...item,
            [valueField]: uploaded.storedPath,
            [hashField]: uploaded.hash,
          })
          return
        }

        onChange({
          ...item,
          [valueField]:
            target === "renderer_file"
              ? file.name
              : buildAssetPath(targetFolder, file.name),
          [hashField]: hash,
        })
      } catch {
        onChange({
          ...item,
          [valueField]:
            target === "renderer_file"
              ? file.name
              : buildAssetPath(targetFolder, file.name),
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

  const handleExistingRendererSelect = useCallback(async () => {
    if (!selectedRendererFile || !onSelectExistingRendererFile) return

    setUploadingField("renderer_file")

    try {
      const selected = await onSelectExistingRendererFile(selectedRendererFile)
      onChange({
        ...item,
        str_version_16: getRendererStoredValue(selected.storedPath),
        int_version_18: selected.hash,
      })
    } finally {
      setUploadingField(null)
    }
  }, [item, onChange, onSelectExistingRendererFile, selectedRendererFile])

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
                    ? JSON.stringify(value)
                    : String(value ?? "")

                return (
                  <div key={field} className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-muted-foreground">
                      {fieldLabel(field)}
                    </label>
                    {field === "seed_color" || field === "seed_overlay_color" ? (
                      <div className="grid grid-cols-2 gap-2">
                        {(["a", "r", "g", "b"] as const).map((channel) => (
                          <label
                            key={channel}
                            className="flex items-center gap-2 rounded-md border border-border/60 bg-muted/30 px-2 py-1"
                          >
                            <span className="w-4 text-[11px] uppercase text-muted-foreground">
                              {channel}
                            </span>
                            <input
                              type="number"
                              min={0}
                              max={255}
                              value={item[field][channel]}
                              onChange={(event) =>
                                handleColorChange(field, channel, event.target.value)
                              }
                              className="h-7 min-w-0 flex-1 bg-transparent font-mono text-xs text-foreground outline-none"
                            />
                          </label>
                        ))}
                      </div>
                    ) : (
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
                    )}
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
                    {field === "str_version_16" ? (
                      <div className="flex flex-col gap-2">
                        {rendererFileOptions.length > 0 && onSelectExistingRendererFile ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <select
                              value={selectedRendererFile}
                              onChange={(event) =>
                                setSelectedRendererFile(event.target.value)
                              }
                              className="min-w-[220px] rounded-md border border-border/60 bg-background px-2 py-1 text-[11px] text-foreground outline-none"
                            >
                              <option value="">GameData/ItemRenderers icinden XML sec</option>
                              {rendererFileOptions.map((option) => (
                                <option key={option} value={option}>
                                  {getRendererOptionLabel(option)}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              onClick={() => void handleExistingRendererSelect()}
                              disabled={!selectedRendererFile || uploadingField === "renderer_file"}
                              className="text-[11px] font-medium text-primary hover:underline disabled:pointer-events-none disabled:opacity-50"
                            >
                              {uploadingField === "renderer_file"
                                ? "Yukleniyor..."
                                : "Secili XML'i kullan"}
                            </button>
                          </div>
                        ) : null}
                        <div className="flex flex-wrap items-center gap-2">
                        <input
                          ref={rendererFileInputRef}
                          type="file"
                          accept=".xml,text/xml,application/xml"
                          className="hidden"
                          onChange={async (event) => {
                            await handleHashFileSelect(
                              "renderer_file",
                              event.target.files?.[0] ?? null
                            )
                            event.target.value = ""
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => rendererFileInputRef.current?.click()}
                          className="text-[11px] font-medium text-primary hover:underline"
                        >
                          {uploadingField === "renderer_file"
                            ? "Yukleniyor..."
                            : onAssetUpload
                              ? "XML sec, yukle, hash doldur"
                              : "XML sec ve hash doldur"}
                        </button>
                        <p className="text-[11px] text-muted-foreground">
                          XML secildiginde Renderer Hash otomatik hesaplanir. Yeni XML yuklenirse otomatik GameData/ItemRenderers altina gider.
                        </p>
                        </div>
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

function getNextAvailableItemId(usedIds: Set<number>, startAt: number) {
  let nextId = Math.max(0, startAt)

  while (usedIds.has(nextId)) {
    nextId += 1
  }

  return nextId
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

function isLegacyServerImport(record: Record<string, unknown>) {
  return (
    "material_type" in record ||
    "storage_type" in record ||
    "visual_effect_type" in record ||
    "body_part_type" in record ||
    "item_renderer" in record
  )
}

function normalizeImportedRendererPath(path: string) {
  const normalized = path.trim().replace(/\\/g, "/").replace(/^\/+/, "")
  if (!normalized) return normalized
  return getAssetFileName(normalized)
}

function buildImportedItem({
  base,
  nextId,
  usedIds,
  raw,
}: {
  base: ItemEntry
  nextId: number
  usedIds: Set<number>
  raw: unknown
}) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Each imported item must be a JSON object")
  }

  const record = raw as Record<string, unknown>
  const requestedId = Number(readImportedValue(record, ITEM_IMPORT_ALIAS_MAP.item_id ?? []))
  const resolvedId =
    Number.isInteger(requestedId) && requestedId >= 0 && !usedIds.has(requestedId)
      ? requestedId
      : getNextAvailableItemId(usedIds, nextId)
  const nextItem: ItemEntry = {
    ...base,
    item_id: resolvedId,
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

  nextItem.seed_color = parseImportedColor(record.seed_color, nextItem.seed_color)
  nextItem.seed_overlay_color = parseImportedColor(
    record.seed_overlay_color,
    nextItem.seed_overlay_color
  )

  if (isLegacyServerImport(record)) {
    applyImportedScalar(nextItem, "action_type", readImportedValue(record, ["action_type", "type"]))
    applyImportedScalar(nextItem, "item_category", readImportedValue(record, ["item_category", "storage_type"]))
    applyImportedScalar(nextItem, "item_kind", readImportedValue(record, ["item_kind", "material_type"]))
    applyImportedScalar(nextItem, "spread_type", readImportedValue(record, ["spread_type", "visual_effect_type"]))
    applyImportedScalar(nextItem, "clothing_type", readImportedValue(record, ["clothing_type", "body_part_type"]))
    applyImportedScalar(nextItem, "val1", readImportedValue(record, ["val1", "cooking_time"]))
    applyImportedScalar(nextItem, "val2", readImportedValue(record, ["val2", "reset_state_after"]))
  }

  const rendererCandidate =
    typeof record.item_renderer === "string"
      ? record.item_renderer
      : typeof record.str_version_16 === "string"
        ? record.str_version_16
        : ""
  if (rendererCandidate.toLowerCase().endsWith(".xml")) {
    nextItem.str_version_16 = normalizeImportedRendererPath(rendererCandidate)
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

function buildImportedSeedItem({
  base,
  itemId,
  name,
}: {
  base: ItemEntry
  itemId: number
  name: string
}): ItemEntry {
  return {
    ...base,
    item_id: itemId,
    name: `${name} Seed`,
    editable_type: 1,
    item_category: 1,
    action_type: 19,
    hit_sound_type: 0,
    item_kind: 0,
    texture: "",
    texture_hash: 0,
    val1: 0,
    texture_x: 0,
    texture_y: 0,
    spread_type: 0,
    is_stripey_wallpaper: 0,
    collision_type: 1,
    break_hits: 7,
    drop_chance: 0,
    clothing_type: 0,
    rarity: 1,
    max_amount: 250,
    extra_file: "",
    extra_file_hash: 0,
    audio_volume: 0,
    pet_name: "",
    pet_prefix: "",
    pet_suffix: "",
    pet_ability: "",
    seed_base: 0,
    seed_overlay: 0,
    tree_base: 0,
    tree_leaves: 0,
    grow_time: 0,
    val2: 0,
    is_rayman: 0,
    extra_options: "",
    texture2: "",
    extra_options2: "",
    punch_options: base.punch_options ?? "",
  }
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
  rendererFileOptions = [],
  onSelectExistingRendererFile,
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
  rendererFileOptions?: string[]
  onSelectExistingRendererFile?: (
    key: string
  ) => Promise<{ storedPath: string; hash: number }>
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
  const [viewMode, setViewMode] = useState<ViewMode>("advanced")
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
        const createdItems: ItemEntry[] = []
        const usedIds = new Set(loadedFile.data.items.map((item) => item.item_id))

        for (const raw of importedItems) {
          const importedItem = buildImportedItem({
            base: { ...baseItem },
            nextId,
            usedIds,
            raw,
          })
          usedIds.add(importedItem.item_id)
          const seedItem = buildImportedSeedItem({
            base: { ...baseItem },
            itemId: getNextAvailableItemId(usedIds, importedItem.item_id + 1),
            name: importedItem.name,
          })
          usedIds.add(seedItem.item_id)

          createdItems.push(importedItem, seedItem)
          nextId = getNextAvailableItemId(usedIds, seedItem.item_id + 1)
        }

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

            const rendererName = getAssetFileName(item.str_version_16 ?? "").toLowerCase()
            const rendererFile = rendererName ? fileLookup.get(rendererName) : undefined
            if (rendererFile && item.str_version_16) {
              const folder = RENDERER_XML_FOLDER
              const cacheKey = `renderer:${folder}:${rendererFile.name.toLowerCase()}`
              const uploaded =
                uploadCache.get(cacheKey) ??
                onAssetUpload("renderer_file", rendererFile, folder)
              uploadCache.set(cacheKey, uploaded)
              const result = await uploaded
              item.str_version_16 = getRendererStoredValue(result.storedPath)
              item.int_version_18 = result.hash
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
                rendererFileOptions={rendererFileOptions}
                onSelectExistingRendererFile={onSelectExistingRendererFile}
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
