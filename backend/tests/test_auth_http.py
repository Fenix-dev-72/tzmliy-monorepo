"""End-to-end HTTP auth flow through the real FastAPI app (ASGITransport):
seed a user, POST /auth/login, use the returned token against a protected
endpoint, and check the failure paths. Complements test_auth_security.py (which
unit-tests the token/permission primitives) by exercising the actual routes,
middleware, and DB together.
"""

LOGIN = "/api/v1/auth/login"
ME = "/api/v1/auth/me"


async def test_login_then_me_succeeds(api_client, http_user):
    resp = await api_client.post(
        LOGIN, json={"identifier": http_user["identifier"], "password": http_user["password"]}
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["requires_2fa"] is False
    token = body["access_token"]
    assert token and body["refresh_token"]

    me = await api_client.get(ME, headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200, me.text
    assert me.json()["email"] == http_user["identifier"]


async def test_me_without_token_is_401(api_client):
    resp = await api_client.get(ME)
    assert resp.status_code == 401


async def test_me_with_garbage_token_is_401(api_client):
    resp = await api_client.get(ME, headers={"Authorization": "Bearer not.a.real.jwt"})
    assert resp.status_code == 401


async def test_login_wrong_password_is_401(api_client, http_user):
    resp = await api_client.post(
        LOGIN, json={"identifier": http_user["identifier"], "password": "definitely-wrong"}
    )
    assert resp.status_code == 401


async def test_login_unknown_identifier_is_401(api_client):
    # No such user -> generic 401 (no account-enumeration difference from a
    # wrong password on a real account).
    resp = await api_client.post(
        LOGIN, json={"identifier": "nobody-unknown@example.com", "password": "whatever123"}
    )
    assert resp.status_code == 401


async def test_login_rejects_malformed_identifier_422(api_client):
    # The identifier validator rejects a non-email/non-phone at the API boundary.
    resp = await api_client.post(LOGIN, json={"identifier": "not-an-email", "password": "whatever123"})
    assert resp.status_code == 422
