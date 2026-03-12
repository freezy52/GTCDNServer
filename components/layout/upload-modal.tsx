"use client"

import { motion } from "framer-motion"
import { Upload } from "lucide-react"
import * as React from "react"

import { Button } from "@/components/ui/button"
import CustomSelect from "@/components/ui/custom-select"
import {
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from "@/components/ui/modal"
import type { FolderOption } from "@/lib/storage"

export type UploadQueueItem = {
  file: File
  relativePath: string
}

type UploadModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  folders: FolderOption[]
  uploadDestination: string
  onUploadDestinationChange: (value: string) => void
  uploading: boolean
  uploadQueue: UploadQueueItem[]
  uploadProgress: number
  fileInputRef: React.RefObject<HTMLInputElement | null>
  folderInputRef: React.RefObject<HTMLInputElement | null>
  onFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void
  onFolderChange: (event: React.ChangeEvent<HTMLInputElement>) => void
  onRemoveItem: (relativePath: string) => void
  onSubmit: (event: React.FormEvent) => Promise<void> | void
  formatFolderLabel: (folder: FolderOption) => string
  formatBytes: (bytes: number) => string
}

export default function UploadModal({
  open,
  onOpenChange,
  folders,
  uploadDestination,
  onUploadDestinationChange,
  uploading,
  uploadQueue,
  uploadProgress,
  fileInputRef,
  folderInputRef,
  onFileChange,
  onFolderChange,
  onRemoveItem,
  onSubmit,
  formatFolderLabel,
  formatBytes,
}: UploadModalProps) {
  const [dropzoneActive, setDropzoneActive] = React.useState(false)

  function handleDropzoneDragOver(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault()
    event.stopPropagation()
    if (!uploading) setDropzoneActive(true)
  }

  function handleDropzoneDragLeave(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault()
    event.stopPropagation()
    setDropzoneActive(false)
  }

  function handleDropzoneDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault()
    event.stopPropagation()
    setDropzoneActive(false)

    if (uploading) return

    const files = Array.from(event.dataTransfer.files ?? [])
    if (files.length === 0) return

    // @note synthesize a change event via a DataTransfer to reuse the existing handler
    const dt = new DataTransfer()
    for (const file of files) dt.items.add(file)

    const syntheticEvent = {
      target: { files: dt.files, value: "" },
    } as unknown as React.ChangeEvent<HTMLInputElement>

    onFileChange(syntheticEvent)
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent>
        <ModalHeader>
          <ModalTitle>Upload</ModalTitle>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>
        </ModalHeader>

        <form onSubmit={onSubmit}>
          <ModalBody>
            <div className="space-y-2">
              <p className="block text-sm font-medium text-foreground">
                Destination folder
              </p>
              <CustomSelect
                value={uploadDestination}
                onValueChange={onUploadDestinationChange}
                triggerClassName="h-10 rounded-xl px-3 text-sm"
                disabled={uploading}
                options={folders.map((folder) => ({
                  label: formatFolderLabel(folder),
                  value: folder.key.slice(0, -1),
                }))}
              />
            </div>

            {/* hidden inputs */}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={onFileChange}
              disabled={uploading}
            />
            <input
              ref={folderInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={onFolderChange}
              disabled={uploading}
            />

            {/* dropzone */}
            <div
              role="button"
              tabIndex={0}
              aria-label="Select files to upload"
              className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                dropzoneActive
                  ? "border-primary bg-primary/5 text-foreground"
                  : "border-border text-muted-foreground hover:border-primary/50 hover:bg-muted/40"
              } ${uploading ? "pointer-events-none opacity-50" : ""}`}
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault()
                  fileInputRef.current?.click()
                }
              }}
              onDragOver={handleDropzoneDragOver}
              onDragLeave={handleDropzoneDragLeave}
              onDrop={handleDropzoneDrop}
            >
              <div className="flex size-10 items-center justify-center rounded-full border border-border bg-muted">
                <Upload className="size-4 text-muted-foreground" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">
                  Drop files here or click to select
                </p>
                <p className="text-xs text-muted-foreground">
                  or{" "}
                  <button
                    type="button"
                    className="underline underline-offset-2 hover:text-foreground transition-colors"
                    disabled={uploading}
                    onClick={(e) => {
                      e.stopPropagation()
                      folderInputRef.current?.click()
                    }}
                  >
                    Upload a folder
                  </button>
                </p>
              </div>
            </div>

            {uploadQueue.length > 0 ? (
              <div className="space-y-2 rounded-lg border border-border bg-muted/40 px-3 py-2">
                <p className="text-sm text-muted-foreground">
                  {uploadQueue.length} file
                  {uploadQueue.length === 1 ? "" : "s"} selected
                </p>
                <div className="upload-queue-scroll max-h-44 space-y-2 overflow-auto pr-1">
                  {uploadQueue.map(({ file, relativePath }) => (
                    <div
                      key={`${relativePath}-${file.size}-${file.lastModified}`}
                      className="flex items-center justify-between gap-3 rounded-md bg-background/70 px-2 py-1.5 text-sm"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-foreground">{relativePath}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatBytes(file.size)}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        onClick={() => onRemoveItem(relativePath)}
                        disabled={uploading}
                      >
                        Remove
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {uploading ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>Uploading</span>
                  <span>{uploadProgress}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <motion.div
                    className="h-full rounded-full bg-primary"
                    animate={{ width: `${uploadProgress}%` }}
                    transition={{ duration: 0.2, ease: "easeOut" }}
                  />
                </div>
              </div>
            ) : null}
          </ModalBody>

          <ModalFooter>
            <Button
              type="submit"
              disabled={uploading || uploadQueue.length === 0}
            >
              {uploading ? "Uploading..." : "Upload"}
            </Button>
          </ModalFooter>
        </form>
      </ModalContent>
    </Modal>
  )
}
