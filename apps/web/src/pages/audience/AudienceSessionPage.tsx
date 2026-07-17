import { AudienceSatisfactionPage } from "../../features/activity-slides";

type AudienceSessionPageProps = {
  activityId?: string;
  sessionId: string;
};

export function AudienceSessionPage({ activityId, sessionId }: AudienceSessionPageProps) {
  return <AudienceSatisfactionPage activityId={activityId} sessionId={sessionId} />;
}
