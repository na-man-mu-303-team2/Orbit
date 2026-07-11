import ReactDOM from "react-dom/client";

import { ReportMockupPage } from "./ReportMockupPage";

const container = document.getElementById("root");
if (!container) {
  throw new Error("Report mockup root element is missing");
}

ReactDOM.createRoot(container).render(<ReportMockupPage />);
