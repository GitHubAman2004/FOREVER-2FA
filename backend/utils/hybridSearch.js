import productModel from "../models/productModel.js"
import getEmbedding from "./embeddings.js"

const RRF_K = 60

const addRankedResults = (scores, results) => {
    results.forEach((doc, index) => {
        const id = doc._id.toString()
        const rrfScore = 1 / (RRF_K + index + 1)
        scores.set(id, (scores.get(id) || 0) + rrfScore)
    })
}

// runs keyword (Atlas Search) + semantic (Atlas Vector Search) queries and merges them via RRF
const hybridSearchProducts = async (query, limit = 10) => {

    // Gemini is optional - if the embedding call fails, fall back to keyword search only
    let queryEmbedding = null
    try {
        queryEmbedding = await getEmbedding(query)
    } catch (error) {
        console.log("Embeddings unavailable, using keyword search only:", error.message);
    }

    const [keywordResults, semanticResults] = await Promise.all([
        productModel.aggregate([
            {
                $search: {
                    index: "product_search_index",
                    text: {
                        query,
                        path: ["name", "description", "category", "subCategory"]
                    }
                }
            },
            { $limit: 20 },
            { $project: { _id: 1 } }
        ]),
        queryEmbedding ? productModel.aggregate([
            {
                $vectorSearch: {
                    index: "product_vector_index",
                    path: "embedding",
                    queryVector: queryEmbedding,
                    numCandidates: 100,
                    limit: 20
                }
            },
            { $project: { _id: 1 } }
        ]) : []
    ])

    const scores = new Map()
    addRankedResults(scores, keywordResults)
    addRankedResults(scores, semanticResults)

    const rankedIds = [...scores.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([id]) => id)

    const products = await productModel.find({ _id: { $in: rankedIds } }).select("-embedding")
    const productsById = new Map(products.map((product) => [product._id.toString(), product]))
    return rankedIds.map((id) => productsById.get(id)).filter(Boolean)
}

export default hybridSearchProducts
