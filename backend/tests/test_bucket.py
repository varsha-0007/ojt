import time
import threading
import pytest
import fakeredis

from app import bucket


@pytest.fixture()
def redis_conn():
    return fakeredis.FakeStrictRedis(decode_responses=True)


def test_allows_requests_up_to_capacity(redis_conn):
    results = [bucket.is_allowed(redis_conn, 1, "clientA", capacity=5, refill_tokens=5, refill_seconds=60) for _ in range(5)]
    assert results == [True, True, True, True, True]


def test_rejects_once_bucket_is_empty(redis_conn):
    for _ in range(5):
        bucket.is_allowed(redis_conn, 1, "clientB", capacity=5, refill_tokens=5, refill_seconds=60)

    sixth = bucket.is_allowed(redis_conn, 1, "clientB", capacity=5, refill_tokens=5, refill_seconds=60)
    assert sixth is False


def test_different_clients_have_separate_buckets(redis_conn):
    for _ in range(5):
        bucket.is_allowed(redis_conn, 1, "clientC", capacity=5, refill_tokens=5, refill_seconds=60)

    still_allowed_for_new_client = bucket.is_allowed(redis_conn, 1, "clientD", capacity=5, refill_tokens=5, refill_seconds=60)
    assert still_allowed_for_new_client is True


def test_bucket_refills_over_time(redis_conn):
    for _ in range(5):
        bucket.is_allowed(redis_conn, 1, "clientE", capacity=5, refill_tokens=5, refill_seconds=1)

    assert bucket.is_allowed(redis_conn, 1, "clientE", capacity=5, refill_tokens=5, refill_seconds=1) is False

    time.sleep(1.1)

    assert bucket.is_allowed(redis_conn, 1, "clientE", capacity=5, refill_tokens=5, refill_seconds=1) is True


def test_concurrent_requests_never_exceed_capacity(redis_conn):
    """Fires 50 requests at the exact same time from 50 threads,
    against a bucket with capacity 10. Proves the Lua script prevents
    a race condition under real concurrency."""
    capacity = 10
    results = []
    lock = threading.Lock()

    def make_request():
        allowed = bucket.is_allowed(redis_conn, 1, "clientF", capacity=capacity, refill_tokens=0, refill_seconds=60)
        with lock:
            results.append(allowed)

    threads = [threading.Thread(target=make_request) for _ in range(50)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    allowed_count = sum(1 for r in results if r is True)
    assert allowed_count == capacity, f"expected exactly {capacity} allowed, got {allowed_count}"