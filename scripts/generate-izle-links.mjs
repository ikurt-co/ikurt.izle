import { randomBytes } from "node:crypto";
import { access, mkdir, open, unlink } from "node:fs/promises";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

export const TOKEN_BYTES = 24; // 192 random bits, encoded as 32 base64url characters.
export const PUBLIC_ORIGIN = "https://izle.ikurt.net";
export const OUTPUT_FILES = [
  "izle-links-001-100.json",
  "izle-links-001-100.csv",
  "izle-kv-bulk-001-100.json",
];
const columns = [
  "product_code", "public_token", "public_url", "kv_key", "status", "target_url",
  "tenant_id", "location_id", "camera_id", "assigned_at", "updated_at",
];

export function createRecords() {
  const updatedAt = new Date().toISOString();
  const used = new Set();
  return Array.from({ length: 100 }, (_, index) => {
    let token;
    do { token = randomBytes(TOKEN_BYTES).toString("base64url"); } while (used.has(token));
    used.add(token);
    return {
      version: 1,
      product_code: `izle-${String(index + 1).padStart(3, "0")}`,
      public_token: token,
      public_url: `${PUBLIC_ORIGIN}/p/${token}`,
      kv_key: token,
      status: "unassigned",
      target_url: null,
      tenant_id: null,
      location_id: null,
      camera_id: null,
      assigned_at: null,
      updated_at: updatedAt,
    };
  });
}

export function toKvBulk(records) {
  return records.map(record => ({
    key: record.public_token,
    value: JSON.stringify({
      version: record.version,
      product_code: record.product_code,
      status: record.status,
      target_url: record.target_url,
      tenant_id: record.tenant_id,
      location_id: record.location_id,
      camera_id: record.camera_id,
      assigned_at: record.assigned_at,
      updated_at: record.updated_at,
    }),
  }));
}

function csvCell(value) {
  return '"' + String(value ?? "").replaceAll('"', '""') + '"';
}

/** Reserve all output files exclusively before writing. Existing manifests are never replaced. */
export async function generateIzleLinks(outputDirectory = fileURLToPath(new URL("../data/", import.meta.url))) {
  await mkdir(outputDirectory, { recursive: true });
  const paths = OUTPUT_FILES.map(name => join(outputDirectory, name));
  for (const path of paths) {
    try {
      await access(path);
    } catch (error) {
      if (error.code === "ENOENT") continue;
      throw error;
    }
    throw new Error(`Mevcut dosyanın üzerine yazılmadı: ${path}`);
  }

  const records = createRecords();
  const csv = "\uFEFF" + columns.join(",") + "\r\n" +
    records.map(record => columns.map(column => csvCell(record[column])).join(",")).join("\r\n") + "\r\n";
  const contents = [
    JSON.stringify(records, null, 2) + "\n",
    csv,
    JSON.stringify(toKvBulk(records), null, 2) + "\n",
  ];
  const reserved = [];
  try {
    for (const path of paths) reserved.push({ path, handle: await open(path, "wx", 0o600) });
    for (let index = 0; index < reserved.length; index++) {
      await reserved[index].handle.writeFile(contents[index], "utf8");
      await reserved[index].handle.sync();
    }
  } catch (error) {
    // Roll back only files reserved by this invocation, never pre-existing files.
    await Promise.allSettled(reserved.map(file => file.handle.close()));
    await Promise.allSettled(reserved.map(file => unlink(file.path)));
    throw error;
  }
  await Promise.all(reserved.map(file => file.handle.close()));
  return { records, paths };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    const args = process.argv.slice(2);
    if (args.length && (args.length !== 2 || args[0] !== "--output-dir")) {
      throw new Error("Kullanım: node scripts/generate-izle-links.mjs [--output-dir <klasör>]");
    }
    const result = await generateIzleLinks(args.length ? resolve(args[1]) : undefined);
    console.log(`${result.records.length} kayıt oluşturuldu. KV'ye yazılmadı; deploy yapılmadı.`);
    for (const path of result.paths) console.log(path);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
