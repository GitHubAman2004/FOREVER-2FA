import { getRedis } from "../config/redis.js"

// every helper swallows Redis errors - the cache is a speed-up, never a reason for a request to fail

// returns the cached value, or null on a miss / when Redis is unavailable
const getCache = async (key) => {
    const redis = getRedis()
    if (!redis) {
        return null
    }
    try {
        const value = await redis.get(key)
        return value ? JSON.parse(value) : null
    } catch (error) {
        console.log("Cache read failed:", error.message)
        return null
    }
}

const setCache = async (key, value, ttlSeconds) => {
    const redis = getRedis()
    if (!redis) {
        return
    }
    try {
        await redis.set(key, JSON.stringify(value), { expiration: { type: 'EX', value: ttlSeconds } })
    } catch (error) {
        console.log("Cache write failed:", error.message)
    }
}

// if this fails the entry still expires on its own after its TTL
const deleteCache = async (...keys) => {
    const redis = getRedis()
    if (!redis) {
        return
    }
    try {
        await redis.del(keys)
    } catch (error) {
        console.log("Cache delete failed:", error.message)
    }
}

export { getCache, setCache, deleteCache }
