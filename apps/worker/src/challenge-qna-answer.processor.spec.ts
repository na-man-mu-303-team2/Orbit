import type { DataSource } from "typeorm";
import { afterEach,describe,expect,it,vi } from "vitest";
import { processChallengeQnaAnswerJob } from "./challenge-qna-answer.processor";

describe("processChallengeQnaAnswerJob",()=>{
  afterEach(()=>vi.unstubAllGlobals());
  it("consumes text evidence once and persists only bounded outcomes",async()=>{
    const query=vi.fn(async(sql:string,parameters?:unknown[])=>{
      if(sql.includes("FROM challenge_qna_answer_attempts attempts"))return [{answer_attempt_id:"answer-a",project_id:"project-a",qna_session_id:"qna-a",question_id:"question-a",question_revision:1,input_mode:"text",status:"queued",audio_file_id:null,storage_key:null,mime_type:null,duration_ms:null,answer_guide_json:{},question_text:"근거?",source_snapshot_json:{}}];
      if(sql.includes("UPDATE jobs")&&parameters?.[1]==="running")return [[jobRow("running",null,null)],1];
      if(sql.includes("UPDATE jobs")&&parameters?.[1]==="succeeded")return [[jobRow("succeeded",parameters[4],null)],1];
      return [];
    });
    const evidence={take:vi.fn(async()=>"비공개 답변 원문"),delete:vi.fn(async()=>undefined)};
    vi.stubGlobal("fetch",vi.fn(async()=>new Response(JSON.stringify({conceptOutcomes:[],clarity:"needs-focus",audienceFit:"appropriate"}),{status:200})));
    const job=await processChallengeQnaAnswerJob({query} as unknown as DataSource,{} as never,evidence as never,"http://python:8000",{jobId:"job-answer",projectId:"project-a",answerAttemptId:"answer-a"});
    expect(job.status).toBe("succeeded");expect(job.result).toEqual({answerAttemptId:"answer-a",measuredConceptCount:0});expect(evidence.take).toHaveBeenCalledOnce();expect(JSON.stringify(job)).not.toContain("비공개 답변 원문");
  });
});
function jobRow(status:"running"|"succeeded",result:unknown,error:unknown){return {job_id:"job-answer",project_id:"project-a",type:"challenge-qna-answer-analysis",status,progress:status==="running"?20:100,message:"answer",result,error,created_at:"2026-07-11T00:00:00.000Z",updated_at:"2026-07-11T00:00:01.000Z"};}
