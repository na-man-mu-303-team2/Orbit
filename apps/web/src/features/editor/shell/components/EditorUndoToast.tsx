export function EditorUndoToast(props: {
  message: string;
  onUndo: () => void;
}) {
  return (
    <div aria-live="polite" className="editor-undo-toast" role="status">
      <span>{props.message}</span>
      <button type="button" onClick={props.onUndo}>실행 취소</button>
    </div>
  );
}
