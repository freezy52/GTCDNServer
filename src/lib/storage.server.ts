import "@tanstack/react-start/server-only";

import { env } from "cloudflare:workers";

import type { FolderOption, StorageObject } from "./storage";

function getDatabase(): D1Database {
  const d1 = (env as any).D1_DB as D1Database | undefined;
  if (!d1) throw new Error("D1_DB binding not found");
  return d1;
}

function getBucket(): R2Bucket {
  const bucket = (env as any).R2_DB as R2Bucket | undefined;
  if (!bucket) throw new Error("R2_DB binding not found");
  return bucket;
}

function normalizePrefix(prefix: string) {
  const trimmed = prefix.trim().replace(/^\/+|\/+$/g, "");
  return trimmed ? `${trimmed}/` : "";
}

function getFolderChain(path: string) {
  const normalized = normalizePrefix(path);
  const parts = normalized.split("/").filter(Boolean);
  return parts.map((_, index) => `${parts.slice(0, index + 1).join("/")}/`);
}

function sortEntries(entries: StorageObject[]) {
  return entries.toSorted((a, b) => {
    if (a.isFolder !== b.isFolder) {
      return a.isFolder ? -1 : 1;
    }

    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
}

async function listAllKeys(prefix = "") {
  const bucket = getBucket();
  const normalizedPrefix = normalizePrefix(prefix);
  const keys: string[] = [];
  let cursor: string | undefined;

  while (true) {
    const listed = await bucket.list({ prefix: normalizedPrefix, cursor });
    keys.push(...listed.objects.map((object) => object.key));

    if (!listed.truncated) break;
    cursor = listed.cursor;
  }

  return keys;
}

async function upsertFolders(paths: string[]) {
  if (paths.length === 0) return;

  const d1 = getDatabase();
  const now = new Date().toISOString();

  await d1.batch(
    paths.map((path) =>
      d1
        .prepare(
          "insert into folder (path, createdAt, updatedAt) values (?1, ?2, ?3) on conflict(path) do update set updatedAt = excluded.updatedAt",
        )
        .bind(path, now, now),
    ),
  );
}

async function removeFoldersByPrefix(prefix: string) {
  const d1 = getDatabase();
  const normalizedPrefix = normalizePrefix(prefix);
  if (!normalizedPrefix) return;

  await d1
    .prepare("delete from folder where path = ?1 or path like ?2")
    .bind(normalizedPrefix, `${normalizedPrefix}%`)
    .run();
}

export async function listFiles(prefix = ""): Promise<StorageObject[]> {
  const bucket = getBucket();
  const normalizedPrefix = normalizePrefix(prefix);
  const listed = await bucket.list({
    prefix: normalizedPrefix,
    delimiter: "/",
  });

  const folders = (listed.delimitedPrefixes ?? []).map<StorageObject>((folderKey) => ({
    key: folderKey,
    name: folderKey.slice(normalizedPrefix.length).replace(/\/$/, ""),
    size: 0,
    uploaded: new Date(0).toISOString(),
    isFolder: true,
  }));

  const files = listed.objects
    .filter((object) => object.key !== normalizedPrefix && !object.key.endsWith("/"))
    .map<StorageObject>((object) => ({
      key: object.key,
      name: object.key.slice(normalizedPrefix.length),
      size: object.size,
      uploaded: object.uploaded.toISOString(),
      isFolder: false,
    }));

  return sortEntries([...folders, ...files]);
}

export async function listFolders(): Promise<FolderOption[]> {
  const d1 = getDatabase();
  const folders = await d1
    .prepare("select path from folder order by path asc")
    .all<{ path: string }>();

  return [
    { key: "", name: "Root" },
    ...((folders.results ?? []).map((folder) => ({
      key: folder.path,
      name: folder.path.slice(0, -1),
    })) as FolderOption[]),
  ];
}

export async function uploadFile(
  key: string,
  body: ReadableStream | ArrayBuffer,
  contentType: string,
): Promise<void> {
  const bucket = getBucket();
  await bucket.put(key, body, { httpMetadata: { contentType } });
  await upsertFolders(getFolderChain(key));
}

export async function createFolder(key: string): Promise<void> {
  const bucket = getBucket();
  const normalizedKey = normalizePrefix(key);

  await bucket.put(normalizedKey, new Uint8Array(0), {
    httpMetadata: { contentType: "application/x-directory" },
  });

  await upsertFolders(getFolderChain(normalizedKey));
}

export async function deleteFile(key: string): Promise<void> {
  const bucket = getBucket();
  if (key.endsWith("/")) {
    const keys = await listAllKeys(key);
    const deleteKeys = keys.length > 0 ? keys : [key];
    await bucket.delete(deleteKeys as any);
    await removeFoldersByPrefix(key);
    return;
  }

  await bucket.delete(key);
}

export async function moveFile(sourceKey: string, destinationPrefix: string): Promise<string> {
  const bucket = getBucket();
  const normalizedPrefix = normalizePrefix(destinationPrefix);
  const fileName = sourceKey.split("/").pop();

  if (!fileName) throw new Error("Invalid file key");

  const nextKey = `${normalizedPrefix}${fileName}`;
  if (nextKey === sourceKey) {
    throw new Error("File is already in that folder");
  }

  const object = await bucket.get(sourceKey);
  if (!object?.body) {
    throw new Error("File not found");
  }

  await bucket.put(nextKey, object.body, {
    httpMetadata: {
      contentType: object.httpMetadata?.contentType || "application/octet-stream",
    },
  });

  await bucket.delete(sourceKey);
  await upsertFolders(getFolderChain(nextKey));

  return nextKey;
}
