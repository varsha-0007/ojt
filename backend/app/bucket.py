import time

LUA_SCRIPT = """
local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local refill_rate = tonumber(ARGV[2])
local now = tonumber(ARGV[3])

local data = redis.call('HMGET', key, 'tokens', 'last_time')
local tokens = tonumber(data[1])
local last_time = tonumber(data[2])

if tokens == nil then
    tokens = capacity
    last_time = now
end

local elapsed = now - last_time
tokens = math.min(capacity, tokens + (elapsed * refill_rate))

local allowed = 0
if tokens >= 1 then
    tokens = tokens - 1
    allowed = 1
end

redis.call('HMSET', key, 'tokens', tokens, 'last_time', now)
redis.call('EXPIRE', key, 3600)

return allowed
"""


def is_allowed(redis_conn, policy_id, client_hash, capacity, refill_tokens, refill_seconds):
    key = f"bucket:{policy_id}:{client_hash}"
    refill_rate = refill_tokens / refill_seconds
    now = time.time()
    result = redis_conn.eval(LUA_SCRIPT, 1, key, capacity, refill_rate, now)
    return result == 1