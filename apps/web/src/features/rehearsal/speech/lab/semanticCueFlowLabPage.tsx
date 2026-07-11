import ReactDOM from "react-dom/client";

import { SemanticCueFlowLabApp } from "./SemanticCueFlowLabApp";

const container = document.getElementById("root");
if (!container) {
  throw new Error("Semantic Cue Flow Lab root element is missing");
}

ReactDOM.createRoot(container).render(<SemanticCueFlowLabApp />);
