import { html, nothing } from "lit";
import type { ExtensionUIRequest } from "@shared/types.js";

interface RenderExtensionUiDialogOptions {
  request: ExtensionUIRequest | null;
  input: string;
  onInput: (event: InputEvent) => void;
  onCancel: () => void;
  onConfirm: (confirmed: boolean) => void;
  onValue: (value: string) => void;
}

export function renderExtensionUiDialog({
  request,
  input,
  onInput,
  onCancel,
  onConfirm,
  onValue,
}: RenderExtensionUiDialogOptions) {
  if (!request) return nothing;

  if (request.method === "select") {
    return html`
      <div class="cv-extension-modal-backdrop" @click=${onCancel}></div>
      <div class="cv-extension-modal" role="dialog" aria-modal="true">
        <div class="cv-extension-modal-title">${request.title}</div>
        <div class="cv-extension-modal-body">
          ${request.options.map(
            (option) => html`
              <button class="cv-extension-option" @click=${() => onValue(option)}>
                ${option}
              </button>
            `,
          )}
        </div>
        <div class="cv-extension-modal-actions">
          <button class="cv-extension-btn" @click=${onCancel}>Cancel</button>
        </div>
      </div>
    `;
  }

  if (request.method === "confirm") {
    return html`
      <div class="cv-extension-modal-backdrop" @click=${onCancel}></div>
      <div class="cv-extension-modal" role="dialog" aria-modal="true">
        <div class="cv-extension-modal-title">${request.title}</div>
        <div class="cv-extension-modal-body cv-extension-confirm">
          ${request.message}
        </div>
        <div class="cv-extension-modal-actions">
          <button class="cv-extension-btn" @click=${onCancel}>Cancel</button>
          <button class="cv-extension-btn primary" @click=${() => onConfirm(false)}>
            No
          </button>
          <button class="cv-extension-btn primary" @click=${() => onConfirm(true)}>
            Yes
          </button>
        </div>
      </div>
    `;
  }

  if (request.method === "input" || request.method === "editor") {
    return html`
      <div class="cv-extension-modal-backdrop" @click=${onCancel}></div>
      <div class="cv-extension-modal" role="dialog" aria-modal="true">
        <div class="cv-extension-modal-title">${request.title}</div>
        <div class="cv-extension-modal-body">
          <textarea
            class="cv-extension-textarea"
            placeholder=${request.method === "input" ? request.placeholder || "" : ""}
            .value=${input}
            @input=${onInput}
          ></textarea>
        </div>
        <div class="cv-extension-modal-actions">
          <button class="cv-extension-btn" @click=${onCancel}>Cancel</button>
          <button class="cv-extension-btn primary" @click=${() => onValue(input)}>
            Submit
          </button>
        </div>
      </div>
    `;
  }

  return nothing;
}
