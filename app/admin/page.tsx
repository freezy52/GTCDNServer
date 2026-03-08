"use client"

import { AnimatePresence, motion } from "framer-motion"
import {
  ChevronRight,
  FileText,
  FolderOpen,
  FolderPlus,
  FolderTree,
  MoreHorizontal,
  MoveRight,
  Upload,
} from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
import { Suspense, useEffect, useMemo, useRef, useState } from "react"

import ChangePasswordModal from "@/components/layout/change-password-modal"
import Navbar from "@/components/layout/navbar"
import RenameFileModal from "@/components/layout/rename-file-modal"
import RenameFolderModal from "@/components/layout/rename-folder-modal"
import UploadConflictModal from "@/components/layout/upload-conflict-modal"
import UploadModal from "@/components/layout/upload-modal"
import { Button } from "@/components/ui/button"
import { goeyToast } from "@/components/ui/goey-toaster"
import {
  Modal,
  ModalBody,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from "@/components/ui/modal"
import { authClient } from "@/lib/auth-client"
import {
  type AdminPageData,
  type UploadConflictAction,
  type UploadConflictResponse,
  type UploadedFileResult,
  fetchJson,
  formatBytes,
  formatFolderLabel,
  formatUploadedDate,
  getFileNameFromKey,
  getBreadcrumbs,
  getParentPath,
  getUploadSuccessDescription,
  mergeUploadQueue,
  normalizePath,
} from "@/lib/admin-page"
import type { FolderOption, StorageObject } from "@/lib/storage"

function AdminPageContent() {
  const ITEMS_PER_PAGE = 20
  const router = useRouter()
  const searchParams = useSearchParams()
  const path = searchParams.get("path") ?? ""
  const currentPath = normalizePath(path)

  const [data, setData] = useState<AdminPageData | null>(null)
  const [loadingPage, setLoadingPage] = useState(true)
  const [useLocalTime, setUseLocalTime] = useState(false)

  const [files, setFiles] = useState<StorageObject[]>([])
  const [folders, setFolders] = useState<FolderOption[]>([])
  const [requiresPasswordChange, setRequiresPasswordChange] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const [draggingFileKey, setDraggingFileKey] = useState<string | null>(null)
  const [dragOverFolderKey, setDragOverFolderKey] = useState<string | null>(
    null
  )
  const [dragOverBreadcrumbPath, setDragOverBreadcrumbPath] = useState<
    string | null
  >(null)
  const [creatingFolder, setCreatingFolder] = useState(false)
  const [movingFile, setMovingFile] = useState(false)
  const [deletingKey, setDeletingKey] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<StorageObject | null>(null)
  const [fileActionsKey, setFileActionsKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [page, setPage] = useState(1)
  const [folderModalOpen, setFolderModalOpen] = useState(false)
  const [folderName, setFolderName] = useState("")
  const [folderError, setFolderError] = useState<string | null>(null)
  const [uploadModalOpen, setUploadModalOpen] = useState(false)
  const [uploadDestination, setUploadDestination] = useState("")
  const [uploadQueue, setUploadQueue] = useState<File[]>([])
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadConflict, setUploadConflict] = useState<{
    file: File
    destinationPath: string
    existingKey: string
    suggestedKey: string
  } | null>(null)
  const [moveModalOpen, setMoveModalOpen] = useState(false)
  const [moveFileKey, setMoveFileKey] = useState<string | null>(null)
  const [moveDestination, setMoveDestination] = useState("")
  const [moveError, setMoveError] = useState<string | null>(null)
  const [renameTarget, setRenameTarget] = useState<StorageObject | null>(null)
  const [renameName, setRenameName] = useState("")
  const [renameError, setRenameError] = useState<string | null>(null)
  const [renamingFile, setRenamingFile] = useState(false)
  const [renameFolderTarget, setRenameFolderTarget] =
    useState<StorageObject | null>(null)
  const [renameFolderName, setRenameFolderName] = useState("")
  const [renameFolderError, setRenameFolderError] = useState<string | null>(
    null
  )
  const [renamingFolder, setRenamingFolder] = useState(false)
  const [passwordModalOpen, setPasswordModalOpen] = useState(false)
  const [newPassword, setNewPassword] = useState("")
  const [changingPassword, setChangingPassword] = useState(false)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const uploadConflictResolverRef = useRef<
    ((action: UploadConflictAction | "cancel") => void) | null
  >(null)

  useEffect(() => {
    void (async () => {
      setLoadingPage(true)

      try {
        const nextData = await fetchJson<AdminPageData>(
          `/api/admin/status?path=${encodeURIComponent(currentPath)}`
        )
        setData(nextData)
      } catch {
        router.replace("/login")
      } finally {
        setLoadingPage(false)
      }
    })()
  }, [currentPath, router])

  useEffect(() => {
    if (!data) return
    setFiles(data.files)
    setRequiresPasswordChange(data.requiresPasswordChange)
  }, [data])

  useEffect(() => {
    setSearchQuery("")
    setPage(1)
  }, [currentPath])

  useEffect(() => {
    setUseLocalTime(true)
  }, [])

  useEffect(() => {
    if (!fileActionsKey) return

    function handlePointerDown(event: PointerEvent) {
      const target = event.target

      if (
        target instanceof HTMLElement &&
        target.closest("[data-file-actions='true']")
      ) {
        return
      }

      setFileActionsKey(null)
    }

    document.addEventListener("pointerdown", handlePointerDown)
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown)
    }
  }, [fileActionsKey])

  const breadcrumbs = getBreadcrumbs(currentPath)
  const filteredFiles = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return files

    return files.filter((file) => file.name.toLowerCase().includes(query))
  }, [files, searchQuery])
  const totalPages = Math.max(
    1,
    Math.ceil(filteredFiles.length / ITEMS_PER_PAGE)
  )
  const paginatedFiles = useMemo(() => {
    const start = (page - 1) * ITEMS_PER_PAGE
    return filteredFiles.slice(start, start + ITEMS_PER_PAGE)
  }, [filteredFiles, page])

  useEffect(() => {
    setPage((current) => Math.min(current, totalPages))
  }, [totalPages])

  async function refresh() {
    const nextData = await fetchJson<AdminPageData>(
      `/api/admin/status?path=${encodeURIComponent(currentPath)}`
    )
    setData(nextData)
    setFiles(nextData.files)
    setRequiresPasswordChange(nextData.requiresPasswordChange)
  }

  async function loadFolders() {
    const nextFolders = await fetchJson<FolderOption[]>("/api/admin/folders")
    setFolders(nextFolders)
    return nextFolders
  }

  async function navigateToPath(nextPath: string) {
    const normalized = normalizePath(nextPath)
    router.push(
      normalized ? `/admin?path=${encodeURIComponent(normalized)}` : "/admin"
    )
  }

  async function uploadFiles(filesToUpload: File[]) {
    return uploadFilesToPath(filesToUpload, currentPath)
  }

  async function requestUpload(
    file: File,
    destinationPath: string,
    conflictAction?: UploadConflictAction
  ) {
    const body = new FormData()
    body.append("file", file)
    body.append("path", destinationPath)

    if (conflictAction) {
      body.append("conflictAction", conflictAction)
    }

    const response = await fetch("/api/admin/upload", {
      method: "POST",
      body,
      cache: "no-store",
    })

    const payload = (await response.json().catch(() => null)) as
      | { error?: string; key?: string }
      | UploadConflictResponse
      | null

    if (response.ok) {
      return {
        ok: true as const,
        key: payload && "key" in payload ? payload.key ?? "" : "",
      }
    }

    if (response.status === 409 && payload?.conflict) {
      return {
        ok: false as const,
        conflict: payload,
      }
    }

    throw new Error(payload?.error || "Upload failed")
  }

  function waitForUploadConflictResolution(conflict: {
    file: File
    destinationPath: string
    existingKey: string
    suggestedKey: string
  }) {
    setUploadConflict(conflict)

    return new Promise<UploadConflictAction | "cancel">((resolve) => {
      uploadConflictResolverRef.current = resolve
    })
  }

  function resolveUploadConflict(action: UploadConflictAction | "cancel") {
    uploadConflictResolverRef.current?.(action)
    uploadConflictResolverRef.current = null
    setUploadConflict(null)
  }

  async function uploadFilesToPath(
    filesToUpload: File[],
    destinationPath: string
  ) {
    if (filesToUpload.length === 0) return false

    setError(null)
    setUploading(true)
    setUploadProgress(0)

    try {
      const uploadedFiles: UploadedFileResult[] = []

      for (const [index, file] of filesToUpload.entries()) {
        let uploadResult = await requestUpload(file, destinationPath)

        if (!uploadResult.ok) {
          setUploading(false)

          const action = await waitForUploadConflictResolution({
            file,
            destinationPath,
            existingKey: uploadResult.conflict.key,
            suggestedKey: uploadResult.conflict.suggestedKey,
          })

          if (action === "cancel") {
            return false
          }

          setUploading(true)
          uploadResult = await requestUpload(file, destinationPath, action)

          if (!uploadResult.ok) {
            throw new Error(uploadResult.conflict.error)
          }
        }

        uploadedFiles.push({
          originalName: file.name,
          uploadedName: getFileNameFromKey(uploadResult.key),
        })

        setUploadProgress(
          Math.round(((index + 1) / filesToUpload.length) * 100)
        )
      }

      await refresh()
      goeyToast.success("Upload completed.", {
        description: getUploadSuccessDescription(uploadedFiles),
      })
      return true
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload failed"
      setError(message)
      goeyToast.error(message)
      return false
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
      setDragActive(false)
    }
  }

  async function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setDragOverFolderKey(null)

    if (event.dataTransfer.types.includes("application/x-gtcdn-file-key")) {
      setDragActive(false)
      return
    }

    const droppedFiles = Array.from(event.dataTransfer.files ?? [])
    await uploadFiles(droppedFiles)
  }

  async function openUploadModal() {
    setError(null)
    setUploadQueue([])
    setUploadProgress(0)
    setUploadConflict(null)
    setUploadDestination(currentPath)
    await loadFolders()
    setUploadModalOpen(true)
  }

  function handleUploadQueueChange(event: React.ChangeEvent<HTMLInputElement>) {
    const nextFiles = Array.from(event.target.files ?? [])
    if (nextFiles.length === 0) return

    setUploadQueue((current) => mergeUploadQueue(current, nextFiles))
    event.target.value = ""
  }

  function removeUploadQueueItem(fileToRemove: File) {
    setUploadQueue((current) =>
      current.filter(
        (file) =>
          !(
            file.name === fileToRemove.name &&
            file.size === fileToRemove.size &&
            file.lastModified === fileToRemove.lastModified
          )
      )
    )
  }

  async function handleMoveToFolder(destinationKey: string) {
    if (!draggingFileKey) return

    setError(null)
    setMovingFile(true)

    try {
      await fetchJson("/api/admin/move", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sourceKey: draggingFileKey,
          destinationPrefix: destinationKey,
        }),
      })
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to move file")
    } finally {
      setMovingFile(false)
      setDraggingFileKey(null)
      setDragOverFolderKey(null)
      setDragOverBreadcrumbPath(null)
    }
  }

  async function handleDelete(key: string) {
    setError(null)
    setDeletingKey(key)

    try {
      await fetchJson("/api/admin/files", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key }),
      })
      if (key.endsWith("/")) {
        setFolders((prev) =>
          prev.filter(
            (folder) => !(folder.key === key || folder.key.startsWith(key))
          )
        )
      }
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed")
    } finally {
      setDeletingKey(null)
    }
  }

  function openRenameModal(file: StorageObject) {
    setRenameTarget(file)
    setRenameName(file.name)
    setRenameError(null)
    setFileActionsKey(null)
  }

  function openRenameFolderModal(folder: StorageObject) {
    setRenameFolderTarget(folder)
    setRenameFolderName(folder.name)
    setRenameFolderError(null)
    setFileActionsKey(null)
  }

  async function handleSignOut() {
    await authClient.signOut()
    router.push("/login")
    router.refresh()
  }

  async function handleUploadSubmit(event: React.FormEvent) {
    event.preventDefault()
    const ok = await uploadFilesToPath(uploadQueue, uploadDestination)
    if (!ok) return
    setUploadQueue([])
    setUploadModalOpen(false)
  }

  async function openMoveModal(fileKey: string) {
    setMoveError(null)
    setMoveFileKey(fileKey)
    setMoveDestination(currentPath)
    await loadFolders()
    setMoveModalOpen(true)
  }

  async function handleCreateFolder(event: React.FormEvent) {
    event.preventDefault()
    setFolderError(null)
    setCreatingFolder(true)

    try {
      await fetchJson("/api/admin/folders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          folderName,
          path: currentPath,
        }),
      })
      setFolderModalOpen(false)
      setFolders((prev) => {
        const nextKey = `${currentPath ? `${currentPath}/` : ""}${folderName.trim().replace(/^\/+|\/+$/g, "")}/`
        if (!nextKey || prev.some((folder) => folder.key === nextKey)) {
          return prev
        }
        return [...prev, { key: nextKey, name: nextKey.slice(0, -1) }]
      })
      await refresh()
    } catch (err) {
      setFolderError(
        err instanceof Error ? err.message : "Failed to create folder"
      )
    } finally {
      setCreatingFolder(false)
    }
  }

  async function handleMoveFile(event: React.FormEvent) {
    event.preventDefault()
    if (!moveFileKey) return

    setMoveError(null)
    setMovingFile(true)

    try {
      await fetchJson("/api/admin/move", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sourceKey: moveFileKey,
          destinationPrefix: moveDestination,
        }),
      })
      setMoveModalOpen(false)
      setMoveFileKey(null)
      await refresh()
    } catch (err) {
      setMoveError(err instanceof Error ? err.message : "Failed to move file")
    } finally {
      setMovingFile(false)
    }
  }

  async function handlePasswordChange(event: React.FormEvent) {
    event.preventDefault()
    setPasswordError(null)
    setChangingPassword(true)

    try {
      await fetchJson("/api/admin/password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: newPassword }),
      })
      setNewPassword("")
      setRequiresPasswordChange(false)
      setPasswordModalOpen(false)
    } catch (err) {
      setPasswordError(
        err instanceof Error ? err.message : "Failed to update password"
      )
    } finally {
      setChangingPassword(false)
    }
  }

  async function handleRenameFile(event: React.FormEvent) {
    event.preventDefault()
    if (!renameTarget) return

    setRenameError(null)
    setRenamingFile(true)

    try {
      await fetchJson<{ key: string }>("/api/admin/rename", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sourceKey: renameTarget.key,
          nextName: renameName,
        }),
      })
      await refresh()
      goeyToast.success("File renamed.", {
        description: `"${renameTarget.name}" is now "${renameName.trim()}".`,
      })
      setRenameTarget(null)
      setRenameName("")
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to rename file"
      setRenameError(message)
      goeyToast.error(message)
    } finally {
      setRenamingFile(false)
    }
  }

  async function handleRenameFolder(event: React.FormEvent) {
    event.preventDefault()
    if (!renameFolderTarget) return

    setRenameFolderError(null)
    setRenamingFolder(true)

    try {
      await fetchJson<{ key: string }>("/api/admin/folders", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sourceKey: renameFolderTarget.key,
          nextName: renameFolderName,
        }),
      })
      await refresh()
      await loadFolders()
      goeyToast.success("Folder renamed.", {
        description: `"${renameFolderTarget.name}" is now "${renameFolderName.trim()}".`,
      })
      setRenameFolderTarget(null)
      setRenameFolderName("")
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to rename folder"
      setRenameFolderError(message)
      goeyToast.error(message)
    } finally {
      setRenamingFolder(false)
    }
  }

  if (loadingPage || !data) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4">
        <p className="text-sm text-muted-foreground">Loading dashboard...</p>
      </main>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar
        adminProfile={{
          name: data.session.user.name ?? "Admin",
          email: data.session.user.email ?? "-",
          onChangePassword: () => setPasswordModalOpen(true),
          onSignOut: handleSignOut,
        }}
      />

      <ChangePasswordModal
        open={requiresPasswordChange || passwordModalOpen}
        requiresPasswordChange={requiresPasswordChange}
        newPassword={newPassword}
        changingPassword={changingPassword}
        passwordError={passwordError}
        onOpenChange={setPasswordModalOpen}
        onNewPasswordChange={setNewPassword}
        onSubmit={handlePasswordChange}
      />

      <Modal open={folderModalOpen} onOpenChange={setFolderModalOpen}>
        <ModalContent>
          <ModalHeader>
            <div className="space-y-2">
              <ModalTitle>Create folder</ModalTitle>
              <ModalDescription>
                Create a folder in the current location. Nested names like
                `cache/images` also work.
              </ModalDescription>
            </div>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setFolderModalOpen(false)}
            >
              Close
            </Button>
          </ModalHeader>

          <form onSubmit={handleCreateFolder}>
            <ModalBody>
              <div className="space-y-2">
                <label
                  htmlFor="folder-name"
                  className="block text-sm font-medium text-foreground"
                >
                  Folder name
                </label>
                <input
                  id="folder-name"
                  type="text"
                  required
                  value={folderName}
                  onChange={(event) => setFolderName(event.target.value)}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground transition-colors outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/50"
                  placeholder="example-folder"
                />
              </div>

              {folderError ? (
                <p className="text-sm text-destructive">{folderError}</p>
              ) : null}
            </ModalBody>

            <ModalFooter>
              <Button type="submit" disabled={creatingFolder}>
                {creatingFolder ? "Creating folder..." : "Create folder"}
              </Button>
            </ModalFooter>
          </form>
        </ModalContent>
      </Modal>

      <UploadModal
        open={uploadModalOpen}
        onOpenChange={(open) => {
          setUploadModalOpen(open)

          if (!open) {
            resolveUploadConflict("cancel")
          }
        }}
        folders={folders}
        uploadDestination={uploadDestination}
        onUploadDestinationChange={setUploadDestination}
        uploading={uploading}
        uploadQueue={uploadQueue}
        uploadProgress={uploadProgress}
        fileInputRef={fileInputRef}
        onFileChange={handleUploadQueueChange}
        onRemoveFile={removeUploadQueueItem}
        onSubmit={handleUploadSubmit}
        formatFolderLabel={formatFolderLabel}
        formatBytes={formatBytes}
      />

      <UploadConflictModal
        open={!!uploadConflict}
        fileName={getFileNameFromKey(uploadConflict?.existingKey ?? "")}
        suggestedName={getFileNameFromKey(uploadConflict?.suggestedKey ?? "")}
        onCancel={() => resolveUploadConflict("cancel")}
        onRename={() => resolveUploadConflict("rename")}
        onReplace={() => resolveUploadConflict("replace")}
      />

      <RenameFileModal
        open={!!renameTarget}
        currentName={renameTarget?.name ?? ""}
        nextName={renameName}
        renameError={renameError}
        renaming={renamingFile}
        onOpenChange={(open) => {
          if (open) return
          setRenameTarget(null)
          setRenameName("")
          setRenameError(null)
        }}
        onNextNameChange={setRenameName}
        onSubmit={handleRenameFile}
      />

      <RenameFolderModal
        open={!!renameFolderTarget}
        currentName={renameFolderTarget?.name ?? ""}
        nextName={renameFolderName}
        renameError={renameFolderError}
        renaming={renamingFolder}
        onOpenChange={(open) => {
          if (open) return
          setRenameFolderTarget(null)
          setRenameFolderName("")
          setRenameFolderError(null)
        }}
        onNextNameChange={setRenameFolderName}
        onSubmit={handleRenameFolder}
      />

      <Modal open={moveModalOpen} onOpenChange={setMoveModalOpen}>
        <ModalContent>
          <ModalHeader>
            <div className="space-y-2">
              <ModalTitle>Move file</ModalTitle>
              <ModalDescription>
                Choose the destination folder for `
                {moveFileKey?.split("/").pop()}`.
              </ModalDescription>
            </div>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setMoveModalOpen(false)}
            >
              Close
            </Button>
          </ModalHeader>

          <form onSubmit={handleMoveFile}>
            <ModalBody>
              <div className="space-y-2">
                <label
                  htmlFor="move-destination"
                  className="block text-sm font-medium text-foreground"
                >
                  Destination folder
                </label>
                <select
                  id="move-destination"
                  value={moveDestination}
                  onChange={(event) => setMoveDestination(event.target.value)}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground transition-colors outline-none focus:border-ring focus:ring-2 focus:ring-ring/50"
                >
                  {folders.map((folder) => (
                    <option
                      key={folder.key || "root"}
                      value={folder.key.slice(0, -1)}
                    >
                      {formatFolderLabel(folder)}
                    </option>
                  ))}
                </select>
              </div>

              {moveError ? (
                <p className="text-sm text-destructive">{moveError}</p>
              ) : null}
            </ModalBody>

            <ModalFooter>
              <Button type="submit" disabled={movingFile}>
                {movingFile ? "Moving file..." : "Move file"}
              </Button>
            </ModalFooter>
          </form>
        </ModalContent>
      </Modal>

      <Modal
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <ModalContent className="max-w-sm">
          <ModalHeader className="block space-y-2">
            <ModalTitle>
              Delete {deleteTarget?.isFolder ? "folder" : "file"}?
            </ModalTitle>
            <ModalDescription>
              {deleteTarget?.isFolder
                ? `This will permanently remove ${deleteTarget.name} and all contents inside it.`
                : `This will permanently remove ${deleteTarget?.name}.`}
            </ModalDescription>
          </ModalHeader>

          <ModalFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setDeleteTarget(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deletingKey === deleteTarget?.key}
              onClick={async () => {
                if (!deleteTarget) return
                await handleDelete(deleteTarget.key)
                setDeleteTarget(null)
              }}
            >
              {deletingKey === deleteTarget?.key ? "Deleting..." : "Delete"}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <motion.main
        className="mx-auto max-w-5xl space-y-8 px-6 py-10"
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.24, ease: "easeOut" }}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <button
                type="button"
                className={`rounded-md px-2 py-1 transition-colors hover:text-foreground ${dragOverBreadcrumbPath === "" ? "bg-primary/10 text-foreground" : ""}`}
                onClick={() => navigateToPath("")}
                onDragOver={(event) => {
                  if (!draggingFileKey) return
                  event.preventDefault()
                  event.dataTransfer.dropEffect = "move"
                  setDragOverBreadcrumbPath("")
                }}
                onDragLeave={() => {
                  if (dragOverBreadcrumbPath === "") {
                    setDragOverBreadcrumbPath(null)
                  }
                }}
                onDrop={async (event) => {
                  if (!draggingFileKey) return
                  event.preventDefault()
                  await handleMoveToFolder("")
                }}
              >
                /
              </button>
              {breadcrumbs.map((crumb) => (
                <div key={crumb.path} className="flex items-center gap-2">
                  <ChevronRight className="size-3.5" />
                  <button
                    type="button"
                    className={`rounded-md px-2 py-1 transition-colors hover:text-foreground ${dragOverBreadcrumbPath === crumb.path ? "bg-primary/10 text-foreground" : ""}`}
                    onClick={() => navigateToPath(crumb.path)}
                    onDragOver={(event) => {
                      if (!draggingFileKey) return
                      event.preventDefault()
                      event.dataTransfer.dropEffect = "move"
                      setDragOverBreadcrumbPath(crumb.path)
                    }}
                    onDragLeave={() => {
                      if (dragOverBreadcrumbPath === crumb.path) {
                        setDragOverBreadcrumbPath(null)
                      }
                    }}
                    onDrop={async (event) => {
                      if (!draggingFileKey) return
                      event.preventDefault()
                      await handleMoveToFolder(crumb.path)
                    }}
                  >
                    {crumb.label}
                  </button>
                </div>
              ))}
            </div>

            <div>
              <h1 className="text-xl font-semibold text-foreground">
                File Manager
              </h1>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {currentPath ? `Inside ${currentPath}` : "Root directory"} -{" "}
                {filteredFiles.length}{" "}
                {filteredFiles.length === 1 ? "item" : "items"}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setFolderModalOpen(true)}
            >
              <FolderPlus className="size-3.5" />
              New Folder
            </Button>
            <Button onClick={openUploadModal} disabled={uploading} size="sm">
              <Upload className="size-3.5" />
              {uploading ? "Uploading..." : "Upload"}
            </Button>
          </div>
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <section
          className={`rounded-2xl border transition-colors ${dragActive ? "border-primary bg-primary/5" : "border-border bg-card"}`}
          onDragEnter={(event) => {
            event.preventDefault()
            if (
              event.dataTransfer.types.includes("application/x-gtcdn-file-key")
            ) {
              return
            }
            setDragActive(true)
          }}
          onDragOver={(event) => {
            event.preventDefault()
            if (
              event.dataTransfer.types.includes("application/x-gtcdn-file-key")
            ) {
              return
            }
            setDragActive(true)
          }}
          onDragLeave={(event) => {
            event.preventDefault()
            if (event.currentTarget === event.target) {
              setDragActive(false)
            }
          }}
          onDrop={handleDrop}
        >
          <div className="border-b border-border px-4 py-3">
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => {
                setSearchQuery(event.target.value)
                setPage(1)
              }}
              placeholder="Search files and folders"
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground transition-colors outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/50"
            />
          </div>
          {filteredFiles.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 px-6 py-20 text-muted-foreground">
              <FolderOpen className="size-8 opacity-40" />
              <p className="text-sm">
                {searchQuery
                  ? "No items match your search."
                  : "This folder is empty. Upload files or create a new folder."}
              </p>
            </div>
          ) : (
            <div className="overflow-hidden">
              {currentPath && page === 1 && !searchQuery ? (
                <div
                  className={`px-4 py-3 ${paginatedFiles.length > 0 ? "border-b border-border" : ""} ${dragOverFolderKey === ".." ? "bg-primary/10" : ""}`}
                  onDragOver={(event) => {
                    if (!draggingFileKey) return
                    event.preventDefault()
                    event.dataTransfer.dropEffect = "move"
                    setDragOverFolderKey("..")
                  }}
                  onDragLeave={() => {
                    if (dragOverFolderKey === "..") {
                      setDragOverFolderKey(null)
                    }
                  }}
                  onDrop={async (event) => {
                    if (!draggingFileKey) return
                    event.preventDefault()
                    await handleMoveToFolder(getParentPath(currentPath))
                  }}
                >
                  <button
                    type="button"
                    className="flex w-full items-center gap-4 text-left"
                    onClick={() => navigateToPath(getParentPath(currentPath))}
                  >
                    <FolderOpen
                      className="size-4 shrink-0 text-muted-foreground"
                      strokeWidth={1.5}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        ...
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Up one folder
                      </p>
                    </div>
                  </button>
                </div>
              ) : null}

              {paginatedFiles.map((file, index) => (
                <div
                  key={file.key}
                  className={`group flex items-center gap-4 px-4 py-3 ${index !== paginatedFiles.length - 1 ? "border-b border-border" : ""} ${file.isFolder && dragOverFolderKey === file.key ? "bg-primary/10" : ""}`}
                  onDragOver={(event) => {
                    if (!file.isFolder || !draggingFileKey) return
                    event.preventDefault()
                    event.dataTransfer.dropEffect = "move"
                    setDragOverFolderKey(file.key)
                  }}
                  onDragLeave={() => {
                    if (dragOverFolderKey === file.key) {
                      setDragOverFolderKey(null)
                    }
                  }}
                  onDrop={async (event) => {
                    if (!file.isFolder || !draggingFileKey) return
                    event.preventDefault()
                    await handleMoveToFolder(file.key)
                  }}
                >
                  {file.isFolder ? (
                    <FolderTree
                      className="size-4 shrink-0 text-muted-foreground"
                      strokeWidth={1.5}
                    />
                  ) : (
                    <button
                      type="button"
                      draggable
                      onDragStart={(event) => {
                        event.dataTransfer.effectAllowed = "move"
                        event.dataTransfer.setData(
                          "application/x-gtcdn-file-key",
                          file.key
                        )
                        event.dataTransfer.setData("text/plain", file.key)
                        setDraggingFileKey(file.key)
                      }}
                      onDragEnd={() => {
                        setDraggingFileKey(null)
                        setDragOverFolderKey(null)
                        setDragOverBreadcrumbPath(null)
                      }}
                      className="shrink-0 cursor-grab active:cursor-grabbing"
                      title="Drag to move file"
                    >
                      <FileText
                        className="size-4 text-muted-foreground"
                        strokeWidth={1.5}
                      />
                    </button>
                  )}

                  <div className="min-w-0 flex-1">
                    {file.isFolder ? (
                      <button
                        type="button"
                        className="truncate text-left text-sm font-medium text-foreground hover:text-primary"
                        onClick={() => navigateToPath(file.key)}
                      >
                        {file.name}
                      </button>
                    ) : (
                      <p className="truncate text-sm font-medium text-foreground">
                        {file.name}
                      </p>
                    )}

                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {file.isFolder ? "Folder" : formatBytes(file.size)}{" "}
                      &middot;{" "}
                      {file.isFolder && file.uploaded.startsWith("1970-")
                        ? "Open folder"
                        : formatUploadedDate(file.uploaded, useLocalTime)}
                    </p>
                  </div>

                  {!file.isFolder ? (
                    <>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => openMoveModal(file.key)}
                        title="Move file"
                        className="shrink-0 text-muted-foreground hover:text-foreground md:hidden"
                      >
                        <MoveRight className="size-3.5" />
                      </Button>

                      <div
                        className="relative shrink-0"
                        data-file-actions="true"
                      >
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          onClick={() =>
                            setFileActionsKey((current) =>
                              current === file.key ? null : file.key
                            )
                          }
                          title="File actions"
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <MoreHorizontal className="size-3.5" />
                        </Button>

                        <AnimatePresence>
                          {fileActionsKey === file.key ? (
                            <motion.div
                              className="absolute right-0 top-full z-20 mt-2 w-40 rounded-xl border border-border bg-popover p-1 shadow-lg"
                              initial={{ opacity: 0, y: -6, scale: 0.96 }}
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              exit={{ opacity: 0, y: -4, scale: 0.98 }}
                              transition={{ duration: 0.16, ease: "easeOut" }}
                            >
                              <button
                                type="button"
                                className="flex w-full items-center rounded-lg px-3 py-2 text-left text-sm text-popover-foreground transition-colors hover:bg-muted"
                                onClick={() => openRenameModal(file)}
                              >
                                Rename file
                              </button>
                              <button
                                type="button"
                                className="flex w-full items-center rounded-lg px-3 py-2 text-left text-sm text-destructive transition-colors hover:bg-destructive/10"
                                onClick={() => {
                                  setDeleteTarget(file)
                                  setFileActionsKey(null)
                                }}
                              >
                                Remove
                              </button>
                            </motion.div>
                          ) : null}
                        </AnimatePresence>
                      </div>
                    </>
                  ) : (
                    <div className="relative shrink-0" data-file-actions="true">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        onClick={() =>
                          setFileActionsKey((current) =>
                            current === file.key ? null : file.key
                          )
                        }
                        disabled={deletingKey === file.key}
                        title="Folder actions"
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <MoreHorizontal className="size-3.5" />
                      </Button>

                      <AnimatePresence>
                        {fileActionsKey === file.key ? (
                          <motion.div
                            className="absolute right-0 top-full z-20 mt-2 w-40 rounded-xl border border-border bg-popover p-1 shadow-lg"
                            initial={{ opacity: 0, y: -6, scale: 0.96 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -4, scale: 0.98 }}
                            transition={{ duration: 0.16, ease: "easeOut" }}
                          >
                            <button
                              type="button"
                              className="flex w-full items-center rounded-lg px-3 py-2 text-left text-sm text-popover-foreground transition-colors hover:bg-muted"
                              onClick={() => openRenameFolderModal(file)}
                            >
                              Rename folder
                            </button>
                            <button
                              type="button"
                              className="flex w-full items-center rounded-lg px-3 py-2 text-left text-sm text-destructive transition-colors hover:bg-destructive/10"
                              onClick={() => {
                                setDeleteTarget(file)
                                setFileActionsKey(null)
                              }}
                            >
                              Remove
                            </button>
                          </motion.div>
                        ) : null}
                      </AnimatePresence>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {filteredFiles.length > ITEMS_PER_PAGE ? (
            <div className="flex items-center justify-between border-t border-border px-4 py-3 text-sm text-muted-foreground">
              <span>
                Page {page} of {totalPages}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={page === 1}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                >
                  Previous
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={page === totalPages}
                  onClick={() =>
                    setPage((current) => Math.min(totalPages, current + 1))
                  }
                >
                  Next
                </Button>
              </div>
            </div>
          ) : null}
        </section>
      </motion.main>
    </div>
  )
}

export default function AdminPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-background px-4">
          <p className="text-sm text-muted-foreground">Loading dashboard...</p>
        </main>
      }
    >
      <AdminPageContent />
    </Suspense>
  )
}
