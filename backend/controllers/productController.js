import { v2 as cloudinary } from "cloudinary"
import productModel from "../models/productModel.js"
import getEmbedding from "../utils/embeddings.js"
import hybridSearchProducts from "../utils/hybridSearch.js"
import { getCache, setCache, deleteCache } from "../utils/cache.js"

const PRODUCT_CACHE_TTL = 10 * 60   // seconds, upper bound on staleness if an invalidation is ever missed
const PRODUCT_LIST_KEY = 'products:list'
const productKey = (id) => `products:single:${id}`

// function for add product
const addProduct = async (req, res) => {
    try {

        const { name, description, price, category, subCategory, sizes, bestseller } = req.body

        const image1 = req.files.image1 && req.files.image1[0]
        const image2 = req.files.image2 && req.files.image2[0]
        const image3 = req.files.image3 && req.files.image3[0]
        const image4 = req.files.image4 && req.files.image4[0]

        const images = [image1, image2, image3, image4].filter((item) => item !== undefined)

        let imagesUrl = await Promise.all(
            images.map(async (item) => {
                let result = await cloudinary.uploader.upload(item.path, { resource_type: 'image' });
                return result.secure_url
            })
        )

        const embedding = await getEmbedding(`${name} ${description}`)

        const productData = {
            name,
            description,
            category,
            price: Number(price),
            subCategory,
            bestseller: bestseller === "true" ? true : false,
            sizes: JSON.parse(sizes),
            image: imagesUrl,
            date: Date.now(),
            embedding
        }

        console.log(productData);

        const product = new productModel(productData);
        await product.save()
        await deleteCache(PRODUCT_LIST_KEY)

        res.json({ success: true, message: "Product Added" })

    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

// function for list product
const listProducts = async (req, res) => {
    try {

        const cached = await getCache(PRODUCT_LIST_KEY)
        if (cached) {
            return res.json({success:true,products:cached})
        }

        const products = await productModel.find({});
        await setCache(PRODUCT_LIST_KEY, products, PRODUCT_CACHE_TTL)
        res.json({success:true,products})

    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

// function for removing product
const removeProduct = async (req, res) => {
    try {
        
        await productModel.findByIdAndDelete(req.body.id)
        await deleteCache(PRODUCT_LIST_KEY, productKey(req.body.id))
        res.json({success:true,message:"Product Removed"})

    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

// function for single product info
const singleProduct = async (req, res) => {
    try {
        
        const { productId } = req.body

        const cached = await getCache(productKey(productId))
        if (cached) {
            return res.json({success:true,product:cached})
        }

        const product = await productModel.findById(productId)
        // don't cache a miss, the id might be added later
        if (product) {
            await setCache(productKey(productId), product, PRODUCT_CACHE_TTL)
        }
        res.json({success:true,product})

    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

// function for hybrid (keyword + semantic) product search
const searchProducts = async (req, res) => {
    try {

        const { query } = req.body
        const products = await hybridSearchProducts(query)

        res.json({ success: true, products })

    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

export { listProducts, addProduct, removeProduct, singleProduct, searchProducts }