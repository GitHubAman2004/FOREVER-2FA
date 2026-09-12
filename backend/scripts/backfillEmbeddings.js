// one-off script: generates embeddings for any product that doesn't have one yet
// run with: node scripts/backfillEmbeddings.js

import 'dotenv/config'
import mongoose from "mongoose"
import connectDB from "../config/mongodb.js"
import productModel from "../models/productModel.js"
import getEmbedding from "../utils/embeddings.js"

const run = async () => {
    await connectDB()

    const products = await productModel.find({ embedding: { $exists: false } })
    console.log(`Found ${products.length} product(s) without embeddings`)

    for (const product of products) {
        const embedding = await getEmbedding(`${product.name} ${product.description}`)
        product.embedding = embedding
        await product.save()
        console.log(`Embedded: ${product.name}`)
    }

    console.log("Done")
    await mongoose.disconnect()
}

run().catch((error) => {
    console.error(error)
    process.exit(1)
})
