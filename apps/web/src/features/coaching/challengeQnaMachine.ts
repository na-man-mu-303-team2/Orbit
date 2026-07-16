export type ChallengeQnaClientState="preparing"|"ready"|"answering"|"processing"|"result"|"completed"|"failed";
const next:Record<ChallengeQnaClientState,ChallengeQnaClientState[]>={preparing:["ready","failed"],ready:["answering"],answering:["processing","ready"],processing:["result","failed"],result:["ready","completed"],completed:[],failed:["preparing"]};
export function transitionChallengeQna(current:ChallengeQnaClientState,target:ChallengeQnaClientState){if(!next[current].includes(target))throw new Error(`Invalid Challenge Q&A transition: ${current} -> ${target}`);return target;}
export function canRevealFullGuide(hasAnswerAttempt:boolean,commandRecorded:boolean){return hasAnswerAttempt||commandRecorded;}
