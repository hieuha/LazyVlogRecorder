import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
// Bundle the Oswald condensed weights the HUD uses (theme.fontCondensed). Without
// this the canvas falls back to Arial Narrow, which has no light weights.
import "@fontsource/oswald/200.css";
import "@fontsource/oswald/300.css";
import "@fontsource/oswald/400.css";
import "@fontsource/oswald/500.css";
import "@fontsource/oswald/600.css";
import "@fontsource/oswald/700.css";

// Warm the font cache so the HUD paints Oswald (not the fallback) from the start.
if (document.fonts) {
  for (const w of ["200", "300", "400", "500", "600", "700"]) {
    void document.fonts.load(`${w} 40px Oswald`);
  }
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
