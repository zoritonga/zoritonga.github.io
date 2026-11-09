// Copia el catálogo a GitHub (data/products.json). El token vive SOLO en Netlify (variables de entorno).
export function githubConfigured() { return !!(process.env.GITHUB_TOKEN && process.env.GITHUB_REPO); }

export async function mirrorToGithub(data, f = fetch) {
  const repo = process.env.GITHUB_REPO, token = process.env.GITHUB_TOKEN, branch = process.env.GITHUB_BRANCH || "main";
  const api = `https://api.github.com/repos/${repo}/contents/data/products.json`;
  const h = { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "user-agent": "snoopy-vapes", "x-github-api-version": "2022-11-28" };
  let sha;
  const g = await f(`${api}?ref=${encodeURIComponent(branch)}`, { headers: h });
  if (g.ok) sha = (await g.json()).sha; else if (g.status !== 404) throw new Error("GitHub GET " + g.status);
  const body = { message: "Actualización de catálogo " + new Date().toISOString(), branch, content: Buffer.from(JSON.stringify(data, null, 1)).toString("base64"), ...(sha ? { sha } : {}) };
  const p = await f(api, { method: "PUT", headers: { ...h, "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!p.ok) throw new Error("GitHub PUT " + p.status + " " + (await p.text()).slice(0, 200));
}
