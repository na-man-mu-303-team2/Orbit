export type EditorFileMenuVariant = "dark" | "soft-gray" | "white";

export type EditorFileMenuItem = {
  disabled?: boolean;
  id: string;
  label: string;
  meta?: string;
  onSelect: () => void;
};

type EditorFileMenuProps = {
  groups: Array<{
    items: EditorFileMenuItem[];
    label?: string;
  }>;
  subtitle: string;
  title: string;
  variant?: EditorFileMenuVariant;
};

export function EditorFileMenu(props: EditorFileMenuProps) {
  const variant = props.variant ?? "dark";

  return (
    <div
      className={`editor-file-menu editor-file-menu--${variant}`}
      data-variant={variant}
      role="menu"
    >
      <div className="editor-file-menu-context">
        <strong>{props.title}</strong>
        <span>{props.subtitle}</span>
      </div>
      {props.groups.map((group, groupIndex) => (
        <section className="editor-file-menu-group" key={`${group.label ?? "menu"}-${groupIndex}`}>
          {group.label ? <span className="editor-file-menu-group-label">{group.label}</span> : null}
          {group.items.map((item) => (
            <button
              className="editor-file-menu-item"
              disabled={item.disabled}
              key={item.id}
              role="menuitem"
              type="button"
              onClick={item.onSelect}
            >
              <span>{item.label}</span>
              {item.meta ? <small>{item.meta}</small> : null}
            </button>
          ))}
        </section>
      ))}
    </div>
  );
}
