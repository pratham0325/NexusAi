import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { settingsApi } from "@/api";
import { Link } from "react-router";
import { canonicalModelId, DEFAULT_MODEL_ID, modelLabel } from "@/lib/models";
import { useAvailableModels } from "@/hooks/use-available-models";
import { useAuth } from "@/hooks/use-auth";
import { useTheme } from "@/hooks/use-theme";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2, Monitor, Moon, Sun } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type SettingsDraft = Partial<
  Pick<
    Awaited<ReturnType<typeof settingsApi.get>>,
    "defaultModelId" | "temperature" | "streamingEnabled" | "emailUpdates"
  >
>;

export default function Settings() {
  const { user } = useAuth();
  const { theme, setTheme } = useTheme();
  const availableModels = useAvailableModels();
  const settings = useQuery({
    queryKey: ["settings"],
    queryFn: settingsApi.get,
  });
  const save = useMutation({
    mutationFn: settingsApi.update,
    onSuccess: () => void settings.refetch(),
  });

  const [draft, setDraft] = useState<SettingsDraft>({});
  const [saving, setSaving] = useState(false);

  const savedModel = canonicalModelId(
    settings.data?.defaultModelId ?? DEFAULT_MODEL_ID,
  );
  const defaultModel =
    draft.defaultModelId ??
    (availableModels.models.some((model) => model.id === savedModel)
      ? savedModel
      : (availableModels.recommendedDefaultModelId ?? DEFAULT_MODEL_ID));
  const temperature = draft.temperature ?? settings.data?.temperature ?? 0.7;
  const streaming =
    draft.streamingEnabled ?? settings.data?.streamingEnabled ?? true;
  const emailUpdates =
    draft.emailUpdates ?? settings.data?.emailUpdates ?? false;

  const handleSave = async () => {
    setSaving(true);
    try {
      await save.mutateAsync({
        defaultModelId: defaultModel,
        temperature,
        streamingEnabled: streaming,
        emailUpdates,
      });
      toast.success("Settings saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppLayout>
      <div className="scrollbar-slim h-full overflow-y-auto">
        <div className="mx-auto max-w-3xl px-6 py-8">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight">
              Settings
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Profile, appearance and AI defaults.
            </p>
          </div>

          {/* Profile */}
          <Card className="mt-6 shadow-none">
            <CardHeader>
              <CardTitle className="text-base">Profile</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="flex size-12 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-cyan-400 font-display text-lg font-bold text-white">
                  {(user?.name?.[0] ?? user?.email?.[0] ?? "U").toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-semibold">
                    {user?.name ?? "Guest user"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {user?.email ?? "Anonymous session"}
                  </p>
                </div>
              </div>
              {user?.isAnonymous && (
                <div className="flex flex-wrap gap-2 border-t border-border/60 pt-4">
                  <Button asChild variant="outline" className="rounded-xl">
                    <Link to="/auth?mode=login">Sign in</Link>
                  </Button>
                  <Button asChild className="rounded-xl">
                    <Link to="/auth?mode=register">Create an account</Link>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Appearance */}
          <Card className="mt-4 shadow-none">
            <CardHeader>
              <CardTitle className="text-base">Appearance</CardTitle>
            </CardHeader>
            <CardContent>
              <Label>Theme</Label>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {(
                  [
                    { id: "light", label: "Light", icon: Sun },
                    { id: "dark", label: "Dark", icon: Moon },
                    { id: "system", label: "System", icon: Monitor },
                  ] as const
                ).map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    onClick={() => setTheme(id)}
                    className={`flex flex-col items-center gap-1.5 rounded-xl border p-3 text-xs font-medium transition-colors ${
                      theme === id
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border/70 hover:bg-accent"
                    }`}
                  >
                    <Icon className="size-4" />
                    {label}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* AI defaults */}
          <Card className="mt-4 shadow-none">
            <CardHeader>
              <CardTitle className="text-base">AI defaults</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div>
                <Label>Default model</Label>
                <Select
                  value={defaultModel}
                  onValueChange={(defaultModelId) =>
                    setDraft((current) => ({ ...current, defaultModelId }))
                  }
                  disabled={
                    !settings.data ||
                    availableModels.isLoading ||
                    availableModels.isError
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
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Current: {modelLabel(defaultModel)}
                </p>
              </div>
              <div>
                <Label>Default temperature: {temperature.toFixed(1)}</Label>
                <Slider
                  value={[temperature]}
                  onValueChange={([temperature]) =>
                    setDraft((current) => ({ ...current, temperature }))
                  }
                  min={0}
                  max={2}
                  step={0.1}
                  className="mt-2.5"
                  disabled={!settings.data}
                />
              </div>
              <div className="flex items-center justify-between rounded-xl border border-border/60 p-3">
                <div>
                  <p className="text-sm font-medium">Streaming responses</p>
                  <p className="text-xs text-muted-foreground">
                    Show tokens as they arrive (disable for all-at-once
                    replies).
                  </p>
                </div>
                <Switch
                  checked={streaming}
                  onCheckedChange={(streamingEnabled) =>
                    setDraft((current) => ({
                      ...current,
                      streamingEnabled,
                    }))
                  }
                />
              </div>
              <div className="flex items-center justify-between rounded-xl border border-border/60 p-3">
                <div>
                  <p className="text-sm font-medium">Product updates</p>
                  <p className="text-xs text-muted-foreground">
                    Occasional emails about new features.
                  </p>
                </div>
                <Switch
                  checked={emailUpdates}
                  onCheckedChange={(emailUpdates) =>
                    setDraft((current) => ({ ...current, emailUpdates }))
                  }
                />
              </div>
            </CardContent>
          </Card>

          <div className="mt-5 flex justify-end">
            <Button
              onClick={handleSave}
              disabled={saving || !settings.data}
              className="rounded-xl"
            >
              {saving && <Loader2 className="mr-1 size-4 animate-spin" />}
              Save changes
            </Button>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
