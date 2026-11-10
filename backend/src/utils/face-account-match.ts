// Same SFace cosine cutoff as the camera login worker. This is a match rule, not identity certainty.
export function matchesRegisteredFace(a: number[], b: number[]) {
  if (a.length !== 128 || b.length !== 128 || !a.every(Number.isFinite) || !b.every(Number.isFinite)) throw Error('FACE_PROCESS_FAILED');
  const normA = Math.hypot(...a), normB = Math.hypot(...b);
  if (normA < 1e-8 || normB < 1e-8) throw Error('FACE_PROCESS_FAILED');
  return a.reduce((sum, value, i) => sum + value * b[i], 0) / (normA * normB) >= .60;
}

/** Require all frames to match one account; never pick arbitrarily between close accounts. */
export function identifyFaceAccount<T extends {userId:string; embedding:number[]}>(candidates:T[], frames:number[][]): T {
  if(frames.length!==3) throw Error('FACE_PROCESS_FAILED');
  const accounts=new Map<string,{candidate:T;score:number}>();
  for(const candidate of candidates) {
    const scores=frames.map(frame=>{
      // Reuse the validation and cutoff contract before calculating the ranking score.
      matchesRegisteredFace(frame,candidate.embedding);
      return frame.reduce((sum,value,i)=>sum+value*candidate.embedding[i],0)/(Math.hypot(...frame)*Math.hypot(...candidate.embedding));
    });
    const score=Math.min(...scores), previous=accounts.get(candidate.userId);
    if(!previous || score>previous.score) accounts.set(candidate.userId,{candidate,score});
  }
  const ranked=[...accounts.values()].sort((a,b)=>b.score-a.score);
  if(!ranked.length || ranked[0].score<.60 || ranked[1] && (ranked[1].score>=.60 || ranked[0].score-ranked[1].score<.05)) throw Error('FACE_NO_MATCH');
  return ranked[0].candidate;
}
