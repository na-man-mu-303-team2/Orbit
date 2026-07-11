import ReactDOM from "react-dom/client";

import { SemanticCueLabApp } from "./SemanticCueLabApp";

const container = document.getElementById("root");
if (!container) {
  throw new Error("Semantic Cue Lab root element is missing");
}

ReactDOM.createRoot(container).render(<SemanticCueLabApp />);
