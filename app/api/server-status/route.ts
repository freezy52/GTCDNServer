import { createSocket } from "node:dgram"

import { NextResponse } from "next/server"

const HOST = "37.59.24.98"
const PORT = 17091
const TIMEOUT_MS = 2000
const PAYLOAD = Buffer.from("gtcdn-status")

type ProbeResult =
  | { status: "reachable"; detail: string; checkedAt: string }
  | { status: "unreachable"; detail: string; checkedAt: string }
  | { status: "error"; detail: string; checkedAt: string }

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function probeUdpPort() {
  return new Promise<ProbeResult>((resolve) => {
    const socket = createSocket("udp4")
    const checkedAt = new Date().toISOString()
    let settled = false

    const finish = (result: ProbeResult) => {
      if (settled) return
      settled = true
      socket.close()
      resolve(result)
    }

    socket.once("error", (error) => {
      const code =
        typeof error === "object" && error && "code" in error
          ? String(error.code)
          : "UNKNOWN"

      finish({
        status: code === "ECONNREFUSED" ? "unreachable" : "error",
        detail:
          code === "ECONNREFUSED"
            ? "Port rejected the UDP probe."
            : `Probe failed with ${code}.`,
        checkedAt,
      })
    })

    socket.connect(PORT, HOST, (connectError) => {
      if (connectError) {
        finish({
          status: "error",
          detail: "Socket connection setup failed.",
          checkedAt,
        })
        return
      }

      socket.send(PAYLOAD, (sendError) => {
        if (sendError) {
          finish({
            status: "error",
            detail: "UDP probe could not be sent.",
            checkedAt,
          })
          return
        }

        setTimeout(() => {
          finish({
            status: "reachable",
            detail: "No immediate UDP rejection was received.",
            checkedAt,
          })
        }, TIMEOUT_MS)
      })
    })
  })
}

export async function GET() {
  const result = await probeUdpPort()

  return NextResponse.json({
    host: HOST,
    port: PORT,
    protocol: "udp",
    timeoutMs: TIMEOUT_MS,
    ...result,
  })
}
