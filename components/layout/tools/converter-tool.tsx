"use client"

import { useCallback, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"

import {
  decodeItemsDat,
  encodeItemsDat,
  encodeItemsDatFromTxt,
  protonHash,
  type ItemsDat,
} from "@/lib/items-dat-helper"
import { DropZone, saveBlob, SegmentedControl, StatGrid, StatusBadge, type Status } from "./shared"

type Direction = "decode" | "encode"
type Format = "json" | "txt"

export function ConverterTool() {
  const [direction, setDirection] = useState<Direction>("decode")
  const [format, setFormat] = useState<Format>("json")
  const [status, setStatus] = useState<Status>({ type: "idle" })
  const [decodeStats, setDecodeStats] = useState<{
    version: number
    item_count: number
    sizeKb: number
  } | null>(null)

  const handleDirectionChange = (d: Direction) => {
    setDirection(d)
    setStatus({ type: "idle" })
    setDecodeStats(null)
  }

  const handleFormatChange = (f: Format) => {
    setFormat(f)
    setStatus({ type: "idle" })
    setDecodeStats(null)
  }

  const handleFile = useCallback(
    (file: File) => {
      setStatus({ type: "idle" })
      setDecodeStats(null)

      if (direction === "decode") {
        const reader = new FileReader()
        reader.readAsArrayBuffer(file)
        reader.onload = (e) => {
          try {
            const buf = new Uint8Array(e.target!.result as ArrayBuffer)
            const data = decodeItemsDat(buf)

            if (format === "json") {
              const json = JSON.stringify(data, null, 2)
              saveBlob(json, "items.json", "application/json")
              setDecodeStats({
                version: data.version,
                item_count: data.item_count,
                sizeKb: Math.round(json.length / 1024),
              })
              setStatus({
                type: "success",
                message: `Decoded ${data.item_count.toLocaleString()} items (v${data.version}) — items.json downloaded`,
              })
            } else {
              const header = `//Credit: IProgramInCPP & GrowtopiaNoobs\n//Format: add_item\\${Object.keys(data.items[0]).join("\\")}\n\nversion\\${data.version}\nitemCount\\${data.item_count}\n\n`
              const lines = data.items
                .map((item) => {
                  const vals = Object.values(item).map((v) => {
                    if (v !== null && typeof v === "object") return Object.values(v).join(",")
                    return v
                  })
                  return "add_item\\" + vals.join("\\")
                })
                .join("\n")
              const txt = header + lines
              saveBlob(txt, "items.txt", "text/plain")
              setDecodeStats({
                version: data.version,
                item_count: data.item_count,
                sizeKb: Math.round(txt.length / 1024),
              })
              setStatus({
                type: "success",
                message: `Decoded ${data.item_count.toLocaleString()} items (v${data.version}) — items.txt downloaded`,
              })
            }
          } catch (err) {
            setStatus({
              type: "error",
              message: err instanceof Error ? err.message : "Decode failed",
            })
          }
        }
      } else {
        const reader = new FileReader()
        reader.readAsText(file)
        reader.onload = (e) => {
          try {
            const text = e.target!.result as string
            let buf: Uint8Array

            if (format === "json") {
              const data: ItemsDat = JSON.parse(text)
              buf = encodeItemsDat(data)
              const hash = protonHash(buf)
              saveBlob(buf.buffer as ArrayBuffer, "items.dat")
              setStatus({
                type: "success",
                message: `Encoded ${data.item_count.toLocaleString()} items — items.dat downloaded (hash: ${hash >>> 0})`,
              })
            } else {
              buf = encodeItemsDatFromTxt(text)
              const hash = protonHash(buf)
              saveBlob(buf.buffer as ArrayBuffer, "items.dat")
              setStatus({
                type: "success",
                message: `Encoded from TXT — items.dat downloaded (hash: ${hash >>> 0})`,
              })
            }
          } catch (err) {
            setStatus({
              type: "error",
              message: err instanceof Error ? err.message : "Encode failed",
            })
          }
        }
      }
    },
    [direction, format],
  )

  const isDecoding = direction === "decode"
  const dropLabel = isDecoding
    ? "Drop items.dat here"
    : format === "json"
      ? "Drop items.json here"
      : "Drop items.txt here"
  const dropSublabel = isDecoding
    ? "or click to browse — binary .dat file"
    : `or click to browse — decoded .${format} file`
  const dropAccept = isDecoding ? "*" : format === "json" ? ".json" : ".txt"

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <SegmentedControl<Direction>
          options={[
            { label: "Decode", value: "decode" },
            { label: "Encode", value: "encode" },
          ]}
          value={direction}
          onChange={handleDirectionChange}
        />
        <SegmentedControl<Format>
          options={[
            { label: "JSON", value: "json" },
            { label: "TXT", value: "txt" },
          ]}
          value={format}
          onChange={handleFormatChange}
        />
        <span className="text-xs text-muted-foreground">
          {isDecoding ? `items.dat → items.${format}` : `items.${format} → items.dat`}
        </span>
      </div>

      <AnimatePresence mode="wait">
        <motion.p
          key={`${direction}-${format}`}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.14 }}
          className="text-sm text-muted-foreground"
        >
          {isDecoding ? (
            <>
              Drop a binary{" "}
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">items.dat</code>{" "}
              to decode it into a{" "}
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">.{format}</code>{" "}
              file you can inspect or edit. Supports versions 1–24.
            </>
          ) : format === "json" ? (
            <>
              Drop a decoded{" "}
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">items.json</code>{" "}
              to re-encode it back into a binary{" "}
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">items.dat</code>.
              Proton hash is shown after encoding.
            </>
          ) : (
            <>
              Drop a decoded{" "}
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">items.txt</code>{" "}
              to re-encode it back into a binary{" "}
              <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">items.dat</code>.
              Proton hash is shown after encoding.
            </>
          )}
        </motion.p>
      </AnimatePresence>

      <DropZone
        key={`${direction}-${format}`}
        accept={dropAccept}
        label={dropLabel}
        sublabel={dropSublabel}
        onFile={handleFile}
      />

      <AnimatePresence>
        <StatusBadge status={status} />
      </AnimatePresence>

      {decodeStats && status.type === "success" && (
        <StatGrid
          stats={[
            { label: "Version", value: `v${decodeStats.version}` },
            { label: "Item Count", value: decodeStats.item_count.toLocaleString() },
            { label: "Output Size", value: `~${decodeStats.sizeKb} KB` },
          ]}
        />
      )}
    </div>
  )
}
