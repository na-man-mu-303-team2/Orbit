export type ActivityRevisionState<T> = {
  revision: number;
  value: T;
};

export function acceptActivityRevision<T>(
  current: ActivityRevisionState<T> | null,
  next: ActivityRevisionState<T>
): ActivityRevisionState<T> {
  return current && current.revision > next.revision ? current : next;
}
