
// Catálogo compartido: la tienda lo lee, el panel lo escribe (con contraseña).
import { getStore } from "@netlify/blobs";
import { createHash, timingSafeEqual } from "node:crypto";

// Contraseña por defecto = la misma que ya usabas en tu panel (se guarda solo su huella).
// Para cambiarla: en Netlify → Site configuration → Environment variables → ADMIN_PASSWORD
const DEFAULT_SHA = "9a423d57a1c75a87abf837a1e30fa67dc6137f1fd040278ed8ee061b6ef4426e";
const MAX_BODY = 4_800_000;

const sha = t => createHash("sha256").update("sv:" + t).digest("hex");
const sleep = ms => new Promise(r => setTimeout(r, ms));
const json = (o, status = 200) => new Response(JSON.stringify(o), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
});
function passOk(pw) {
  const want = process.env.ADMIN_PASSWORD ? sha(process.env.ADMIN_PASSWORD) : DEFAULT_SHA;
  const a = Buffer.from(sha(String(pw || ""))), b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}
const IMG = /^data:image\/(webp|png|jpeg|gif);base64,[A-Za-z0-9+/=]+$/;
function clean(list) {
  if (!Array.isArray(list) || list.length > 100) return null;
  const seen = new Set(), out = [];
  for (const p of list) {
    if (!p || typeof p !== "object") return null;
    const id = String(p.id || "").slice(0, 60);
    if (!id || seen.has(id)) return null;
    seen.add(id);
    out.push({
      id,
      nombre: String(p.nombre || "").slice(0, 60),
      tipo: String(p.tipo || "").slice(0, 30),
      nota: String(p.nota || "").slice(0, 40),
      precio: Math.max(0, Number(p.precio) || 0),
      puffs: Math.max(0, Number(p.puffs) || 0),
      imagen: typeof p.imagen === "string" && (p.imagen === "" || IMG.test(p.imagen)) ? p.imagen : "",
      disponible: p.disponible !== false
    });
  }
  return out;
}

export default async (req, _ctx, deps = {}) => {
  const store = (deps.getStore || getStore)({ name: "snoopy", consistency: "strong" });
  const url = new URL(req.url);
  try {
    if (req.method === "GET") {
      if (url.searchParams.has("auth")) {
        if (passOk(req.headers.get("x-admin-key"))) return json({ ok: true });
        await sleep(deps.noWait ? 0 : 700); return json({ ok: false }, 401);
      }
      const data = await store.get("catalog", { type: "json" });
      if (!data) return json({ products: null, updated: "0" });
      if (url.searchParams.get("v") === data.updated) return json({ unchanged: true, updated: data.updated });
      return json(data);
    }
    if (req.method === "POST") {
      if (!passOk(req.headers.get("x-admin-key"))) { await sleep(deps.noWait ? 0 : 700); return json({ error: "Contraseña incorrecta" }, 401); }
      if (Number(req.headers.get("content-length") || 0) > MAX_BODY) return json({ error: "Las fotos pesan demasiado. Usa fotos más ligeras." }, 413);
      const text = await req.text();
      if (text.length > MAX_BODY) return json({ error: "Las fotos pesan demasiado. Usa fotos más ligeras." }, 413);
      let body; try { body = JSON.parse(text); } catch { return json({ error: "Datos inválidos" }, 400); }
      const products = clean(body && body.products);
      if (!products) return json({ error: "Catálogo inválido" }, 400);
      const cur = await store.get("catalog", { type: "json" });
      if (cur && String(body.base) !== cur.updated) return json({ error: "conflict", updated: cur.updated }, 409);
      const updated = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      await store.setJSON("catalog", { updated, products });
      return json({ ok: true, updated });
    }
    return json({ error: "Método no permitido" }, 405);
  } catch (e) {
    console.error("products error", e);
    return json({ error: "Error del servidor" }, 500);
  }
};

export const config = { path: "/api/products" };
