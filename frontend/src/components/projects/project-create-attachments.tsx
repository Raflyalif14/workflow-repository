"use client";
import { useRef, type ReactNode } from "react";
import { AlertCircle, FileText, ImageIcon, Paperclip, X } from "lucide-react";
import { translate as translateI18n, translateStoredError } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { appendDocumentFiles, appendProjectPhotoFiles, DOCUMENT_ACCEPT, getDocumentFileKey, MAX_DOCUMENT_FILES, MAX_PROJECT_PHOTOS, PROJECT_MOM_ACCEPT, PROJECT_PHOTO_ACCEPT, removeDocumentFile, selectSingleProjectMomFile } from "@/lib/document-file-selection";
import { SectionHeading } from "./project-create-section-heading";

function formatFileSize(size: number): string {
  return `${(size / 1024 / 1024).toFixed(2)} MB`;
}

function SelectedFileRow({
  file,
  icon,
  onRemove,
  disabled,
}: {
  file: File;
  icon: ReactNode;
  onRemove: () => void;
  disabled: boolean;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3 border-b border-border/50 py-2.5 last:border-b-0">
      <span className="shrink-0 text-muted-foreground">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground" title={file.name}>
          {file.name}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {file.type || "File"} · {formatFileSize(file.size)}
        </p>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-9 w-9 shrink-0"
        onClick={onRemove}
        disabled={disabled}
        aria-label={translateI18n("projectCreate.removeFile", { name: file.name })}
        title={translateI18n("projectCreate.removeFile", { name: file.name })}
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}

export interface ProjectCreateAttachmentsProps {
  mom: File | null;
  photos: File[];
  documents: File[];
  setMom: (value: File | null) => void;
  setPhotos: (value: File[]) => void;
  setDocuments: (value: File[]) => void;
  onError: (error: string | null) => void;
  fileSelectionError: string | null;
  disabled: boolean;
  submitAttempted: boolean;
}

export function ProjectCreateAttachments({
  mom,
  photos,
  documents,
  setMom,
  setPhotos,
  setDocuments,
  onError,
  fileSelectionError,
  disabled,
  submitAttempted,
}: ProjectCreateAttachmentsProps) {
  const momInputRef = useRef<HTMLInputElement>(null);
  const removeMom = () => {
    setMom(null);
    onError(null);
    if (momInputRef.current) momInputRef.current.value = "";
  };
  const removePhoto = (index: number) => {
    setPhotos(removeDocumentFile(photos, index));
    onError(null);
  };
  const removeDocument = (index: number) => {
    setDocuments(removeDocumentFile(documents, index));
    onError(null);
  };
  return <>
    <section className="border-b border-border px-5 py-6 sm:px-7">
      <SectionHeading number="03" title={translateI18n("projectCreate.intakeEvidence")}>
        {translateI18n("projectCreate.intakeEvidenceHelp")}
      </SectionHeading>

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="min-w-0">
          <div className="mb-3">
            <label className="text-sm font-medium" htmlFor="project-mom">
              {translateI18n("projectCreate.momPdf")} <span className="text-destructive" aria-hidden="true">*</span>
            </label>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{translateI18n("ui.exactPdf")}</p>
          </div>
          <Input
            ref={momInputRef}
            id="project-mom"
            name="mom"
            type="file"
            accept={PROJECT_MOM_ACCEPT}
            disabled={disabled}
            aria-invalid={submitAttempted && !mom}
            onChange={(event) => {
              const selection = selectSingleProjectMomFile(event.target.files);
              event.target.value = "";
              if (selection.error) {
                onError(selection.error);
                return;
              }
              if (!selection.file) return;

              setMom(selection.file);
              onError(null);
            }}
          />
          {mom ? (
            <div className="mt-2 border-y border-border/50">
              <SelectedFileRow
                file={mom}
                icon={<FileText className="h-4 w-4" />}
                onRemove={removeMom}
                disabled={disabled}
              />
            </div>
          ) : submitAttempted ? (
            <p className="mt-1.5 text-xs text-destructive">{translateI18n("copy.momRequired")}</p>
          ) : null}
        </div>

        <div className="min-w-0">
          <div className="mb-3">
            <label className="text-sm font-medium" htmlFor="project-photos">
              {translateI18n("projectCreate.projectPhotos")} <span className="text-destructive" aria-hidden="true">*</span>
            </label>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {translateI18n("projectCreate.photosHelp", { count: MAX_PROJECT_PHOTOS })}
            </p>
          </div>
          <Input
            id="project-photos"
            name="photos"
            type="file"
            multiple
            accept={PROJECT_PHOTO_ACCEPT}
            disabled={disabled}
            aria-invalid={submitAttempted && photos.length === 0}
            onChange={(event) => {
              const selection = appendProjectPhotoFiles(photos, event.target.files);
              setPhotos(selection.files);
              event.target.value = "";
              onError(selection.error);
            }}
          />
          {photos.length > 0 ? (
            <div className="mt-2 border-y border-border/50">
              {photos.map((file, index) => (
                <SelectedFileRow
                  key={getDocumentFileKey(file)}
                  file={file}
                  icon={<ImageIcon className="h-4 w-4" />}
                  onRemove={() => removePhoto(index)}
                  disabled={disabled}
                />
              ))}
            </div>
          ) : submitAttempted ? (
            <p className="mt-1.5 text-xs text-destructive">{translateI18n("copy.photoRequired")}</p>
          ) : null}
        </div>
      </div>

      {fileSelectionError && (
        <div role="alert" className="mt-5 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{translateStoredError(fileSelectionError, "projectCreate.invalidFile")}</span>
        </div>
      )}
    </section>
    <section className="px-5 py-6 sm:px-7">
      <SectionHeading number="04" title={translateI18n("ui.supportingDocuments")} muted>
        {translateI18n("ui.supportingDescription")}
      </SectionHeading>

      <label className="mb-2 block text-sm font-medium" htmlFor="project-documents">{translateI18n("copy.additionalFiles")}</label>
      <p className="mb-3 text-xs leading-5 text-muted-foreground">
        {translateI18n("ui.fileLimit", { count: MAX_DOCUMENT_FILES })}
      </p>
      <Input
        id="project-documents"
        name="documents"
        type="file"
        multiple
        accept={DOCUMENT_ACCEPT}
        disabled={disabled}
        onChange={(event) => {
          const selection = appendDocumentFiles(documents, event.target.files);
          setDocuments(selection.files);
          event.target.value = "";
          onError(selection.error);
        }}
      />
      {documents.length > 0 && (
        <div className="mt-2 border-y border-border/50">
          {documents.map((file, index) => (
            <SelectedFileRow
              key={getDocumentFileKey(file)}
              file={file}
              icon={<Paperclip className="h-4 w-4" />}
              onRemove={() => removeDocument(index)}
              disabled={disabled}
            />
          ))}
        </div>
      )}
    </section>
  </>;
}
