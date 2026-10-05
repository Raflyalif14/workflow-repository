// Only known, safe archive messages are displayed. Provider errors stay hidden.
export function getOutputArchiveErrorKey(message?: unknown) {
  if (message === "Download all is limited to 100 MiB. Download files individually.") return "outputUi.archiveTooLarge" as const;
  if (message === "Archive file sizes cannot be verified. Download files individually.") return "outputUi.archiveUnknownSize" as const;
  return "outputUi.archiveUnavailable" as const;
}
