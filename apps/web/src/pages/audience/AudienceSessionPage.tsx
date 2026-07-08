import { AudienceEntrance } from "../../features/audience/AudienceEntrance";

type AudienceSessionPageProps = {
  joinCode?: string;
};

export function AudienceSessionPage({ joinCode }: AudienceSessionPageProps) {
  return <AudienceEntrance initialJoinCode={joinCode} />;
}
