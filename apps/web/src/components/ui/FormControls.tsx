import {
  cloneElement,
  forwardRef,
  type InputHTMLAttributes,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes
} from "react";
import "./form-controls.css";

type OrbitFieldControlProps = {
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
  id?: string;
};

export function OrbitField(props: {
  children: ReactElement<OrbitFieldControlProps>;
  className?: string;
  error?: string;
  hint?: string;
  id: string;
  label: ReactNode;
}) {
  const helperId = `${props.id}-helper`;
  const describedBy = [props.children.props["aria-describedby"], props.hint || props.error ? helperId : null]
    .filter(Boolean)
    .join(" ") || undefined;
  const control = cloneElement(props.children, {
    "aria-describedby": describedBy,
    "aria-invalid": props.error ? true : props.children.props["aria-invalid"],
    id: props.id
  });

  return (
    <label
      className={`redesign-field${props.error ? " redesign-field-invalid" : ""} ${props.className ?? ""}`.trim()}
      htmlFor={props.id}
    >
      <span className="redesign-field-label">{props.label}</span>
      {control}
      {props.error || props.hint ? (
        <small id={helperId} role={props.error ? "alert" : undefined}>
          {props.error ?? props.hint}
        </small>
      ) : null}
    </label>
  );
}

export const OrbitInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function OrbitInput({ className = "", ...props }, ref) {
    return <input className={`redesign-input ${className}`.trim()} ref={ref} {...props} />;
  }
);

export const OrbitSelect = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function OrbitSelect({ className = "", ...props }, ref) {
    return <select className={`redesign-select ${className}`.trim()} ref={ref} {...props} />;
  }
);

export const OrbitTextarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function OrbitTextarea({ className = "", ...props }, ref) {
    return <textarea className={`redesign-input redesign-textarea ${className}`.trim()} ref={ref} {...props} />;
  }
);
