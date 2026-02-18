import { LitElement, html, css } from "lit";
import { customElement, state } from "lit/decorators.js";

/**
 * Root application shell with simple hash-based routing.
 *
 * Routes:
 *   #/           → session list (landing page)
 *   #/session/X  → chat view for session X
 */
@customElement("app-root")
export class AppRoot extends LitElement {
  @state() private route: { page: "home" } | { page: "session"; id: string } =
    { page: "home" };

  static styles = css`
    :host {
      display: block;
      height: 100%;
      width: 100%;
    }
  `;

  connectedCallback() {
    super.connectedCallback();
    window.addEventListener("hashchange", this.onHashChange);
    this.onHashChange();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener("hashchange", this.onHashChange);
  }

  private onHashChange = () => {
    const hash = window.location.hash || "#/";
    const sessionMatch = hash.match(/^#\/session\/(.+)$/);
    if (sessionMatch) {
      this.route = { page: "session", id: sessionMatch[1] };
    } else {
      this.route = { page: "home" };
    }
  };

  render() {
    if (this.route.page === "session") {
      return html`<chat-view .sessionId=${this.route.id}></chat-view>`;
    }
    return html`<session-list></session-list>`;
  }
}
