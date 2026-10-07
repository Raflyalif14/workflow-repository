import { useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/components/auth/auth-provider";
import { apiClient } from "@/lib/api-client";
import { projectKeys } from "@/lib/query-keys";
import type { Project } from "@/types/project";
import { createBusinessRequestStore } from "@/lib/business-request";

export function useBusinessRequest() {
  const { user } = useAuth();
  const client = useQueryClient();
  const state = useRef({ account: user?.id, store: createBusinessRequestStore(), reviewed: new Map<string,string>() });
  if (state.current.account !== user?.id) state.current = { account: user?.id, store: createBusinessRequestStore(), reviewed: new Map() };
  const cachedProject = (projectId: string) => client.getQueryData<Project>(projectKeys.detailWithoutActivity(projectId))
    || client.getQueryData<Project>(projectKeys.detail(projectId));
  const request = async <T,>(projectId: string, action: string, path: string, method: string, body?: unknown): Promise<T> => {
    if (!user) throw new Error("Unable to save changes.");
    const current = state.current;
    const result = await current.store.run(projectId, `${action}:${method}:${path}`, body, async () => {
      return current.reviewed.get(projectId) || cachedProject(projectId)?.updated_at
        || (await apiClient<Project>(`/projects/${projectId}?include_activity=false`)).updated_at;
    }, headers => apiClient<T>(path, { method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) }),
    () => {
      current.reviewed.delete(projectId);
      void client.invalidateQueries({ queryKey: projectKeys.detail(projectId) });
      void client.invalidateQueries({ queryKey: projectKeys.milestones(projectId) });
      void client.invalidateQueries({ queryKey: projectKeys.activities(projectId) });
      void client.invalidateQueries({ queryKey: projectKeys.all() });
    });
    current.reviewed.delete(projectId);
    return result;
  };
  return Object.assign(request, { prepare: (projectId: string) => {
    // Freeze when the user begins editing, before a background refresh replaces cache data.
    const revision = cachedProject(projectId)?.updated_at;
    if (revision && !state.current.reviewed.has(projectId)) state.current.reviewed.set(projectId,revision);
  } });
}
