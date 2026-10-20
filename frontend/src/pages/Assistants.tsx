import { AppLayout } from "@/components/layout/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { assistantsApi, conversationsApi, documentsApi } from "@/api";
import { canonicalModelId, DEFAULT_MODEL_ID, modelLabel } from "@/lib/models";
import { useAvailableModels } from "@/hooks/use-available-models";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Bot, Pencil, Plus, Trash2, MessageSquare } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import type { AssistantWire } from "@/api/types";

interface AssistantForm {
  name: string;
  description: string;
  systemPrompt: string;
  modelId: string;
  temperature: number;
  emoji: string;
  documentIds: string[];
}

const EMPTY: AssistantForm = {
  name: "",
  description: "",
  systemPrompt: "You are a helpful assistant. Answer clearly and concisely.",
  modelId: DEFAULT_MODEL_ID,
  temperature: 0.7,
  emoji: "🤖",
  documentIds: [],
};

export default function Assistants() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const availableModels = useAvailableModels();
  const assistants = useQuery({
    queryKey: ["assistants"],
    queryFn: assistantsApi.list,
  });
  const documents = useQuery({
    queryKey: ["documents"],
    queryFn: documentsApi.list,
  });
  const refresh = () => void qc.invalidateQueries({ queryKey: ["assistants"] });
  const create = useMutation({
    mutationFn: assistantsApi.create,
    onSuccess: refresh,
  });
  const update = useMutation({
    mutationFn: (v: { id: string; body: Partial<AssistantForm> }) =>
      assistantsApi.update(v.id, v.body),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: assistantsApi.remove,
    onSuccess: refresh,
  });

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<AssistantForm>(EMPTY);

  const openCreate = () => {
    setEditingId(null);
    setForm({
      ...EMPTY,
      modelId: availableModels.recommendedDefaultModelId ?? DEFAULT_MODEL_ID,
    });
    setOpen(true);
  };

  const openEdit = (a: AssistantWire) => {
    setEditingId(a._id);
    setForm({
      name: a.name,
      description: a.description,
      systemPrompt: a.systemPrompt,
      modelId: availableModels.models.some(
        (model) => model.id === canonicalModelId(a.modelId),
      )
        ? canonicalModelId(a.modelId)
        : (availableModels.recommendedDefaultModelId ?? DEFAULT_MODEL_ID),
      temperature: a.temperature,
      emoji: a.emoji,
      documentIds: a.documentIds,
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) {
      toast.error("Name is required");
      return;
    }
    try {
      if (editingId) {
        await update.mutateAsync({ id: editingId, body: form });
        toast.success("Assistant updated");
      } else {
        await create.mutateAsync(form);
        toast.success("Assistant created");
      }
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await remove.mutateAsync(id);
      toast.success("Assistant deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const startChat = async (assistantId: string) => {
    try {
      const convo = await conversationsApi.create({ assistantId });
      toast.success("Chat started");
      navigate(`/dashboard/c/${convo._id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  };

  return (
    <AppLayout>
      <div className="scrollbar-slim h-full overflow-y-auto">
        <div className="mx-auto max-w-5xl px-6 py-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="font-display text-2xl font-bold tracking-tight">
                Assistants
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Custom AI personas with their own prompts, models and knowledge.
              </p>
            </div>
            <Button onClick={openCreate} className="gap-2 rounded-xl">
              <Plus className="size-4" />
              New assistant
            </Button>
          </div>

          {(assistants.data ?? []).length === 0 ? (
            <div className="mt-16 flex flex-col items-center text-center">
              <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10">
                <Bot className="size-7 text-primary" />
              </div>
              <h2 className="mt-4 font-display text-lg font-semibold">
                No assistants yet
              </h2>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                Create your first assistant — a coding helper, a writing coach,
                or a document Q&A bot over your uploads.
              </p>
              <Button onClick={openCreate} className="mt-5 gap-2 rounded-xl">
                <Plus className="size-4" />
                Create assistant
              </Button>
            </div>
          ) : (
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {(assistants.data ?? []).map((a) => (
                <div
                  key={a._id}
                  className="group flex flex-col rounded-2xl border border-border/70 bg-card p-5 transition-all hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-lg"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-2xl">
                      {a.emoji}
                    </div>
                    <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        onClick={() => openEdit(a)}
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 text-destructive"
                        onClick={() => handleDelete(a._id)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                  <h3 className="mt-3 font-display text-base font-semibold">
                    {a.name}
                  </h3>
                  <p className="mt-1 line-clamp-2 flex-1 text-sm text-muted-foreground">
                    {a.description || "No description"}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    <Badge variant="secondary" className="text-[10px]">
                      {modelLabel(a.modelId)}
                    </Badge>
                    <Badge variant="secondary" className="text-[10px]">
                      temp {a.temperature.toFixed(1)}
                    </Badge>
                    {a.documentIds.length > 0 && (
                      <Badge variant="secondary" className="text-[10px]">
                        📎 {a.documentIds.length} doc
                        {a.documentIds.length > 1 ? "s" : ""}
                      </Badge>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-4 w-full gap-2 rounded-lg"
                    onClick={() => startChat(a._id)}
                  >
                    <MessageSquare className="size-3.5" />
                    Start chat
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Edit assistant" : "New assistant"}
            </DialogTitle>
            <DialogDescription>
              Define the persona, model and optional knowledge base.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-3">
              <div className="w-20">
                <Label htmlFor="emoji">Emoji</Label>
                <Input
                  id="emoji"
                  value={form.emoji}
                  onChange={(e) => setForm({ ...form, emoji: e.target.value })}
                  className="mt-1.5 text-center text-xl"
                />
              </div>
              <div className="flex-1">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Code Helper"
                  className="mt-1.5"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="desc">Description</Label>
              <Input
                id="desc"
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
                placeholder="Helps with TypeScript questions"
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="prompt">System prompt</Label>
              <Textarea
                id="prompt"
                value={form.systemPrompt}
                onChange={(e) =>
                  setForm({ ...form, systemPrompt: e.target.value })
                }
                className="mt-1.5 min-h-[100px] font-mono text-xs"
              />
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <Label>Model</Label>
                <Select
                  value={form.modelId}
                  onValueChange={(v) => setForm({ ...form, modelId: v })}
                  disabled={
                    availableModels.isLoading || availableModels.isError
                  }
                >
                  <SelectTrigger className="mt-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {availableModels.models.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1">
                <Label>Temperature: {form.temperature.toFixed(1)}</Label>
                <Slider
                  value={[form.temperature]}
                  onValueChange={([t]) => setForm({ ...form, temperature: t })}
                  min={0}
                  max={2}
                  step={0.1}
                  className="mt-3"
                />
              </div>
            </div>
            {(documents.data ?? []).length > 0 && (
              <div>
                <Label>Knowledge base (documents)</Label>
                <div className="mt-1.5 max-h-36 space-y-1 overflow-y-auto rounded-lg border border-border/60 p-2">
                  {" "}
                  {documents.data?.map((d) => {
                    const checked = form.documentIds.includes(d._id);
                    return (
                      <button
                        key={d._id}
                        type="button"
                        onClick={() =>
                          setForm({
                            ...form,
                            documentIds: checked
                              ? form.documentIds.filter((x) => x !== d._id)
                              : [...form.documentIds, d._id],
                          })
                        }
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
                      >
                        <span
                          className={
                            checked
                              ? "flex size-4 items-center justify-center rounded bg-primary text-[10px] text-primary-foreground"
                              : "size-4 rounded border border-border"
                          }
                        >
                          {checked ? "✓" : ""}
                        </span>
                        <span className="truncate">{d.name}</span>
                        <Badge
                          variant="secondary"
                          className="ml-auto text-[10px]"
                        >
                          {d.status === "ready"
                            ? `${d.chunkCount} chunks`
                            : d.status}
                        </Badge>
                      </button>
                    );
                  })}
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Chats with this assistant use RAG over these documents.
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save}>
              {editingId ? "Save changes" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
