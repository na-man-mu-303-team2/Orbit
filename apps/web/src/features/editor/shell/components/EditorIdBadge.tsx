export function IdBadge(props: { id: string }) {
  const kind = getIdKind(props.id);
  const displayId = getDisplayIdLabel(props.id);

  return (
    <span className={`id-badge id-badge-${kind}`} title={props.id}>
      {displayId}
    </span>
  );
}

function getIdKind(id: string): string {
  if (id.startsWith("deck_")) {
    return "deck";
  }
  if (id.startsWith("project_")) {
    return "project";
  }
  if (id.startsWith("slide_")) {
    return "slide";
  }
  if (id.startsWith("el_")) {
    return "element";
  }
  if (id.startsWith("anim_")) {
    return "animation";
  }
  if (id.startsWith("kw_")) {
    return "keyword";
  }
  if (id.startsWith("change_")) {
    return "change";
  }
  if (id.startsWith("snapshot_")) {
    return "snapshot";
  }
  return "default";
}

function getDisplayIdLabel(id: string) {
  const kind = getIdKind(id);
  const suffix = getDisplayIdSuffix(id);

  switch (kind) {
    case "project":
      return `project${suffix}`;
    case "deck":
      return `deck${suffix}`;
    case "slide":
      return `slide${suffix}`;
    case "element":
      return `element${suffix}`;
    case "animation":
      return `animation${suffix}`;
    case "keyword":
      return `keyword${suffix}`;
    case "change":
      return `change${suffix}`;
    case "snapshot":
      return `snapshot${suffix}`;
    default:
      return truncateValue(id.replace(/_/g, ""), 18);
  }
}

function getDisplayIdSuffix(id: string) {
  const normalized = id.includes("_") ? id.slice(id.indexOf("_") + 1) : id;

  return truncateValue(normalized.replace(/_/g, ""), 12);
}

function truncateValue(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}...` : value;
}
