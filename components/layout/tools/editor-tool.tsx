"use client"

import { ItemsDatEditor } from "./items-dat-editor"

export function EditorTool() {
  return (
    <ItemsDatEditor
      emptyDescription={
        <>
          Load a binary{" "}
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">items.dat</code>{" "}
          to browse and edit every item field, then export a modified{" "}
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">items.dat</code>{" "}
          with the proton hash shown automatically.
        </>
      }
      emptySublabel="or click to browse - binary .dat file"
      saveLabel="Export .dat"
    />
  )
}
