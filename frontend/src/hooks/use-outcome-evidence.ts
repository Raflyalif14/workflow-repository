"use client";
import { useEffect, useRef, useState } from 'react';
import { apiClient } from '@/lib/api-client';

export function useOutcomeEvidence(projectId: string) {
  const [files, setFilesState] = useState<File[]>([]), [isUploading, setUploading] = useState(false);
  const ids = useRef<string[]>([]), inFlight = useRef(false);
  const currentProject = useRef(projectId); currentProject.current = projectId;
  useEffect(() => { ids.current = []; setFilesState([]); }, [projectId]);
  const setFiles = (next: File[]) => { if (!inFlight.current) { ids.current = []; setFilesState(next); } };
  const reset = () => { ids.current = []; setFilesState([]); };
  const prepare = async () => {
    if (!files.length || files.length > 10 || files.some(file => !/\.(jpg|jpeg|png|pdf|doc|docx)$/i.test(file.name) || file.size <= 0 || file.size > 50*1024*1024)) throw Error('workflowUpdate.evidenceRequired');
    if (ids.current.length) return ids.current;
    if (inFlight.current) throw Error('workflowUpdate.evidenceRequired');
    inFlight.current = true; setUploading(true);
    try {
      const body = new FormData(); files.forEach(file => body.append('files',file));
      const result = await apiClient<{documents:Array<{id:string}>}>(`/projects/${projectId}/outcome-evidence`,{method:'POST',body});
      if (currentProject.current !== projectId) throw Error('workflowUpdate.evidenceRequired');
      if (!result.documents || result.documents.length !== files.length || result.documents.some(d => !/^[0-9a-f-]{36}$/i.test(d.id))) throw Error('workflowUpdate.evidenceRequired');
      ids.current = result.documents.map(d => d.id); return ids.current;
    } finally { inFlight.current = false; setUploading(false); }
  };
  return {files,setFiles,reset,prepare,isUploading};
}
