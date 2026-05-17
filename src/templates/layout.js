import { html } from "../lib/html.js";

export function renderDocument({ title, body, bodyClass = "", styles = [], scripts = [] }) {
  return html`<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>${title}</title>
        ${styles.map(href => html`<link rel="stylesheet" href="${href}">`)}
      </head>
      <body class="${bodyClass}">
        ${body}
        ${scripts.map(src => html`<script type="module" src="${src}"></script>`)}
      </body>
    </html>`;
}
