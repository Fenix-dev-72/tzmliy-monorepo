import { useEffect, useState } from "react";
import { Package } from "lucide-react";
import * as productsApi from "@/lib/api/products";
import type { Product } from "@/lib/api/products";

export function ProductPhoto({ accessToken, product, size = 40 }: { accessToken: string; product: Product; size?: number }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    setUrl(null);
    if (!product.photo_object_key) return;
    productsApi
      .getProductPhotoUrl(accessToken, product.id)
      .then((r) => setUrl(r.photo_url))
      .catch(() => setUrl(null));
  }, [accessToken, product.id, product.photo_object_key]);

  if (url) {
    return <img src={url} alt={product.name} style={{ width: size, height: size }} className="shrink-0 rounded-lg object-cover" />;
  }
  return (
    <div style={{ width: size, height: size }} className="bg-accent text-foreground-muted flex shrink-0 items-center justify-center rounded-lg">
      <Package size={size * 0.5} />
    </div>
  );
}
