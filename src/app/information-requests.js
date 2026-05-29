function closestForm(button) {
  return button.closest("[data-information-subject-type]");
}

function readErrorMessage(response) {
  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    return response.json().then(body => body.error || `Request failed with HTTP ${response.status}.`).catch(() => `Request failed with HTTP ${response.status}.`);
  }

  return response.text().then(text => text || `Request failed with HTTP ${response.status}.`);
}

function controlForButton(button) {
  const field = button.closest(".field");

  return field?.querySelector("input[name], textarea[name], select[name], input[data-field], textarea[data-field], select[data-field]");
}

function targetPathForButton(button) {
  if (button.dataset.targetPath) {
    return button.dataset.targetPath;
  }

  const control = controlForButton(button);

  if (!control) {
    return "";
  }

  if (control.name) {
    return control.name;
  }

  const list = button.closest("[data-list]");
  const item = button.closest("[data-list-item]");
  const field = control.dataset.field;

  if (!list || !item || !field) {
    return "";
  }

  const index = Array.from(list.querySelectorAll(":scope [data-list-item]")).indexOf(item);

  return `${list.dataset.list}.${index}.${field}`;
}

function targetKindForPath(path, button) {
  if (button.dataset.targetKind) {
    return button.dataset.targetKind;
  }

  return path.includes(".") ? "list-item" : "field";
}

function labelForButton(button) {
  if (button.dataset.targetLabel) {
    return button.dataset.targetLabel;
  }

  return button.closest(".field")?.querySelector(".field__label-text, span")?.textContent?.trim() || "this field";
}

function requestContext(button) {
  const root = closestForm(button);
  const path = targetPathForButton(button);

  if (!root || !path) {
    throw new Error("This request target could not be resolved.");
  }

  return {
    subjectType: root.dataset.informationSubjectType,
    subjectSlug: root.dataset.slug || root.dataset.reportSlug,
    targetKind: targetKindForPath(path, button),
    targetPath: path,
    label: labelForButton(button)
  };
}

function parseRecipients(value) {
  return String(value ?? "")
    .split(/[,\n]+/)
    .map(item => item.trim())
    .filter(Boolean)
    .map(item => ({
      email: item,
      userPrincipalName: item
    }));
}

function createOption(value, label) {
  const option = document.createElement("option");

  option.value = value;
  option.textContent = label;
  return option;
}

function createDialog() {
  const dialog = document.createElement("dialog");
  const form = document.createElement("form");
  const header = document.createElement("header");
  const title = document.createElement("h2");
  const channelLabel = document.createElement("label");
  const channelText = document.createElement("span");
  const channel = document.createElement("select");
  const recipientsLabel = document.createElement("label");
  const recipientsText = document.createElement("span");
  const recipients = document.createElement("textarea");
  const teamLabel = document.createElement("label");
  const teamText = document.createElement("span");
  const team = document.createElement("select");
  const channelPickerLabel = document.createElement("label");
  const channelPickerText = document.createElement("span");
  const channelPicker = document.createElement("select");
  const messageLabel = document.createElement("label");
  const messageText = document.createElement("span");
  const message = document.createElement("textarea");
  const status = document.createElement("p");
  const actions = document.createElement("div");
  const cancel = document.createElement("button");
  const submit = document.createElement("button");

  dialog.className = "information-request-dialog";
  form.method = "dialog";
  header.className = "information-request-dialog__header";
  title.textContent = "Request information";
  channelText.textContent = "Channel";
  channel.name = "channel";
  channel.append(
    createOption("email", "Email"),
    createOption("teams-chat", "Teams chat"),
    createOption("teams-channel", "Teams channel")
  );
  recipientsText.textContent = "Recipients";
  recipients.name = "recipients";
  recipients.rows = 3;
  recipients.placeholder = "name@example.com";
  teamText.textContent = "Team";
  team.name = "teamId";
  channelPickerText.textContent = "Teams channel";
  channelPicker.name = "channelId";
  messageText.textContent = "Message";
  message.name = "message";
  message.rows = 5;
  status.className = "information-request-dialog__status";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  actions.className = "information-request-dialog__actions";
  cancel.type = "button";
  cancel.className = "button button--subtle";
  cancel.textContent = "Cancel";
  submit.type = "submit";
  submit.className = "button button--primary";
  submit.textContent = "Send request";

  [channelLabel, recipientsLabel, teamLabel, channelPickerLabel, messageLabel].forEach(label => {
    label.className = "field";
  });
  messageLabel.classList.add("field--wide");
  recipientsLabel.classList.add("field--wide");
  channelLabel.append(channelText, channel);
  recipientsLabel.append(recipientsText, recipients);
  teamLabel.append(teamText, team);
  channelPickerLabel.append(channelPickerText, channelPicker);
  messageLabel.append(messageText, message);
  header.append(title);
  actions.append(cancel, submit);
  form.append(header, channelLabel, recipientsLabel, teamLabel, channelPickerLabel, messageLabel, status, actions);
  dialog.append(form);
  document.body.append(dialog);

  const updateChannelMode = () => {
    const isChannel = channel.value === "teams-channel";

    recipientsLabel.hidden = isChannel;
    teamLabel.hidden = !isChannel;
    channelPickerLabel.hidden = !isChannel;
  };
  const loadTeams = async () => {
    if (team.dataset.loaded) {
      return;
    }

    team.replaceChildren(createOption("", "Loading..."));

    try {
      const response = await fetch("/api/microsoft/teams");

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      const teams = await response.json();
      team.replaceChildren(createOption("", "Choose team"), ...teams.map(item => createOption(item.id, item.displayName || item.id)));
      team.dataset.loaded = "true";
    } catch (error) {
      team.replaceChildren(createOption("", error instanceof Error ? error.message : "Teams unavailable"));
    }
  };
  const loadChannels = async () => {
    const teamId = team.value;

    channelPicker.replaceChildren(createOption("", teamId ? "Loading..." : "Choose channel"));

    if (!teamId) {
      return;
    }

    try {
      const response = await fetch(`/api/microsoft/teams/${encodeURIComponent(teamId)}/channels`);

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      const channels = await response.json();
      channelPicker.replaceChildren(createOption("", "Choose channel"), ...channels.map(item => createOption(item.id, item.displayName || item.id)));
    } catch (error) {
      channelPicker.replaceChildren(createOption("", error instanceof Error ? error.message : "Channels unavailable"));
    }
  };

  channel.addEventListener("change", () => {
    updateChannelMode();

    if (channel.value === "teams-channel") {
      loadTeams();
    }
  });
  team.addEventListener("change", loadChannels);
  cancel.addEventListener("click", () => dialog.close());
  updateChannelMode();

  return {
    dialog,
    form,
    title,
    channel,
    recipients,
    team,
    channelPicker,
    message,
    status,
    submit
  };
}

