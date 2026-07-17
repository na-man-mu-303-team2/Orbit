import type { ReactNode } from "react";
import "./empty-state.css";

export function OrbitEmptyState(props: { action?: ReactNode; description: ReactNode; icon?: ReactNode; title: ReactNode }) {
  return (
    <section className="redesign-empty-state" role="status">
      {props.icon ? <span className="redesign-empty-state-icon">{props.icon}</span> : null}
      <h3>{props.title}</h3>
      <p>{props.description}</p>
      {props.action ? <div className="redesign-empty-state-action">{props.action}</div> : null}
    </section>
  );
}
