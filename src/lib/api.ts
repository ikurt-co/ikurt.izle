export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(path, {
    ...options,
    redirect: path.startsWith("/api/admin/") ? "manual" : options.redirect,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });

  if (response.type === "opaqueredirect" && path.startsWith("/api/admin/")) {
    window.location.assign("/admin");
    throw new Error("Yönetici oturumunuz sona erdi. Yeniden giriş yapın.");
  }
  if (!response.headers.get("content-type")?.includes("application/json")) {
    throw new Error("Sunucu yanıtı alınamadı. Yönetici oturumunuzu kontrol edin.");
  }
  const data = (await response.json()) as T & {
    error?: string;
    message?: string;
  };

  if (!response.ok) {
    throw new Error(
      data.message ||
      data.error ||
      `HTTP ${response.status}`,
    );
  }

  return data;
}

export function slugify(value: string): string {
  return value
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}