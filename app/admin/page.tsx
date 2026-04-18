"use client"

import { AnimatePresence, motion } from "framer-motion"
import {
  Check,
  ChevronDown,
  ChevronRight,
  Download,
  FileText,
  FolderOpen,
  FolderPlus,
  FolderTree,
  HelpCircle,
  LoaderCircle,
  MoreHorizontal,
  MoveRight,
  PencilLine,
  Trash2,
  Upload,
} from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
import { Suspense, useEffect, useMemo, useRef, useState } from "react"

import ChangePasswordModal from "@/components/layout/change-password-modal"
import Navbar from "@/components/layout/navbar"
import RenameFileModal from "@/components/layout/rename-file-modal"
import RenameFolderModal from "@/components/layout/rename-folder-modal"
import {
  ItemsDatEditor,
  type LoadedItemsDatFile,
} from "@/components/layout/tools/items-dat-editor"
import UploadConflictModal from "@/components/layout/upload-conflict-modal"
import UploadModal from "@/components/layout/upload-modal"
import { Button } from "@/components/ui/button"
import CustomSelect from "@/components/ui/custom-select"
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
  type UploadDirectResponse,
  type UploadedFileResult,
  fetchJson,
  formatBytes,
  buildPublicFileUrl,
  formatFolderLabel,
  formatUploadedDate,
  getDecodedJsonFileName,
  getFileNameFromKey,
  getBreadcrumbs,
  getParentPath,
  getUploadSuccessDescription,
  ApiError,
  isDatFileName,
  normalizePath,
} from "@/lib/admin-page"
import { decodeItemsDat, protonHash } from "@/lib/items-dat-helper"
import type { FolderOption, StorageObject } from "@/lib/storage"

function uploadToSignedUrl(
  uploadUrl: string,
  file: File,
  onProgress?: (progress: number) => void
) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open("PUT", uploadUrl)
    xhr.setRequestHeader("content-type", file.type || "application/octet-stream")

    xhr.upload.addEventListener("progress", (event) => {
      if (!event.lengthComputable) return
      onProgress?.(event.loaded / event.total)
    })

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(1)
        resolve()
        return
      }

      reject(new Error("Failed to upload file to storage"))
    })

    xhr.addEventListener("error", () => {
      reject(new Error("Failed to upload file to storage"))
    })

    xhr.send(file)
  })
}

