-- Client-reported bug (2026-07-22): the "agent" system role never had
-- catalog.view in DEFAULT_ROLE_PERMISSIONS, so GET /products 403'd for
-- agents and the Sales page's product picker silently came up empty --
-- unrelated to the same-day own-data-scoping change, just an existing gap it
-- happened to surface. Agents get read-only catalog access (catalog.view),
-- not catalog.manage -- they can pick a product for a sale but not
-- create/edit/delete the shared company catalog.

INSERT INTO role_permissions (role_id, tenant_id, permission_key)
SELECT id, tenant_id, 'catalog.view' FROM roles WHERE name = 'agent' AND is_system = true
ON CONFLICT DO NOTHING;
