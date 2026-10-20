import { modelsApi } from "@/api";
import { MODELS } from "@/lib/models";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

export function useAvailableModels() {
  const query = useQuery({
    queryKey: ["available-models"],
    queryFn: modelsApi.available,
    staleTime: 60_000,
  });

  const models = useMemo(
    () =>
      query.data?.modelIds
        .map((id) => MODELS.find((model) => model.id === id))
        .filter((model) => model !== undefined) ?? [],
    [query.data?.modelIds],
  );

  return {
    ...query,
    models,
    recommendedDefaultModelId: query.data?.recommendedDefaultModelId ?? null,
  };
}
