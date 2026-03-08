"use client"

import { GooeyToaster as GoeyToasterPrimitive, gooeyToast } from "goey-toast"
import type { GoeyToasterProps } from "goey-toast"
import "goey-toast/styles.css"

export const goeyToast = gooeyToast
export type { GoeyToasterProps }
export type {
  GoeyToastOptions,
  GoeyPromiseData,
  GoeyToastAction,
  GoeyToastClassNames,
  GoeyToastTimings,
} from "goey-toast"

function GoeyToaster(props: GoeyToasterProps) {
  return (
    <>
      <GoeyToasterPrimitive position="top-center" {...props} />
      <style jsx global>{`
        .gooey-timestamp {
          display: none !important;
        }

        [data-sonner-toast][data-x-position="left"] .gooey-description {
          width: 100%;
          text-align: left !important;
        }

        [data-sonner-toast][data-x-position="center"] .gooey-description {
          width: 100%;
          text-align: center !important;
        }

        [data-sonner-toast][data-x-position="right"] .gooey-description {
          width: 100%;
          text-align: right !important;
        }
      `}</style>
    </>
  )
}

export { GoeyToaster }