function AdminPageContent() {
  const ITEMS_PER_PAGE = 20
  const router = useRouter()
  const searchParams = useSearchParams()
  const path = searchParams.get("path") ?? ""
  const currentPath = normalizePath(path)

  const [data, setData] = useState<AdminPageData | null>(null)
  const [loadingPage, setLoadingPage] = useState(true)
  const [useLocalTime, setUseLocalTime] = useState(false)

  const [folders, setFolders] = useState<FolderOption[]>([])
  const [foldersLoaded, setFoldersLoaded] = useState(false)
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
  const [sortType, setSortType] = useState<"name" | "date" | "size">("name")
  const [sortMenuOpen, setSortMenuOpen] = useState(false)
  const [page, setPage] = useState(1)
  const [folderModalOpen, setFolderModalOpen] = useState(false)
  const [folderName, setFolderName] = useState("")
  const [folderError, setFolderError] = useState<string | null>(null)
  const [uploadModalOpen, setUploadModalOpen] = useState(false)
  const [uploadDestination, setUploadDestination] = useState("")
  const [uploadQueue, setUploadQueue] = useState<Array<{ file: File; relativePath: string }>>([])
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
  const [howToUseModalOpen, setHowToUseModalOpen] = useState(false)
  const [itemsEditorTarget, setItemsEditorTarget] = useState<StorageObject | null>(null)
  const [itemsEditorFile, setItemsEditorFile] = useState<LoadedItemsDatFile | null>(null)
  const [itemsEditorLoading, setItemsEditorLoading] = useState(false)
  const [itemsEditorError, setItemsEditorError] = useState<string | null>(null)
  const [gamedataXmlFiles, setGamedataXmlFiles] = useState<string[]>([])
  const adminDataCacheRef = useRef(new Map<string, AdminPageData>())
  const fileInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)
  const sortMenuRef = useRef<HTMLDivElement>(null)
  const uploadConflictResolverRef = useRef<
    ((action: UploadConflictAction | "cancel") => void) | null
  >(null)

  useEffect(() => {
    const input = folderInputRef.current
    if (!input) return

    input.setAttribute("webkitdirectory", "")
    input.setAttribute("directory", "")
  }, [uploadModalOpen])

  useEffect(() => {
    if (!itemsEditorTarget) {
      setGamedataXmlFiles([])
      return
    }

    let cancelled = false

    async function collectXmlFiles(folderPath: string): Promise<string[]> {
      const files = await fetchJson<StorageObject[]>(
        `/api/admin/files?path=${encodeURIComponent(folderPath)}`
      )
      const xmlFiles = files
        .filter((file) => !file.isFolder && file.name.toLowerCase().endsWith(".xml"))
        .map((file) => file.key)
      const nestedFolders = files.filter((file) => file.isFolder)
      const nestedResults = await Promise.all(
        nestedFolders.map((folder) => collectXmlFiles(folder.key))
      )

      return [...xmlFiles, ...nestedResults.flat()]
    }

    void (async () => {
      try {
        let xmlFiles: string[] = []
        try {
          xmlFiles = await collectXmlFiles("GameData/ItemRenderers")
        } catch {
          try {
            xmlFiles = await collectXmlFiles("game/gamedata")
          } catch {
            xmlFiles = await collectXmlFiles("gamedata")
          }
        }

        const sortedXmlFiles = xmlFiles.toSorted((left, right) =>
          left.localeCompare(right, undefined, { sensitivity: "base" })
        )
        if (!cancelled) {
          setGamedataXmlFiles(sortedXmlFiles)
        }
      } catch {
        if (!cancelled) {
          setGamedataXmlFiles([])
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [itemsEditorTarget])

  function applyAdminData(nextData: AdminPageData) {
    adminDataCacheRef.current.set(nextData.currentPath, nextData)
    setData(nextData)
    setRequiresPasswordChange(nextData.requiresPasswordChange)
  }

  useEffect(() => {
    void (async () => {
      const cachedData = adminDataCacheRef.current.get(currentPath)

      if (cachedData) {
        applyAdminData(cachedData)
        setLoadingPage(false)
      } else {
        setLoadingPage(true)
      }

      try {
        const nextData = await fetchJson<AdminPageData>(
          `/api/admin/status?path=${encodeURIComponent(currentPath)}`
        )
        applyAdminData(nextData)
        setError(null)
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          router.replace("/login")
          return
        }

        setError(
          error instanceof Error
            ? error.message
            : "Failed to load admin dashboard."
        )
      } finally {
        setLoadingPage(false)
      }
    })()
  }, [currentPath, router])

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

  useEffect(() => {
    if (!sortMenuOpen) return

    function handlePointerDown(event: PointerEvent) {
      if (!sortMenuRef.current?.contains(event.target as Node)) {
        setSortMenuOpen(false)
      }
    }

    document.addEventListener("pointerdown", handlePointerDown)
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown)
    }
  }, [sortMenuOpen])

  const breadcrumbs = getBreadcrumbs(currentPath)
  const currentPageData = useMemo(
    () =>
      adminDataCacheRef.current.get(currentPath) ??
      (data?.currentPath === currentPath ? data : null),
    [currentPath, data]
  )
  const visibleFiles = useMemo(
    () => currentPageData?.files ?? [],
    [currentPageData]
  )
  const showLoadingShell = loadingPage && !adminDataCacheRef.current.has(currentPath)
  const filteredFiles = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    const nextFiles = !query
      ? visibleFiles
      : visibleFiles.filter((file) =>
          file.name.toLowerCase().includes(query)
        )

    return nextFiles.toSorted((left, right) => {
      if (left.isFolder !== right.isFolder) {
        return left.isFolder ? -1 : 1
      }

      if (sortType === "date") {
        if (left.isFolder && right.isFolder) {
          return left.name.localeCompare(right.name, undefined, {
            sensitivity: "base",
          })
        }

        return (
          new Date(right.uploaded).getTime() - new Date(left.uploaded).getTime()
        )
      }

      if (sortType === "size") {
        if (left.isFolder && right.isFolder) {
          return left.name.localeCompare(right.name, undefined, {
            sensitivity: "base",
          })
        }

        return right.size - left.size
      }

      return left.name.localeCompare(right.name, undefined, {
        sensitivity: "base",
      })
    })
  }, [visibleFiles, searchQuery, sortType])
  const totalPages = Math.max(
    1,
    Math.ceil(filteredFiles.length / ITEMS_PER_PAGE)
  )
  const sortLabel =
    sortType === "name"
      ? "Name (A-Z)"
      : sortType === "date"
        ? "Date"
        : "Size"
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
    applyAdminData(nextData)
  }

  async function loadFolders(force = false) {
    if (foldersLoaded && !force) {
      return folders
    }

    const nextFolders = await fetchJson<FolderOption[]>("/api/admin/folders")
    setFolders(nextFolders)
    setFoldersLoaded(true)
    return nextFolders
  }

  async function navigateToPath(nextPath: string) {
    const normalized = normalizePath(nextPath)
    const cachedData = adminDataCacheRef.current.get(normalized)

    if (cachedData) {
      applyAdminData(cachedData)
      setLoadingPage(false)
    } else {
      setLoadingPage(true)
    }

    router.push(
      normalized ? `/admin?path=${encodeURIComponent(normalized)}` : "/admin"
    )
  }

  async function uploadFiles(filesToUpload: File[]) {
    return uploadFilesToPath(filesToUpload, currentPath)
  }

  function getFolderUploadKey(destinationPath: string, relativePath: string) {
    const normalizedDestination = normalizePath(destinationPath)
    const normalizedRelativePath = relativePath
      .replace(/\\/g, "/")
      .replace(/^\/+/, "")

    return `${normalizedDestination ? `${normalizedDestination}/` : ""}${normalizedRelativePath}`
  }

  async function requestUpload(
    file: File,
    destinationPath: string,
    conflictAction?: UploadConflictAction,
    key?: string,
    onProgress?: (progress: number) => void
  ) {
    const response = await fetch("/api/admin/upload/url", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        path: destinationPath,
        key,
        fileName: file.name,
        contentType: file.type || "application/octet-stream",
        conflictAction,
      }),
      cache: "no-store",
    })

    const payload = (await response.json().catch(() => null)) as
      | { error?: string; key?: string; uploadUrl?: string }
      | UploadConflictResponse
      | null

    if (response.ok) {
      const directUpload = payload as UploadDirectResponse | null

      if (!directUpload?.uploadUrl || !directUpload.key) {
        throw new Error("Upload URL generation failed")
      }

      await uploadToSignedUrl(directUpload.uploadUrl, file, onProgress)

      await fetchJson<{ key: string }>("/api/admin/upload/complete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key: directUpload.key }),
      })

      return {
        ok: true as const,
        key: directUpload.key,
      }
    }

    if (
      response.status === 409 &&
      payload &&
      "conflict" in payload &&
      payload.conflict
    ) {
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
        let uploadResult = await requestUpload(
          file,
          destinationPath,
          undefined,
          undefined,
          (progress) => {
            setUploadProgress(
              Math.round(((index + progress) / filesToUpload.length) * 100)
            )
          }
        )

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
          uploadResult = await requestUpload(
            file,
            destinationPath,
            action,
            undefined,
            (progress) => {
              setUploadProgress(
                Math.round(((index + progress) / filesToUpload.length) * 100)
              )
            }
          )

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

  async function uploadFolderItemsToPath(
    itemsToUpload: Array<{ file: File; relativePath: string }>,
    destinationPath: string
  ) {
    if (itemsToUpload.length === 0) return false

    setError(null)
    setUploading(true)
    setUploadProgress(0)

    try {
      const uploadedFiles: UploadedFileResult[] = []

      for (const [index, item] of itemsToUpload.entries()) {
        const baseKey = getFolderUploadKey(destinationPath, item.relativePath)
        let uploadResult = await requestUpload(
          item.file,
          destinationPath,
          undefined,
          baseKey,
          (progress) => {
            setUploadProgress(
              Math.round(((index + progress) / itemsToUpload.length) * 100)
            )
          }
        )

        if (!uploadResult.ok) {
          setUploading(false)

          const action = await waitForUploadConflictResolution({
            file: item.file,
            destinationPath,
            existingKey: uploadResult.conflict.key,
            suggestedKey: uploadResult.conflict.suggestedKey,
          })

          if (action === "cancel") {
            return false
          }

          setUploading(true)
          uploadResult = await requestUpload(
            item.file,
            destinationPath,
            action,
            baseKey,
            (progress) => {
              setUploadProgress(
                Math.round(((index + progress) / itemsToUpload.length) * 100)
              )
            }
          )

          if (!uploadResult.ok) {
            throw new Error(uploadResult.conflict.error)
          }
        }

        uploadedFiles.push({
          originalName: item.relativePath,
          uploadedName: uploadResult.key.replace(
            `${normalizePath(destinationPath) ? `${normalizePath(destinationPath)}/` : ""}`,
            ""
          ),
        })

        setUploadProgress(
          Math.round(((index + 1) / itemsToUpload.length) * 100)
        )
      }

      await refresh()
      await loadFolders(true)
      goeyToast.success("Upload completed.", {
        description:
          itemsToUpload.length === 1
            ? `"${uploadedFiles[0]?.uploadedName ?? uploadedFiles[0]?.originalName ?? "file"}" has been uploaded successfully.`
            : `${itemsToUpload.length} files has been upload successfully.`,
      })
      return true
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload failed"
      setError(message)
      goeyToast.error(message)
      return false
    } finally {
      setUploading(false)
      if (folderInputRef.current) folderInputRef.current.value = ""
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
    try {
      await loadFolders()
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load folders"
      setError(message)
      goeyToast.error("Upload unavailable.", {
        description: message,
      })
      return
    }
    setUploadModalOpen(true)
  }

  async function openUploadFolderModal() {
    setError(null)
    setUploadQueue([])
    setUploadProgress(0)
    setUploadConflict(null)
    setUploadDestination(currentPath)
    try {
      await loadFolders()
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load folders"
      setError(message)
      goeyToast.error("Folder upload unavailable.", {
        description: message,
      })
      return
    }
    setUploadModalOpen(true)
  }

  function handleUploadQueueChange(event: React.ChangeEvent<HTMLInputElement>) {
    const nextFiles = Array.from(event.target.files ?? [])
    if (nextFiles.length === 0) return

    setUploadQueue((current) => {
      const merged = [...current]
      for (const file of nextFiles) {
        const relativePath = file.name
        const exists = merged.some(
          (item) =>
            item.relativePath === relativePath &&
            item.file.size === file.size &&
            item.file.lastModified === file.lastModified
        )
        if (!exists) merged.push({ file, relativePath })
      }
      return merged
    })
    event.target.value = ""
  }

  function removeUploadQueueItem(relativePath: string) {
    setUploadQueue((current) =>
      current.filter((item) => item.relativePath !== relativePath)
    )
  }

  function handleUploadFolderQueueChange(
    event: React.ChangeEvent<HTMLInputElement>
  ) {
    const nextFiles = Array.from(event.target.files ?? [])
    if (nextFiles.length === 0) return

    setUploadQueue((current) => {
      const merged = [...current]

      for (const file of nextFiles) {
        const relativePath =
          file.webkitRelativePath?.replace(/\\/g, "/") || file.name
        const exists = merged.some(
          (item) =>
            item.relativePath === relativePath &&
            item.file.size === file.size &&
            item.file.lastModified === file.lastModified
        )

        if (!exists) {
          merged.push({ file, relativePath })
        }
      }

      return merged
    })
    event.target.value = ""
  }

  function removeUploadFolderQueueItem(relativePath: string) {
    setUploadQueue((current) =>
      current.filter((item) => item.relativePath !== relativePath)
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

  async function handleDownloadFile(key: string) {
    const url = buildPublicFileUrl(key)

    if (!url) {
      goeyToast.error("Download unavailable.", {
        description: "Set NEXT_PUBLIC_R2_PUBLIC_URL to enable direct downloads.",
      })
      return
    }

    try {
      const response = await fetch(url, { cache: "no-store" })

      if (!response.ok) {
        throw new Error("Failed to download file")
      }

      const blob = await response.blob()
      const objectUrl = URL.createObjectURL(blob)
      const anchor = document.createElement("a")
      anchor.href = objectUrl
      anchor.download = getFileNameFromKey(key)
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(objectUrl)
      setFileActionsKey(null)
    } catch (downloadError) {
      goeyToast.error("Download failed.", {
        description:
          downloadError instanceof Error
            ? downloadError.message
            : "Failed to download file.",
      })
    }
  }

  async function handleDecodeFile(file: StorageObject) {
    if (!isDatFileName(file.name)) {
      goeyToast.error("Decode unavailable.", {
        description: "Only .dat files can be decoded.",
      })
      return
    }

    const url = buildPublicFileUrl(file.key)

    if (!url) {
      goeyToast.error("Decode unavailable.", {
        description: "Set NEXT_PUBLIC_R2_PUBLIC_URL to enable direct file access.",
      })
      return
    }

    const decodePromise = (async () => {
      const response = await fetch(url, { cache: "no-store" })

      if (!response.ok) {
        throw new Error("Failed to fetch file")
      }

      const buffer = new Uint8Array(await response.arrayBuffer())
      const decoded = decodeItemsDat(buffer)
      const json = JSON.stringify(decoded, null, 2)
      const objectUrl = URL.createObjectURL(
        new Blob([json], { type: "application/json" })
      )
      const anchor = document.createElement("a")
      anchor.href = objectUrl
      anchor.download = getDecodedJsonFileName(file.name)
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(objectUrl)
      return {
        fileName: file.name,
        decodedName: getDecodedJsonFileName(file.name),
        itemCount: decoded.item_count,
      }
    })()

    setFileActionsKey(null)

    void goeyToast.promise(decodePromise, {
      loading: `Decoding "${file.name}"`,
      success: "Decode completed.",
      error: "Decode failed.",
      description: {
        success: (result) =>
          `"${result.fileName}" decoded successfully as "${result.decodedName}" with ${result.itemCount.toLocaleString()} items.`,
        error: (decodeError) =>
          decodeError instanceof Error
            ? decodeError.message
            : "This file is not a valid supported items.dat file.",
      },
    })
  }

  async function openItemsEditor(file: StorageObject) {
    setItemsEditorTarget(file)
    setItemsEditorFile(null)
    setItemsEditorError(null)
    setItemsEditorLoading(true)
    setFileActionsKey(null)

    try {
      const publicUrl = buildPublicFileUrl(file.key)
      const privateUrl = `/api/admin/download?key=${encodeURIComponent(file.key)}`

      let response = publicUrl
        ? await fetch(publicUrl, { cache: "no-store" })
        : null

      if (!response?.ok) {
        response = await fetch(privateUrl, { cache: "no-store" })
      }

      if (!response.ok) {
        throw new Error("Failed to fetch items.dat")
      }

      await new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => resolve())
      })

      const buffer = new Uint8Array(await response.arrayBuffer())
      const decoded = decodeItemsDat(buffer)

      setItemsEditorFile({
        fileName: file.name,
        data: decoded,
      })
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to open items.dat"
      setItemsEditorError(message)
      goeyToast.error("Editor unavailable.", {
        description: message,
      })
    } finally {
      setItemsEditorLoading(false)
    }
  }

  async function handleSaveItemsEditor({
    encoded,
    hash,
    fileName,
    editedCount,
  }: {
    encoded: Uint8Array
    hash: number
    fileName: string
    editedCount: number
  }) {
    if (!itemsEditorTarget) {
      throw new Error("No items.dat file selected")
    }

    const uploadTarget = await fetchJson<UploadDirectResponse>(
      "/api/admin/upload/url",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          key: itemsEditorTarget.key,
          contentType: "application/octet-stream",
          conflictAction: "replace",
        }),
      }
    )

    const uploadBytes = new Uint8Array(encoded.byteLength)
    uploadBytes.set(encoded)

    const uploadFile = new File([uploadBytes], fileName, {
      type: "application/octet-stream",
    })

    await uploadToSignedUrl(uploadTarget.uploadUrl, uploadFile)
    await fetchJson("/api/admin/upload/complete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key: uploadTarget.key }),
    })
    await refresh()

    goeyToast.success("items.dat saved.", {
      description: `"${itemsEditorTarget.name}" updated with ${editedCount} edits (hash: ${hash >>> 0}).`,
    })

    return `Saved to cache - hash: ${hash >>> 0}`
  }

  async function handleUploadEditorAsset(
    field: "texture" | "extra_file" | "renderer_file",
    file: File,
    targetFolder: string
  ) {
    const normalizedFolder = normalizePath(targetFolder)
    const cacheFolder = normalizePath(
      normalizedFolder ? `cache/${normalizedFolder}` : "cache"
    )
    const targetKey = `${cacheFolder ? `${cacheFolder}/` : ""}${file.name}`
    const uploadTarget = await fetchJson<UploadDirectResponse>(
      "/api/admin/upload/url",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          key: targetKey,
          contentType: file.type || "application/octet-stream",
          conflictAction: "replace",
        }),
      }
    )

    await uploadToSignedUrl(uploadTarget.uploadUrl, file)
    await fetchJson("/api/admin/upload/complete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key: uploadTarget.key }),
    })
    await loadFolders(true)
    await refresh()

    const uploadedBuffer = new Uint8Array(await file.arrayBuffer())
    const uploadedHash = protonHash(uploadedBuffer)

    goeyToast.success("Asset uploaded.", {
      description: `"${file.name}" uploaded to "${cacheFolder || "cache"}" for ${field}.`,
    })

    return {
      storedPath:
        field === "renderer_file"
          ? file.name
          : uploadTarget.key.replace(/^cache\/+/, ""),
      hash: uploadedHash,
    }
  }

  async function handleSelectExistingRendererFile(key: string) {
    const normalizedKey = normalizePath(key)
    const publicUrl = buildPublicFileUrl(normalizedKey)
    const privateUrl = `/api/admin/download?key=${encodeURIComponent(normalizedKey)}`

    let response = publicUrl
      ? await fetch(publicUrl, { cache: "no-store" })
      : null

    if (!response?.ok) {
      response = await fetch(privateUrl, { cache: "no-store" })
    }

    if (!response.ok) {
      throw new Error("Failed to fetch renderer XML")
    }

    const buffer = new Uint8Array(await response.arrayBuffer())
    return {
      storedPath: normalizedKey.split("/").pop() ?? normalizedKey,
      hash: protonHash(buffer),
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
    const ok = await uploadFolderItemsToPath(uploadQueue, uploadDestination)
    if (!ok) return
    setUploadQueue([])
    setUploadModalOpen(false)
  }

  async function openMoveModal(fileKey: string) {
    setMoveError(null)
    setMoveFileKey(fileKey)
    setMoveDestination(currentPath)
    try {
      await loadFolders()
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load folders"
      setMoveError(message)
      goeyToast.error("Move unavailable.", {
        description: message,
      })
      return
    }
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
        description: `"${renameTarget.name}" successfully renamed to "${renameName.trim()}".`,
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
      await loadFolders(true)
      goeyToast.success("Folder renamed.", {
        description: `"${renameFolderTarget.name}" successfully renamed to "${renameFolderName.trim()}".`,
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

  return (
    <div className="min-h-screen bg-background">
      <Navbar
        adminProfile={
          data
            ? {
                name: data.session.user.name ?? "Admin",
                email: data.session.user.email ?? "-",
                onChangePassword: () => setPasswordModalOpen(true),
                onSignOut: handleSignOut,
              }
            : undefined
        }
      />

      {data ? (
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
      ) : null}

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
        folderInputRef={folderInputRef}
        onFileChange={handleUploadQueueChange}
        onFolderChange={handleUploadFolderQueueChange}
        onRemoveItem={removeUploadQueueItem}
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

      <Modal
        open={!!itemsEditorTarget}
        onOpenChange={(open) => {
          if (open) return
          setItemsEditorTarget(null)
          setItemsEditorFile(null)
          setItemsEditorLoading(false)
          setItemsEditorError(null)
        }}
        dismissible={!itemsEditorLoading}
      >
        <ModalContent className="max-w-7xl">
          <ModalHeader>
            <div className="space-y-2">
              <ModalTitle>Edit items.dat</ModalTitle>
              <ModalDescription>
                {itemsEditorTarget
                  ? `Editing ${itemsEditorTarget.name} directly from cache.`
                  : "Load an items.dat file from cache and save it back in place."}
              </ModalDescription>
            </div>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setItemsEditorTarget(null)
                setItemsEditorFile(null)
                setItemsEditorLoading(false)
                setItemsEditorError(null)
              }}
              disabled={itemsEditorLoading}
            >
              Close
            </Button>
          </ModalHeader>

          <ModalBody className="mt-4">
            {itemsEditorLoading ? (
              <div className="flex h-[70vh] items-center justify-center">
                <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                  <LoaderCircle className="size-4 animate-spin" />
                  <span>Loading items.dat...</span>
                </div>
              </div>
            ) : itemsEditorFile ? (
              <div className="flex h-[70vh] min-h-0 overflow-hidden">
                <ItemsDatEditor
                  initialFile={itemsEditorFile}
                  allowFileLoad={false}
                  saveLabel="Save to cache"
                  assetFolderOptions={["game", "interface", "audio", "images"]}
                  rendererFileOptions={gamedataXmlFiles}
                  onSelectExistingRendererFile={handleSelectExistingRendererFile}
                  onAssetUpload={handleUploadEditorAsset}
                  onSave={handleSaveItemsEditor}
                />
              </div>
            ) : (
              <div className="flex h-[28vh] items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 px-6 text-center text-sm text-muted-foreground">
                {itemsEditorError ?? "This file could not be opened."}
              </div>
            )}
          </ModalBody>
        </ModalContent>
      </Modal>

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
                <p className="block text-sm font-medium text-foreground">
                  Destination folder
                </p>
                <CustomSelect
                  value={moveDestination}
                  onValueChange={setMoveDestination}
                  triggerClassName="h-10 rounded-xl px-3 text-sm"
                  options={folders.map((folder) => ({
                    label: formatFolderLabel(folder),
                    value: folder.key.slice(0, -1),
                  }))}
                />
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

      <Modal open={howToUseModalOpen} onOpenChange={setHowToUseModalOpen}>
        <ModalContent className="max-w-lg">
          <ModalHeader>
            <ModalTitle>How to use</ModalTitle>
          </ModalHeader>
          <ModalBody className="space-y-5">
            <div className="space-y-1.5">
              <p className="text-sm font-medium text-foreground">Uploading files</p>
              <p className="text-sm text-muted-foreground">
                Click <span className="font-medium text-foreground">Upload</span> to add individual files or{" "}
                <span className="font-medium text-foreground">Upload Folder</span> to upload an entire folder at once.
                You can also drag and drop files directly onto the file list.
              </p>
            </div>
            <div className="space-y-1.5">
              <p className="text-sm font-medium text-foreground">Managing files</p>
              <p className="text-sm text-muted-foreground">
                Hover over a file and click the <span className="font-medium text-foreground">...</span> menu to rename,
                move, download, edit <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">items.dat</code>,
                or delete it. Folders can be navigated by clicking their name.
              </p>
            </div>
            <div className="space-y-1.5">
              <p className="text-sm font-medium text-foreground">Public file URL</p>
              <p className="text-sm text-muted-foreground">
                Files are publicly accessible at:
              </p>
              <div className="rounded-lg border border-border bg-muted px-3 py-2 font-mono text-xs text-foreground break-all">
                {process.env.NEXT_PUBLIC_R2_PUBLIC_URL
                  ? `${process.env.NEXT_PUBLIC_R2_PUBLIC_URL.replace(/\/+$/, "")}/<file-path>`
                  : <span className="text-destructive">NEXT_PUBLIC_R2_PUBLIC_URL is not set</span>}
              </div>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button onClick={() => setHowToUseModalOpen(false)}>Close</Button>
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
                {showLoadingShell ? (
                  <span className="inline-flex items-center gap-2 align-middle">
                    <LoaderCircle className="size-3.5 animate-spin" />
                    <span>Loading count...</span>
                  </span>
                ) : (
                  <>
                    {filteredFiles.length}{" "}
                    {filteredFiles.length === 1 ? "item" : "items"}
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setHowToUseModalOpen(true)}
              title="How to use"
            >
              <HelpCircle className="size-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setFolderModalOpen(true)}
              disabled={showLoadingShell}
            >
              <FolderPlus className="size-3.5" />
              New Folder
            </Button>
            <Button
              onClick={openUploadModal}
              disabled={uploading || showLoadingShell}
            >
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
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => {
                  setSearchQuery(event.target.value)
                  setPage(1)
                }}
                placeholder="Search files and folders"
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground transition-colors outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/50"
                disabled={showLoadingShell}
              />
              <div className="flex items-center gap-2 sm:w-auto sm:shrink-0">
                <span className="text-xs font-medium text-muted-foreground">
                  Sort
                </span>
                <div className="relative" ref={sortMenuRef}>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setSortMenuOpen((open) => !open)}
                    disabled={showLoadingShell}
                    className="min-w-36 justify-between"
                  >
                    {sortLabel}
                    <ChevronDown
                      className={`size-3.5 transition-transform ${sortMenuOpen ? "rotate-180" : ""}`}
                    />
                  </Button>

                  <AnimatePresence>
                    {sortMenuOpen ? (
                      <motion.div
                        className="absolute right-0 top-full z-20 mt-2 w-full rounded-xl border border-border bg-popover p-1 shadow-lg"
                        initial={{ opacity: 0, y: -6, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -4, scale: 0.98 }}
                        transition={{ duration: 0.16, ease: "easeOut" }}
                      >
                        {[
                          { value: "name" as const, label: "Name (A-Z)" },
                          { value: "date" as const, label: "Date" },
                          { value: "size" as const, label: "Size" },
                        ].map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            className={`flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-left text-sm transition-colors ${
                              sortType === option.value
                                ? "bg-primary text-primary-foreground"
                                : "text-popover-foreground hover:bg-muted"
                            }`}
                            onClick={() => {
                              setSortType(option.value)
                              setPage(1)
                              setSortMenuOpen(false)
                            }}
                          >
                            <span>{option.label}</span>
                            {sortType === option.value ? (
                              <Check className="size-3.5" />
                            ) : null}
                          </button>
                        ))}
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </div>
              </div>
            </div>
          </div>
          {showLoadingShell ? (
            <div className="flex flex-col items-center justify-center gap-3 px-6 py-20 text-muted-foreground">
              <LoaderCircle className="size-8 animate-spin opacity-70" />
              <p className="text-sm">Loading items...</p>
            </div>
          ) : filteredFiles.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 px-6 py-20 text-muted-foreground">
              <FolderOpen className="size-8 opacity-40" />
              <p className="text-sm">
                {searchQuery
                  ? "No items match your search."
                  : "This folder is empty. Upload files or create a new folder."}
              </p>
            </div>
          ) : (
            <div className="overflow-visible">
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
                                onClick={() => handleDownloadFile(file.key)}
                              >
                                <Download className="mr-2 size-3.5" />
                                Download file
                              </button>
                              {isDatFileName(file.name) ? (
                                <button
                                  type="button"
                                  className="flex w-full items-center rounded-lg px-3 py-2 text-left text-sm text-popover-foreground transition-colors hover:bg-muted"
                                  onClick={() => openItemsEditor(file)}
                                >
                                  <PencilLine className="mr-2 size-3.5" />
                                  Edit
                                </button>
                              ) : null}
                              {isDatFileName(file.name) ? (
                                <button
                                  type="button"
                                  className="flex w-full items-center rounded-lg px-3 py-2 text-left text-sm text-popover-foreground transition-colors hover:bg-muted"
                                  onClick={() => handleDecodeFile(file)}
                                >
                                  <FileText className="mr-2 size-3.5" />
                                  Decode
                                </button>
                              ) : null}
                              <button
                                type="button"
                                className="flex w-full items-center rounded-lg px-3 py-2 text-left text-sm text-popover-foreground transition-colors hover:bg-muted"
                                onClick={() => openRenameModal(file)}
                              >
                                <PencilLine className="mr-2 size-3.5" />
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
                                <Trash2 className="mr-2 size-3.5" />
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
                              <PencilLine className="mr-2 size-3.5" />
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
                              <Trash2 className="mr-2 size-3.5" />
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
