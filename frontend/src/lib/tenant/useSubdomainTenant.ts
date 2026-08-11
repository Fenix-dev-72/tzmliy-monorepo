import { useEffect, useState } from "react";
import { ApiError } from "@/lib/api/client";
import * as tenantAuthApi from "@/lib/api/tenantAuth";

// The production apex domain -- any other hostname of the shape
// "{slug}.tizimly.uz" is treated as a per-tenant subdomain login. "www" is
// excluded (that's still the marketing site, not a tenant). Local dev
// (localhost, 127.0.0.1) and any other hostname never match, so this hook is
// a no-op there -- the root-domain login flow is completely unaffected.
const APEX_DOMAIN = "tizimly.uz";

function extractSlug(hostname: string): string | null {
  if (hostname === APEX_DOMAIN || hostname === `www.${APEX_DOMAIN}`) return null;
  if (!hostname.endsWith(`.${APEX_DOMAIN}`)) return null;
  const slug = hostname.slice(0, -(`.${APEX_DOMAIN}`.length));
  // Only a single-label subdomain counts (no "a.b.tizimly.uz" edge cases).
  if (!slug || slug.includes(".")) return null;
  return slug;
}

export interface SubdomainTenantState {
  // null until we know whether we're on a subdomain at all, and while the
  // by-slug lookup is in flight.
  slug: string | null;
  loading: boolean;
  tenantName: string | null;
  // true once the lookup has resolved and found no matching tenant --
  // distinct from "not on a subdomain at all" (slug === null, loading === false).
  notFound: boolean;
}

// Resolves the current hostname to a tenant name for the subdomain-branded
// login page ({slug}.tizimly.uz) -- see LoginView.tsx. Root-domain behavior
// (tizimly.uz, www.tizimly.uz, local dev) is untouched: slug stays null and
// nothing renders differently.
export function useSubdomainTenant(): SubdomainTenantState {
  const slug = extractSlug(window.location.hostname);
  const [state, setState] = useState<SubdomainTenantState>({
    slug,
    loading: slug !== null,
    tenantName: null,
    notFound: false,
  });

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    (async () => {
      try {
        const tenant = await tenantAuthApi.getTenantBySlug(slug);
        if (!cancelled) setState({ slug, loading: false, tenantName: tenant.name, notFound: false });
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) {
          setState({ slug, loading: false, tenantName: null, notFound: true });
        } else {
          // Network/other error: fail open into the generic login form
          // rather than blocking the whole page on a branding lookup.
          setState({ slug, loading: false, tenantName: null, notFound: false });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  return state;
}
