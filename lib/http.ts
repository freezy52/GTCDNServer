import { NextResponse } from "next/server"

export function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unexpected error"
}

export function getErrorStatus(error: unknown, fallbackStatus = 500) {
  if (error instanceof Error && error.message === "Unauthorized") {
    return 401
  }

  return fallbackStatus
}

export function jsonError(error: unknown, status = 500) {
  return NextResponse.json({ error: getErrorMessage(error) }, { status })
}
