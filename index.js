const dns = require("node:dns");
dns.setServers(["8.8.8.8", "8.8.4.4"]);

const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const { MongoClient, ServerApiVersion } = require('mongodb');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const uri = process.env.MONGODB_URI;

app.use(cors());
app.use(express.json());

const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

app.get('/', (req, res) => {
    res.send('Fable Server is Running!')
});

async function run() {
    try {
        await client.connect();
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");

        const database = client.db(process.env.DB_NAME);
        const ebooksCollection = database.collection("ebooks");
        const purchasesCollection = database.collection("purchases");
        const bookmarksCollection = database.collection("bookmarks");
        app.get('/ebooks', async (req, res) => {
            try {
                const books = await ebooksCollection.find({}).toArray();
                res.status(200).json(books);
            } catch (error) {
                console.error("Error fetching books:", error);
                res.status(500).json({ error: "Failed to fetch books" });
            }
        });

        // Ebooks Details
        app.get('/ebooks/:id', async (req, res) => {
            try {
                const bookId = req.params.id;
                const book = await ebooksCollection.findOne({ id: Number(bookId) });

                if (!book) {
                    return res.status(404).json({ error: "Book not found" });
                }
                res.status(200).json(book);
            } catch (error) {
                console.error("Error fetching book detail:", error);
                res.status(500).json({ error: "Server error" });
            }
        });

        //Books By Genre
        app.get('/ebooks', async (req, res) => {
            try {
                const { genre } = req.query;
                let query = {};

                if (genre) {
                    // Case-Sensitive Match (Regex)
                    query.category = { $regex: new RegExp(`^${genre}$`, 'i') };
                }

                const books = await ebooksCollection.find(query).toArray();
                res.status(200).json(books);
            } catch (error) {
                console.error("Error fetching books:", error);
                res.status(500).json({ error: "Server error" });
            }
        });

        //Error Handling If no book yet purchased
        app.get('/user/purchased', async (req, res) => {
            try {
                // consider req.user.id
                // const userId = req.user?.id;
                const purchases = [];
                // Check user Id list
                // Query Collection(such as: ordersCollection or purchasesCollection)
                // const purchases = await purchasesCollection.find({ userId: userId }).toArray();
                res.status(200).json(purchases);

            } catch (error) {
                console.error("Error fetching purchases:", error);
                res.status(500).json({ error: "Internal Server Error" });
            }
        });

        //Purchase History

        // app.get('/user/history', async (req, res) => {
        //     try {

        //         const dummyHistory = [
        //             {
        //                 _id: "tx_1",
        //                 transactionId: "ch_3Mv2b1Lkd90xPq",
        //                 bookTitle: "The Great Gatsby",
        //                 purchaseDate: "2026-06-15T08:30:00.000Z",
        //                 amount: 14.99,
        //                 status: "success"
        //             },
        //             {
        //                 _id: "tx_2",
        //                 transactionId: "ch_4Nn3c2Mkd91yRt",
        //                 bookTitle: "Atomic Habits",
        //                 purchaseDate: "2026-06-18T14:45:00.000Z",
        //                 amount: 9.99,
        //                 status: "success"
        //             }
        //         ];

        //         res.status(200).json(dummyHistory);
        //     } catch (error) {
        //         console.error("Error fetching history:", error);
        //         res.status(500).json({ error: "Internal Server Error" });
        //     }
        // });

    } catch (error) {
        console.error("Database connection failed:", error);
    }
}
run().catch(console.dir);

app.listen(PORT, () => {
    console.log(`Fable Server listening on port ${PORT}`);
});