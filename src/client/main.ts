import "./components/app-root.js";
import "./components/session-list.js";
import "./components/chat-view.js";
import "./components/settings-panel.js";
import "./components/message-list.js";
import "./components/chat-input.js";

// Apply saved theme preference
const saved = localStorage.getItem("pi-theme");
if (saved === "light" || saved === "dark") {
  document.documentElement.setAttribute("data-theme", saved);
}
