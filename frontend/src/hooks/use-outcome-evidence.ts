"use client";
import { useEffect, useRef, useState } from 'react';
import { apiClient } from '@/lib/api-client';

export function useOutcomeEvidence(projectId: string) {
  const [files, setFilesState] = useState<File[]>([]), [isUploading, setUploading] = useState(false);
  const ids = useRef<string[]>([]), inFlight = useRef(false);
  const abandonedIds = useRef<string[]>([]);
  const currentProject = useRef(projectId); currentProject.current = projectId;
  useEffect(() => { ids.current = []; abandonedIds.current = []; setFilesState([]); }, [projectId]);
  const abandonUploads = () => {
    abandonedIds.current.push(...ids.current);
    ids.current = [];
  };
  const setFiles = (next: File[]) => {
    if (inFlight.current) return;
    abandonUploads();
    setFilesState(next);
  };
  const reset = () => { ids.current = []; abandonedIds.current = []; setFilesState([]); };

  const cleanAbandonedUploads = async () => {
    while (currentProject.current === projectId && abandonedIds.current.length) {
      const documentIds = abandonedIds.current.slice(0, 10);
      await apiClient(`/projects/${projectId}/outcome-evidence/discard`, {
        method: 'POST', body: JSON.stringify({ documentIds }),
      });
      if (currentProject.current === projectId) abandonedIds.current.splice(0, documentIds.length);
    }
  };

  const discard = async () => {
    if (inFlight.current) return false;
    abandonUploads();
    if (!abandonedIds.current.length) return true;
    inFlight.current = true;
    setUploading(true);
    try {
      await cleanAbandonedUploads();
      return true;
    } finally {
      inFlight.current = false;
      setUploading(false);
    }
  };
  const prepare = async () => {
    if (!files.length || files.length > 10 || files.some(file => !/\.(jpg|jpeg|png|pdf|doc|docx)$/i.test(file.name) || file.size <= 0 || file.size > 50*1024*1024)) throw Error('workflowUpdate.evidenceRequired');
    if (ids.current.length) return ids.current;
    if (inFlight.current) throw Error('workflowUpdate.evidenceRequired');
    inFlight.current = true; setUploading(true);
    try {
      await cleanAbandonedUploads();
      if (currentProject.current !== projectId) throw Error('workflowUpdate.evidenceRequired');
      const body = new FormData(); files.forEach(file => body.append('files',file));
      const result = await apiClient<{documents:Array<{id:string}>}>(`/projects/${projectId}/outcome-evidence`,{method:'POST',body});
      if (currentProject.current !== projectId) throw Error('workflowUpdate.evidenceRequired');
      if (!result.documents || result.documents.length !== files.length || result.documents.some(d => !/^[0-9a-f-]{36}$/i.test(d.id))) throw Error('workflowUpdate.evidenceRequired');
      ids.current = result.documents.map(d => d.id); return ids.current;
    } finally { inFlight.current = false; setUploading(false); }
  };
  return {files,setFiles,reset,prepare,discard,isUploading};
}
