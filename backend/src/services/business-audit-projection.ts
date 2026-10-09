const fields = new Set(['name','customer','scenario_id','estimated_revenue','status','is_postponed','postpone_reason',
  'final_contract_value','loss_reason','selected_keys','start_date','duration_working_days','due_date',
  'promotion_status','promoted_document_id','contribution_id','comment_id','attachment_count','request_note','review_note','version_id','version_number','file_count','phase_id','files','schedule']);
export function safeBusinessAudit(value: unknown) {
  if (!value || typeof value !== 'object') return undefined;
  const audit = value as Record<string, any>;
  if (!['PROJECT','MILESTONE','OUTPUT_DOCUMENT','PROJECT_PLAN','OFFICIAL_DOCUMENT','DOCUMENT_COMMENT','SUPPORTING_CONTRIBUTION'].includes(audit.object_type) || typeof audit.object_id !== 'string') return undefined;
  const project = (source: unknown) => {
    const result: Record<string, unknown> = {};
    if (!source || typeof source !== 'object' || Array.isArray(source)) return result;
    for (const [key, item] of Object.entries(source)) {
      if (!fields.has(key)) continue;
      if (key === 'files' || key === 'schedule') {
        const allowed = key === 'files' ? ['id','name','size'] : ['id','start_date','duration_working_days','due_date'];
        if (Array.isArray(item)) result[key] = item.map(row => Object.fromEntries(allowed.filter(field => row &&
          (row[field] === null || ['string','number','boolean'].includes(typeof row[field]))).map(field => [field,row[field]])));
      } else if (key === 'selected_keys') {
        if (Array.isArray(item)) result[key] = item.filter(value => typeof value === 'string');
      } else if (item === null || ['string','number','boolean'].includes(typeof item)) result[key] = item;
    }
    return result;
  };
  const before = project(audit.before), after = project(audit.after);
  const changedFields = Array.isArray(audit.changed_fields) ? audit.changed_fields.filter((key: unknown) =>
    typeof key === 'string' && fields.has(key) && (key in before || key in after)) : [];
  return { objectKey: typeof audit.object_key === 'string' ? audit.object_key : undefined, objectType: audit.object_type as string, objectId: audit.object_id as string, changedFields: changedFields as string[], before, after };
}
