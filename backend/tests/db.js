import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'

let mongod

// throwaway in-memory MongoDB, never touches Atlas
export const connect = async () => {
    mongod = await MongoMemoryServer.create()
    await mongoose.connect(mongod.getUri())
}

export const clear = async () => {
    const collections = Object.values(mongoose.connection.collections)
    await Promise.all(collections.map((c) => c.deleteMany({})))
}

export const close = async () => {
    await mongoose.disconnect()
    await mongod.stop()
}
