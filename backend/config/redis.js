import { createClient } from "redis";

let client = null

// optional - without REDIS_URL the app just skips the cache and reads from MongoDB
const connectRedis = async () => {

    if (!process.env.REDIS_URL) {
        console.log("REDIS_URL not set, caching disabled");
        return
    }

    client = createClient({
        url: process.env.REDIS_URL,
        // fail commands straight away while disconnected instead of queueing them,
        // so a Redis outage falls back to MongoDB rather than hanging requests
        disableOfflineQueue: true
    })

    // without an error listener a dropped connection would crash the server.
    // the client keeps retrying in the background, so only log the first error of each outage
    let errorLogged = false
    client.on('error', (error) => {
        if (!errorLogged) {
            console.log("Redis unavailable, falling back to MongoDB:", error.message);
            errorLogged = true
        }
    })

    client.on('ready', () => {
        errorLogged = false
        console.log("Redis Connected");
    })

    try {
        await client.connect()
    } catch (error) {
        console.log("Redis connection failed, caching disabled:", error.message);
    }

}

// the client only while it's usable, otherwise null
const getRedis = () => {
    return client && client.isReady ? client : null
}

export { getRedis }
export default connectRedis;
