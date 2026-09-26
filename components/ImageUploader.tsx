"use client";

import { useEffect, useId, useMemo, useRef } from "react";

import { MAX_IMAGE_BYTES } from "@/lib/validation";

const ACCEPTED_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

interface ImageUploaderProps {
  file: File | null;
  onFileChange: (file: File | null) => void;
  onError: (message: string | null) => void;
}

export function ImageUploader({
  file,
  onFileChange,
  onError,
}: ImageUploaderProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  const previewUrl = useMemo(() => {
    if (!file) {
      return null;
    }
    return URL.createObjectURL(file);
  }, [file]);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  function handleSelect(selected: File | null) {
    onError(null);

    if (!selected) {
      onFileChange(null);
      return;
    }

    const type = selected.type.toLowerCase();
    if (!ACCEPTED_TYPES.has(type)) {
      onError("Unsupported image type. Please use JPG, JPEG, PNG, or WEBP.");
      if (inputRef.current) {
        inputRef.current.value = "";
      }
      return;
    }

    if (selected.size > MAX_IMAGE_BYTES) {
      onError("That image is too large. Please use a file under 4 MB.");
      if (inputRef.current) {
        inputRef.current.value = "";
      }
      return;
    }

    onFileChange(selected);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-4">
        <label
          htmlFor={inputId}
          className="text-sm font-medium tracking-wide text-[var(--ink)]"
        >
          Photograph
        </label>
        {file ? (
          <button
            type="button"
            onClick={() => {
              handleSelect(null);
              if (inputRef.current) {
                inputRef.current.value = "";
              }
            }}
            className="text-sm text-[var(--muted)] underline-offset-4 transition hover:text-[var(--ink)] hover:underline"
          >
            Remove
          </button>
        ) : null}
      </div>

      {previewUrl ? (
        <div className="overflow-hidden rounded-sm bg-[var(--surface)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
            alt="Selected photograph preview"
            className="max-h-[420px] w-full object-contain"
          />
          <div className="flex items-center justify-between gap-3 border-t border-[var(--line)] px-4 py-3">
            <p className="truncate text-sm text-[var(--muted)]">{file?.name}</p>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="shrink-0 text-sm text-[var(--ink)] underline-offset-4 hover:underline"
            >
              Change
            </button>
          </div>
        </div>
      ) : (
        <label
          htmlFor={inputId}
          className="flex min-h-[220px] cursor-pointer flex-col items-center justify-center gap-3 border border-dashed border-[var(--line)] bg-[var(--surface)] px-6 py-10 text-center transition hover:border-[var(--ink-soft)]"
        >
          <span className="text-sm font-medium text-[var(--ink)]">
            Drop a photograph or click to upload
          </span>
          <span className="text-xs tracking-wide text-[var(--muted)]">
            JPG, JPEG, PNG, or WEBP · max 4 MB
          </span>
        </label>
      )}

      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept="image/jpeg,image/jpg,image/png,image/webp"
        className="sr-only"
        onChange={(event) => {
          handleSelect(event.target.files?.[0] ?? null);
        }}
      />
    </div>
  );
}