let dialogState = null;
let activeButton = null;
let activeContext = null;

function openRequestDialog(button) {
  dialogState ||= createDialog();
  activeButton = button;
  activeContext = requestContext(button);
  dialogState.title.textContent = `Request information for ${activeContext.label}`;
  dialogState.message.value = `Could you provide the information for ${activeContext.label}?`;
  dialogState.status.textContent = "";
  dialogState.status.dataset.state = "idle";
  dialogState.submit.disabled = false;
  dialogState.dialog.showModal();
}

function selectedOptionLabel(select) {
  return select.selectedOptions[0]?.textContent || "";
}

function requestPayload() {
  const channel = dialogState.channel.value;

  return {
    ...activeContext,
    channel,
    recipients: channel === "teams-channel" ? [] : parseRecipients(dialogState.recipients.value),
    message: dialogState.message.value,
    provider: channel === "teams-channel"
      ? {
        teamId: dialogState.team.value,
        teamName: selectedOptionLabel(dialogState.team),
        channelId: dialogState.channelPicker.value,
        channelName: selectedOptionLabel(dialogState.channelPicker)
      }
      : {}
  };
}

function setButtonState(button, request) {
  const host = button.closest(".field") || button.closest(".contribution-request");
  const marker = host?.querySelector("[data-information-request-marker]") || document.createElement("small");

  marker.dataset.informationRequestMarker = "";
  marker.className = "information-request-marker";
  marker.textContent = request.deliveryStatus.state === "failed"
    ? "Request failed"
    : request.responseStatus.state === "pending"
      ? "Request sent"
      : "Response received";
  marker.dataset.state = request.deliveryStatus.state === "failed" ? "failed" : request.responseStatus.state;

  if (!marker.parentElement) {
    host?.append(marker);
  }
}

async function submitRequest(event) {
  event.preventDefault();

  try {
    dialogState.submit.disabled = true;
    dialogState.status.textContent = "Sending...";
    dialogState.status.dataset.state = "pending";

    const response = await fetch("/api/information-requests", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(requestPayload())
    });

    if (!response.ok) {
      throw new Error(await readErrorMessage(response));
    }

    const data = await response.json();

    setButtonState(activeButton, data.request);
    dialogState.status.textContent = data.request.deliveryStatus.state === "failed"
      ? data.request.deliveryStatus.error
      : "Request sent.";
    dialogState.status.dataset.state = data.request.deliveryStatus.state === "failed" ? "error" : "success";

    if (data.request.deliveryStatus.state !== "failed") {
      dialogState.dialog.close();
    }
  } catch (error) {
    dialogState.status.textContent = error instanceof Error ? error.message : "Request could not be sent.";
    dialogState.status.dataset.state = "error";
  } finally {
    dialogState.submit.disabled = false;
  }
}

document.addEventListener("click", event => {
  const button = event.target.closest("[data-information-request-button]");

  if (button) {
    try {
      openRequestDialog(button);
    } catch (error) {
      button.textContent = error instanceof Error ? error.message : "Request unavailable";
    }
  }
});

document.addEventListener("submit", event => {
  if (dialogState?.form && event.target === dialogState.form) {
    submitRequest(event);
  }
});
