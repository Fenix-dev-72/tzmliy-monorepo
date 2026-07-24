"""SSRF guard for outbound HTTP.

Several integrations fetch URLs that are ultimately derived from tenant-supplied
values -- the AmoCRM subdomain / Bitrix24 portal domain a tenant admin types into
the connect form (`crm/providers.py`, `crm/oauth.py`), and the recording URL a
call-provider webhook payload carries (`calls/providers.py`). Without a check, an
authenticated (privileged, 2FA-gated) tenant admin -- or anyone able to forge a
signature-valid recording URL -- could point the server at an internal address
(`127.0.0.1`, `169.254.169.254`, RFC1918 ranges) and turn it into an SSRF probe.

`validate_public_url` resolves the URL's host and rejects it if any resolved
address is loopback / link-local / private / reserved / multicast / unspecified.
Because it works off `urlsplit(...).hostname`, it also closes host-breakout tricks
where a crafted subdomain like ``evil.com/`` or ``x@evil.com`` would otherwise
escape an intended ``{value}.amocrm.ru`` template -- the real host is whatever the
parser reports, and that host is what gets validated.

Known residual risk: this is resolve-time validation, not connection-time IP
pinning, so a DNS-rebinding attacker who flips the record between this check and
the actual `urlopen` is not fully stopped. That is accepted for the current threat
model (the reachable callers are behind privileged tenant auth or webhook-signature
verification); pinning the resolved IP into the socket would be the stronger fix if
this surface ever widens to unauthenticated input.
"""

import ipaddress
import socket
from urllib.parse import urlsplit

_ALLOWED_SCHEMES = ("http", "https")


class UnsafeUrlError(Exception):
    """Raised when an outbound URL resolves to a non-public / disallowed host."""


def _is_disallowed(ip: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    # Normalize IPv4-mapped IPv6 (e.g. ::ffff:169.254.169.254) to its v4 form so
    # the metadata/loopback ranges are caught regardless of how the host resolves.
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped is not None:
        ip = ip.ipv4_mapped
    return (
        ip.is_loopback
        or ip.is_link_local
        or ip.is_private
        or ip.is_reserved
        or ip.is_multicast
        or ip.is_unspecified
    )


def validate_public_url(url: str) -> None:
    """Raise ``UnsafeUrlError`` unless ``url`` is an http(s) URL whose host
    resolves exclusively to public, routable addresses. Call it immediately
    before every outbound ``urlopen`` that fetches a tenant/webhook-derived URL.
    """
    parts = urlsplit(url)
    if parts.scheme not in _ALLOWED_SCHEMES:
        raise UnsafeUrlError(f"Disallowed URL scheme: {parts.scheme or '(none)'}")

    host = parts.hostname
    if not host:
        raise UnsafeUrlError("URL has no host")

    # A bare IP literal in the URL: validate it directly, no DNS lookup needed.
    try:
        literal = ipaddress.ip_address(host)
    except ValueError:
        literal = None
    if literal is not None:
        if _is_disallowed(literal):
            raise UnsafeUrlError(f"URL host resolves to a non-public address: {host}")
        return

    port = parts.port or (443 if parts.scheme == "https" else 80)
    try:
        infos = socket.getaddrinfo(host, port, proto=socket.IPPROTO_TCP)
    except socket.gaierror as exc:
        raise UnsafeUrlError(f"Cannot resolve host: {host}") from exc

    if not infos:
        raise UnsafeUrlError(f"Cannot resolve host: {host}")

    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if _is_disallowed(ip):
            raise UnsafeUrlError(f"URL host resolves to a non-public address: {host} -> {ip}")
