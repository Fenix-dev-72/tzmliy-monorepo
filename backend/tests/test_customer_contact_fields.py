"""Customers store the richer AmoCRM-style contact fields (email, company,
notes) on create and update (client request).
"""

from app.modules.customers import service as customers_service


async def test_customer_create_and_update_contact_fields(app_pool, two_tenants, tenant_users):
    tenant_a, _ = two_tenants
    actor = tenant_users[tenant_a]

    created = await customers_service.create_customer(
        app_pool,
        tenant_a,
        "Alice",
        "+998901112233",
        None,
        "lead",
        created_by_user_id=actor,
        email="alice@example.com",
        company="Acme LLC",
        notes="VIP, prefers calls in the morning",
    )
    assert created["email"] == "alice@example.com"
    assert created["company"] == "Acme LLC"
    assert created["notes"] == "VIP, prefers calls in the morning"

    # Update (stage unchanged, so no activity row) overwrites the contact fields.
    updated = await customers_service.update_customer(
        app_pool,
        tenant_a,
        created["id"],
        actor,
        "Alice B",
        "+998901112233",
        None,
        "lead",
        True,  # can_view_all
        email="alice.b@example.com",
        company="Acme Corp",
        notes="moved to enterprise plan",
    )
    assert updated["email"] == "alice.b@example.com"
    assert updated["company"] == "Acme Corp"
    assert updated["notes"] == "moved to enterprise plan"


async def test_customer_contact_fields_optional(app_pool, two_tenants):
    tenant_a, _ = two_tenants
    # Phone-only customer with no email/company/notes still works (all nullable).
    created = await customers_service.create_customer(
        app_pool, tenant_a, "Bob", "+998907778899", None, "lead"
    )
    assert created["email"] is None
    assert created["company"] is None
    assert created["notes"] is None
