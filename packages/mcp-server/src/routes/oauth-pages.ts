function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const STYLE = `
  :root { color-scheme: light dark; --bg: #faf7f2; --fg: #2b2118; --muted: #6b5d50; --accent: #b4532a; --card: #fff; --line: #e6ddd2; }
  @media (prefers-color-scheme: dark) { :root { --bg: #1c1712; --fg: #f3ece4; --muted: #b5a797; --accent: #e07a4a; --card: #26201a; --line: #3a3128; } }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 16px; background: var(--bg); color: var(--fg); font: 16px/1.5 system-ui, sans-serif; }
  main { width: 100%; max-width: 380px; background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 24px; }
  h1 { font-size: 1.25rem; margin: 0 0 4px; }
  p { margin: 0 0 16px; color: var(--muted); }
  label { display: block; font-size: .875rem; margin: 12px 0 4px; }
  input[type=email], input[type=password] { width: 100%; padding: 10px; border: 1px solid var(--line); border-radius: 8px; background: transparent; color: inherit; font: inherit; }
  .actions { display: flex; gap: 8px; margin-top: 20px; }
  button { flex: 1; padding: 10px; border-radius: 8px; border: 1px solid var(--accent); font: inherit; cursor: pointer; }
  button[value=signin] { background: var(--accent); color: #fff; }
  button[value=signup] { background: transparent; color: var(--accent); }
  .error { color: #c0392b; margin: 0 0 12px; }
  .destination { color: var(--fg); }
`;

function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>${STYLE}</style>
</head>
<body><main>${body}</main></body>
</html>`;
}

export interface LoginPageParams {
  clientName: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  state?: string;
  error?: string;
}

/** The client name is self-asserted at registration; the redirect host is what the user can trust. */
function redirectHost(redirectUri: string): string {
  try {
    return new URL(redirectUri).host;
  } catch {
    return redirectUri;
  }
}

export function loginPage(params: LoginPageParams): string {
  const hidden = (
    [
      ["client_id", params.clientId],
      ["redirect_uri", params.redirectUri],
      ["code_challenge", params.codeChallenge],
      ["state", params.state ?? ""],
    ] as const
  )
    .map(
      ([name, value]) =>
        `<input type="hidden" name="${name}" value="${escapeHtml(value)}">`,
    )
    .join("\n");

  return page(
    "Sign in to Cafe Listo",
    `<h1>Connect to Cafe Listo</h1>
<p><strong>${escapeHtml(params.clientName)}</strong> wants to read and update your Cafe Listo prep box checklist.</p>
<p class="destination">You'll be sent back to <strong>${escapeHtml(redirectHost(params.redirectUri))}</strong></p>
${params.error ? `<p class="error" role="alert">${escapeHtml(params.error)}</p>` : ""}
<form method="post" action="/login">
${hidden}
<label for="email">Email</label>
<input id="email" name="email" type="email" autocomplete="email" required>
<label for="password">Password</label>
<input id="password" name="password" type="password" autocomplete="current-password" required>
<div class="actions">
<button type="submit" name="mode" value="signin">Sign in &amp; allow</button>
<button type="submit" name="mode" value="signup">Create account</button>
</div>
</form>`,
  );
}

export function errorPage(message: string): string {
  return page(
    "Authorization error",
    `<h1>Can't continue</h1><p class="error">${escapeHtml(message)}</p>`,
  );
}
