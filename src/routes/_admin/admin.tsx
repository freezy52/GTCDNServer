import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  ChevronRight,
  FileText,
  FolderOpen,
  FolderPlus,
  FolderTree,
  MoveRight,
  Trash2,
  Upload,
} from "lucide-react";

import Navbar from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import {
  Modal,
  ModalBody,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from "@/components/ui/modal";
import { authClient } from "@/lib/auth";
import {
  changeAdminPasswordAction,
  createFolderAction,
  deleteFileAction,
  getPasswordStatusAction,
  listFilesAction,
  listFoldersAction,
  moveFileAction,
  uploadFileAction,
} from "@/lib/actions";
import { getSession } from "@/lib/session";
import type { FolderOption, StorageObject } from "@/lib/storage";

type AdminSearch = {
  path?: string;
};

export const Route = createFileRoute("/_admin/admin")({
  validateSearch: (search: Record<string, unknown>): AdminSearch => ({
    path: typeof search.path === "string" ? search.path : undefined,
  }),
  loaderDeps: ({ search }) => ({
    path: search.path ?? "",
  }),
  head: () => ({
    meta: [{ title: "Admin — GTCDN" }],
  }),
  loader: async ({ deps }) => {
    const [files, folders, passwordStatus, session] = await Promise.all([
      listFilesAction({ data: deps.path }),
      listFoldersAction(),
      getPasswordStatusAction(),
      getSession(),
    ]);

    return {
      currentPath: deps.path,
      files,
      folders,
      requiresPasswordChange: passwordStatus.requiresPasswordChange,
      session,
    };
  },
  component: AdminPage,
});

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function normalizePath(path: string) {
  return path.trim().replace(/^\/+|\/+$/g, "");
}

function getParentPath(path: string) {
  const normalized = normalizePath(path);
  if (!normalized) return "";

  const parts = normalized.split("/");
  parts.pop();
  return parts.join("/");
}

function getBreadcrumbs(path: string) {
  const normalized = normalizePath(path);
  if (!normalized) return [] as Array<{ label: string; path: string }>;

  const parts = normalized.split("/");
  return parts.map((part, index) => ({
    label: part,
    path: parts.slice(0, index + 1).join("/"),
  }));
}

function formatFolderLabel(folder: FolderOption) {
  return folder.key ? folder.name : "Root";
}

function AdminPage() {
  const router = useRouter();
  const data = Route.useLoaderData();

  const [files, setFiles] = useState<StorageObject[]>(data.files);
  const [folders, setFolders] = useState<FolderOption[]>(data.folders);
  const [requiresPasswordChange, setRequiresPasswordChange] = useState(
    data.requiresPasswordChange,
  );
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [draggingFileKey, setDraggingFileKey] = useState<string | null>(null);
  const [dragOverFolderKey, setDragOverFolderKey] = useState<string | null>(null);
  const [dragOverBreadcrumbPath, setDragOverBreadcrumbPath] = useState<string | null>(null);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [movingFile, setMovingFile] = useState(false);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<StorageObject | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [folderModalOpen, setFolderModalOpen] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [folderError, setFolderError] = useState<string | null>(null);
  const [moveModalOpen, setMoveModalOpen] = useState(false);
  const [moveFileKey, setMoveFileKey] = useState<string | null>(null);
  const [moveDestination, setMoveDestination] = useState("");
  const [moveError, setMoveError] = useState<string | null>(null);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setFiles(data.files);
  }, [data.files]);

  useEffect(() => {
    setFolders(data.folders);
  }, [data.folders]);

  useEffect(() => {
    setRequiresPasswordChange(data.requiresPasswordChange);
  }, [data.requiresPasswordChange]);

  const currentPath = normalizePath(data.currentPath);
  const breadcrumbs = getBreadcrumbs(currentPath);

  async function refresh() {
    const [nextFiles, nextFolders] = await Promise.all([
      listFilesAction({ data: currentPath }),
      listFoldersAction(),
    ]);

    setFiles(nextFiles);
    setFolders(nextFolders);
  }

  async function navigateToPath(path: string) {
    await router.navigate({
      to: "/admin",
      search: { path: normalizePath(path) || undefined },
    });
  }

  async function uploadFiles(filesToUpload: File[]) {
    if (filesToUpload.length === 0) return;

    setError(null);
    setUploading(true);

    try {
      for (const file of filesToUpload) {
        const body = new FormData();
        body.append("file", file);
        body.append("path", currentPath);
        await uploadFileAction({ data: body });
      }

      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setDragActive(false);
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const nextFiles = Array.from(e.target.files ?? []);
    await uploadFiles(nextFiles);
  }

  async function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOverFolderKey(null);

    if (e.dataTransfer.types.includes("application/x-gtcdn-file-key")) {
      setDragActive(false);
      return;
    }

    const droppedFiles = Array.from(e.dataTransfer.files ?? []);
    await uploadFiles(droppedFiles);
  }

  async function handleMoveToFolder(destinationKey: string) {
    if (!draggingFileKey) return;

    setError(null);
    setMovingFile(true);

    try {
      await moveFileAction({
        data: {
          sourceKey: draggingFileKey,
          destinationPrefix: destinationKey,
        },
      });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to move file");
    } finally {
      setMovingFile(false);
      setDraggingFileKey(null);
      setDragOverFolderKey(null);
      setDragOverBreadcrumbPath(null);
    }
  }

  async function handleDelete(key: string) {
    setError(null);
    setDeletingKey(key);

    try {
      await deleteFileAction({ data: key });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeletingKey(null);
    }
  }

  function openDeleteModal(file: StorageObject) {
    setDeleteTarget(file);
  }

  async function handleSignOut() {
    await authClient.signOut();
    await router.navigate({ to: "/login" });
  }

  function openPasswordModal() {
    setPasswordError(null);
    setPasswordModalOpen(true);
  }

  function openFolderModal() {
    setFolderError(null);
    setFolderName("");
    setFolderModalOpen(true);
  }

  function openMoveModal(fileKey: string) {
    setMoveError(null);
    setMoveFileKey(fileKey);
    setMoveDestination(currentPath);
    setMoveModalOpen(true);
  }

  async function handleCreateFolder(e: React.FormEvent) {
    e.preventDefault();
    setFolderError(null);
    setCreatingFolder(true);

    try {
      await createFolderAction({
        data: {
          folderName,
          path: currentPath,
        },
      });
      setFolderModalOpen(false);
      await refresh();
    } catch (err) {
      setFolderError(err instanceof Error ? err.message : "Failed to create folder");
    } finally {
      setCreatingFolder(false);
    }
  }

  async function handleMoveFile(e: React.FormEvent) {
    e.preventDefault();
    if (!moveFileKey) return;

    setMoveError(null);
    setMovingFile(true);

    try {
      await moveFileAction({
        data: {
          sourceKey: moveFileKey,
          destinationPrefix: moveDestination,
        },
      });
      setMoveModalOpen(false);
      setMoveFileKey(null);
      await refresh();
    } catch (err) {
      setMoveError(err instanceof Error ? err.message : "Failed to move file");
    } finally {
      setMovingFile(false);
    }
  }

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault();
    setPasswordError(null);
    setChangingPassword(true);

    try {
      await changeAdminPasswordAction({ data: newPassword });
      setNewPassword("");
      setRequiresPasswordChange(false);
      setPasswordModalOpen(false);
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : "Failed to update password");
    } finally {
      setChangingPassword(false);
    }
  }

  return (
    <div className="bg-background min-h-screen">
      <Navbar
        adminProfile={{
          name: data.session?.user.name ?? "Admin",
          email: data.session?.user.email ?? "-",
          onChangePassword: openPasswordModal,
          onSignOut: handleSignOut,
        }}
      />

      <Modal
        open={requiresPasswordChange || passwordModalOpen}
        onOpenChange={setPasswordModalOpen}
        dismissible={!requiresPasswordChange}
      >
        <ModalContent>
          <ModalHeader>
            <div className="space-y-2">
              <ModalTitle>
                {requiresPasswordChange ? "Change default password" : "Change password"}
              </ModalTitle>
              <ModalDescription>
                {requiresPasswordChange
                  ? "Your account is still using the default password. You must set a new password before continuing."
                  : "Set a new password for the admin account."}
              </ModalDescription>
            </div>

            {!requiresPasswordChange && (
              <Button type="button" variant="ghost" size="sm" onClick={() => setPasswordModalOpen(false)}>
                Close
              </Button>
            )}
          </ModalHeader>

          <form onSubmit={handlePasswordChange}>
            <ModalBody>
              <div className="space-y-2">
                <label htmlFor="new-password" className="block text-sm font-medium text-foreground">
                  New password
                </label>
                <input
                  id="new-password"
                  type="password"
                  required
                  minLength={8}
                  autoFocus
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="border-input bg-background text-foreground placeholder:text-muted-foreground focus:border-ring focus:ring-ring/50 w-full rounded-lg border px-3 py-2 text-sm outline-none transition-colors focus:ring-2"
                  placeholder="Enter a new password"
                />
              </div>

              {passwordError && <p className="text-sm text-destructive">{passwordError}</p>}
            </ModalBody>

            <ModalFooter className="justify-end">
              <Button type="submit" disabled={changingPassword}>
                {changingPassword ? "Updating password..." : "Update password"}
              </Button>
            </ModalFooter>
          </form>
        </ModalContent>
      </Modal>

      <Modal open={folderModalOpen} onOpenChange={setFolderModalOpen}>
        <ModalContent>
          <ModalHeader>
            <div className="space-y-2">
              <ModalTitle>Create folder</ModalTitle>
              <ModalDescription>
                Create a folder in the current location. Nested names like `cache/images`
                also work.
              </ModalDescription>
            </div>

            <Button type="button" variant="ghost" size="sm" onClick={() => setFolderModalOpen(false)}>
              Close
            </Button>
          </ModalHeader>

          <form onSubmit={handleCreateFolder}>
            <ModalBody>
              <div className="space-y-2">
                <label htmlFor="folder-name" className="block text-sm font-medium text-foreground">
                  Folder name
                </label>
                <input
                  id="folder-name"
                  type="text"
                  required
                  autoFocus
                  value={folderName}
                  onChange={(e) => setFolderName(e.target.value)}
                  className="border-input bg-background text-foreground placeholder:text-muted-foreground focus:border-ring focus:ring-ring/50 w-full rounded-lg border px-3 py-2 text-sm outline-none transition-colors focus:ring-2"
                  placeholder="example-folder"
                />
              </div>

              {folderError && <p className="text-sm text-destructive">{folderError}</p>}
            </ModalBody>

            <ModalFooter>
              <Button type="submit" disabled={creatingFolder}>
                {creatingFolder ? "Creating folder..." : "Create folder"}
              </Button>
            </ModalFooter>
          </form>
        </ModalContent>
      </Modal>

      <Modal open={moveModalOpen} onOpenChange={setMoveModalOpen}>
        <ModalContent>
          <ModalHeader>
            <div className="space-y-2">
              <ModalTitle>Move file</ModalTitle>
              <ModalDescription>
                Choose the destination folder for `{moveFileKey?.split("/").pop()}`.
              </ModalDescription>
            </div>

            <Button type="button" variant="ghost" size="sm" onClick={() => setMoveModalOpen(false)}>
              Close
            </Button>
          </ModalHeader>

          <form onSubmit={handleMoveFile}>
            <ModalBody>
              <div className="space-y-2">
                <label htmlFor="move-destination" className="block text-sm font-medium text-foreground">
                  Destination folder
                </label>
                <select
                  id="move-destination"
                  value={moveDestination}
                  onChange={(e) => setMoveDestination(e.target.value)}
                  className="border-input bg-background text-foreground focus:border-ring focus:ring-ring/50 w-full rounded-lg border px-3 py-2 text-sm outline-none transition-colors focus:ring-2"
                >
                  {folders.map((folder) => (
                    <option key={folder.key || "root"} value={folder.key.slice(0, -1)}>
                      {formatFolderLabel(folder)}
                    </option>
                  ))}
                </select>
              </div>

              {moveError && <p className="text-sm text-destructive">{moveError}</p>}
            </ModalBody>

            <ModalFooter>
              <Button type="submit" disabled={movingFile}>
                {movingFile ? "Moving file..." : "Move file"}
              </Button>
            </ModalFooter>
          </form>
        </ModalContent>
      </Modal>

      <Modal open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <ModalContent className="max-w-sm">
          <ModalHeader className="block space-y-2">
            <ModalTitle>Delete {deleteTarget?.isFolder ? "folder" : "file"}?</ModalTitle>
            <ModalDescription>
              {deleteTarget?.isFolder
                ? `This will permanently remove ${deleteTarget.name} and all contents inside it.`
                : `This will permanently remove ${deleteTarget?.name}.`}
            </ModalDescription>
          </ModalHeader>

          <ModalFooter>
            <Button type="button" variant="ghost" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deletingKey === deleteTarget?.key}
              onClick={async () => {
                if (!deleteTarget) return;
                await handleDelete(deleteTarget.key);
                setDeleteTarget(null);
              }}
            >
              {deletingKey === deleteTarget?.key ? "Deleting..." : "Delete"}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <main className="mx-auto max-w-5xl px-6 py-10 space-y-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <button
                type="button"
                className={`rounded-md px-2 py-1 transition-colors hover:text-foreground ${dragOverBreadcrumbPath === "" ? "bg-primary/10 text-foreground" : ""}`}
                onClick={() => navigateToPath("")}
                onDragOver={(e) => {
                  if (!draggingFileKey) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  setDragOverBreadcrumbPath("");
                }}
                onDragLeave={() => {
                  if (dragOverBreadcrumbPath === "") setDragOverBreadcrumbPath(null);
                }}
                onDrop={async (e) => {
                  if (!draggingFileKey) return;
                  e.preventDefault();
                  await handleMoveToFolder("");
                }}
              >
                Root
              </button>
              {breadcrumbs.map((crumb) => (
                <div key={crumb.path} className="flex items-center gap-2">
                  <ChevronRight className="size-3.5" />
                  <button
                    type="button"
                    className={`rounded-md px-2 py-1 transition-colors hover:text-foreground ${dragOverBreadcrumbPath === crumb.path ? "bg-primary/10 text-foreground" : ""}`}
                    onClick={() => navigateToPath(crumb.path)}
                    onDragOver={(e) => {
                      if (!draggingFileKey) return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                      setDragOverBreadcrumbPath(crumb.path);
                    }}
                    onDragLeave={() => {
                      if (dragOverBreadcrumbPath === crumb.path) setDragOverBreadcrumbPath(null);
                    }}
                    onDrop={async (e) => {
                      if (!draggingFileKey) return;
                      e.preventDefault();
                      await handleMoveToFolder(crumb.path);
                    }}
                  >
                    {crumb.label}
                  </button>
                </div>
              ))}
            </div>

            <div>
              <h1 className="text-xl font-semibold text-foreground">File Manager</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                {currentPath ? `Inside ${currentPath}` : "Root directory"} - {files.length} {files.length === 1 ? "item" : "items"}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {currentPath && (
              <Button type="button" variant="ghost" size="sm" onClick={() => navigateToPath(getParentPath(currentPath))}>
                <FolderOpen className="size-3.5" />
                Up One Level
              </Button>
            )}
            <Button type="button" variant="outline" size="sm" onClick={openFolderModal}>
              <FolderPlus className="size-3.5" />
              New Folder
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={handleUpload}
              disabled={uploading}
            />
            <Button onClick={() => fileInputRef.current?.click()} disabled={uploading} size="sm">
              <Upload className="size-3.5" />
              {uploading ? "Uploading..." : "Upload"}
            </Button>
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <section
          className={`rounded-2xl border transition-colors ${dragActive ? "border-primary bg-primary/5" : "border-border bg-card"}`}
          onDragEnter={(e) => {
            e.preventDefault();
            if (e.dataTransfer.types.includes("application/x-gtcdn-file-key")) return;
            setDragActive(true);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            if (e.dataTransfer.types.includes("application/x-gtcdn-file-key")) return;
            setDragActive(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            if (e.currentTarget === e.target) setDragActive(false);
          }}
          onDrop={handleDrop}
        >
          <div className="border-b border-border px-4 py-3 text-sm text-muted-foreground">
            Drag and drop files here to upload into {currentPath ? `${currentPath}/` : "the root folder"}.
          </div>

          {files.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 px-6 py-20 text-muted-foreground">
              <FolderOpen className="size-8 opacity-40" />
              <p className="text-sm">This folder is empty. Upload files or create a new folder.</p>
            </div>
          ) : (
            <div className="overflow-hidden">
              {files.map((file, index) => (
                <div
                  key={file.key}
                  className={`group flex items-center gap-4 px-4 py-3 ${index !== files.length - 1 ? "border-b border-border" : ""} ${file.isFolder && dragOverFolderKey === file.key ? "bg-primary/10" : ""}`}
                  onDragOver={(e) => {
                    if (!file.isFolder || !draggingFileKey) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    setDragOverFolderKey(file.key);
                  }}
                  onDragLeave={() => {
                    if (dragOverFolderKey === file.key) {
                      setDragOverFolderKey(null);
                    }
                  }}
                  onDrop={async (e) => {
                    if (!file.isFolder || !draggingFileKey) return;
                    e.preventDefault();
                    await handleMoveToFolder(file.key);
                  }}
                >
                  {file.isFolder ? (
                    <FolderTree className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.5} />
                  ) : (
                    <button
                      type="button"
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = "move";
                        e.dataTransfer.setData("application/x-gtcdn-file-key", file.key);
                        e.dataTransfer.setData("text/plain", file.key);
                        setDraggingFileKey(file.key);
                      }}
                      onDragEnd={() => {
                        setDraggingFileKey(null);
                        setDragOverFolderKey(null);
                        setDragOverBreadcrumbPath(null);
                      }}
                      className="shrink-0 cursor-grab active:cursor-grabbing"
                      title="Drag to move file"
                    >
                      <FileText className="size-4 text-muted-foreground" strokeWidth={1.5} />
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
                      <p className="truncate text-sm font-medium text-foreground">{file.name}</p>
                    )}

                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {file.isFolder ? "Folder" : formatBytes(file.size)} &middot;{" "}
                      {file.isFolder && file.uploaded.startsWith("1970-")
                        ? "Open folder"
                        : new Date(file.uploaded).toLocaleDateString(undefined, {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          })}
                    </p>
                  </div>

                  {!file.isFolder && (
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
                  )}

                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => openDeleteModal(file)}
                    disabled={deletingKey === file.key}
                    title={file.isFolder ? "Delete folder" : "Delete file"}
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
