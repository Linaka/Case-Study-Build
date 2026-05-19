function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function text(value) {
  return String(value ?? "").trim();
}

function itemTitle(item, fallback) {
  if (typeof item === "string") {
    return item;
  }

  return text(item?.title || item?.metric || fallback);
}

function itemDescription(item) {
  if (typeof item === "string") {
    return "";
  }

  return text(item?.description || item?.body || item?.summary);
}

function itemValue(item) {
  if (typeof item === "string" || item?.value === null || item?.value === undefined || item?.value === "") {
    return "";
  }

  const value = Number(item.value);

  if (!Number.isFinite(value)) {
    return "";
  }

  const unit = text(item.unit);
  const formatted = new Intl.NumberFormat("en", {
    maximumFractionDigits: 2
  }).format(value);

  return ["%", "x", "X"].includes(unit) ? `${formatted}${unit}` : unit ? `${formatted} ${unit}` : formatted;
}

function section(title, value) {
  if (!text(value)) {
    return "";
  }

  return `\n## ${title}\n\n${text(value)}\n`;
}

function listSection(title, items) {
  const rows = asArray(items).map((item, index) => {
    const heading = itemTitle(item, `${title} ${index + 1}`);
    const value = itemValue(item);
    const description = itemDescription(item);
    const label = value ? `${heading} (${value})` : heading;

    return description ? `- **${label}:** ${description}` : `- ${label}`;
  });

  if (!rows.length) {
    return "";
  }

  return `\n## ${title}\n\n${rows.join("\n")}\n`;
}

export function renderMarkdown(project) {
  const collaborators = asArray(project.collaborators).join(", ");
  const assets = asArray(project.assets)
    .filter(asset => asset.visibility !== "hidden")
    .map(asset => `![${text(asset.caption) || "Case-study asset"}](${asset.path})\n\n_${text(asset.caption)} (${text(asset.visibility || "public")})_`);

  return `# ${text(project.title)}

${text(project.subtitle)}

| Field | Value |
|---|---|
| Year | ${text(project.year)} |
| Sector | ${text(project.sector)} |
| Client type | ${text(project.clientType)} |
| Role | ${text(project.role)} |
| Collaborators | ${collaborators} |
${section("Context", project.context)}
${section("Challenge", project.challenge)}
${section("Audience", project.audience)}
${section("Approach", project.approach)}
${listSection("Key decisions", project.keyDecisions)}
${listSection("Outputs", project.outputs)}
${listSection("Impact", project.impact)}
${section("Reflection", project.reflection)}
${section("Confidentiality notes", project.confidentialityNotes)}
${assets.length ? `\n## Assets\n\n${assets.join("\n\n")}\n` : ""}`;
}
