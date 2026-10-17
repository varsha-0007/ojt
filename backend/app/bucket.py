import time
import threading

from redis.exceptions import RedisError


_memory_buckets = {}
_memory_buckets_lock = threading.Lock()

LUA_SCRIPT = """
local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local refill_tokens = tonumber(ARGV[2])
local refill_seconds = tonumber(ARGV[3])
local now = tonumber(ARGV[4])

local data = redis.call('HMGET', key, 'tokens', 'last_refill', 'last_time')
local tokens = tonumber(data[1])
local last_refill = tonumber(data[2]) or tonumber(data[3])

if tokens == nil then
    tokens = capacity
    last_refill = now
end

if refill_tokens > 0 and refill_seconds > 0 then
    local intervals = math.floor((now - last_refill) / refill_seconds)
    if intervals > 0 then
        tokens = math.min(capacity, tokens + (intervals * refill_tokens))
        last_refill = last_refill + (intervals * refill_seconds)
    end
end

local allowed = 0
if tokens >= 1 then
    tokens = tokens - 1
    allowed = 1
end

redis.call('HMSET', key, 'tokens', tokens, 'last_refill', last_refill)
redis.call('EXPIRE', key, 3600)

return allowed
"""


def is_allowed(redis_conn, policy_id, client_hash, capacity, refill_tokens, refill_seconds, company_id=None):
    key = f"bucket:{policy_id}:{client_hash}"
    now = time.time()
    try:
        result = redis_conn.eval(
            LUA_SCRIPT,
            1,
            key,
            capacity,
            refill_tokens,
            refill_seconds,
            now,
        )
        return result == 1
    except RedisError:
        memory_key = (company_id, policy_id, client_hash)
        with _memory_buckets_lock:
            tokens, last_refill = _memory_buckets.get(memory_key, (capacity, now))
            if refill_tokens > 0 and refill_seconds > 0:
                intervals = int((now - last_refill) / refill_seconds)
                if intervals > 0:
                    tokens = min(capacity, tokens + intervals * refill_tokens)
                    last_refill += intervals * refill_seconds
            allowed = tokens >= 1
            if allowed:
                tokens -= 1
            _memory_buckets[memory_key] = (tokens, last_refill)
            return allowed