import { AppLayout } from "@/components/layout/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { documentsApi } from "@/api";
import { useAuth } from "@/hooks/use-auth";
import {
  ACCEPT_ATTR,
  MAX_FILE_BYTES,
  extractText,
  formatBytes,
} from "@/lib/extract";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  CheckCircle2,
  FileText,
  Loader2,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

interface UploadingFile {
  name: string;
  progress: number;
}

export default function Documents() {
  const { isAuthenticated } = useAuth();
  const qc = useQueryClient();
  const documents = useQuery({ queryKey: ["documents"], queryFn: documentsApi.list });
  const ingest = useMutation({
    mutationFn: documentsApi.ingest,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["documents"] }),
  });
  const remove = useMutation({
    mutationFn: documentsApi.remove,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["documents"] }),
  });
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<UploadingFile[]>([]);
  const [dragOver, setDragOver] = useState(false);

  const handleFiles = async (files: FileList | File[]) => {
    if (!isAuthenticated) return;
    for (const file of Array.from(files)) {
      if (file.size > MAX_FILE_BYTES) {
        toast.error(`${file.name} is larger than 8 MB`);
        continue;
      }
      setUploading((u) => [...u, { name: file.name, progress: 10 }]);
      try {
        setUploading((u) =>
          u.map((x) => (x.name === file.name ? { ...x, progress: 40 } : x)),
        );
        const text = await extractText(file);
        if (!text.trim()) {
          throw new Error("No extractable text found in this file");
        }
        setUploading((u) =>
          u.map((x) => (x.name === file.name ? { ...x, progress: 75 } : x)),
        );
        await ingest.mutateAsync({
          name: file.name,
          mimeType: file.type || "application/octet-stream",
          size: file.size,
          text,
        });
        setUploading((u) => u.filter((x) => x.name !== file.name));
        toast.success(`${file.name} uploaded and embedded`);
      } catch (err) {
        setUploading((u) => u.filter((x) => x.name !== file.name));
        toast.error(
          err instanceof Error ? err.message : `Failed to process ${file.name}`,
        );
      }
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await remove.mutateAsync(id);
      toast.success("Document deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  };

  return (
    <AppLayout>
      <div className="scrollbar-slim h-full overflow-y-auto">
        <div className="mx-auto max-w-4xl px-6 py-8">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight">
              Documents
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Upload files once, then attach them to assistants for RAG chat.
            </p>
          </div>

          {/* Dropzone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              if (e.dataTransfer.files.length) void handleFiles(e.dataTransfer.files);
            }}
            onClick={() => inputRef.current?.click()}
            className={`mt-6 flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-10 text-center transition-colors ${
              dragOver
                ? "border-primary bg-primary/5"
                : "border-border bg-card/50 hover:border-primary/40"
            }`}
          >
            <input
              ref={inputRef}
              type="file"
              multiple
              accept={ACCEPT_ATTR}
              className="hidden"
              onChange={(e) => {
                if (e.target.files?.length) void handleFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <div className="flex size-12 items-center justify-center rounded-xl bg-primary/10">
              <UploadCloud className="size-6 text-primary" />
            </div>
            <p className="mt-3 text-sm font-medium">
              Drop files here or click to browse
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              PDF, DOCX, TXT, MD, CSV · up to 8 MB each
            </p>
          </div>

          {/* Uploading */}
          {uploading.length > 0 && (
            <div className="mt-4 space-y-2">
              {uploading.map((u) => (
                <div
                  key={u.name}
                  className="flex items-center gap-3 rounded-xl border border-border/70 bg-card p-3"
                >
                  <Loader2 className="size-4 animate-spin text-primary" />
                  <span className="min-w-0 flex-1 truncate text-sm">{u.name}</span>
                  <Progress value={u.progress} className="w-28" />
                </div>
              ))}
            </div>
          )}

          {/* List */}
          <div className="mt-8">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Your documents ({documents.data?.length ?? 0})
            </h2>
            {(documents.data ?? []).length === 0 ? (
              <p className="mt-4 rounded-xl border border-border/60 bg-card/50 p-6 text-center text-sm text-muted-foreground">
                No documents yet. Upload a PDF and try asking an assistant about
                it.
              </p>
            ) : (
              <div className="mt-3 space-y-2">
                {(documents.data ?? []).map((d) => (
                  <div
                    key={d._id}
                    className="group flex items-center gap-3 rounded-xl border border-border/70 bg-card p-4"
                  >
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                      <FileText className="size-5 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{d.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatBytes(d.size)} · {d.charCount.toLocaleString()} chars
                        {d.status === "ready" && ` · ${d.chunkCount} chunks embedded`}
                      </p>
                    </div>
                    <StatusBadge status={d.status} error={d.error ?? undefined} />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive"
                      onClick={() => handleDelete(d._id)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

function StatusBadge({
  status,
  error,
}: {
  status: "processing" | "ready" | "failed";
  error?: string;
}) {
  if (status === "ready") {
    return (
      <Badge className="gap-1 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
        <CheckCircle2 className="size-3" /> Ready
      </Badge>
    );
  }
  if (status === "failed") {
    return (
      <Badge
        className="gap-1 rounded-full bg-destructive/15 text-destructive"
        title={error}
      >
        <AlertCircle className="size-3" /> Failed
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="gap-1 rounded-full">
      <Loader2 className="size-3 animate-spin" /> Processing
    </Badge>
  );
}
