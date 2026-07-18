import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  canMutateProjectDeck,
  ProjectAccessProvider,
  useProjectAccessMembership
} from "./ProjectAccessContext";

function Probe() {
  const membership = useProjectAccessMembership();
  return <span>{membership.role}</span>;
}

describe("ProjectAccessContext", () => {
  it("exposes accepted membership to project routes", () => {
    expect(
      renderToStaticMarkup(
        <ProjectAccessProvider membership={{ role: "viewer", status: "accepted" }}>
          <Probe />
        </ProjectAccessProvider>
      )
    ).toContain("viewer");
  });

  it("allows only accepted owners and editors to mutate a deck", () => {
    expect(canMutateProjectDeck({ role: "owner", status: "accepted" })).toBe(true);
    expect(canMutateProjectDeck({ role: "editor", status: "accepted" })).toBe(true);
    expect(canMutateProjectDeck({ role: "viewer", status: "accepted" })).toBe(false);
    expect(canMutateProjectDeck({ role: "editor", status: "pending" })).toBe(false);
  });
});
