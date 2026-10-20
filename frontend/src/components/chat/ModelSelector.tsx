import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { canonicalModelId, modelLabel } from "@/lib/models";
import { useAvailableModels } from "@/hooks/use-available-models";
import { Check, ChevronDown, Cpu } from "lucide-react";
import { cn } from "@/lib/utils";

interface ModelSelectorProps {
  value: string;
  onChange: (modelId: string) => void;
}

export function ModelSelector({ value, onChange }: ModelSelectorProps) {
  const { models, isLoading, isError, recommendedDefaultModelId } =
    useAvailableModels();
  const selectedModelId = models.some(
    (model) => model.id === canonicalModelId(value),
  )
    ? canonicalModelId(value)
    : recommendedDefaultModelId;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 rounded-full font-medium"
        >
          <Cpu className="size-3.5 text-primary" />
          {modelLabel(selectedModelId ?? value)}
          <ChevronDown className="size-3.5 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          AI models
        </DropdownMenuLabel>
        {models.map((m) => (
          <DropdownMenuItem
            key={m.id}
            onClick={() => onChange(m.id)}
            className="cursor-pointer gap-3 py-2.5"
          >
            <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-[11px] font-bold text-primary">
              {m.family.slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-sm font-medium">
                {m.label}
                {m.tier === "pro" && (
                  <span className="rounded bg-primary/15 px-1 py-px text-[9px] font-bold uppercase text-primary">
                    Pro
                  </span>
                )}
              </div>
              <p className="truncate text-xs text-muted-foreground">
                {m.description}
              </p>
            </div>
            {m.id === selectedModelId && (
              <Check className="size-4 text-primary" />
            )}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <p className="px-2 py-1.5 text-[11px] leading-snug text-muted-foreground">
          {isLoading
            ? "Loading models available with your API keys…"
            : isError
              ? "Could not load available models. Refresh and try again."
              : models.length === 1 && models[0].id === "nexus-demo"
                ? "No provider API key is configured. Nexus Demo is available."
                : "Only models available with your configured provider keys are shown."}
        </p>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function modelClasses(id: string) {
  return cn(modelLabel(id));
}
