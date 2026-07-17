import { describe,expect,it } from "vitest";
import { canRevealFullGuide,transitionChallengeQna } from "./challengeQnaMachine";
describe("Challenge Q&A client machine",()=>{it("blocks skipped states and gates the full guide",()=>{expect(()=>transitionChallengeQna("ready","result")).toThrow("Invalid");expect(canRevealFullGuide(false,false)).toBe(false);expect(canRevealFullGuide(true,false)).toBe(true);expect(canRevealFullGuide(false,true)).toBe(true);});});
