import { NextResponse } from "next/server"

import { getPasswordChangeStatus } from "@/lib/admin"
import { getErrorStatus, jsonError } from "@/lib/http"
import { requireRequestSession } from "@/lib/session"
import { listFiles } from "@/lib/storage-server"

export async function GET(request: Request) {
  try {
    const session = await requireRequestSession(request)
    const { searchParams } = new URL(request.url)
    const path = searchParams.get("path") ?? ""
    const [files, requiresPasswordChange] = await Promise.all([
      listFiles(path),
      getPasswordChangeStatus(session.user.id),
    ])

    return NextResponse.json({
      currentPath: path,
      files,
      requiresPasswordChange,
      session,
    })
  } catch (error) {
    return jsonError(error, getErrorStatus(error))
  }
}
