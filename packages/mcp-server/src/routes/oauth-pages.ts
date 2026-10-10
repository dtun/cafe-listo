function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

// Palette mirrors packages/landing/src/styles/variables.css so sign-in feels like the rest of Café Listo.
const STYLE = `
  :root { color-scheme: light dark; --bg: #fffdf5; --fg: #1a1a1a; --muted: #4a3728; --primary: #b71c1c; --primary-dark: #7f0000; --yellow: #fdd835; --yellow-dark: #f9a825; --card: #fff; --line: #e0d6cc; }
  @media (prefers-color-scheme: dark) { :root { --bg: #141110; --fg: #fffdf5; --muted: #d7c9bb; --primary: #ef5350; --primary-dark: #ff8a80; --card: #221c19; --line: #3d332d; } }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 16px; background: var(--bg); color: var(--fg); font: 16px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; }
  main { width: 100%; max-width: 380px; background: var(--card); border: 1px solid var(--line); border-top: 6px solid var(--primary); border-radius: 12px; padding: 24px; box-shadow: 0 8px 24px rgb(183 28 28 / 0.08); }
  h1 { font-size: 1.5rem; margin: 0 0 4px; color: var(--primary); }
  p { margin: 0 0 16px; color: var(--muted); }
  label { display: block; font-size: .875rem; font-weight: 600; margin: 12px 0 4px; }
  input[type=email], input[type=password] { width: 100%; padding: 10px; border: 1px solid var(--line); border-radius: 8px; background: transparent; color: inherit; font: inherit; }
  input:focus-visible, button:focus-visible { outline: 3px solid var(--yellow-dark); outline-offset: 2px; }
  .actions { display: flex; gap: 8px; margin-top: 20px; }
  button { flex: 1; padding: 10px; border-radius: 8px; border: 2px solid transparent; font: inherit; font-weight: 700; cursor: pointer; transition: background-color .2s; }
  button[value=signin] { background: var(--yellow); color: #1a1a1a; }
  button[value=signin]:hover { background: var(--yellow-dark); }
  button[value=signup] { background: transparent; color: var(--primary); border-color: var(--primary); }
  button[value=signup]:hover { color: var(--primary-dark); border-color: var(--primary-dark); }
  .error { color: var(--primary); font-weight: 600; margin: 0 0 12px; }
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
