import httpx
import pytest
import concurrent.futures

BASE_URL = "http://localhost:8000"


def send_request():
    try:
        response = httpx.get(f"{BASE_URL}/demo/books", timeout=5)
        return response.status_code
    except httpx.RequestError:
        return None


@pytest.mark.skip(reason="Run manually against a live server — see the docstring above")
def test_concurrent_load_respects_the_configured_limit():
    with concurrent.futures.ThreadPoolExecutor(max_workers=30) as pool:
        status_codes = list(pool.map(lambda _: send_request(), range(30)))

    allowed = status_codes.count(200)
    rejected = status_codes.count(429)

    print(f"\nAllowed: {allowed}, Rejected: {rejected}")

    assert allowed + rejected == 30
    assert allowed <= 10
    assert rejected >= 20