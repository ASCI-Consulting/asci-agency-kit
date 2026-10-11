const $ = (id) => document.getElementById(id),
  token = document.querySelector('meta[name="workspace-token"]').content;
document.querySelector('meta[name="workspace-token"]').remove();
let records = [],
  kind = "task",
  editing = null,
  request = null;
const kinds = {
  company: "Companies",
  person: "People",
  deal: "Deals",
  task: "Tasks",
  proposal: "Proposals",
  engagement: "Delivery",
};
const title = (r) => r.data.name ?? r.data.title;
const specs = {
  company: [
    ["name", "Company name"],
    ["website", "Website", "optional"],
  ],
  person: [
    ["name", "Person name"],
    ["companyId", "Company", "company"],
    ["email", "Email", "optional"],
    ["role", "Role"],
  ],
  deal: [
    ["title", "Title"],
    ["companyId", "Company", "company"],
    ["offer", "Selected offer"],
    [
      "stage",
      "Deal stage",
      ["interest", "discovery", "scoped", "proposal", "won", "lost"],
    ],
    ["nextStep", "Next step", "text"],
    ["closeReason", "Closing reason", "optional"],
  ],
  task: [
    ["title", "Title"],
    ["owner", "Owner"],
    ["dueAt", "Due date", "date"],
    ["status", "Task status", ["todo", "in_progress", "done", "cancelled"]],
    ["priority", "Priority", ["low", "normal", "high"]],
    ["linkedId", "Linked record", "linked"],
  ],
  proposal: [
    ["title", "Title"],
    ["dealId", "Deal", "deal"],
    ["scope", "Scope", "text"],
    ["deliverables", "Deliverables, one per line", "lines"],
    ["assumptions", "Assumptions and exclusions", "text"],
    ["status", "Proposal status", ["draft", "shared", "accepted", "declined"]],
  ],
  engagement: [
    ["title", "Title"],
    ["dealId", "Won deal", "won"],
    ["scope", "Agreed scope", "text"],
    [
      "status",
      "Delivery status",
      ["planned", "active", "delivered", "archived"],
    ],
    ["milestones", "Milestones, one per line", "milestones"],
    ["handover", "Handover notes", "optional"],
  ],
};
async function api(path, body) {
  const response = await fetch(path, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(10000),
  });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error ?? "Workspace request failed");
  return value;
}
function el(tag, text) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  return node;
}
async function load() {
  $("status").textContent = "Loading workspace…";
  try {
    const [rows, report, identity] = await Promise.all([
      api("/api/records"),
      api("/api/report"),
      api("/api/profile"),
    ]);
    $("brand").textContent = identity.name;
    records = rows;
    $("summary").replaceChildren(
      ...Object.entries(report.summary).map(([label, n]) => {
        const node = el("article");
        node.append(
          el("span", label.replace(/([A-Z])/g, " $1").toLowerCase()),
          el("strong", String(n)),
        );
        return node;
      }),
    );
    $("status").textContent =
      "Saved local records · changes never send or schedule email";
    render();
  } catch (e) {
    $("status").textContent = e.message;
  }
}
function render() {
  $("list-title").textContent = kinds[kind];
  for (const b of $("tabs").children)
    b.setAttribute("aria-pressed", String(b.dataset.kind === kind));
  const rows = records.filter((r) => r.kind === kind);
  $("records").replaceChildren(
    ...rows.map((record) => {
      const node = el("article"),
        text = el("div");
      text.append(
        el("strong", title(record)),
        el(
          "p",
          record.data.nextStep ?? record.data.status ?? "Relationship record",
        ),
      );
      const open = el("button", "Open record");
      open.onclick = () => edit(record);
      node.append(text, open);
      return node;
    }),
  );
  if (!rows.length)
    $("records").append(
      el("p", "No records yet. Add one with a clear owner and next step."),
    );
}
for (const [id, label] of Object.entries(kinds)) {
  const button = el("button", label);
  button.dataset.kind = id;
  button.onclick = () => {
    kind = id;
    render();
  };
  $("tabs").append(button);
}
function edit(record = null) {
  editing = record;
  request = null;
  $("error").textContent = "";
  $("save").disabled = false;
  $("editor-title").textContent = `${record ? "Edit" : "New"} ${kind}`;
  $("fields").replaceChildren();
  for (const [name, label, type] of specs[kind]) {
    const wrapper = el("label", label);
    let control;
    if (
      Array.isArray(type) ||
      ["company", "deal", "won", "linked"].includes(type)
    ) {
      control = el("select");
      if (!Array.isArray(type))
        control.append(new Option("Choose a record", ""));
      const options = Array.isArray(type)
        ? type
        : records.filter((r) =>
            type === "linked"
              ? r.id !== record?.id
              : type === "won"
                ? r.kind === "deal" && r.data.stage === "won"
                : r.kind === type,
          );
      for (const item of options)
        control.append(
          new Option(
            typeof item === "string" ? item : title(item),
            typeof item === "string" ? item : item.id,
          ),
        );
    } else {
      control = el(
        ["text", "lines", "milestones"].includes(type) ? "textarea" : "input",
      );
      if (type === "date") control.type = "datetime-local";
    }
    control.name = name;
    control.setAttribute("aria-label", label);
    control.required = !["optional", "linked"].includes(type);
    control.maxLength = ["lines", "milestones"].includes(type) ? 32000 : 2000;
    const value = record?.data[name];
    control.value =
      type === "date"
        ? value
          ? new Date(
              Date.parse(value) - new Date(value).getTimezoneOffset() * 60000,
            )
              .toISOString()
              .slice(0, 16)
          : ""
        : type === "lines"
          ? (value ?? []).join("\n")
          : type === "milestones"
            ? (value ?? []).map((x) => x.title).join("\n")
            : (value ?? control.value ?? "");
    wrapper.append(control);
    $("fields").append(wrapper);
  }
  if (kind === "deal") {
    const note = el(
      "p",
      "Discovery notes: record the business goal, constraints, stakeholders and current process before scoping.",
    );
    $("fields").append(note);
    for (const name of ["goal", "constraints", "stakeholders", "notes"]) {
      const label = el("label", `Discovery ${name}`),
        input = el("textarea");
      input.name = `discovery.${name}`;
      input.maxLength = 2000;
      input.value = record?.data.discovery?.[name] ?? "";
      label.append(input);
      $("fields").append(label);
    }
  }
  if (kind === "engagement" && record) {
    for (const [i, m] of record.data.milestones.entries()) {
      const label = el("label", m.title),
        box = el("input");
      box.type = "checkbox";
      box.name = `milestone.${i}`;
      box.checked = m.done;
      label.append(box);
      $("fields").append(label);
    }
  }
  $("editor").showModal();
}
$("editor").querySelector("form").onsubmit = async (event) => {
  event.preventDefault();
  $("error").textContent = "";
  if (request) return;
  const values = new FormData(event.currentTarget),
    data = {};
  for (const [name, , type] of specs[kind]) {
    const v = String(values.get(name) ?? "").trim();
    if (type === "optional" && !v) {
      if (["website", "email"].includes(name)) data[name] = null;
      continue;
    }
    data[name] =
      type === "date"
        ? new Date(v).toISOString()
        : type === "lines"
          ? v.split("\n")
          : type === "milestones"
            ? v
                .split("\n")
                .map((title, i) => ({
                  title,
                  done:
                    title === editing?.data.milestones[i]?.title &&
                    values.has(`milestone.${i}`),
                }))
            : type === "linked"
              ? v || null
              : v;
  }
  if (kind === "deal") {
    const discovery = Object.fromEntries(
      ["goal", "constraints", "stakeholders", "notes"].map((name) => [
        name,
        String(values.get(`discovery.${name}`) ?? "").trim(),
      ]),
    );
    if (Object.values(discovery).some(Boolean)) data.discovery = discovery;
  }
  request = {
    record: {
      id: editing?.id ?? crypto.randomUUID(),
      version: (editing?.version ?? 0) + 1,
      updatedAt: new Date().toISOString(),
      kind,
      data,
    },
    expectedVersion: editing?.version ?? 0,
    idempotencyKey: crypto.randomUUID(),
  };
  $("save").disabled = true;
  try {
    await api("/api/records", request);
    $("editor").close();
    await load();
  } catch (error) {
    $("error").textContent =
      `${error.message} Close and refresh before another change. The outcome may be uncertain.`;
  }
};
$("new").onclick = () => edit();
$("refresh").onclick = load;
$("close").onclick = () => $("editor").close();
await load();
