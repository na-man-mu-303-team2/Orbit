import type { DataSource } from "typeorm";
import { afterEach,describe,expect,it,vi } from "vitest";
import { processChallengeQnaGenerationJob } from "./challenge-qna-generation.processor";

describe("processChallengeQnaGenerationJob",()=>{
  afterEach(()=>vi.unstubAllGlobals());
  it("stores an immutable grounded revision without question text in the Job result",async()=>{
    const query=vi.fn(async(sql:string,parameters?:unknown[])=>{
      if(sql.includes("SELECT * FROM challenge_qna_sessions"))return [sessionRow()];
      if(sql.includes("UPDATE jobs")&&parameters?.[1]==="running")return [jobRow("running",null,null)];
      if(sql.includes("UPDATE jobs")&&parameters?.[1]==="succeeded")return [jobRow("succeeded",parameters[4],null)];
      return [];
    });
    const managerQuery=vi.fn(async(sql:string)=>sql.includes("FOR UPDATE")?[{generation_revision:1,status:"preparing"}]:[]);
    const dataSource={query,transaction:vi.fn(async(callback:any)=>callback({query:managerQuery}))} as unknown as DataSource;
    vi.stubGlobal("fetch",vi.fn(async()=>new Response(JSON.stringify({questions:[question()]}),{status:200})));
    const job=await processChallengeQnaGenerationJob(dataSource,"http://python:8000",{jobId:"job-qna",projectId:"project-a",qnaSessionId:"qna-a",generationRevision:1});
    expect(job.status).toBe("succeeded");expect(job.result).not.toHaveProperty("questionText");
    expect(managerQuery.mock.calls.some(([sql])=>String(sql).includes("INSERT INTO challenge_qna_questions"))).toBe(true);
  });
});
function sessionRow(){return {qna_session_id:"qna-a",project_id:"project-a",status:"preparing",generation_revision:1,source_json:{mode:"checkpoint",questionCount:1},source_snapshot_json:{deck:{deckVersion:1,slides:[{slideId:"slide-a",contentHash:"a".repeat(64)}]}},grounding_snapshot_json:{chunks:[]}};}
function question(){const ref={type:"slide",slideId:"slide-a",deckVersion:1,slideOrder:1,title:"핵심",contentHash:"a".repeat(64)};return {questionType:"evidence",difficulty:"standard",questionText:"근거는 무엇입니까?",linkedGoalIds:[],sourceRefs:[ref],answerGuide:{supportState:"grounded",mustIncludeConcepts:[{conceptId:"concept-a",label:"핵심",sourceRefs:[ref]}],suggestedStructure:["결론","근거"],caveats:[],remediation:null}};}
function jobRow(status:"running"|"succeeded",result:unknown,error:unknown){return {job_id:"job-qna",project_id:"project-a",type:"challenge-qna-generation",status,progress:status==="running"?20:100,message:"qna",result,error,created_at:"2026-07-11T00:00:00.000Z",updated_at:"2026-07-11T00:00:01.000Z"};}
