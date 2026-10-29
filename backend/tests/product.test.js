import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import jwt from 'jsonwebtoken'
import app from '../app.js'
import { connect, close } from './db.js'

beforeAll(connect)
afterAll(close)

// /search and /chat are skipped: they need Atlas Search, which the in-memory db doesn't have

describe('admin-only product routes', () => {
    const routes = ['/api/product/add', '/api/product/remove']

    it.each(routes)('%s rejects a request with no token', async (route) => {
        const res = await request(app).post(route).send({ id: 'anything' })
        expect(res.body.success).toBe(false)
        expect(res.body.message).toBe('Not Authorized Login Again')
    })

    it.each(routes)('%s rejects a normal user token', async (route) => {
        const userToken = jwt.sign({ id: 'some-user-id' }, process.env.JWT_SECRET)
        const res = await request(app).post(route).set('token', userToken).send({ id: 'anything' })
        expect(res.body.success).toBe(false)
        expect(res.body.message).toBe('Not Authorized Login Again')
    })

    it.each(routes)('%s rejects a forged token', async (route) => {
        const forged = jwt.sign(process.env.ADMIN_EMAIL + process.env.ADMIN_PASSWORD, 'wrong-secret')
        const res = await request(app).post(route).set('token', forged).send({ id: 'anything' })
        expect(res.body.success).toBe(false)
    })
})
