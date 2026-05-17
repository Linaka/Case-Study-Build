const RAW_HTML = Symbol("rawHtml");

const ESCAPES = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  "\"": "&quot;",
  "'": "&#39;"
};

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ESCAPES[character]);
}

export function raw(value) {
  return {
    [RAW_HTML]: true,
    value: String(value ?? "")
  };
}

function isRaw(value) {
  return Boolean(value && value[RAW_HTML]);
}

function renderValue(value) {
  if (value === null || value === undefined) {
    return "";
  }

  if (Array.isArray(value)) {
    return value.map(renderValue).join("");
  }

  if (isRaw(value)) {
    return value.value;
  }

  return escapeHtml(value);
}

// Tagged-template helper: interpolated project data is escaped by default,
// while nested templates can opt in to raw rendering via html() / raw().
export function html(strings, ...values) {
  let output = "";

  strings.forEach((part, index) => {
    output += part;
    if (index < values.length) {
      output += renderValue(values[index]);
    }
  });

  return raw(output);
}

export function joinHtml(items, separator = "") {
  return raw(items.filter(Boolean).map(renderValue).join(separator));
}

export function toHtml(fragment) {
  return renderValue(fragment);
}

export function safeJson(value) {
  return JSON.stringify(value, null, 2).replace(/[<>&]/g, character => {
    if (character === "<") return "\\u003c";
    if (character === ">") return "\\u003e";
    return "\\u0026";
  });
}
