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
        // app.get('/ebooks/:id', async (req, res) => {
        //     try {
        //         const bookId = req.params.id;
        //         const book = await ebooksCollection.findOne({ id: Number(bookId) });

        //         if (!book) {
        //             return res.status(404).json({ error: "Book not found" });
        //         }
        //         res.status(200).json(book);
        //     } catch (error) {
        //         console.error("Error fetching book detail:", error);
        //         res.status(500).json({ error: "Server error" });
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