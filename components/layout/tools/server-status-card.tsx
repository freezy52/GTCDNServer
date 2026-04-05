"use client"

import { useEffect, useState } from "react"
import { Activity, LoaderCircle, RefreshCw, Wifi, WifiOff } from "lucide-react"

type ServerStatusResponse = {
  host: string
  port: number
  protocol: "udp"
  timeoutMs: number
  status: "reachable" | "unreachable" | "error"
  detail: string
  checkedAt: string
}

const REFRESH_INTERVAL_MS = 15000

function formatCheckedAt(value: string) {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return "Unknown"
  }

  return new Intl.DateTimeFormat("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date)
}

export function ServerStatusCard({ compact = false }: { compact?: boolean }) {
  const [data, setData] = useState<ServerStatusResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true

    const load = async (silent = false) => {
      if (!silent) {
        setLoading(true)
      } else {
        setRefreshing(true)
      }

      try {
        const response = await fetch("/api/server-status", { cache: "no-store" })
        const payload = (await response.json()) as ServerStatusResponse

        if (!response.ok) {
          throw new Error(payload.detail || "Status endpoint failed.")
        }

        if (!mounted) return
        setData(payload)
        setError(null)
      } catch (loadError) {
        if (!mounted) return
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Server status could not be loaded."
        )
      } finally {
        if (!mounted) return
        setLoading(false)
        setRefreshing(false)
      }
    }

    void load()
    const interval = window.setInterval(() => {
      void load(true)
    }, REFRESH_INTERVAL_MS)

    return () => {
      mounted = false
      window.clearInterval(interval)
    }
  }, [])

  const status = data?.status ?? (error ? "error" : "reachable")
  const isReachable = status === "reachable"
  const StatusIcon =
    loading || refreshing
      ? LoaderCircle
      : isReachable
        ? Wifi
        : WifiOff

  return (
    <div
      className={`rounded-2xl border border-border/60 bg-muted/20 ${compact ? "p-4" : "p-3.5"}`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl ${
            isReachable
              ? "bg-emerald-500/12 text-emerald-600"
              : "bg-rose-500/12 text-rose-600"
          }`}
        >
          <StatusIcon
            className={`size-4 ${loading || refreshing ? "animate-spin" : ""}`}
            strokeWidth={1.8}
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[0.65rem] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
                Server Status
              </p>
              <p className="mt-1 text-sm font-semibold text-foreground">
                {loading
                  ? "Kontrol ediliyor..."
                  : isReachable
                    ? "Server acik gorunuyor"
                    : "Server kapali ya da ulasilamiyor"}
              </p>
            </div>
            <button
              type="button"
              onClick={async () => {
                setRefreshing(true)

                try {
                  const response = await fetch("/api/server-status", {
                    cache: "no-store",
                  })
                  const payload = (await response.json()) as ServerStatusResponse

                  if (!response.ok) {
                    throw new Error(payload.detail || "Manual refresh failed.")
                  }

                  setData(payload)
                  setError(null)
                } catch (refreshError) {
                  setError(
                    refreshError instanceof Error
                      ? refreshError.message
                      : "Manual refresh failed."
                  )
                } finally {
                  setRefreshing(false)
                }
              }}
              className="rounded-lg border border-border/60 p-2 text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
              aria-label="Refresh server status"
            >
              <RefreshCw
                className={`size-3.5 ${refreshing ? "animate-spin" : ""}`}
                strokeWidth={1.8}
              />
            </button>
          </div>

          <div className="mt-3 space-y-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <Activity className="size-3.5" strokeWidth={1.8} />
              <span className="font-mono text-[11px] text-foreground">
                37.59.24.98:17091/udp
              </span>
            </div>
            <p>
              {error
                ? error
                : data?.detail ??
                  "UDP probe sonucu bekleniyor."}
            </p>
            <p className="text-[11px]">
              {data
                ? `Son kontrol: ${formatCheckedAt(data.checkedAt)}`
                : "Son kontrol henuz yapilmadi."}
            </p>
            <p className="text-[11px]">
              UDP tarafinda bu kontrol, porttan aninda red gelmiyorsa server'i
              erisilebilir kabul eder.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
