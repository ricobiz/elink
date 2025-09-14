import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Force override styles
const styleOverride = document.createElement('style');
styleOverride.textContent = `
:root {
  --background: hsl(217, 19%, 10%) !important;
  --foreground: hsl(0, 0%, 90%) !important;
  --card: hsl(217, 19%, 12%) !important;
  --card-foreground: hsl(0, 0%, 85%) !important;
  --primary: hsl(263, 70%, 65%) !important;
  --secondary: hsl(217, 10%, 18%) !important;
  --muted: hsl(217, 10%, 15%) !important;
  --muted-foreground: hsl(0, 0%, 55%) !important;
  --border: hsl(217, 10%, 22%) !important;
  --sidebar: hsl(217, 19%, 11%) !important;
  --sidebar-foreground: hsl(0, 0%, 85%) !important;
}
body { 
  background: hsl(217, 19%, 10%) !important; 
  color: hsl(0, 0%, 90%) !important;
}
`;
document.head.appendChild(styleOverride);

createRoot(document.getElementById("root")!).render(<App />);
