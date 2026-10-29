import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach, vi } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import app from '../app.js'
import productModel from '../models/productModel.js'
import { getRedis } from '../config/redis.js'
import { connect, clear, close } from './db.js'

// in-memory stand-in for Redis, just the three commands the cache helpers use
const store = new Map()
const fakeRedis = {
    get: vi.fn(async (key) => store.get(key) ?? null),
    set: vi.fn(async (key, value) => { store.set(key, value) }),
    del: vi.fn(async (keys) => { [].concat(keys).forEach((k) => store.delete(k)) })
}

vi.mock('../config/redis.js', () => ({
    getRedis: vi.fn(),
    default: vi.fn()
}))

// addProduct calls Gemini for an embedding - don't hit the network in tests
vi.mock('../utils/embeddings.js', () => ({
    default: vi.fn(async () => [0.1, 0.2, 0.3])
}))

const adminToken = () => jwt.sign(process.env.ADMIN_EMAIL + process.env.ADMIN_PASSWORD, process.env.JWT_SECRET)

const sampleProduct = (name) => ({
    name,
    description: 'desc',
    price: 10,
    image: ['http://img'],
    category: 'Men',
    subCategory: 'Topwear',
    sizes: ['M'],
    date: Date.now()
})

const list = () => request(app).get('/api/product/list')
const single = (productId) => request(app).post('/api/product/single').send({ productId })
const listNames = (res) => res.body.products.map((p) => p.name).sort()

beforeAll(connect)
beforeEach(() => {
    vi.mocked(getRedis).mockReturnValue(fakeRedis)
})
afterEach(async () => {
    await clear()
    store.clear()
    vi.clearAllMocks()
})
afterAll(close)

describe('product list cache', () => {
    it('serves the second request from the cache', async () => {
        await productModel.create(sampleProduct('Shirt'))
        await list()

        // written straight to the db, so the API doesn't know to clear the cache
        await productModel.create(sampleProduct('Jeans'))

        const res = await list()
        expect(res.body.success).toBe(true)
        expect(listNames(res)).toEqual(['Shirt'])
    })

    it('is cleared when a product is removed', async () => {
        const shirt = await productModel.create(sampleProduct('Shirt'))
        await productModel.create(sampleProduct('Jeans'))
        await list()

        const removed = await request(app).post('/api/product/remove').set('token', adminToken()).send({ id: shirt._id })
        expect(removed.body.success).toBe(true)

        const res = await list()
        expect(listNames(res)).toEqual(['Jeans'])
    })

    it('is cleared when a product is added', async () => {
        await productModel.create(sampleProduct('Shirt'))
        await list()

        const added = await request(app)
            .post('/api/product/add')
            .set('token', adminToken())
            .field('name', 'Jacket')
            .field('description', 'warm')
            .field('price', '50')
            .field('category', 'Men')
            .field('subCategory', 'Winterwear')
            .field('sizes', JSON.stringify(['L']))
            .field('bestseller', 'false')
        expect(added.body.success).toBe(true)

        const res = await list()
        expect(listNames(res)).toEqual(['Jacket', 'Shirt'])
    })
})

describe('single product cache', () => {
    it('serves a repeat lookup from the cache', async () => {
        const shirt = await productModel.create(sampleProduct('Shirt'))
        await single(shirt._id)

        await productModel.updateOne({ _id: shirt._id }, { name: 'Renamed directly' })

        const res = await single(shirt._id)
        expect(res.body.product.name).toBe('Shirt')
    })

    it('is cleared when the product is removed', async () => {
        const shirt = await productModel.create(sampleProduct('Shirt'))
        await single(shirt._id)

        await request(app).post('/api/product/remove').set('token', adminToken()).send({ id: shirt._id })

        const res = await single(shirt._id)
        expect(res.body.product).toBeNull()
    })

    it('does not cache a product that was not found', async () => {
        const res = await single('64b000000000000000000000')
        expect(res.body.product).toBeNull()
        expect(fakeRedis.set).not.toHaveBeenCalledWith(expect.stringContaining('64b000000000000000000000'), expect.anything(), expect.anything())
    })
})

describe('without Redis', () => {
    it('still works when Redis is unavailable', async () => {
        vi.mocked(getRedis).mockReturnValue(null)
        await productModel.create(sampleProduct('Shirt'))

        const res = await list()
        expect(res.body.success).toBe(true)
        expect(listNames(res)).toEqual(['Shirt'])
    })

    it('still works when a Redis command throws', async () => {
        vi.mocked(getRedis).mockReturnValue({
            get: vi.fn().mockRejectedValue(new Error('connection lost')),
            set: vi.fn().mockRejectedValue(new Error('connection lost')),
            del: vi.fn().mockRejectedValue(new Error('connection lost'))
        })
        await productModel.create(sampleProduct('Shirt'))

        const res = await list()
        expect(res.body.success).toBe(true)
        expect(listNames(res)).toEqual(['Shirt'])
    })
})
