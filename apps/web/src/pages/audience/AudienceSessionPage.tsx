import { AudienceEntrance } from "../../features/audience/AudienceEntrance";

type AudienceSessionPageProps = {
  sessionId: string;
};

export function AudienceSessionPage({ sessionId }: AudienceSessionPageProps) {
  return <AudienceEntrance sessionId={sessionId} />;
}
